import { describe, it, expect } from 'vitest'
import { IDBFactory } from 'fake-indexeddb'
import { IndexedDBOutbox } from '../../src/lib/idb-outbox'
import { runOutboxScenarios, fakeEntry } from './outbox-scenarios'
import type { Hex } from '../../src/lib/types'

let counter = 0
const freshDbName = () => `swarmchat-test-${Date.now()}-${++counter}`

runOutboxScenarios('IndexedDBOutbox', async () => {
  return new IndexedDBOutbox({
    dbName: freshDbName(),
    idbFactory: new IDBFactory(),
  })
})

describe('IndexedDBOutbox: persistence and lifecycle', () => {
  it('survives close + reopen with the same dbName', async () => {
    // Share one IDBFactory across the two store instances so the underlying
    // database actually persists between opens.
    const factory = new IDBFactory()
    const dbName = freshDbName()

    const a = new IndexedDBOutbox({ dbName, idbFactory: factory })
    const e = fakeEntry(('0x' + '01'.repeat(32)) as Hex, 'sent')
    await a.put(e)
    await a.close()

    const b = new IndexedDBOutbox({ dbName, idbFactory: factory })
    const got = await b.get(e.msgId)
    expect(got?.status).toBe('sent')
    await b.close()
  })

  it('clear() removes every entry', async () => {
    const factory = new IDBFactory()
    const store = new IndexedDBOutbox({ dbName: freshDbName(), idbFactory: factory })
    await store.put(fakeEntry(('0x' + '02'.repeat(32)) as Hex))
    await store.put(fakeEntry(('0x' + '03'.repeat(32)) as Hex))
    expect((await store.list()).length).toBe(2)
    await store.clear()
    expect((await store.list()).length).toBe(0)
    await store.close()
  })

  it('throws if no IndexedDB is available', () => {
    expect(() => new IndexedDBOutbox({ idbFactory: undefined as unknown as IDBFactory }))
      .toThrowError(/IndexedDB is not available/)
  })
})
