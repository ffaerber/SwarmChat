import { describe, it, expect } from 'vitest'
import { IDBFactory } from 'fake-indexeddb'
import { Blocklist } from '../../src/lib/blocklist'
import type { Hex } from '../../src/lib/types'

let counter = 0
const freshDbName = () => `swarmchat-blocklist-test-${Date.now()}-${++counter}`

const ALICE = '0x1111111111111111111111111111111111111111' as Hex
const BOB   = '0x2222222222222222222222222222222222222222' as Hex
const ALICE_UPPER = '0x1111111111111111111111111111111111111111'.toUpperCase() as Hex

describe('Blocklist', () => {
  const make = () => new Blocklist({ dbName: freshDbName(), idbFactory: new IDBFactory() })

  it('starts empty', async () => {
    const bl = make()
    await bl.load()
    expect(bl.list()).toEqual([])
    expect(bl.isBlocked(ALICE)).toBe(false)
    await bl.close()
  })

  it('block / unblock toggle', async () => {
    const bl = make()
    await bl.load()
    await bl.block(ALICE)
    expect(bl.isBlocked(ALICE)).toBe(true)
    expect(bl.list()).toEqual([ALICE])

    await bl.unblock(ALICE)
    expect(bl.isBlocked(ALICE)).toBe(false)
    expect(bl.list()).toEqual([])
    await bl.close()
  })

  it('normalizes case on read and write', async () => {
    const bl = make()
    await bl.load()
    await bl.block(ALICE_UPPER)
    expect(bl.isBlocked(ALICE)).toBe(true)
    expect(bl.list()).toEqual([ALICE]) // stored lowercased
    await bl.close()
  })

  it('block is idempotent', async () => {
    const bl = make()
    await bl.load()
    await bl.block(ALICE)
    await bl.block(ALICE)
    expect(bl.list().length).toBe(1)
    await bl.close()
  })

  it('liveSet() reflects mutations without a re-read (Transport contract)', async () => {
    const bl = make()
    await bl.load()
    const live = bl.liveSet()
    expect(live.has(ALICE.toLowerCase() as Hex)).toBe(false)
    await bl.block(ALICE)
    expect(live.has(ALICE.toLowerCase() as Hex)).toBe(true)
    await bl.unblock(ALICE)
    expect(live.has(ALICE.toLowerCase() as Hex)).toBe(false)
    await bl.close()
  })

  it('persists across close + reopen', async () => {
    const factory = new IDBFactory()
    const dbName = freshDbName()

    const a = new Blocklist({ dbName, idbFactory: factory })
    await a.load()
    await a.block(ALICE)
    await a.block(BOB)
    await a.close()

    const b = new Blocklist({ dbName, idbFactory: factory })
    await b.load()
    expect(b.isBlocked(ALICE)).toBe(true)
    expect(b.isBlocked(BOB)).toBe(true)
    expect(b.list().sort()).toEqual([ALICE, BOB].sort())
    await b.close()
  })

  it('subscribe fires on block + unblock and stops after off()', async () => {
    const bl = make()
    await bl.load()
    let calls = 0
    const off = bl.subscribe(() => { calls++ })
    await bl.block(ALICE)
    await bl.unblock(ALICE)
    expect(calls).toBe(2)
    off()
    await bl.block(ALICE)
    expect(calls).toBe(2)
    await bl.close()
  })

  it('load() is idempotent', async () => {
    const bl = make()
    await bl.load()
    await bl.block(ALICE)
    await bl.load() // must not wipe in-memory state or re-fire spurious events
    expect(bl.isBlocked(ALICE)).toBe(true)
    await bl.close()
  })

  it('throws if no IndexedDB is available', () => {
    expect(() => new Blocklist({ idbFactory: undefined as unknown as IDBFactory }))
      .toThrowError(/IndexedDB is not available/)
  })
})
