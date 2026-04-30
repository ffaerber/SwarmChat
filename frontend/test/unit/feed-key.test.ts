import { describe, it, expect } from 'vitest'
import { privateKeyToAccount } from 'viem/accounts'
import { deriveFeedKey, FEED_KEY_SEED } from '../../src/lib/feed-key'
import type { Hex } from '../../src/lib/types'

const ALICE_PK = '0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d' as Hex
const BOB_PK = '0x8b3a350cf5c34c9194ca85829a2df0ec3153be0318b5e2d3348e872092edffba' as Hex

const aliceAccount = privateKeyToAccount(ALICE_PK)
const bobAccount = privateKeyToAccount(BOB_PK)

const aliceSign = (m: string) => aliceAccount.signMessage({ message: m })
const bobSign = (m: string) => bobAccount.signMessage({ message: m })

describe('deriveFeedKey', () => {
  it('produces a valid 32-byte private key and matching address', async () => {
    const id = await deriveFeedKey(aliceSign)
    expect(id.privateKey).toMatch(/^0x[0-9a-f]{64}$/)
    expect(id.address).toMatch(/^0x[0-9a-fA-F]{40}$/)

    // address should be the actual address derived from the private key
    expect(id.address).toBe(privateKeyToAccount(id.privateKey).address)
  })

  it('is deterministic across calls for the same wallet', async () => {
    const a = await deriveFeedKey(aliceSign)
    const b = await deriveFeedKey(aliceSign)
    expect(a.privateKey).toBe(b.privateKey)
    expect(a.address).toBe(b.address)
  })

  it('produces a different identity for a different wallet', async () => {
    const a = await deriveFeedKey(aliceSign)
    const b = await deriveFeedKey(bobSign)
    expect(a.privateKey).not.toBe(b.privateKey)
    expect(a.address).not.toBe(b.address)
  })

  it('does not equal the wallet itself (so feed key is not the wallet key)', async () => {
    const a = await deriveFeedKey(aliceSign)
    expect(a.address.toLowerCase()).not.toBe(aliceAccount.address.toLowerCase())
  })

  it('signs the documented seed string', async () => {
    let captured: string | undefined
    await deriveFeedKey(async msg => {
      captured = msg
      return aliceAccount.signMessage({ message: msg })
    })
    expect(captured).toBe(FEED_KEY_SEED)
  })
})
