import { keccak256, concat, toBytes, toHex } from 'viem'
import type { Group, Hex } from './types'

/** Deterministic group id from creator + 16-byte nonce. */
export function makeGroupId(creator: Hex, nonce: Hex): Hex {
  return keccak256(concat([toBytes(creator), toBytes(nonce)]))
}

/** Helper to mint a fresh 16-byte nonce for groups. */
export function randomGroupNonce(): Hex {
  const out = new Uint8Array(16)
  crypto.getRandomValues(out)
  return toHex(out)
}

export interface GroupsStore {
  put(group: Group): Promise<void>
  get(id: Hex): Promise<Group | null>
  list(): Promise<Group[]>
  /** Notification stream for UI refresh. */
  subscribe(cb: () => void): () => void
}

export class InMemoryGroups implements GroupsStore {
  private byId = new Map<string, Group>()
  private listeners = new Set<() => void>()

  async put(group: Group): Promise<void> {
    const key = group.id.toLowerCase()
    const existing = this.byId.get(key)
    // Drop stale states; tie-break on createdAt for clean re-emits.
    if (existing && existing.version > group.version) return
    if (existing && existing.version === group.version
        && existing.createdAt >= group.createdAt) return
    this.byId.set(key, { ...group })
    this.emit()
  }

  async get(id: Hex): Promise<Group | null> {
    return this.byId.get(id.toLowerCase()) ?? null
  }

  async list(): Promise<Group[]> {
    return [...this.byId.values()].sort((a, b) => b.createdAt - a.createdAt)
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

export interface IndexedDBGroupsOptions {
  dbName?: string
  storeName?: string
  idbFactory?: IDBFactory
}

const DEFAULT_DB = 'swarmchat-groups'
const DEFAULT_STORE = 'groups'
const DB_VERSION = 1

export class IndexedDBGroups implements GroupsStore {
  private readonly dbName: string
  private readonly storeName: string
  private readonly idb: IDBFactory
  private dbPromise?: Promise<IDBDatabase>
  private listeners = new Set<() => void>()

  constructor(opts: IndexedDBGroupsOptions = {}) {
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

  async put(group: Group): Promise<void> {
    const db = await this.db()
    const key = group.id.toLowerCase()
    const existing = await new Promise<Group | undefined>((resolve, reject) => {
      const tx = db.transaction(this.storeName, 'readonly')
      const req = tx.objectStore(this.storeName).get(key)
      req.onsuccess = () => resolve(req.result as Group | undefined)
      req.onerror = () => reject(req.error)
    })
    if (existing && existing.version > group.version) return
    if (existing && existing.version === group.version
        && existing.createdAt >= group.createdAt) return

    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(this.storeName, 'readwrite')
      tx.objectStore(this.storeName).put({ ...group, idKey: key })
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error)
    })
    this.emit()
  }

  async get(id: Hex): Promise<Group | null> {
    const db = await this.db()
    return new Promise((resolve, reject) => {
      const tx = db.transaction(this.storeName, 'readonly')
      const req = tx.objectStore(this.storeName).get(id.toLowerCase())
      req.onsuccess = () => {
        const v = req.result as (Group & { idKey?: string }) | undefined
        if (!v) return resolve(null)
        const { idKey: _idKey, ...g } = v
        resolve(g)
      }
      req.onerror = () => reject(req.error)
    })
  }

  async list(): Promise<Group[]> {
    const db = await this.db()
    const out: Group[] = []
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(this.storeName, 'readonly')
      const req = tx.objectStore(this.storeName).openCursor()
      req.onsuccess = () => {
        const cursor = req.result
        if (!cursor) return
        const v = cursor.value as Group & { idKey?: string }
        const { idKey: _idKey, ...g } = v
        out.push(g)
        cursor.continue()
      }
      req.onerror = () => reject(req.error)
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error)
    })
    out.sort((a, b) => b.createdAt - a.createdAt)
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
          if (!db.objectStoreNames.contains(this.storeName)) {
            db.createObjectStore(this.storeName, { keyPath: 'idKey' })
          }
        }
        open.onsuccess = () => resolve(open.result)
        open.onerror = () => reject(open.error)
      })
    }
    return this.dbPromise
  }
}
