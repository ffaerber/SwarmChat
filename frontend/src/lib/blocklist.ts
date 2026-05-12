import type { Hex } from './types'

/**
 * Per-user, IndexedDB-backed blocklist (spec §7).
 *
 * Wallet addresses are stored lowercased so callers can pass any case. The
 * underlying `Set<Hex>` is the same reference handed to `Transport`, so
 * mutations here take effect on the next inbound envelope without rewiring.
 */
export interface BlocklistOptions {
  dbName?: string
  storeName?: string
  idbFactory?: IDBFactory
}

const DEFAULT_DB = 'swarmchat-blocklist'
const DEFAULT_STORE = 'blocked'
const DB_VERSION = 1

export class Blocklist {
  private readonly dbName: string
  private readonly storeName: string
  private readonly idb: IDBFactory
  private dbPromise?: Promise<IDBDatabase>
  private readonly set = new Set<Hex>()
  private readonly listeners = new Set<() => void>()
  private loaded = false

  constructor(opts: BlocklistOptions = {}) {
    this.dbName = opts.dbName ?? DEFAULT_DB
    this.storeName = opts.storeName ?? DEFAULT_STORE
    const factory = opts.idbFactory ?? (globalThis as { indexedDB?: IDBFactory }).indexedDB
    if (!factory) throw new Error('IndexedDB is not available in this environment')
    this.idb = factory
  }

  /** Load persisted entries into the in-memory Set. Idempotent. */
  async load(): Promise<void> {
    if (this.loaded) return
    const db = await this.db()
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(this.storeName, 'readonly')
      const req = tx.objectStore(this.storeName).openCursor()
      req.onsuccess = () => {
        const cursor = req.result
        if (!cursor) return
        this.set.add(cursor.key as Hex)
        cursor.continue()
      }
      req.onerror = () => reject(req.error)
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error)
    })
    this.loaded = true
    this.emit()
  }

  async close(): Promise<void> {
    if (!this.dbPromise) return
    const db = await this.dbPromise
    db.close()
    this.dbPromise = undefined
  }

  /** Live Set used by Transport for `has()` lookups. Do not replace, only mutate via this class. */
  liveSet(): Set<Hex> {
    return this.set
  }

  isBlocked(wallet: Hex): boolean {
    return this.set.has(wallet.toLowerCase() as Hex)
  }

  list(): Hex[] {
    return [...this.set].sort()
  }

  async block(wallet: Hex): Promise<void> {
    const k = wallet.toLowerCase() as Hex
    if (this.set.has(k)) return
    this.set.add(k)
    await this.persist(k, true)
    this.emit()
  }

  async unblock(wallet: Hex): Promise<void> {
    const k = wallet.toLowerCase() as Hex
    if (!this.set.has(k)) return
    this.set.delete(k)
    await this.persist(k, false)
    this.emit()
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

  private async persist(wallet: Hex, blocked: boolean): Promise<void> {
    const db = await this.db()
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(this.storeName, 'readwrite')
      const store = tx.objectStore(this.storeName)
      if (blocked) store.put({ wallet, ts: Date.now() }, wallet)
      else store.delete(wallet)
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error)
      tx.onabort = () => reject(tx.error ?? new Error('transaction aborted'))
    })
  }

  private db(): Promise<IDBDatabase> {
    if (!this.dbPromise) {
      this.dbPromise = new Promise((resolve, reject) => {
        const open = this.idb.open(this.dbName, DB_VERSION)
        open.onupgradeneeded = () => {
          const db = open.result
          if (!db.objectStoreNames.contains(this.storeName)) {
            db.createObjectStore(this.storeName)
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
