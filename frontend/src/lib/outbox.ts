import type { Envelope, Hex, PeerProfile } from './types'

export type MessageStatus = 'pending' | 'sent' | 'delivered' | 'read' | 'failed'

export interface OutboxEntry {
  msgId: Hex
  envelope: Envelope
  to: PeerProfile
  status: MessageStatus
  attempts: number      // total send attempts so far (1 = initial)
  lastSentAt: number    // ms epoch of most recent pssSend
  nextRetryAt: number | null
  failedReason?: string
}

export interface OutboxStore {
  put(entry: OutboxEntry): Promise<void>
  get(msgId: Hex): Promise<OutboxEntry | undefined>
  update(msgId: Hex, patch: Partial<OutboxEntry>): Promise<OutboxEntry | undefined>
  list(filter?: { status?: MessageStatus | MessageStatus[] }): Promise<OutboxEntry[]>
  delete(msgId: Hex): Promise<void>
}

export class InMemoryOutbox implements OutboxStore {
  private entries = new Map<string, OutboxEntry>()

  async put(entry: OutboxEntry): Promise<void> {
    this.entries.set(entry.msgId, { ...entry })
  }

  async get(msgId: Hex): Promise<OutboxEntry | undefined> {
    const e = this.entries.get(msgId)
    return e ? { ...e } : undefined
  }

  async update(msgId: Hex, patch: Partial<OutboxEntry>): Promise<OutboxEntry | undefined> {
    const e = this.entries.get(msgId)
    if (!e) return undefined
    const next = { ...e, ...patch }
    this.entries.set(msgId, next)
    return { ...next }
  }

  async list(filter?: { status?: MessageStatus | MessageStatus[] }): Promise<OutboxEntry[]> {
    const all = [...this.entries.values()].map(e => ({ ...e }))
    if (!filter?.status) return all
    const wanted = Array.isArray(filter.status) ? new Set(filter.status) : new Set([filter.status])
    return all.filter(e => wanted.has(e.status))
  }

  async delete(msgId: Hex): Promise<void> {
    this.entries.delete(msgId)
  }
}
