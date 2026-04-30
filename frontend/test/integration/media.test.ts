import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { Bee } from '@ethersphere/bee-js'
import { privateKeyToAccount } from 'viem/accounts'
import { startMockBee, MockBeeBroker } from '../mock-bee'
import { Transport } from '../../src/lib/transport'
import { Reliability } from '../../src/lib/reliability'
import { InMemoryOutbox } from '../../src/lib/outbox'
import { uploadMedia, MediaResolver } from '../../src/lib/media'
import type { Envelope, Hex, MsgPayload, PeerProfile } from '../../src/lib/types'

const ALICE_PK = '0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d' as Hex
const BOB_PK = '0x8b3a350cf5c34c9194ca85829a2df0ec3153be0318b5e2d3348e872092edffba' as Hex

async function buyStamp(beeUrl: string): Promise<string> {
  const res = await fetch(`${beeUrl}/stamps/100000/20`, { method: 'POST' })
  return (await res.json()).batchID
}

interface World {
  broker: MockBeeBroker
  alice: { reliability: Reliability; transport: Transport; bee: Bee; stamp: string }
  bob: { reliability: Reliability; transport: Transport; bee: Bee; stamp: string; profile: PeerProfile }
  bobInbox: Envelope[]
}

async function world(): Promise<World> {
  const broker = await startMockBee({ nodes: ['alice-bee', 'bob-bee'] })

  const aliceAcc = privateKeyToAccount(ALICE_PK)
  const bobAcc = privateKeyToAccount(BOB_PK)

  const aliceBee = new Bee(broker.url('alice-bee'))
  const bobBee = new Bee(broker.url('bob-bee'))

  const aliceStamp = await buyStamp(broker.url('alice-bee'))
  const bobStamp = await buyStamp(broker.url('bob-bee'))

  const aliceFeed = ('0x' + 'a1'.repeat(20)) as Hex
  const bobFeed = ('0x' + 'b1'.repeat(20)) as Hex

  const aliceTransport = new Transport({
    bee: aliceBee, selfWallet: aliceAcc.address, selfFeedOwner: aliceFeed,
    signMessage: m => aliceAcc.signMessage({ message: m }),
    postageBatchId: aliceStamp,
  })
  const bobTransport = new Transport({
    bee: bobBee, selfWallet: bobAcc.address, selfFeedOwner: bobFeed,
    signMessage: m => bobAcc.signMessage({ message: m }),
    postageBatchId: bobStamp,
  })

  const bobNode = broker.node('bob-bee')
  const bobProfile: PeerProfile = {
    wallet: bobAcc.address,
    pssPublicKey: bobNode.pssPublicKey as Hex,
    swarmOverlay: bobNode.overlay as Hex,
  }

  const aliceR = new Reliability({ transport: aliceTransport, outbox: new InMemoryOutbox(), backoff: [10_000] })
  const bobR = new Reliability({ transport: bobTransport, outbox: new InMemoryOutbox(), backoff: [10_000] })

  const bobInbox: Envelope[] = []
  bobR.onIncomingMessage(env => bobInbox.push(env))

  await aliceR.start()
  await bobR.start()
  // Let the WS upgrade settle.
  await new Promise(r => setTimeout(r, 30))

  return {
    broker,
    alice: { reliability: aliceR, transport: aliceTransport, bee: aliceBee, stamp: aliceStamp },
    bob: { reliability: bobR, transport: bobTransport, bee: bobBee, stamp: bobStamp, profile: bobProfile },
    bobInbox,
  }
}

describe('media: upload → PSS reference → download round-trip', () => {
  let w: World
  beforeEach(async () => { w = await world() })
  afterEach(async () => {
    w.alice.reliability.stop()
    w.bob.reliability.stop()
    await w.broker.stop()
  })

  it('alice uploads an image, sends the ref to bob, bob downloads and the bytes match', async () => {
    // Arrange: a PNG-like blob (random bytes are fine for round-trip).
    const original = new Uint8Array(2048).map((_, i) => i & 0xff)
    const file = new File([original], 'cat.png', { type: 'image/png' })

    // Upload via Alice's bee.
    const upload = await uploadMedia(w.alice.bee, w.alice.stamp, file, { encrypt: false })
    expect(upload.kind).toBe('image')
    expect(upload.size).toBe(2048)
    expect(upload.mime).toBe('image/png')
    expect(upload.ref).toMatch(/^0x[0-9a-f]{64}$/) // unencrypted = 32 bytes

    // Send the ref over PSS.
    const payload: MsgPayload = {
      kind: 'image', ref: upload.ref, mime: upload.mime, size: upload.size, name: upload.name,
    }
    await w.alice.reliability.send({ to: w.bob.profile, type: 'msg', payload })

    // Bob receives the envelope.
    await vi.waitFor(() => expect(w.bobInbox).toHaveLength(1), { timeout: 1000, interval: 20 })
    const got = w.bobInbox[0]
    expect((got.payload as MsgPayload).kind).toBe('image')
    expect((got.payload as { ref: Hex }).ref).toBe(upload.ref)

    // Bob downloads the bytes from his own bee node.
    const bytes = await w.bob.bee.downloadFile(upload.ref.slice(2)).then(d => d.data.toUint8Array())
    expect(bytes.length).toBe(original.length)
    for (let i = 0; i < original.length; i++) expect(bytes[i]).toBe(original[i])
  })

  it('encrypted upload returns a 64-byte reference', async () => {
    const file = new File([new Uint8Array(64)], 'secret.bin', { type: 'application/octet-stream' })
    const upload = await uploadMedia(w.alice.bee, w.alice.stamp, file, { encrypt: true })
    // Mock matches real bee's hash+key shape: 64 bytes = 128 hex chars.
    expect(upload.ref).toMatch(/^0x[0-9a-f]{128}$/)
  })

  it('MediaResolver memoizes blob URLs per reference', async () => {
    const file = new File([new Uint8Array([1, 2, 3, 4])], 'tiny.bin', { type: 'application/octet-stream' })
    const upload = await uploadMedia(w.alice.bee, w.alice.stamp, file, { encrypt: false })

    const resolver = new MediaResolver(w.bob.bee)
    const a = await resolver.resolve(upload.ref)
    const b = await resolver.resolve(upload.ref)
    expect(a).toBe(b)
    resolver.dispose()
  })

  it('rejects oversized files client-side without uploading', async () => {
    const big = new File([new Uint8Array(10 * 1024 * 1024 + 1)], 'big.bin', { type: 'application/octet-stream' })
    await expect(uploadMedia(w.alice.bee, w.alice.stamp, big)).rejects.toThrow(/cap is/)
  })
})
