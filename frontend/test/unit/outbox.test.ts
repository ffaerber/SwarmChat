import { describe, it, expect } from 'vitest'
import { InMemoryOutbox, type OutboxEntry } from '../../src/lib/outbox'
import type { Envelope, Hex, PeerProfile } from '../../src/lib/types'

function fakeEntry(msgId: Hex, status: OutboxEntry['status'] = 'sent'): OutboxEntry {
  const env: Envelope = {
    v: 1,
    type: 'msg',
    msgId,
    from: '0x' + 'aa'.repeat(20) as Hex,
    to: '0x' + 'bb'.repeat(20) as Hex,
    ts: 1,
    nonce: '0x' + '00'.repeat(16) as Hex,
    payload: {},
    sig: '0x' + 'cc'.repeat(65) as Hex,
  }
  const profile: PeerProfile = {
    wallet: env.to,
    pssPublicKey: '0x' + '02' + 'dd'.repeat(32) as Hex,
    swarmOverlay: '0x' + 'ee'.repeat(32) as Hex,
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

describe('InMemoryOutbox', () => {
  it('puts and gets entries', async () => {
    const o = new InMemoryOutbox()
    const e = fakeEntry('0x' + '01'.repeat(32) as Hex)
    await o.put(e)
    const got = await o.get(e.msgId)
    expect(got?.msgId).toBe(e.msgId)
  })

  it('returns undefined for missing entries', async () => {
    const o = new InMemoryOutbox()
    expect(await o.get('0x' + '02'.repeat(32) as Hex)).toBeUndefined()
  })

  it('updates fields', async () => {
    const o = new InMemoryOutbox()
    const e = fakeEntry('0x' + '03'.repeat(32) as Hex)
    await o.put(e)
    const updated = await o.update(e.msgId, { status: 'delivered', nextRetryAt: null })
    expect(updated?.status).toBe('delivered')
    expect((await o.get(e.msgId))?.status).toBe('delivered')
  })

  it('returns undefined when updating a missing entry', async () => {
    const o = new InMemoryOutbox()
    expect(await o.update('0x' + '04'.repeat(32) as Hex, { status: 'failed' })).toBeUndefined()
  })

  it('lists by status filter', async () => {
    const o = new InMemoryOutbox()
    await o.put(fakeEntry('0x' + '05'.repeat(32) as Hex, 'sent'))
    await o.put(fakeEntry('0x' + '06'.repeat(32) as Hex, 'delivered'))
    await o.put(fakeEntry('0x' + '07'.repeat(32) as Hex, 'failed'))

    expect((await o.list()).length).toBe(3)
    expect((await o.list({ status: 'sent' })).length).toBe(1)
    expect((await o.list({ status: ['sent', 'delivered'] })).length).toBe(2)
  })

  it('returns isolated copies (no leaking mutation)', async () => {
    const o = new InMemoryOutbox()
    const e = fakeEntry('0x' + '08'.repeat(32) as Hex)
    await o.put(e)
    const got = await o.get(e.msgId)
    got!.attempts = 999
    expect((await o.get(e.msgId))?.attempts).toBe(1)
  })

  it('deletes entries', async () => {
    const o = new InMemoryOutbox()
    const e = fakeEntry('0x' + '09'.repeat(32) as Hex)
    await o.put(e)
    await o.delete(e.msgId)
    expect(await o.get(e.msgId)).toBeUndefined()
  })
})
