import { describe, it, expect, beforeEach, vi } from 'vitest'
import { Reliability, DEFAULT_BACKOFF_MS } from '../../src/lib/reliability'
import { InMemoryOutbox, type OutboxEntry } from '../../src/lib/outbox'
import type { TransportLike, SendArgs, SubscribeArgs } from '../../src/lib/transport'
import type { Envelope, Hex, PeerProfile } from '../../src/lib/types'

const ALICE: Hex = '0x' + 'aa'.repeat(20) as Hex
const BOB: Hex = '0x' + 'bb'.repeat(20) as Hex

const bobProfile: PeerProfile = {
  wallet: BOB,
  pssPublicKey: '0x02' + 'bb'.repeat(32) as Hex,
  swarmOverlay: '0x' + 'bb'.repeat(32) as Hex,
}
const aliceProfile: PeerProfile = {
  wallet: ALICE,
  pssPublicKey: '0x02' + 'aa'.repeat(32) as Hex,
  swarmOverlay: '0x' + 'aa'.repeat(32) as Hex,
}

class FakeTransport implements TransportLike {
  sentEnvelopes: Envelope[] = []
  retransmits: Envelope[] = []
  private listener?: SubscribeArgs
  private msgCounter = 0

  async send(args: SendArgs): Promise<Envelope> {
    this.msgCounter++
    const env: Envelope = {
      v: 1,
      type: args.type,
      msgId: ('0x' + this.msgCounter.toString(16).padStart(64, '0')) as Hex,
      from: ALICE,
      to: args.to.wallet,
      ts: Date.now(),
      nonce: ('0x' + 'ee'.repeat(16)) as Hex,
      payload: args.payload,
      sig: ('0x' + '11'.repeat(65)) as Hex,
    }
    this.sentEnvelopes.push(env)
    return env
  }

  async retransmit(env: Envelope, _to: PeerProfile): Promise<void> {
    this.retransmits.push(env)
  }

  subscribe(args: SubscribeArgs) {
    this.listener = args
    return { cancel: () => { this.listener = undefined } }
  }

  /** Simulate an inbound envelope from the network. */
  async deliver(env: Envelope): Promise<void> {
    await this.listener?.onMessage(env)
  }
}

describe('Reliability (fake transport, fake timers)', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  it('records a sent message in the outbox with status=sent', async () => {
    const transport = new FakeTransport()
    const outbox = new InMemoryOutbox()
    const r = new Reliability({ transport, outbox })
    await r.start()

    const entry = await r.send({ to: bobProfile, type: 'msg', payload: { text: 'hi' } })
    expect(entry.status).toBe('sent')
    expect(entry.attempts).toBe(1)
    expect(transport.sentEnvelopes).toHaveLength(1)
    expect((await outbox.get(entry.msgId))?.status).toBe('sent')
  })

  it('retransmits the same envelope (same msgId) when the ack window expires', async () => {
    const transport = new FakeTransport()
    const outbox = new InMemoryOutbox()
    const r = new Reliability({ transport, outbox, backoff: [1000, 2000, 3000] })
    await r.start()

    const entry = await r.send({ to: bobProfile, type: 'msg', payload: {} })
    expect(transport.retransmits).toHaveLength(0)

    await vi.advanceTimersByTimeAsync(1000)
    expect(transport.retransmits).toHaveLength(1)
    expect(transport.retransmits[0].msgId).toBe(entry.envelope.msgId) // same msgId
    expect((await outbox.get(entry.msgId))?.attempts).toBe(2)
  })

  it('cancels the retry timer when an ack arrives', async () => {
    const transport = new FakeTransport()
    const outbox = new InMemoryOutbox()
    const r = new Reliability({ transport, outbox, backoff: [1000, 2000] })
    await r.start()

    const entry = await r.send({ to: bobProfile, type: 'msg', payload: {} })

    await transport.deliver({
      v: 1,
      type: 'ack',
      msgId: '0x' + '99'.repeat(32) as Hex,
      from: BOB,
      to: ALICE,
      ts: Date.now(),
      nonce: '0x' + '00'.repeat(16) as Hex,
      payload: { ackMsgId: entry.envelope.msgId },
      sig: '0x' + '11'.repeat(65) as Hex,
    })

    await vi.advanceTimersByTimeAsync(5000)
    expect(transport.retransmits).toHaveLength(0)
    expect((await outbox.get(entry.msgId))?.status).toBe('delivered')
  })

  it('promotes delivered → read on a read receipt', async () => {
    const transport = new FakeTransport()
    const outbox = new InMemoryOutbox()
    const r = new Reliability({ transport, outbox, backoff: [1000] })
    await r.start()

    const entry = await r.send({ to: bobProfile, type: 'msg', payload: {} })

    const ack: Envelope = {
      v: 1, type: 'ack', msgId: '0x' + '99'.repeat(32) as Hex,
      from: BOB, to: ALICE, ts: 1, nonce: '0x' + '00'.repeat(16) as Hex,
      payload: { ackMsgId: entry.envelope.msgId },
      sig: '0x' + '11'.repeat(65) as Hex,
    }
    await transport.deliver(ack)
    expect((await outbox.get(entry.msgId))?.status).toBe('delivered')

    await transport.deliver({ ...ack, type: 'read', payload: { readMsgId: entry.envelope.msgId } })
    expect((await outbox.get(entry.msgId))?.status).toBe('read')
  })

  it('marks a message failed after the retry budget is exhausted', async () => {
    const transport = new FakeTransport()
    const outbox = new InMemoryOutbox()
    const backoff = [100, 200, 300] // 3 retries -> 4 attempts total
    const r = new Reliability({ transport, outbox, backoff })
    await r.start()

    const entry = await r.send({ to: bobProfile, type: 'msg', payload: {} })

    const totalElapsed = backoff.reduce((a, b) => a + b, 0) + 100
    await vi.advanceTimersByTimeAsync(totalElapsed)

    const final = await outbox.get(entry.envelope.msgId)
    expect(final?.status).toBe('failed')
    expect(final?.failedReason).toBe('retry budget exhausted')
    expect(final?.attempts).toBe(backoff.length + 1)        // 1 initial + N retries
    expect(transport.retransmits.length).toBe(backoff.length) // exactly N retransmits
  })

  it('resumes pending retries on start()', async () => {
    const transport = new FakeTransport()
    const outbox = new InMemoryOutbox()
    const sentEnv: Envelope = {
      v: 1, type: 'msg',
      msgId: '0x' + '77'.repeat(32) as Hex,
      from: ALICE, to: BOB, ts: 1,
      nonce: '0x' + '00'.repeat(16) as Hex,
      payload: { text: 'persisted' },
      sig: '0x' + '11'.repeat(65) as Hex,
    }
    const persisted: OutboxEntry = {
      msgId: sentEnv.msgId,
      envelope: sentEnv,
      to: bobProfile,
      status: 'sent',
      attempts: 1,
      lastSentAt: Date.now() - 5000,
      nextRetryAt: Date.now() + 1000,
    }
    await outbox.put(persisted)

    const r = new Reliability({ transport, outbox, backoff: [1000, 2000] })
    await r.start()

    await vi.advanceTimersByTimeAsync(1500)
    expect(transport.retransmits).toHaveLength(1)
    expect(transport.retransmits[0].msgId).toBe(sentEnv.msgId)
  })

  it('emits status updates via onStatus', async () => {
    const transport = new FakeTransport()
    const outbox = new InMemoryOutbox()
    const r = new Reliability({ transport, outbox, backoff: [1000] })
    await r.start()

    const events: string[] = []
    r.onStatus(e => events.push(e.status))

    const entry = await r.send({ to: bobProfile, type: 'msg', payload: {} })
    await transport.deliver({
      v: 1, type: 'ack', msgId: '0x' + '99'.repeat(32) as Hex,
      from: BOB, to: ALICE, ts: 1, nonce: '0x' + '00'.repeat(16) as Hex,
      payload: { ackMsgId: entry.envelope.msgId },
      sig: '0x' + '11'.repeat(65) as Hex,
    })
    // tiny delay so async transition resolves
    await vi.advanceTimersByTimeAsync(0)

    expect(events).toEqual(['sent', 'delivered'])
  })

  it('auto-acks an incoming msg when resolveProfile is provided', async () => {
    const transport = new FakeTransport()
    const outbox = new InMemoryOutbox()
    const r = new Reliability({
      transport,
      outbox,
      backoff: [1000],
      resolveProfile: () => aliceProfile,
    })
    await r.start()

    await transport.deliver({
      v: 1, type: 'msg',
      msgId: '0x' + '88'.repeat(32) as Hex,
      from: ALICE, to: BOB, ts: 1,
      nonce: '0x' + '00'.repeat(16) as Hex,
      payload: { text: 'hi' },
      sig: '0x' + '11'.repeat(65) as Hex,
    })
    await vi.advanceTimersByTimeAsync(0)

    expect(transport.sentEnvelopes).toHaveLength(1)
    expect(transport.sentEnvelopes[0].type).toBe('ack')
    expect((transport.sentEnvelopes[0].payload as { ackMsgId: string }).ackMsgId).toBe(
      '0x' + '88'.repeat(32),
    )
  })

  it('default backoff is the spec schedule', () => {
    expect(DEFAULT_BACKOFF_MS).toEqual([
      30_000,
      120_000,
      600_000,
      3_600_000,
      21_600_000,
    ])
  })
})
