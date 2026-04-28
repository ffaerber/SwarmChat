import type { Hex, SwarmRef } from './types'

export type MessageDirection = 'in' | 'out'
export type MessageStatus = 'sent' | 'delivered' | 'read' | 'failed'

interface ChatMessageBase {
  msgId: Hex
  /** The other party's wallet (peer in the conversation). */
  peer: Hex
  direction: MessageDirection
  ts: number
  /** Outbound only — reflects the Reliability layer's view. */
  status?: MessageStatus
}

export interface TextMessage extends ChatMessageBase {
  kind: 'text'
  text: string
}

export interface MediaMessage extends ChatMessageBase {
  kind: 'image' | 'video' | 'file'
  ref: SwarmRef
  mime: string
  size: number
  name?: string
  w?: number
  h?: number
  durationMs?: number
}

export type ChatMessage = TextMessage | MediaMessage

export interface ConversationSummary {
  peer: Hex
  lastMessage: ChatMessage
  unread: number
}

/** Short text preview for chat-list rows. */
export function previewOf(msg: ChatMessage): string {
  switch (msg.kind) {
    case 'text': return msg.text
    case 'image': return msg.name ? `📷 ${msg.name}` : '📷 Photo'
    case 'video': return msg.name ? `🎬 ${msg.name}` : '🎬 Video'
    case 'file':  return `📎 ${msg.name}`
  }
}

export interface MessagesStore {
  put(msg: ChatMessage): Promise<void>
  updateStatus(msgId: Hex, status: MessageStatus): Promise<void>
  listForPeer(peer: Hex, limit?: number): Promise<ChatMessage[]>
  listConversations(): Promise<ConversationSummary[]>
  /** A change-notification stream so React can refresh without polling. */
  subscribe(cb: () => void): () => void
}

export class InMemoryMessages implements MessagesStore {
  private byId = new Map<Hex, ChatMessage>()
  private listeners = new Set<() => void>()

  async put(msg: ChatMessage) {
    this.byId.set(msg.msgId, { ...msg })
    this.emit()
  }

  async updateStatus(msgId: Hex, status: MessageStatus) {
    const e = this.byId.get(msgId)
    if (!e) return
    this.byId.set(msgId, { ...e, status })
    this.emit()
  }

  async listForPeer(peer: Hex, limit?: number): Promise<ChatMessage[]> {
    const target = peer.toLowerCase()
    const list = [...this.byId.values()]
      .filter(m => m.peer.toLowerCase() === target)
      .sort((a, b) => a.ts - b.ts)
    return limit ? list.slice(-limit) : list
  }

  async listConversations(): Promise<ConversationSummary[]> {
    const byPeer = new Map<string, ChatMessage[]>()
    for (const m of this.byId.values()) {
      const k = m.peer.toLowerCase()
      const list = byPeer.get(k) ?? []
      list.push(m)
      byPeer.set(k, list)
    }
    const out: ConversationSummary[] = []
    for (const [, list] of byPeer) {
      list.sort((a, b) => a.ts - b.ts)
      out.push({ peer: list[0].peer, lastMessage: list[list.length - 1], unread: 0 })
    }
    out.sort((a, b) => b.lastMessage.ts - a.lastMessage.ts)
    return out
  }

  subscribe(cb: () => void): () => void {
    this.listeners.add(cb)
    return () => this.listeners.delete(cb)
  }

  private emit() {
    for (const cb of this.listeners) {
      try { cb() } catch { /* swallow */ }
    }
  }
}
