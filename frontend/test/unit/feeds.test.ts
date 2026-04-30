import { describe, it, expect, beforeEach } from 'vitest'
import { FeedIndex, Topic } from '@ethersphere/bee-js'
import { privateKeyToAccount } from 'viem/accounts'
import { Feeds, outboxTopic, type FeedsBee } from '../../src/lib/feeds'
import { signEnvelope } from '../../src/lib/envelope'
import type { Envelope, Hex } from '../../src/lib/types'

const ALICE_PK = '0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d' as Hex
const BOB_PK = '0x8b3a350cf5c34c9194ca85829a2df0ec3153be0318b5e2d3348e872092edffba' as Hex

const ALICE_FEED_PK = '0x' + '11'.repeat(32) as Hex
const BOB_FEED_PK = '0x' + '22'.repeat(32) as Hex

const aliceWallet = privateKeyToAccount(ALICE_PK).address
const bobWallet = privateKeyToAccount(BOB_PK).address
const aliceFeedOwner = privateKeyToAccount(ALICE_FEED_PK).address
const bobFeedOwner = privateKeyToAccount(BOB_FEED_PK).address

const aliceSign = (m: string) => privateKeyToAccount(ALICE_PK).signMessage({ message: m })

/**
 * Minimal in-memory bee feed store that conforms to FeedsBee. Each
 * (owner, topic) pair is a sequence-style append-only log. uploadPayload
 * appends; downloadPayload reads latest or by index.
 */
class FakeBeeFeed implements FeedsBee {
  // key = `${owner.toLowerCase()}|${topic.toHex()}` → list of payloads
  private store = new Map<string, Uint8Array[]>()

  private static keyFor(owner: string, topic: Topic): string {
    return `${owner.toLowerCase().replace(/^0x/, '')}|${topic.toHex()}`
  }

  makeFeedWriter(topic: Topic, signer: string) {
    const owner = privateKeyToAccount(signer as Hex).address
    const key = FakeBeeFeed.keyFor(owner, topic)
    const store = this.store
    return {
      owner,
      topic,
      uploadPayload: async (_stamp: unknown, payload: Uint8Array | string) => {
        const list = store.get(key) ?? []
        list.push(typeof payload === 'string' ? new TextEncoder().encode(payload) : payload)
        store.set(key, list)
        return { reference: '0x' + '00'.repeat(32) }
      },
      uploadReference: async () => { throw new Error('not implemented') },
      upload: async () => { throw new Error('not implemented') },
      download: async () => { throw new Error('not implemented') },
      downloadPayload: async () => { throw new Error('use the reader') },
      downloadReference: async () => { throw new Error('not implemented') },
    } as unknown as ReturnType<FeedsBee['makeFeedWriter']>
  }

  makeFeedReader(topic: Topic, owner: string) {
    const key = FakeBeeFeed.keyFor(owner, topic)
    const store = this.store
    return {
      owner,
      topic,
      download: async () => { throw new Error('not implemented') },
      downloadReference: async () => { throw new Error('not implemented') },
      downloadPayload: async (options?: { index?: FeedIndex | number }) => {
        const list = store.get(key) ?? []
        if (list.length === 0) throw new Error('feed empty')
        let idx: number
        if (options?.index === undefined) idx = list.length - 1
        else if (typeof options.index === 'number') idx = options.index
        else idx = Number(options.index.toBigInt())
        if (idx < 0 || idx >= list.length) throw new Error(`no update at ${idx}`)
        return {
          payload: { toUint8Array: () => list[idx], toUtf8: () => new TextDecoder().decode(list[idx]) },
          feedIndex: FeedIndex.fromBigInt(BigInt(idx)),
        }
      },
    } as unknown as ReturnType<FeedsBee['makeFeedReader']>
  }
}

async function makeMsg(text: string, ts: number): Promise<Envelope> {
  return signEnvelope(
    { from: aliceWallet, to: bobWallet, feedOwner: aliceFeedOwner, type: 'msg', payload: { text }, ts },
    aliceSign,
  )
}

describe('Feeds', () => {
  let bee: FakeBeeFeed
  let alice: Feeds
  let bob: Feeds

  beforeEach(() => {
    bee = new FakeBeeFeed()
    alice = new Feeds({ bee, selfWallet: aliceWallet, feedPrivateKey: ALICE_FEED_PK, postageBatchId: 'stamp-a' })
    bob = new Feeds({ bee, selfWallet: bobWallet, feedPrivateKey: BOB_FEED_PK, postageBatchId: 'stamp-b' })
  })

  it('outboxTopic is deterministic and case-insensitive on the wallet', () => {
    const a = outboxTopic('0xABCDEF0000000000000000000000000000000000')
    const b = outboxTopic('0xabcdef0000000000000000000000000000000000')
    expect(a.toHex()).toBe(b.toHex())
  })

  it('writeOutbox + readOutbox round-trips a single envelope', async () => {
    const env = await makeMsg('hi', 1_000)
    await alice.writeOutbox(bobWallet, env)

    const got = await bob.readOutbox({ senderFeedOwner: aliceFeedOwner, sinceTs: 0 })
    expect(got).toHaveLength(1)
    expect(got[0].msgId).toBe(env.msgId)
    expect((got[0].payload as { text: string }).text).toBe('hi')
  })

  it('returns empty when the feed has no updates', async () => {
    const got = await bob.readOutbox({ senderFeedOwner: aliceFeedOwner, sinceTs: 0 })
    expect(got).toEqual([])
  })

  it('returns oldest-first across multiple writes', async () => {
    const e1 = await makeMsg('one', 1_000)
    const e2 = await makeMsg('two', 2_000)
    const e3 = await makeMsg('three', 3_000)
    await alice.writeOutbox(bobWallet, e1)
    await alice.writeOutbox(bobWallet, e2)
    await alice.writeOutbox(bobWallet, e3)

    const got = await bob.readOutbox({ senderFeedOwner: aliceFeedOwner, sinceTs: 0 })
    expect(got.map(e => (e.payload as { text: string }).text)).toEqual(['one', 'two', 'three'])
  })

  it('stops at sinceTs and excludes equal/older entries', async () => {
    await alice.writeOutbox(bobWallet, await makeMsg('old', 500))
    await alice.writeOutbox(bobWallet, await makeMsg('cutoff', 1_000))
    await alice.writeOutbox(bobWallet, await makeMsg('new1', 2_000))
    await alice.writeOutbox(bobWallet, await makeMsg('new2', 3_000))

    const got = await bob.readOutbox({ senderFeedOwner: aliceFeedOwner, sinceTs: 1_000 })
    expect(got.map(e => (e.payload as { text: string }).text)).toEqual(['new1', 'new2'])
  })

  it('honors maxItems', async () => {
    for (let i = 1; i <= 5; i++) {
      await alice.writeOutbox(bobWallet, await makeMsg(`m${i}`, i * 1_000))
    }
    const got = await bob.readOutbox({ senderFeedOwner: aliceFeedOwner, sinceTs: 0, maxItems: 3 })
    expect(got).toHaveLength(3)
    // Should be the *latest* 3 (oldest-first within that slice).
    expect(got.map(e => (e.payload as { text: string }).text)).toEqual(['m3', 'm4', 'm5'])
  })

  it('writes per-recipient feeds independently', async () => {
    const aliceToBob = await makeMsg('to bob', 1_000)
    const carol = '0xC0a01000000000000000000000000000000A0000' as Hex
    const aliceToCarol = await signEnvelope(
      { from: aliceWallet, to: carol, feedOwner: aliceFeedOwner, type: 'msg', payload: { text: 'to carol' }, ts: 1_000 },
      aliceSign,
    )
    await alice.writeOutbox(bobWallet, aliceToBob)
    await alice.writeOutbox(carol, aliceToCarol)

    const bobsView = await bob.readOutbox({ senderFeedOwner: aliceFeedOwner, sinceTs: 0 })
    expect(bobsView).toHaveLength(1)
    expect(bobsView[0].msgId).toBe(aliceToBob.msgId)
  })

  it('does not surface a peer\'s feed addressed to someone else', async () => {
    // Alice writes to Carol's outbox, but Bob queries his own.
    const carol = '0xC0a01000000000000000000000000000000A0000' as Hex
    await alice.writeOutbox(carol, await makeMsg('not for bob', 1_000))

    const bobsView = await bob.readOutbox({ senderFeedOwner: aliceFeedOwner, sinceTs: 0 })
    expect(bobsView).toEqual([])
  })
})
