import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { Bee } from '@ethersphere/bee-js'
import { privateKeyToAccount } from 'viem/accounts'
import { startMockBee, MockBeeBroker } from '../mock-bee'
import { Transport } from '../../src/lib/transport'
import type { Envelope, Hex, PeerProfile } from '../../src/lib/types'

const ALICE_PK = '0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d' as Hex
const BOB_PK = '0x8b3a350cf5c34c9194ca85829a2df0ec3153be0318b5e2d3348e872092edffba' as Hex

interface Setup {
  broker: MockBeeBroker
  alice: Transport
  bob: Transport
  aliceWallet: Hex
  bobWallet: Hex
  aliceProfile: PeerProfile
  bobProfile: PeerProfile
}

async function buyStamp(beeUrl: string): Promise<string> {
  const res = await fetch(`${beeUrl}/stamps/100000/20`, { method: 'POST' })
  return (await res.json()).batchID
}

async function setup(): Promise<Setup> {
  const broker = await startMockBee({ nodes: ['alice-bee', 'bob-bee'] })

  const aliceAccount = privateKeyToAccount(ALICE_PK)
  const bobAccount = privateKeyToAccount(BOB_PK)

  const aliceBee = new Bee(broker.url('alice-bee'))
  const bobBee = new Bee(broker.url('bob-bee'))

  const aliceStamp = await buyStamp(broker.url('alice-bee'))
  const bobStamp = await buyStamp(broker.url('bob-bee'))

  const aliceFeed = ('0x' + 'a1'.repeat(20)) as Hex
  const bobFeed = ('0x' + 'b1'.repeat(20)) as Hex

  const alice = new Transport({
    bee: aliceBee,
    selfWallet: aliceAccount.address,
    selfFeedOwner: aliceFeed,
    signMessage: m => aliceAccount.signMessage({ message: m }),
    postageBatchId: aliceStamp,
  })
  const bob = new Transport({
    bee: bobBee,
    selfWallet: bobAccount.address,
    selfFeedOwner: bobFeed,
    signMessage: m => bobAccount.signMessage({ message: m }),
    postageBatchId: bobStamp,
  })

  const aliceNode = broker.node('alice-bee')
  const bobNode = broker.node('bob-bee')

  const aliceProfile: PeerProfile = {
    wallet: aliceAccount.address,
    pssPublicKey: aliceNode.pssPublicKey as Hex,
    swarmOverlay: aliceNode.overlay as Hex,
  }
  const bobProfile: PeerProfile = {
    wallet: bobAccount.address,
    pssPublicKey: bobNode.pssPublicKey as Hex,
    swarmOverlay: bobNode.overlay as Hex,
  }

  return {
    broker,
    alice,
    bob,
    aliceWallet: aliceAccount.address,
    bobWallet: bobAccount.address,
    aliceProfile,
    bobProfile,
  }
}

function nextEnvelope(transport: Transport, opts?: { onError?: (e: unknown) => void }): {
  promise: Promise<Envelope>
  cancel: () => void
} {
  let cancelSub: (() => void) | undefined
  const promise = new Promise<Envelope>((resolve, reject) => {
    const sub = transport.subscribe({
      onMessage: env => {
        resolve(env)
        sub.cancel()
      },
      onError: err => {
        opts?.onError?.(err)
        reject(err)
        sub.cancel()
      },
    })
    cancelSub = () => sub.cancel()
  })
  return { promise, cancel: () => cancelSub?.() }
}

describe('Transport (alice <-> bob via mock-bee)', () => {
  let s: Setup
  beforeEach(async () => { s = await setup() })
  afterEach(async () => { await s.broker.stop() })

  it('delivers a signed message from alice to bob', async () => {
    const waiter = nextEnvelope(s.bob)
    // Give the WebSocket a tick to register before sending.
    await new Promise(r => setTimeout(r, 20))

    const sent = await s.alice.send({
      to: s.bobProfile,
      type: 'msg',
      payload: { text: 'hello bob' },
    })

    const received = await waiter.promise
    expect(received.msgId).toBe(sent.msgId)
    expect(received.from.toLowerCase()).toBe(s.aliceWallet.toLowerCase())
    expect(received.to.toLowerCase()).toBe(s.bobWallet.toLowerCase())
    expect((received.payload as { text: string }).text).toBe('hello bob')
  })

  it('drops messages whose signature does not match `from`', async () => {
    let saw: Envelope | undefined
    const sub = s.bob.subscribe({ onMessage: env => { saw = env } })
    await new Promise(r => setTimeout(r, 20))

    // Send a forged envelope: signed by alice but `from` claims to be a third party.
    const aliceAccount = privateKeyToAccount(ALICE_PK)
    const forged: Envelope = {
      v: 1,
      type: 'msg',
      from: '0xdEAD000000000000000000000000000000000000' as Hex,
      to: s.bobWallet,
      feedOwner: '0xdEAD000000000000000000000000000000000000' as Hex,
      ts: Date.now(),
      nonce: '0x' + 'aa'.repeat(16) as Hex,
      msgId: ('0x' + 'bb'.repeat(32)) as Hex,
      payload: { text: 'spoof' },
      sig: await aliceAccount.signMessage({ message: 'unrelated' }) as Hex,
    }

    // Bypass the Transport's own signing and shove the forged envelope
    // through bee-js directly, exactly as a malicious peer would.
    const { Topic } = await import('@ethersphere/bee-js')
    const target = s.bobProfile.swarmOverlay.slice(2, 6)
    const recipient = s.bobProfile.pssPublicKey.slice(2)
    const stamp = await buyStamp(s.broker.url('alice-bee'))
    await new Bee(s.broker.url('alice-bee')).pssSend(
      stamp,
      Topic.fromString(`swarmchat:inbox:${s.bobWallet.toLowerCase()}`),
      target,
      new TextEncoder().encode(JSON.stringify(forged)),
      recipient,
    )

    await new Promise(r => setTimeout(r, 80))
    expect(saw).toBeUndefined()
    sub.cancel()
  })

  it('dedupes duplicate msgIds', async () => {
    const seen: Envelope[] = []
    const sub = s.bob.subscribe({ onMessage: env => { seen.push(env) } })
    await new Promise(r => setTimeout(r, 20))

    const sent = await s.alice.send({
      to: s.bobProfile,
      type: 'msg',
      payload: { text: 'once' },
    })

    // Replay the exact envelope a second time via raw pssSend.
    const { Topic } = await import('@ethersphere/bee-js')
    const target = s.bobProfile.swarmOverlay.slice(2, 6)
    const recipient = s.bobProfile.pssPublicKey.slice(2)
    const stamp = await buyStamp(s.broker.url('alice-bee'))
    await new Bee(s.broker.url('alice-bee')).pssSend(
      stamp,
      Topic.fromString(`swarmchat:inbox:${s.bobWallet.toLowerCase()}`),
      target,
      new TextEncoder().encode(JSON.stringify(sent)),
      recipient,
    )

    await new Promise(r => setTimeout(r, 80))
    expect(seen).toHaveLength(1)
    sub.cancel()
  })

  it('honors the blocklist after sig verification', async () => {
    const aliceAccount = privateKeyToAccount(ALICE_PK)
    const bobAccount = privateKeyToAccount(BOB_PK)
    const bobBee = new Bee(s.broker.url('bob-bee'))
    const blocked = new Transport({
      bee: bobBee,
      selfWallet: bobAccount.address,
      selfFeedOwner: ('0x' + 'b1'.repeat(20)) as Hex,
      signMessage: m => bobAccount.signMessage({ message: m }),
      postageBatchId: await buyStamp(s.broker.url('bob-bee')),
      blocklist: new Set([aliceAccount.address.toLowerCase() as Hex]),
    })

    let saw: Envelope | undefined
    const sub = blocked.subscribe({ onMessage: env => { saw = env } })
    await new Promise(r => setTimeout(r, 20))

    await s.alice.send({ to: s.bobProfile, type: 'msg', payload: { text: 'blocked' } })
    await new Promise(r => setTimeout(r, 80))

    expect(saw).toBeUndefined()
    sub.cancel()
  })

  it('round-trips an ack from bob back to alice', async () => {
    const aliceWaiter = nextEnvelope(s.alice)
    const bobWaiter = nextEnvelope(s.bob)
    await new Promise(r => setTimeout(r, 20))

    const msg = await s.alice.send({
      to: s.bobProfile,
      type: 'msg',
      payload: { text: 'ping' },
    })
    const got = await bobWaiter.promise
    await s.bob.send({
      to: s.aliceProfile,
      type: 'ack',
      payload: { ackMsgId: got.msgId },
    })

    const ack = await aliceWaiter.promise
    expect(ack.type).toBe('ack')
    expect((ack.payload as { ackMsgId: string }).ackMsgId).toBe(msg.msgId)
  })
})
