import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { Bee } from '@ethersphere/bee-js'
import { privateKeyToAccount } from 'viem/accounts'
import { startMockBee, MockBeeBroker } from '../mock-bee'
import { Transport } from '../../src/lib/transport'
import { InMemoryOutbox } from '../../src/lib/outbox'
import { Reliability } from '../../src/lib/reliability'
import type { Envelope, Hex, PeerProfile } from '../../src/lib/types'

const ALICE_PK = '0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d' as Hex
const BOB_PK = '0x8b3a350cf5c34c9194ca85829a2df0ec3153be0318b5e2d3348e872092edffba' as Hex

interface World {
  broker: MockBeeBroker
  alice: { reliability: Reliability; transport: Transport; outbox: InMemoryOutbox; profile: PeerProfile }
  bob: { reliability: Reliability; transport: Transport; outbox: InMemoryOutbox; profile: PeerProfile }
}

async function buyStamp(beeUrl: string): Promise<string> {
  const res = await fetch(`${beeUrl}/stamps/100000/20`, { method: 'POST' })
  return (await res.json()).batchID
}

async function world(): Promise<World> {
  const broker = await startMockBee({ nodes: ['alice-bee', 'bob-bee'] })

  const aliceAcc = privateKeyToAccount(ALICE_PK)
  const bobAcc = privateKeyToAccount(BOB_PK)

  const aliceBee = new Bee(broker.url('alice-bee'))
  const bobBee = new Bee(broker.url('bob-bee'))

  const aliceFeed = ('0x' + 'a1'.repeat(20)) as Hex
  const bobFeed = ('0x' + 'b1'.repeat(20)) as Hex

  const aliceTransport = new Transport({
    bee: aliceBee,
    selfWallet: aliceAcc.address,
    selfFeedOwner: aliceFeed,
    signMessage: m => aliceAcc.signMessage({ message: m }),
    postageBatchId: await buyStamp(broker.url('alice-bee')),
  })
  const bobTransport = new Transport({
    bee: bobBee,
    selfWallet: bobAcc.address,
    selfFeedOwner: bobFeed,
    signMessage: m => bobAcc.signMessage({ message: m }),
    postageBatchId: await buyStamp(broker.url('bob-bee')),
  })

  const aliceProfile: PeerProfile = {
    wallet: aliceAcc.address,
    pssPublicKey: broker.node('alice-bee').pssPublicKey as Hex,
    swarmOverlay: broker.node('alice-bee').overlay as Hex,
  }
  const bobProfile: PeerProfile = {
    wallet: bobAcc.address,
    pssPublicKey: broker.node('bob-bee').pssPublicKey as Hex,
    swarmOverlay: broker.node('bob-bee').overlay as Hex,
  }

  const aliceOutbox = new InMemoryOutbox()
  const bobOutbox = new InMemoryOutbox()

  const aliceR = new Reliability({
    transport: aliceTransport,
    outbox: aliceOutbox,
    resolveProfile: w => (w.toLowerCase() === bobAcc.address.toLowerCase() ? bobProfile : null),
    backoff: [50, 100, 200],
  })
  const bobR = new Reliability({
    transport: bobTransport,
    outbox: bobOutbox,
    resolveProfile: w => (w.toLowerCase() === aliceAcc.address.toLowerCase() ? aliceProfile : null),
    backoff: [50, 100, 200],
  })

  return {
    broker,
    alice: { reliability: aliceR, transport: aliceTransport, outbox: aliceOutbox, profile: aliceProfile },
    bob:   { reliability: bobR,   transport: bobTransport,   outbox: bobOutbox,   profile: bobProfile   },
  }
}

describe('Reliability + Transport + mock-bee', () => {
  let w: World

  beforeEach(async () => { w = await world() })
  afterEach(async () => {
    w.alice.reliability.stop()
    w.bob.reliability.stop()
    await w.broker.stop()
  })

  it('end-to-end: alice sends, bob auto-acks, alice transitions to delivered', async () => {
    const inbox: Envelope[] = []
    w.bob.reliability.onIncomingMessage(env => inbox.push(env))

    await w.bob.reliability.start()
    await w.alice.reliability.start()
    // Give the websocket a tick to register.
    await new Promise(r => setTimeout(r, 30))

    const sent = await w.alice.reliability.send({
      to: w.bob.profile,
      type: 'msg',
      payload: { text: 'hi bob' },
    })

    // Wait until bob has the inbound + alice has the ack reflected.
    await vi.waitFor(async () => {
      const e = await w.alice.outbox.get(sent.envelope.msgId)
      expect(e?.status).toBe('delivered')
    }, { timeout: 1000, interval: 20 })

    expect(inbox).toHaveLength(1)
    expect((inbox[0].payload as { text: string }).text).toBe('hi bob')
  })

  it('read receipt promotes delivered → read', async () => {
    await w.bob.reliability.start()
    await w.alice.reliability.start()
    await new Promise(r => setTimeout(r, 30))

    const incoming: Envelope[] = []
    w.bob.reliability.onIncomingMessage(env => {
      if (env.type === 'msg') incoming.push(env)
    })

    const sent = await w.alice.reliability.send({
      to: w.bob.profile,
      type: 'msg',
      payload: { text: 'read me' },
    })

    await vi.waitFor(async () => {
      expect((await w.alice.outbox.get(sent.envelope.msgId))?.status).toBe('delivered')
    }, { timeout: 1000, interval: 20 })

    expect(incoming[0].msgId).toBe(sent.envelope.msgId)
    await w.bob.reliability.markRead(sent.envelope.msgId, w.alice.profile)

    await vi.waitFor(async () => {
      expect((await w.alice.outbox.get(sent.envelope.msgId))?.status).toBe('read')
    }, { timeout: 1000, interval: 20 })
  })

  it('emits status events: sent → delivered', async () => {
    await w.bob.reliability.start()
    await w.alice.reliability.start()
    await new Promise(r => setTimeout(r, 30))

    const events: string[] = []
    w.alice.reliability.onStatus(e => events.push(e.status))

    await w.alice.reliability.send({
      to: w.bob.profile,
      type: 'msg',
      payload: { text: 'event' },
    })

    await vi.waitFor(() => {
      expect(events).toContain('delivered')
    }, { timeout: 1000, interval: 20 })

    expect(events[0]).toBe('sent')
    expect(events.at(-1)).toBe('delivered')
  })
})
