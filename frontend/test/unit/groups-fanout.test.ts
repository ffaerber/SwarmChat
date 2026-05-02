import { describe, it, expect } from 'vitest'
import { Reliability } from '../../src/lib/reliability'
import { InMemoryOutbox } from '../../src/lib/outbox'
import type { TransportLike, SendArgs, SubscribeArgs } from '../../src/lib/transport'
import type { Envelope, Hex, PeerProfile } from '../../src/lib/types'

const ALICE: Hex = ('0x' + 'aa'.repeat(20)) as Hex

function profile(addr: Hex): PeerProfile {
  return {
    wallet: addr,
    pssPublicKey: ('0x02' + addr.slice(2).padEnd(64, '0').slice(0, 64)) as Hex,
    swarmOverlay: ('0x' + addr.slice(2).padEnd(64, '0').slice(0, 64)) as Hex,
  }
}

class CapturingTransport implements TransportLike {
  sent: SendArgs[] = []
  retransmits: Envelope[] = []
  private listener?: SubscribeArgs
  private c = 0

  async send(args: SendArgs): Promise<Envelope> {
    this.sent.push(args)
    this.c++
    return {
      v: 1,
      type: args.type,
      msgId: ('0x' + this.c.toString(16).padStart(64, '0')) as Hex,
      from: ALICE,
      to: args.to.wallet,
      feedOwner: ('0x' + 'a1'.repeat(20)) as Hex,
      ts: 1_000 + this.c,
      nonce: ('0x' + 'ee'.repeat(16)) as Hex,
      payload: args.payload,
      sig: ('0x' + '11'.repeat(65)) as Hex,
      ...(args.groupId ? { groupId: args.groupId } : {}),
    }
  }

  async retransmit(env: Envelope): Promise<void> {
    this.retransmits.push(env)
  }

  subscribe(args: SubscribeArgs) {
    this.listener = args
    return { cancel: () => { this.listener = undefined } }
  }
}

describe('group fan-out', () => {
  it('threads groupId from Reliability.send through to Transport.send', async () => {
    const transport = new CapturingTransport()
    const r = new Reliability({ transport, outbox: new InMemoryOutbox() })
    await r.start()

    const groupId = ('0x' + 'cc'.repeat(32)) as Hex
    const bob = profile(('0x' + 'b1'.repeat(20)) as Hex)
    await r.send({ to: bob, type: 'msg', payload: { kind: 'text', text: 'hi' }, groupId })

    expect(transport.sent).toHaveLength(1)
    expect(transport.sent[0].groupId).toBe(groupId)
    expect(transport.sent[0].to.wallet).toBe(bob.wallet)
  })

  it('omits groupId for normal 1:1 sends', async () => {
    const transport = new CapturingTransport()
    const r = new Reliability({ transport, outbox: new InMemoryOutbox() })
    await r.start()

    const bob = profile(('0x' + 'b1'.repeat(20)) as Hex)
    await r.send({ to: bob, type: 'msg', payload: { kind: 'text', text: 'hi' } })

    expect(transport.sent[0].groupId).toBeUndefined()
  })

  it('a fan-out caller produces N distinct envelopes, all carrying the same groupId', async () => {
    const transport = new CapturingTransport()
    const r = new Reliability({ transport, outbox: new InMemoryOutbox() })
    await r.start()

    const groupId = ('0x' + 'cc'.repeat(32)) as Hex
    const recipients = [
      profile(('0x' + 'b1'.repeat(20)) as Hex),
      profile(('0x' + 'c1'.repeat(20)) as Hex),
      profile(('0x' + 'd1'.repeat(20)) as Hex),
    ]
    const payload = { kind: 'text', text: 'group hello' }
    const results = await Promise.all(
      recipients.map(p => r.send({ to: p, type: 'msg', payload, groupId })),
    )

    expect(transport.sent).toHaveLength(3)
    expect(transport.sent.every(s => s.groupId === groupId)).toBe(true)
    expect(new Set(transport.sent.map(s => s.to.wallet)).size).toBe(3)
    // Each fan-out gets its own msgId (so per-recipient retry/ack tracking works).
    expect(new Set(results.map(e => e.envelope.msgId)).size).toBe(3)
    // Every recipient sees the groupId on the resulting envelope.
    expect(results.every(e => e.envelope.groupId === groupId)).toBe(true)
  })
})
