import type { Hex } from './types'
import type { MessageStatus, OutboxEntry, OutboxStore } from './outbox'

export interface IndexedDBOutboxOptions {
  /** Database name. Default: 'swarmchat'. */
  dbName?: string
  /** Object store name within the DB. Default: 'outbox'. */
  storeName?: string
  /**
   * IndexedDB factory. Defaults to `globalThis.indexedDB`. Pass a
   * `fake-indexeddb` `IDBFactory` to run in Node tests without globals.
   */
  idbFactory?: IDBFactory
}

const DEFAULT_DB = 'swarmchat'
const DEFAULT_STORE = 'outbox'
const DB_VERSION = 1

export class IndexedDBOutbox implements OutboxStore {
  private readonly dbName: string
  private readonly storeName: string
  private readonly idb: IDBFactory
  private dbPromise?: Promise<IDBDatabase>

  constructor(opts: IndexedDBOutboxOptions = {}) {
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

  async put(entry: OutboxEntry): Promise<void> {
    const db = await this.db()
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(this.storeName, 'readwrite')
      tx.objectStore(this.storeName).put(entry)
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error)
      tx.onabort = () => reject(tx.error ?? new Error('transaction aborted'))
    })
  }

  async get(msgId: Hex): Promise<OutboxEntry | undefined> {
    const db = await this.db()
    return new Promise((resolve, reject) => {
      const tx = db.transaction(this.storeName, 'readonly')
      const req = tx.objectStore(this.storeName).get(msgId)
      req.onsuccess = () => resolve((req.result as OutboxEntry | undefined) ?? undefined)
      req.onerror = () => reject(req.error)
    })
  }

  async update(msgId: Hex, patch: Partial<OutboxEntry>): Promise<OutboxEntry | undefined> {
    const db = await this.db()
    return new Promise((resolve, reject) => {
      const tx = db.transaction(this.storeName, 'readwrite')
      const store = tx.objectStore(this.storeName)
      let next: OutboxEntry | undefined
      const getReq = store.get(msgId)
      getReq.onsuccess = () => {
        const existing = getReq.result as OutboxEntry | undefined
        if (!existing) return // tx will commit empty; we resolve with undefined
        next = { ...existing, ...patch, msgId: existing.msgId }
        store.put(next)
      }
      getReq.onerror = () => reject(getReq.error)
      tx.oncomplete = () => resolve(next)
      tx.onerror = () => reject(tx.error)
      tx.onabort = () => reject(tx.error ?? new Error('transaction aborted'))
    })
  }

  async list(filter?: { status?: MessageStatus | MessageStatus[] }): Promise<OutboxEntry[]> {
    const db = await this.db()
    const wanted = filter?.status
      ? new Set(Array.isArray(filter.status) ? filter.status : [filter.status])
      : null

    return new Promise((resolve, reject) => {
      const tx = db.transaction(this.storeName, 'readonly')
      const out: OutboxEntry[] = []
      const cursorReq = tx.objectStore(this.storeName).openCursor()
      cursorReq.onsuccess = () => {
        const cursor = cursorReq.result
        if (!cursor) return
        const value = cursor.value as OutboxEntry
        if (!wanted || wanted.has(value.status)) out.push(value)
        cursor.continue()
      }
      cursorReq.onerror = () => reject(cursorReq.error)
      tx.oncomplete = () => resolve(out)
      tx.onerror = () => reject(tx.error)
    })
  }

  async delete(msgId: Hex): Promise<void> {
    const db = await this.db()
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(this.storeName, 'readwrite')
      tx.objectStore(this.storeName).delete(msgId)
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error)
    })
  }

  /** Wipe every entry. Useful for tests or a "clear chat history" UI. */
  async clear(): Promise<void> {
    const db = await this.db()
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(this.storeName, 'readwrite')
      tx.objectStore(this.storeName).clear()
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error)
    })
  }

  private db(): Promise<IDBDatabase> {
    if (!this.dbPromise) {
      this.dbPromise = new Promise((resolve, reject) => {
        const open = this.idb.open(this.dbName, DB_VERSION)
        open.onupgradeneeded = () => {
          const db = open.result
          if (!db.objectStoreNames.contains(this.storeName)) {
            const store = db.createObjectStore(this.storeName, { keyPath: 'msgId' })
            store.createIndex('status', 'status', { unique: false })
          }
        }
        open.onsuccess = () => resolve(open.result)
        open.onerror = () => reject(open.error)
        open.onblocked = () => reject(new Error('IndexedDB upgrade blocked'))
      })
    }
    return this.dbPromise
  }
}
