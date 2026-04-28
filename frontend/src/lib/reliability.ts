import type { TransportLike } from './transport'
import type { OutboxEntry, OutboxStore } from './outbox'
import type { Envelope, EnvelopeType, Hex, PeerProfile } from './types'

/**
 * Backoff schedule from spec §6: 30s, 2m, 10m, 1h, 6h.
 * The Nth entry is the wait between attempt N and attempt N+1.
 * After the last entry's wait expires without an ack, the message is
 * marked `failed`.
 */
export const DEFAULT_BACKOFF_MS: number[] = [
  30 * 1_000,
  2 * 60 * 1_000,
  10 * 60 * 1_000,
  60 * 60 * 1_000,
  6 * 60 * 60 * 1_000,
]

type TimeoutHandle = ReturnType<typeof setTimeout>

export interface ReliabilityOptions {
  transport: TransportLike
  outbox: OutboxStore
  /** Wait between successive attempts. Default = DEFAULT_BACKOFF_MS. */
  backoff?: number[]
  /** Lookup peer profile (for auto-acking incoming msgs). Optional. */
  resolveProfile?: (wallet: Hex) => Promise<PeerProfile | null> | PeerProfile | null
  /** Hooks (mostly for tests). */
  now?: () => number
  setTimeoutFn?: (cb: () => void, ms: number) => TimeoutHandle
  clearTimeoutFn?: (h: TimeoutHandle) => void
}

export interface ReliabilitySendArgs {
  to: PeerProfile
  type: EnvelopeType
  payload: unknown
}

export type StatusListener = (entry: OutboxEntry) => void
export type IncomingListener = (env: Envelope) => void

export class Reliability {
  private readonly backoff: number[]
  private readonly now: () => number
  private readonly setTimeoutFn: (cb: () => void, ms: number) => TimeoutHandle
  private readonly clearTimeoutFn: (h: TimeoutHandle) => void

  private timers = new Map<string, TimeoutHandle>()
  private statusListeners = new Set<StatusListener>()
  private incomingListeners = new Set<IncomingListener>()
  private subscription?: { cancel: () => void }
  private started = false

  constructor(private readonly opts: ReliabilityOptions) {
    this.backoff = opts.backoff ?? DEFAULT_BACKOFF_MS
    this.now = opts.now ?? Date.now
    this.setTimeoutFn = opts.setTimeoutFn ?? ((cb, ms) => setTimeout(cb, ms))
    this.clearTimeoutFn = opts.clearTimeoutFn ?? (h => clearTimeout(h as ReturnType<typeof setTimeout>))
  }

  /** Subscribe to incoming PSS messages and resume retry timers from the outbox. */
  async start(): Promise<void> {
    if (this.started) return
    this.started = true

    this.subscription = this.opts.transport.subscribe({
      onMessage: env => this.onIncoming(env),
    })

    // Resume in-flight messages on startup.
    const pending = await this.opts.outbox.list({ status: 'sent' })
    for (const entry of pending) {
      this.scheduleRetry(entry)
    }
  }

  stop(): void {
    this.subscription?.cancel()
    this.subscription = undefined
    for (const h of this.timers.values()) this.clearTimeoutFn(h)
    this.timers.clear()
    this.started = false
  }

  /** Send a new message. Records to outbox, publishes via transport, schedules retry. */
  async send(args: ReliabilitySendArgs): Promise<OutboxEntry> {
    const env = await this.opts.transport.send({
      to: args.to,
      type: args.type,
      payload: args.payload,
    })

    const ts = this.now()
    const wait = this.backoff[0]
    const entry: OutboxEntry = {
      msgId: env.msgId,
      envelope: env,
      to: args.to,
      status: 'sent',
      attempts: 1,
      lastSentAt: ts,
      nextRetryAt: wait !== undefined ? ts + wait : null,
    }

    await this.opts.outbox.put(entry)
    this.notifyStatus(entry)
    this.scheduleRetry(entry)
    return entry
  }

  onStatus(cb: StatusListener): () => void {
    this.statusListeners.add(cb)
    return () => this.statusListeners.delete(cb)
  }

  onIncomingMessage(cb: IncomingListener): () => void {
    this.incomingListeners.add(cb)
    return () => this.incomingListeners.delete(cb)
  }

  /** Send a `read` receipt for a message. Caller must know the original sender's profile. */
  async markRead(msgId: Hex, sender: PeerProfile): Promise<void> {
    await this.opts.transport.send({
      to: sender,
      type: 'read',
      payload: { readMsgId: msgId },
    })
  }

  // -- internals -----------------------------------------------------------

  private scheduleRetry(entry: OutboxEntry): void {
    if (entry.nextRetryAt == null) return
    const delay = Math.max(0, entry.nextRetryAt - this.now())
    const handle = this.setTimeoutFn(() => this.onRetryDue(entry.msgId), delay)
    const prev = this.timers.get(entry.msgId)
    if (prev) this.clearTimeoutFn(prev)
    this.timers.set(entry.msgId, handle)
  }

  private async onRetryDue(msgId: Hex): Promise<void> {
    this.timers.delete(msgId)
    const entry = await this.opts.outbox.get(msgId)
    if (!entry || entry.status !== 'sent') return

    // backoff.length entries → backoff.length retries → backoff.length + 1
    // total attempts (initial + N retries). After the final retry, mark failed.
    const maxAttempts = this.backoff.length + 1
    if (entry.attempts >= maxAttempts) {
      await this.failEntry(msgId)
      return
    }

    try {
      await this.opts.transport.retransmit(entry.envelope, entry.to)
    } catch {
      // Best-effort. Leave the timer chain ticking; we'll bump attempts
      // either way so a wedged transport can't loop forever.
    }

    const attempts = entry.attempts + 1
    const ts = this.now()

    if (attempts >= maxAttempts) {
      const failed = await this.opts.outbox.update(msgId, {
        attempts,
        lastSentAt: ts,
        nextRetryAt: null,
        status: 'failed',
        failedReason: 'retry budget exhausted',
      })
      if (failed) this.notifyStatus(failed)
      return
    }

    const wait = this.backoff[attempts - 1]
    const updated = await this.opts.outbox.update(msgId, {
      attempts,
      lastSentAt: ts,
      nextRetryAt: wait !== undefined ? ts + wait : null,
    })
    if (!updated) return
    this.notifyStatus(updated)
    if (updated.nextRetryAt != null) this.scheduleRetry(updated)
  }

  private async failEntry(msgId: Hex): Promise<void> {
    const failed = await this.opts.outbox.update(msgId, {
      status: 'failed',
      nextRetryAt: null,
      failedReason: 'retry budget exhausted',
    })
    if (failed) this.notifyStatus(failed)
  }

  private async onIncoming(env: Envelope): Promise<void> {
    if (env.type === 'ack') {
      const ackId = (env.payload as { ackMsgId?: Hex } | undefined)?.ackMsgId
      if (ackId) await this.transitionTo(ackId, 'delivered')
    } else if (env.type === 'read') {
      const readId = (env.payload as { readMsgId?: Hex } | undefined)?.readMsgId
      if (readId) await this.transitionTo(readId, 'read')
    } else if (env.type === 'msg') {
      // Auto-ack on receipt (spec §6).
      await this.autoAck(env)
    }

    for (const cb of this.incomingListeners) {
      try { cb(env) } catch { /* listener error must not break dispatch */ }
    }
  }

  private async autoAck(env: Envelope): Promise<void> {
    if (!this.opts.resolveProfile) return
    const sender = await this.opts.resolveProfile(env.from)
    if (!sender) return
    try {
      await this.opts.transport.send({
        to: sender,
        type: 'ack',
        payload: { ackMsgId: env.msgId },
      })
    } catch {
      // Best-effort. Sender will retry; we'll re-ack next time.
    }
  }

  private async transitionTo(msgId: Hex, status: 'delivered' | 'read'): Promise<void> {
    const entry = await this.opts.outbox.get(msgId)
    if (!entry) return
    // delivered -> read is allowed; read -> anything is terminal.
    if (entry.status === 'read') return
    if (entry.status === 'delivered' && status === 'delivered') return
    if (entry.status === 'failed') return

    const updated = await this.opts.outbox.update(msgId, {
      status,
      nextRetryAt: null,
    })
    const t = this.timers.get(msgId)
    if (t) {
      this.clearTimeoutFn(t)
      this.timers.delete(msgId)
    }
    if (updated) this.notifyStatus(updated)
  }

  private notifyStatus(entry: OutboxEntry): void {
    for (const cb of this.statusListeners) {
      try { cb(entry) } catch { /* swallow */ }
    }
  }
}
