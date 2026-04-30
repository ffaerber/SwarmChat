import { Topic, FeedIndex } from '@ethersphere/bee-js'
import type { FeedReader, FeedWriter } from '@ethersphere/bee-js'
import { decodeEnvelope, encodeEnvelope } from './envelope'
import type { Envelope, Hex } from './types'

/** 32-byte hex private key (with or without 0x prefix). */
export type FeedSigner = string

/**
 * Subset of the bee-js Bee class that the Feeds layer actually uses.
 * Lets callers pass any bee-shaped factory (mock or real).
 */
export interface FeedsBee {
  makeFeedWriter(topic: Topic, signer: FeedSigner): FeedWriter
  makeFeedReader(topic: Topic, owner: string): FeedReader
}

export interface FeedsOptions {
  bee: FeedsBee
  selfWallet: Hex
  feedPrivateKey: FeedSigner
  postageBatchId: string
}

/** Per-recipient outbox topic used for store-and-forward (spec §6). */
export function outboxTopic(recipient: Hex): Topic {
  return Topic.fromString(`swarmchat:outbox:${recipient.toLowerCase()}`)
}

export interface ReadOutboxArgs {
  /** The peer's *feed owner address* (derived from their feed signer). */
  senderFeedOwner: Hex
  /** Only return envelopes strictly newer than this timestamp. */
  sinceTs: number
  /** Hard cap on items returned in case the feed is huge. Default 100. */
  maxItems?: number
}

/**
 * Per-pair outbox feeds for store-and-forward. Each user maintains one feed
 * per recipient: `swarmchat:outbox:<recipient>` owned by the sender. On
 * startup, the recipient walks each contact's feed targeted at them and pulls
 * everything they missed.
 */
export class Feeds {
  constructor(private readonly opts: FeedsOptions) {}

  /** Append `env` to my outbox feed addressed to `recipient`. */
  async writeOutbox(recipient: Hex, env: Envelope): Promise<void> {
    const writer = this.opts.bee.makeFeedWriter(outboxTopic(recipient), this.opts.feedPrivateKey)
    await writer.uploadPayload(this.opts.postageBatchId, encodeEnvelope(env))
  }

  /**
   * Walk `senderFeedOwner`'s outbox feed targeted at me. Returns envelopes
   * strictly newer than `sinceTs`, oldest first. Stops at the first older
   * entry or after `maxItems`.
   */
  async readOutbox(args: ReadOutboxArgs): Promise<Envelope[]> {
    const reader = this.opts.bee.makeFeedReader(outboxTopic(this.opts.selfWallet), args.senderFeedOwner)
    const max = args.maxItems ?? 100

    let latest
    try {
      latest = await reader.downloadPayload()
    } catch {
      return [] // feed empty or non-existent
    }

    const head = parseEnvelope(latest.payload)
    if (!head || head.ts <= args.sinceTs) return []

    const collected: Envelope[] = [head]
    let idx = latest.feedIndex.toBigInt() - 1n

    while (collected.length < max && idx >= 0n) {
      try {
        const update = await reader.downloadPayload({ index: FeedIndex.fromBigInt(idx) })
        const env = parseEnvelope(update.payload)
        if (!env || env.ts <= args.sinceTs) break
        collected.unshift(env)
      } catch {
        break
      }
      idx -= 1n
    }
    return collected
  }
}

function parseEnvelope(payload: { toUint8Array(): Uint8Array }): Envelope | null {
  try {
    return decodeEnvelope(payload.toUint8Array())
  } catch {
    return null
  }
}
