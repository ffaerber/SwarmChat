import { describe, it, expect, beforeEach } from 'vitest'
import type { OutboxEntry, OutboxStore } from '../../src/lib/outbox'
import type { Envelope, Hex, PeerProfile } from '../../src/lib/types'

export function fakeEntry(msgId: Hex, status: OutboxEntry['status'] = 'sent'): OutboxEntry {
  const env: Envelope = {
    v: 1,
    type: 'msg',
    msgId,
    from: ('0x' + 'aa'.repeat(20)) as Hex,
    to: ('0x' + 'bb'.repeat(20)) as Hex,
    feedOwner: ('0x' + 'a1'.repeat(20)) as Hex,
    ts: 1,
    nonce: ('0x' + '00'.repeat(16)) as Hex,
    payload: { text: 'hi' },
    sig: ('0x' + 'cc'.repeat(65)) as Hex,
  }
  const profile: PeerProfile = {
    wallet: env.to,
    pssPublicKey: ('0x02' + 'dd'.repeat(32)) as Hex,
    swarmOverlay: ('0x' + 'ee'.repeat(32)) as Hex,
  }
  return {
    msgId,
    envelope: env,
    to: profile,
    status,
    attempts: 1,
    lastSentAt: 0,
    nextRetryAt: null,
  }
}

const ID = (n: number): Hex => ('0x' + n.toString(16).padStart(64, '0')) as Hex

/** Run the same scenarios against any OutboxStore implementation. */
export function runOutboxScenarios(label: string, factory: () => Promise<OutboxStore>) {
  describe(label, () => {
    let store: OutboxStore
    beforeEach(async () => {
      store = await factory()
    })

    it('puts and gets entries', async () => {
      const e = fakeEntry(ID(1))
      await store.put(e)
      const got = await store.get(e.msgId)
      expect(got?.msgId).toBe(e.msgId)
      expect(got?.envelope.payload).toEqual({ text: 'hi' })
    })

    it('returns undefined for missing entries', async () => {
      expect(await store.get(ID(9999))).toBeUndefined()
    })

    it('updates fields and returns the merged entry', async () => {
      const e = fakeEntry(ID(2))
      await store.put(e)
      const updated = await store.update(e.msgId, { status: 'delivered', nextRetryAt: null })
      expect(updated?.status).toBe('delivered')
      expect((await store.get(e.msgId))?.status).toBe('delivered')
    })

    it('returns undefined when updating a missing entry', async () => {
      expect(await store.update(ID(404), { status: 'failed' })).toBeUndefined()
    })

    it('lists by status filter', async () => {
      await store.put(fakeEntry(ID(10), 'sent'))
      await store.put(fakeEntry(ID(11), 'delivered'))
      await store.put(fakeEntry(ID(12), 'failed'))
      expect((await store.list()).length).toBe(3)
      expect((await store.list({ status: 'sent' })).length).toBe(1)
      expect((await store.list({ status: ['sent', 'delivered'] })).length).toBe(2)
    })

    it('returns isolated copies (mutating a result does not leak)', async () => {
      const e = fakeEntry(ID(20))
      await store.put(e)
      const got = await store.get(e.msgId)
      got!.attempts = 999
      expect((await store.get(e.msgId))?.attempts).toBe(1)
    })

    it('deletes entries', async () => {
      const e = fakeEntry(ID(30))
      await store.put(e)
      await store.delete(e.msgId)
      expect(await store.get(e.msgId)).toBeUndefined()
    })

    it('overwrites on put with the same msgId', async () => {
      const id = ID(40)
      const a = fakeEntry(id)
      a.attempts = 1
      await store.put(a)
      const b = fakeEntry(id)
      b.attempts = 5
      await store.put(b)
      expect((await store.get(id))?.attempts).toBe(5)
    })
  })
}
