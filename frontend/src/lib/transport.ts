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
}

export interface SubscribeArgs {
  onMessage: (env: Envelope) => void
  onError?: (err: unknown) => void
  onClose?: () => void
}

/**
 * Wraps bee-js PSS with the SwarmChat envelope: sign on send, verify on
 * receipt, drop blocked senders, drop duplicates.
 */
export class Transport {
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
        type: args.type,
        payload: args.payload,
      },
      this.opts.signMessage,
    )

    const topic = Topic.fromString(inboxTopic(args.to.wallet))
    const target = args.to.swarmOverlay.slice(2, 6) // first 2 bytes
    const recipient = args.to.pssPublicKey.startsWith('0x')
      ? args.to.pssPublicKey.slice(2)
      : args.to.pssPublicKey

    await this.opts.bee.pssSend(
      this.opts.postageBatchId,
      topic,
      target,
      encodeEnvelope(env),
      recipient,
    )
    // Record our own send so we don't reprocess on echo.
    this.markSeen(env.msgId)
    return env
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
