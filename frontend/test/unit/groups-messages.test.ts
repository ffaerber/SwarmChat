import { describe, it, expect } from 'vitest'
import { InMemoryMessages, type ChatMessage } from '../../src/lib/messages-store'
import type { Hex } from '../../src/lib/types'

const ALICE = ('0x' + 'a1'.repeat(20)) as Hex
const BOB   = ('0x' + 'b1'.repeat(20)) as Hex
const CAROL = ('0x' + 'c1'.repeat(20)) as Hex
const G1    = ('0x' + '11'.repeat(32)) as Hex
const G2    = ('0x' + '22'.repeat(32)) as Hex

function txt(opts: {
  msgId: string
  peer: Hex
  ts: number
  direction?: 'in' | 'out'
  text?: string
  groupId?: Hex
}): ChatMessage {
  return {
    msgId: opts.msgId as Hex,
    peer: opts.peer,
    ts: opts.ts,
    direction: opts.direction ?? 'in',
    kind: 'text',
    text: opts.text ?? 'hi',
    ...(opts.groupId ? { groupId: opts.groupId } : {}),
  }
}

describe('InMemoryMessages: groupId routing', () => {
  it('listForPeer excludes group messages even when peer matches', async () => {
    const store = new InMemoryMessages()
    await store.put(txt({ msgId: '0x' + '01'.repeat(32), peer: BOB, ts: 1 }))
    await store.put(txt({ msgId: '0x' + '02'.repeat(32), peer: BOB, ts: 2, groupId: G1 }))
    await store.put(txt({ msgId: '0x' + '03'.repeat(32), peer: BOB, ts: 3 }))

    const list = await store.listForPeer(BOB)
    expect(list.map(m => m.msgId)).toEqual([
      '0x' + '01'.repeat(32),
      '0x' + '03'.repeat(32),
    ])
  })

  it('listForGroup returns only messages with the matching groupId, sorted by ts', async () => {
    const store = new InMemoryMessages()
    await store.put(txt({ msgId: '0x' + '01'.repeat(32), peer: BOB, ts: 30, groupId: G1 }))
    await store.put(txt({ msgId: '0x' + '02'.repeat(32), peer: CAROL, ts: 10, groupId: G1 }))
    await store.put(txt({ msgId: '0x' + '03'.repeat(32), peer: BOB, ts: 20, groupId: G2 }))
    await store.put(txt({ msgId: '0x' + '04'.repeat(32), peer: ALICE, ts: 20, groupId: G1, direction: 'out' }))
    await store.put(txt({ msgId: '0x' + '05'.repeat(32), peer: BOB, ts: 99 })) // no group

    const list = await store.listForGroup(G1)
    expect(list.map(m => m.ts)).toEqual([10, 20, 30])
    expect(list.every(m => m.groupId === G1)).toBe(true)
  })

  it('listConversations excludes group conversations', async () => {
    const store = new InMemoryMessages()
    await store.put(txt({ msgId: '0x' + '01'.repeat(32), peer: BOB, ts: 1 }))
    await store.put(txt({ msgId: '0x' + '02'.repeat(32), peer: CAROL, ts: 2, groupId: G1 }))

    const list = await store.listConversations()
    expect(list).toHaveLength(1)
    expect(list[0].peer).toBe(BOB)
  })

  it('listGroupConversations returns one summary per group, newest-first', async () => {
    const store = new InMemoryMessages()
    await store.put(txt({ msgId: '0x' + '01'.repeat(32), peer: BOB, ts: 10, groupId: G1 }))
    await store.put(txt({ msgId: '0x' + '02'.repeat(32), peer: CAROL, ts: 50, groupId: G1 }))
    await store.put(txt({ msgId: '0x' + '03'.repeat(32), peer: BOB, ts: 30, groupId: G2 }))

    const list = await store.listGroupConversations()
    expect(list).toHaveLength(2)
    expect(list[0].groupId).toBe(G1)  // last ts 50
    expect(list[0].lastMessage.ts).toBe(50)
    expect(list[1].groupId).toBe(G2)  // last ts 30
  })

  it('listForGroup is case-insensitive on groupId', async () => {
    const store = new InMemoryMessages()
    const upper = ('0x' + 'AB'.repeat(32)) as Hex
    const lower = ('0x' + 'ab'.repeat(32)) as Hex
    await store.put(txt({ msgId: '0x' + '01'.repeat(32), peer: BOB, ts: 1, groupId: upper }))
    expect((await store.listForGroup(lower)).length).toBe(1)
  })
})
