import { describe, it, expect } from 'vitest'
import { IDBFactory } from 'fake-indexeddb'
import {
  InMemoryGroups,
  IndexedDBGroups,
  makeGroupId,
  randomGroupNonce,
} from '../../src/lib/groups-store'
import type { Group, Hex } from '../../src/lib/types'

const ALICE = ('0x' + 'a1'.repeat(20)) as Hex
const BOB   = ('0x' + 'b1'.repeat(20)) as Hex
const CAROL = ('0x' + 'c1'.repeat(20)) as Hex

function group(overrides: Partial<Group> = {}): Group {
  return {
    id: makeGroupId(ALICE, ('0x' + '00'.repeat(16)) as Hex),
    name: 'Test',
    members: [ALICE, BOB],
    admin: ALICE,
    createdAt: 1_000,
    version: 1,
    ...overrides,
  }
}

describe('makeGroupId', () => {
  it('is deterministic for the same creator + nonce', () => {
    const nonce = ('0x' + 'aa'.repeat(16)) as Hex
    expect(makeGroupId(ALICE, nonce)).toBe(makeGroupId(ALICE, nonce))
  })
  it('changes when nonce changes', () => {
    const a = makeGroupId(ALICE, ('0x' + 'aa'.repeat(16)) as Hex)
    const b = makeGroupId(ALICE, ('0x' + 'bb'.repeat(16)) as Hex)
    expect(a).not.toBe(b)
  })
  it('changes when creator changes', () => {
    const nonce = ('0x' + 'aa'.repeat(16)) as Hex
    expect(makeGroupId(ALICE, nonce)).not.toBe(makeGroupId(BOB, nonce))
  })
  it('returns a 32-byte hex', () => {
    const id = makeGroupId(ALICE, randomGroupNonce())
    expect(id).toMatch(/^0x[0-9a-f]{64}$/i)
  })
})

describe('randomGroupNonce', () => {
  it('returns a 16-byte hex', () => {
    expect(randomGroupNonce()).toMatch(/^0x[0-9a-f]{32}$/i)
  })
  it('produces different nonces on successive calls', () => {
    expect(randomGroupNonce()).not.toBe(randomGroupNonce())
  })
})

describe('InMemoryGroups', () => {
  it('round-trips put/get/list', async () => {
    const store = new InMemoryGroups()
    const g = group()
    await store.put(g)
    const got = await store.get(g.id)
    expect(got?.id).toBe(g.id)
    expect((await store.list()).length).toBe(1)
  })

  it('keeps only the highest-version state for the same id', async () => {
    const store = new InMemoryGroups()
    const v1 = group({ name: 'old', members: [ALICE, BOB], version: 1 })
    const v2 = group({ name: 'new', members: [ALICE, BOB, CAROL], version: 2 })
    await store.put(v1)
    await store.put(v2)
    const got = await store.get(v1.id)
    expect(got?.name).toBe('new')
    expect(got?.members.length).toBe(3)
  })

  it('drops a stale (lower-version) state', async () => {
    const store = new InMemoryGroups()
    const v2 = group({ name: 'new', version: 2 })
    const v1 = group({ name: 'old', version: 1 })
    await store.put(v2)
    await store.put(v1)
    expect((await store.get(v1.id))?.name).toBe('new')
  })

  it('emits change notifications', async () => {
    const store = new InMemoryGroups()
    let n = 0
    store.subscribe(() => { n++ })
    await store.put(group())
    expect(n).toBe(1)
    await store.put(group({ version: 2, name: 'next' }))
    expect(n).toBe(2)
  })

  it('lowercases id for lookups', async () => {
    const store = new InMemoryGroups()
    const g = group({ id: ('0x' + 'AB'.repeat(32)) as Hex })
    await store.put(g)
    const lower = ('0x' + 'ab'.repeat(32)) as Hex
    expect((await store.get(lower))?.id).toBe(g.id)
  })

  it('lists groups newest-first by createdAt', async () => {
    const store = new InMemoryGroups()
    await store.put(group({ id: makeGroupId(ALICE, ('0x' + '01'.repeat(16)) as Hex), createdAt: 100 }))
    await store.put(group({ id: makeGroupId(ALICE, ('0x' + '02'.repeat(16)) as Hex), createdAt: 300 }))
    await store.put(group({ id: makeGroupId(ALICE, ('0x' + '03'.repeat(16)) as Hex), createdAt: 200 }))
    const list = await store.list()
    expect(list.map(g => g.createdAt)).toEqual([300, 200, 100])
  })
})

describe('IndexedDBGroups', () => {
  let counter = 0
  const fresh = () => `swarmchat-test-groups-${Date.now()}-${++counter}`

  it('round-trips put/get/list across instances on the same factory', async () => {
    const factory = new IDBFactory()
    const dbName = fresh()
    const a = new IndexedDBGroups({ dbName, idbFactory: factory })
    const g = group()
    await a.put(g)
    await a.close()

    const b = new IndexedDBGroups({ dbName, idbFactory: factory })
    const got = await b.get(g.id)
    expect(got?.id).toBe(g.id)
    expect((await b.list()).length).toBe(1)
    await b.close()
  })

  it('drops stale (lower-version) writes', async () => {
    const store = new IndexedDBGroups({ dbName: fresh(), idbFactory: new IDBFactory() })
    await store.put(group({ name: 'new', version: 2 }))
    await store.put(group({ name: 'old', version: 1 }))
    expect((await store.get(group().id))?.name).toBe('new')
    await store.close()
  })

  it('emits change notifications on accepted writes only', async () => {
    const store = new IndexedDBGroups({ dbName: fresh(), idbFactory: new IDBFactory() })
    let n = 0
    store.subscribe(() => { n++ })
    await store.put(group({ version: 2 }))
    await store.put(group({ version: 1 }))  // stale, should not emit
    expect(n).toBe(1)
    await store.close()
  })
})
