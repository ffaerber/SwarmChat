import type { Hex } from './types'
import type {
  ChatMessage,
  ConversationSummary,
  GroupConversationSummary,
  MessageStatus,
  MessagesStore,
} from './messages-store'

export interface IndexedDBMessagesOptions {
  dbName?: string
  storeName?: string
  idbFactory?: IDBFactory
}

const DEFAULT_DB = 'swarmchat-messages'
const DEFAULT_STORE = 'messages'
/** v2 adds a `groupKey` index for group conversation lookups. */
const DB_VERSION = 2

export class IndexedDBMessages implements MessagesStore {
  private readonly dbName: string
  private readonly storeName: string
  private readonly idb: IDBFactory
  private dbPromise?: Promise<IDBDatabase>
  private listeners = new Set<() => void>()

  constructor(opts: IndexedDBMessagesOptions = {}) {
    this.dbName = opts.dbName ?? DEFAULT_DB
    this.storeName = opts.storeName ?? DEFAULT_STORE
    const factory = opts.idbFactory ?? (globalThis as { indexedDB?: IDBFactory }).indexedDB
    if (!factory) throw new Error('IndexedDB is not available in this environment')
    this.idb = factory
  }

  async close(): Promise<void> {
    if (!this.dbPromise) return
    const db = await this.dbPromise
    db.close()
    this.dbPromise = undefined
  }

  async put(msg: ChatMessage): Promise<void> {
    const db = await this.db()
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(this.storeName, 'readwrite')
      tx.objectStore(this.storeName).put(this.toRow(msg))
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error)
    })
    this.emit()
  }

  async updateStatus(msgId: Hex, status: MessageStatus): Promise<void> {
    const db = await this.db()
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(this.storeName, 'readwrite')
      const store = tx.objectStore(this.storeName)
      const getReq = store.get(msgId)
      getReq.onsuccess = () => {
        const cur = getReq.result as (ChatMessage & { peerKey?: string; groupKey?: string }) | undefined
        if (!cur) return
        store.put(this.toRow({ ...cur, status }))
      }
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error)
    })
    this.emit()
  }

  private toRow(msg: ChatMessage): ChatMessage & { peerKey: string; groupKey: string } {
    return {
      ...msg,
      peerKey: msg.peer.toLowerCase(),
      // Indexed booleans are tricky in IDB; use a sentinel string for "no group".
      groupKey: msg.groupId ? msg.groupId.toLowerCase() : '',
    }
  }

  async listForPeer(peer: Hex, limit?: number): Promise<ChatMessage[]> {
    const db = await this.db()
    const out: ChatMessage[] = []
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(this.storeName, 'readonly')
      const idx = tx.objectStore(this.storeName).index('peerKey')
      const req = idx.openCursor(IDBKeyRange.only(peer.toLowerCase()))
      req.onsuccess = () => {
        const cursor = req.result
        if (!cursor) return
        const v = cursor.value as ChatMessage
        // Only include 1:1 messages here; group messages have their own list.
        if (!v.groupId) out.push(v)
        cursor.continue()
      }
      req.onerror = () => reject(req.error)
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error)
    })
    out.sort((a, b) => a.ts - b.ts)
    return limit ? out.slice(-limit) : out
  }

  async listForGroup(groupId: Hex, limit?: number): Promise<ChatMessage[]> {
    const db = await this.db()
    const out: ChatMessage[] = []
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(this.storeName, 'readonly')
      const idx = tx.objectStore(this.storeName).index('groupKey')
      const req = idx.openCursor(IDBKeyRange.only(groupId.toLowerCase()))
      req.onsuccess = () => {
        const cursor = req.result
        if (!cursor) return
        out.push(cursor.value as ChatMessage)
        cursor.continue()
      }
      req.onerror = () => reject(req.error)
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error)
    })
    out.sort((a, b) => a.ts - b.ts)
    return limit ? out.slice(-limit) : out
  }

  async listConversations(): Promise<ConversationSummary[]> {
    const db = await this.db()
    const byPeer = new Map<string, ChatMessage[]>()
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(this.storeName, 'readonly')
      const req = tx.objectStore(this.storeName).openCursor()
      req.onsuccess = () => {
        const cursor = req.result
        if (!cursor) return
        const v = cursor.value as ChatMessage
        if (!v.groupId) {
          const k = v.peer.toLowerCase()
          const list = byPeer.get(k) ?? []
          list.push(v)
          byPeer.set(k, list)
        }
        cursor.continue()
      }
      req.onerror = () => reject(req.error)
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error)
    })
    const out: ConversationSummary[] = []
    for (const [, list] of byPeer) {
      list.sort((a, b) => a.ts - b.ts)
      out.push({ peer: list[0].peer, lastMessage: list[list.length - 1], unread: 0 })
    }
    out.sort((a, b) => b.lastMessage.ts - a.lastMessage.ts)
    return out
  }

  async listGroupConversations(): Promise<GroupConversationSummary[]> {
    const db = await this.db()
    const byGroup = new Map<string, ChatMessage[]>()
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(this.storeName, 'readonly')
      const req = tx.objectStore(this.storeName).openCursor()
      req.onsuccess = () => {
        const cursor = req.result
        if (!cursor) return
        const v = cursor.value as ChatMessage
        if (v.groupId) {
          const k = v.groupId.toLowerCase()
          const list = byGroup.get(k) ?? []
          list.push(v)
          byGroup.set(k, list)
        }
        cursor.continue()
      }
      req.onerror = () => reject(req.error)
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error)
    })
    const out: GroupConversationSummary[] = []
    for (const [, list] of byGroup) {
      list.sort((a, b) => a.ts - b.ts)
      out.push({ groupId: list[0].groupId as Hex, lastMessage: list[list.length - 1], unread: 0 })
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

  private db(): Promise<IDBDatabase> {
    if (!this.dbPromise) {
      this.dbPromise = new Promise((resolve, reject) => {
        const open = this.idb.open(this.dbName, DB_VERSION)
        open.onupgradeneeded = () => {
          const db = open.result
          const tx = open.transaction!
          const store = db.objectStoreNames.contains(this.storeName)
            ? tx.objectStore(this.storeName)
            : (() => {
                const s = db.createObjectStore(this.storeName, { keyPath: 'msgId' })
                s.createIndex('peerKey', 'peerKey', { unique: false })
                return s
              })()
          if (!store.indexNames.contains('groupKey')) {
            store.createIndex('groupKey', 'groupKey', { unique: false })
          }
        }
        open.onsuccess = () => resolve(open.result)
        open.onerror = () => reject(open.error)
      })
    }
    return this.dbPromise
  }
}
