import type { Bee, PssSubscription } from '@ethersphere/bee-js'
import { Topic } from '@ethersphere/bee-js'
import {
  decodeEnvelope,
  encodeEnvelope,
  inboxTopic,
  signEnvelope,
  verifyEnvelope,
} from './envelope'
import type { Envelope, EnvelopeType, Hex, PeerProfile, SignMessage } from './types'

export interface TransportOptions {
  bee: Bee
  selfWallet: Hex
  /** Sender's feed-owner address; embedded in every outgoing envelope so
   *  recipients can find this user's outbox feed. */
  selfFeedOwner: Hex
  signMessage: SignMessage
  postageBatchId: string
  /** Drop messages from these wallets after sig verification. */
  blocklist?: Set<Hex>
  /** Max msgIds to remember for dedup. Default 10_000 per §6 of the spec. */
  dedupCapacity?: number
}

export interface SendArgs {
  to: PeerProfile
  type: EnvelopeType
  payload: unknown
  /** Optional group context; tagged on the signed envelope so the
   *  recipient can route it to a group conversation. */
  groupId?: Hex
}

export interface SubscribeArgs {
  onMessage: (env: Envelope) => void
  onError?: (err: unknown) => void
  onClose?: () => void
}

export interface SubscriptionHandle {
  cancel: () => void
}

/** Subset of Transport that downstream layers (Reliability) depend on. */
export interface TransportLike {
  send(args: SendArgs): Promise<Envelope>
  retransmit(env: Envelope, to: PeerProfile): Promise<void>
  subscribe(args: SubscribeArgs): SubscriptionHandle
}

/**
 * Wraps bee-js PSS with the SwarmChat envelope: sign on send, verify on
 * receipt, drop blocked senders, drop duplicates.
 */
export class Transport implements TransportLike {
  private readonly dedup = new Set<string>()
  private readonly dedupCapacity: number

  constructor(private readonly opts: TransportOptions) {
    this.dedupCapacity = opts.dedupCapacity ?? 10_000
  }

  async send(args: SendArgs): Promise<Envelope> {
    const env = await signEnvelope(
      {
        from: this.opts.selfWallet,
        to: args.to.wallet,
        feedOwner: this.opts.selfFeedOwner,
        type: args.type,
        payload: args.payload,
        groupId: args.groupId,
      },
      this.opts.signMessage,
    )
    await this.publish(env, args.to)
    // Record our own send so we don't reprocess on echo.
    this.markSeen(env.msgId)
    return env
  }

  /** Re-publish a previously signed envelope (same msgId/sig) for retries. */
  async retransmit(env: Envelope, to: PeerProfile): Promise<void> {
    await this.publish(env, to)
  }

  private async publish(env: Envelope, to: PeerProfile): Promise<void> {
    const topic = Topic.fromString(inboxTopic(to.wallet))
    const target = to.swarmOverlay.slice(2, 6) // first 2 bytes
    const recipient = to.pssPublicKey.startsWith('0x')
      ? to.pssPublicKey.slice(2)
      : to.pssPublicKey

    await this.opts.bee.pssSend(
      this.opts.postageBatchId,
      topic,
      target,
      encodeEnvelope(env),
      recipient,
    )
  }

  subscribe(args: SubscribeArgs): PssSubscription {
    const topic = Topic.fromString(inboxTopic(this.opts.selfWallet))
    return this.opts.bee.pssSubscribe(topic, {
      onMessage: async (message: { toUtf8(): string }) => {
        try {
          const env = decodeEnvelope(message.toUtf8())
          if (!this.shouldAccept(env)) return
          if (!(await verifyEnvelope(env))) return
          if (this.opts.blocklist?.has(env.from.toLowerCase() as Hex)) return
          this.markSeen(env.msgId)
          args.onMessage(env)
        } catch (err) {
          args.onError?.(err)
        }
      },
      onError: err => args.onError?.(err),
      onClose: () => args.onClose?.(),
    })
  }

  private shouldAccept(env: Envelope): boolean {
    if (env.v !== 1) return false
    if (this.dedup.has(env.msgId)) return false
    return true
  }

  private markSeen(msgId: string) {
    if (this.dedup.size >= this.dedupCapacity) {
      const oldest = this.dedup.values().next().value
      if (oldest) this.dedup.delete(oldest)
    }
    this.dedup.add(msgId)
  }
}
