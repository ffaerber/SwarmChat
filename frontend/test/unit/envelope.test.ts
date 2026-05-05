import { describe, it, expect } from 'vitest'
import { privateKeyToAccount, generatePrivateKey } from 'viem/accounts'
import {
  canonicalize,
  inboxTopic,
  makeMsgId,
  signEnvelope,
  verifyEnvelope,
} from '../../src/lib/envelope'
import type { Hex } from '../../src/lib/types'

const alicePk = '0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d' as Hex
const bobPk = '0x8b3a350cf5c34c9194ca85829a2df0ec3153be0318b5e2d3348e872092edffba' as Hex

const alice = privateKeyToAccount(alicePk)
const bob = privateKeyToAccount(bobPk)
const aliceSign = (m: string) => alice.signMessage({ message: m })

describe('canonicalize', () => {
  it('sorts keys at every level', () => {
    expect(canonicalize({ b: 1, a: { d: 4, c: 3 } })).toBe('{"a":{"c":3,"d":4},"b":1}')
  })
  it('preserves array order', () => {
    expect(canonicalize([3, 1, 2])).toBe('[3,1,2]')
  })
  it('escapes strings the same as JSON.stringify', () => {
    expect(canonicalize({ s: 'a"b\\c' })).toBe('{"s":"a\\"b\\\\c"}')
  })
})

describe('inboxTopic', () => {
  it('lowercases the wallet address', () => {
    expect(inboxTopic('0xABCDEF0000000000000000000000000000000000')).toBe(
      'swarmchat:inbox:0xabcdef0000000000000000000000000000000000',
    )
  })
})

describe('makeMsgId', () => {
  it('is deterministic for the same inputs', () => {
    const id1 = makeMsgId(alice.address, '0x00112233445566778899aabbccddeeff', 1700000000000)
    const id2 = makeMsgId(alice.address, '0x00112233445566778899aabbccddeeff', 1700000000000)
    expect(id1).toBe(id2)
  })
  it('changes when nonce changes', () => {
    const a = makeMsgId(alice.address, '0x00112233445566778899aabbccddeeff', 1)
    const b = makeMsgId(alice.address, '0x00112233445566778899aabbccddee00', 1)
    expect(a).not.toBe(b)
  })
  it('changes when timestamp changes', () => {
    const a = makeMsgId(alice.address, '0x00112233445566778899aabbccddeeff', 1)
    const b = makeMsgId(alice.address, '0x00112233445566778899aabbccddeeff', 2)
    expect(a).not.toBe(b)
  })
})

const ALICE_FEED = ('0x' + 'a1'.repeat(20)) as Hex
const BOB_FEED = ('0x' + 'b1'.repeat(20)) as Hex
const C_FEED = ('0x' + 'c1'.repeat(20)) as Hex

describe('signEnvelope / verifyEnvelope', () => {
  it('round-trips a valid signature', async () => {
    const env = await signEnvelope(
      { from: alice.address, to: bob.address, feedOwner: ALICE_FEED, type: 'msg', payload: { text: 'hi' } },
      aliceSign,
    )
    expect(env.sig).toMatch(/^0x[0-9a-f]+$/i)
    expect(env.feedOwner).toBe(ALICE_FEED)
    expect(await verifyEnvelope(env)).toBe(true)
  })

  it('rejects a tampered payload', async () => {
    const env = await signEnvelope(
      { from: alice.address, to: bob.address, feedOwner: ALICE_FEED, type: 'msg', payload: { text: 'hi' } },
      aliceSign,
    )
    const tampered = { ...env, payload: { text: 'bye' } }
    expect(await verifyEnvelope(tampered)).toBe(false)
  })

  it('rejects a tampered feedOwner', async () => {
    const env = await signEnvelope(
      { from: alice.address, to: bob.address, feedOwner: ALICE_FEED, type: 'msg', payload: {} },
      aliceSign,
    )
    const tampered = { ...env, feedOwner: BOB_FEED }
    expect(await verifyEnvelope(tampered)).toBe(false)
  })

  it('rejects spoofed `from` (signer != claimed sender)', async () => {
    const env = await signEnvelope(
      { from: bob.address, to: alice.address, feedOwner: BOB_FEED, type: 'msg', payload: { text: 'spoof' } },
      aliceSign, // signed by alice but claims to be from bob
    )
    expect(await verifyEnvelope(env)).toBe(false)
  })

  it('produces stable msgId for given (from, nonce, ts)', async () => {
    const ts = 1737000000000
    const nonce: Hex = '0xdeadbeefdeadbeefdeadbeefdeadbeef'
    const env = await signEnvelope(
      { from: alice.address, to: bob.address, feedOwner: ALICE_FEED, type: 'msg', payload: {}, ts, nonce },
      aliceSign,
    )
    expect(env.msgId).toBe(makeMsgId(alice.address, nonce, ts))
  })

  it('different signers produce different signatures over identical bodies', async () => {
    const ts = 1
    const nonce: Hex = '0x' + '11'.repeat(16) as Hex
    const fixed = { type: 'msg' as const, payload: {}, ts, nonce }

    const a = await signEnvelope({ from: alice.address, to: bob.address, feedOwner: ALICE_FEED, ...fixed }, aliceSign)
    const fresh = generatePrivateKey()
    const c = privateKeyToAccount(fresh)
    const cSign = (m: string) => c.signMessage({ message: m })
    const b = await signEnvelope({ from: c.address, to: bob.address, feedOwner: C_FEED, ...fixed }, cSign)

    expect(a.sig).not.toBe(b.sig)
  })

  it('round-trips a groupId in the signed body', async () => {
    const groupId: Hex = ('0x' + 'aa'.repeat(32)) as Hex
    const env = await signEnvelope(
      {
        from: alice.address,
        to: bob.address,
        feedOwner: ALICE_FEED,
        type: 'msg',
        payload: { kind: 'text', text: 'hi group' },
        groupId,
      },
      aliceSign,
    )
    expect(env.groupId).toBe(groupId)
    expect(await verifyEnvelope(env)).toBe(true)
  })

  it('rejects a tampered groupId', async () => {
    const groupId: Hex = ('0x' + 'aa'.repeat(32)) as Hex
    const env = await signEnvelope(
      { from: alice.address, to: bob.address, feedOwner: ALICE_FEED, type: 'msg', payload: {}, groupId },
      aliceSign,
    )
    const tampered = { ...env, groupId: ('0x' + 'bb'.repeat(32)) as Hex }
    expect(await verifyEnvelope(tampered)).toBe(false)
  })

  it('omits groupId from the signed body when not provided', async () => {
    const env = await signEnvelope(
      { from: alice.address, to: bob.address, feedOwner: ALICE_FEED, type: 'msg', payload: {} },
      aliceSign,
    )
    expect('groupId' in env).toBe(false)
    expect(await verifyEnvelope(env)).toBe(true)
  })

  it('groupId-bearing and groupId-less envelopes have different signatures', async () => {
    const ts = 12345
    const nonce: Hex = '0x' + '22'.repeat(16) as Hex
    const without = await signEnvelope(
      { from: alice.address, to: bob.address, feedOwner: ALICE_FEED, type: 'msg', payload: {}, ts, nonce },
      aliceSign,
    )
    const withGroup = await signEnvelope(
      {
        from: alice.address, to: bob.address, feedOwner: ALICE_FEED, type: 'msg', payload: {}, ts, nonce,
        groupId: ('0x' + 'cc'.repeat(32)) as Hex,
      },
      aliceSign,
    )
    expect(without.sig).not.toBe(withGroup.sig)
  })
})
