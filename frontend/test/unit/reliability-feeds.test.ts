import { describe, it, expect, vi } from 'vitest'
import { FeedIndex, Topic } from '@ethersphere/bee-js'
import { privateKeyToAccount } from 'viem/accounts'
import { Reliability } from '../../src/lib/reliability'
import { InMemoryOutbox } from '../../src/lib/outbox'
import { Feeds, type FeedsBee } from '../../src/lib/feeds'
import type { TransportLike, SendArgs, SubscribeArgs } from '../../src/lib/transport'
import type { Envelope, Hex, PeerProfile } from '../../src/lib/types'

const ALICE = ('0x' + 'aa'.repeat(20)) as Hex
const BOB = ('0x' + 'bb'.repeat(20)) as Hex
const ALICE_FEED_PK = ('0x' + '11'.repeat(32)) as Hex
const aliceFeedOwner = privateKeyToAccount(ALICE_FEED_PK).address

const bobProfile: PeerProfile = {
  wallet: BOB,
  pssPublicKey: ('0x02' + 'bb'.repeat(32)) as Hex,
  swarmOverlay: ('0x' + 'bb'.repeat(32)) as Hex,
}

class FakeTransport implements TransportLike {
  sentEnvelopes: Envelope[] = []
  retransmits: Envelope[] = []
  private listener?: SubscribeArgs
  private msgCounter = 0

  async send(args: SendArgs): Promise<Envelope> {
    this.msgCounter++
    const env: Envelope = {
      v: 1,
      type: args.type,
      msgId: ('0x' + this.msgCounter.toString(16).padStart(64, '0')) as Hex,
      from: ALICE,
      to: args.to.wallet,
      feedOwner: aliceFeedOwner,
      ts: Date.now(),
      nonce: ('0x' + 'ee'.repeat(16)) as Hex,
      payload: args.payload,
      sig: ('0x' + '11'.repeat(65)) as Hex,
    }
    this.sentEnvelopes.push(env)
    return env
  }
  async retransmit(env: Envelope): Promise<void> { this.retransmits.push(env) }
  subscribe(args: SubscribeArgs) {
    this.listener = args
    return { cancel: () => { this.listener = undefined } }
  }
  async deliver(env: Envelope): Promise<void> { await this.listener?.onMessage(env) }
}

class FakeBeeFeed implements FeedsBee {
  private store = new Map<string, Uint8Array[]>()
  static keyFor(owner: string, topic: Topic) {
    return `${owner.toLowerCase().replace(/^0x/, '')}|${topic.toHex()}`
  }
  makeFeedWriter(topic: Topic, signer: string) {
    const owner = privateKeyToAccount(signer as Hex).address
    const key = FakeBeeFeed.keyFor(owner, topic)
    const store = this.store
    return {
      owner, topic,
      uploadPayload: async (_: unknown, payload: Uint8Array | string) => {
        const list = store.get(key) ?? []
        list.push(typeof payload === 'string' ? new TextEncoder().encode(payload) : payload)
        store.set(key, list)
        return { reference: '0x' + '00'.repeat(32) }
      },
      uploadReference: async () => { throw new Error('nope') },
      upload: async () => { throw new Error('nope') },
      download: async () => { throw new Error('nope') },
      downloadPayload: async () => { throw new Error('nope') },
      downloadReference: async () => { throw new Error('nope') },
    } as unknown as ReturnType<FeedsBee['makeFeedWriter']>
  }
  makeFeedReader(topic: Topic, owner: string) {
    const key = FakeBeeFeed.keyFor(owner, topic)
    const store = this.store
    return {
      owner, topic,
      download: async () => { throw new Error('nope') },
      downloadReference: async () => { throw new Error('nope') },
      downloadPayload: async (options?: { index?: FeedIndex | number }) => {
        const list = store.get(key) ?? []
        if (list.length === 0) throw new Error('empty')
        let idx: number
        if (options?.index === undefined) idx = list.length - 1
        else if (typeof options.index === 'number') idx = options.index
        else idx = Number(options.index.toBigInt())
        return {
          payload: { toUint8Array: () => list[idx], toUtf8: () => new TextDecoder().decode(list[idx]) },
          feedIndex: FeedIndex.fromBigInt(BigInt(idx)),
        }
      },
    } as unknown as ReturnType<FeedsBee['makeFeedReader']>
  }
}

describe('Reliability + Feeds composition', () => {
  it('mirrors every msg send to the outbox feed', async () => {
    const transport = new FakeTransport()
    const outbox = new InMemoryOutbox()
    const beeFeed = new FakeBeeFeed()
    const aliceFeeds = new Feeds({
      bee: beeFeed, selfWallet: ALICE, feedPrivateKey: ALICE_FEED_PK, postageBatchId: 'stamp',
    })
    // Bob-side reader: same shared bee, but selfWallet is BOB so the
    // outbox topic resolves to swarmchat:outbox:<bob>.
    const bobFeeds = new Feeds({
      bee: beeFeed, selfWallet: BOB, feedPrivateKey: ('0x' + '22'.repeat(32)) as Hex, postageBatchId: 'stamp',
    })
    const r = new Reliability({ transport, outbox, feeds: aliceFeeds, backoff: [10_000] })
    await r.start()

    await r.send({ to: bobProfile, type: 'msg', payload: { text: 'hello' } })
    // Wait for the fire-and-forget feed write to settle.
    await vi.waitFor(async () => {
      const got = await bobFeeds.readOutbox({
        senderFeedOwner: aliceFeedOwner as Hex,
        sinceTs: 0,
      })
      expect(got).toHaveLength(1)
      expect((got[0].payload as { text: string }).text).toBe('hello')
    }, { timeout: 500, interval: 10 })

    r.stop()
  })

  it('does not mirror non-msg envelopes (acks/reads/typing)', async () => {
    const transport = new FakeTransport()
    const outbox = new InMemoryOutbox()
    const beeFeed = new FakeBeeFeed()
    const aliceFeeds = new Feeds({
      bee: beeFeed, selfWallet: ALICE, feedPrivateKey: ALICE_FEED_PK, postageBatchId: 'stamp',
    })
    const bobFeeds = new Feeds({
      bee: beeFeed, selfWallet: BOB, feedPrivateKey: ('0x' + '22'.repeat(32)) as Hex, postageBatchId: 'stamp',
    })
    const r = new Reliability({ transport, outbox, feeds: aliceFeeds, backoff: [10_000] })
    await r.start()

    await r.send({ to: bobProfile, type: 'ack', payload: { ackMsgId: '0x' + '00'.repeat(32) } })
    await r.send({ to: bobProfile, type: 'typing', payload: { isTyping: true } })

    await new Promise(r => setTimeout(r, 30))
    const got = await bobFeeds.readOutbox({
      senderFeedOwner: aliceFeedOwner as Hex,
      sinceTs: 0,
    })
    expect(got).toEqual([])
    r.stop()
  })

  it('a feed-write failure does not break the send', async () => {
    const transport = new FakeTransport()
    const outbox = new InMemoryOutbox()
    const brokenFeeds = {
      writeOutbox: async () => { throw new Error('feed offline') },
    } as unknown as Feeds
    const r = new Reliability({ transport, outbox, feeds: brokenFeeds, backoff: [10_000] })
    await r.start()

    const entry = await r.send({ to: bobProfile, type: 'msg', payload: {} })
    expect(entry.status).toBe('sent')
    expect(transport.sentEnvelopes).toHaveLength(1)
    r.stop()
  })
})
