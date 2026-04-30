import { keccak256, toBytes } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import type { Hex, SignMessage } from './types'

/**
 * Stable seed string. Bumping the version invalidates every derived feed
 * identity, so treat it as protocol-versioning: only change when feed
 * format changes incompatibly.
 */
export const FEED_KEY_SEED = 'swarmchat:feed-key:v1' as const

export interface FeedIdentity {
  privateKey: Hex
  address: Hex
}

/**
 * Derive a per-user feed signing key by asking the wallet to sign a fixed
 * message and hashing the signature. Reproducible across devices: any
 * device with the same wallet produces the same feed identity.
 */
export async function deriveFeedKey(signMessage: SignMessage): Promise<FeedIdentity> {
  const sig = await signMessage(FEED_KEY_SEED)
  const privateKey = keccak256(toBytes(sig))
  const account = privateKeyToAccount(privateKey)
  return { privateKey, address: account.address }
}
