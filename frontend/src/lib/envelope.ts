import { keccak256, concat, toBytes, toHex, recoverMessageAddress, isAddressEqual } from 'viem'
import type { Envelope, Hex, SignMessage, UnsignedEnvelope } from './types'

export const PROTOCOL_VERSION = 1 as const

/** Topic each user listens on; matches §5 of the spec. */
export function inboxTopic(wallet: Hex): string {
  return `swarmchat:inbox:${wallet.toLowerCase()}`
}

export function makeMsgId(from: Hex, nonce: Hex, ts: number): Hex {
  return keccak256(
    concat([
      toBytes(from),
      toBytes(nonce),
      toBytes(toHex(BigInt(ts), { size: 8 })),
    ]),
  )
}

export function randomNonce(rng: () => Uint8Array = defaultRandomBytes): Hex {
  const bytes = rng()
  if (bytes.length !== 16) throw new Error('nonce must be 16 bytes')
  return toHex(bytes)
}

function defaultRandomBytes(): Uint8Array {
  const out = new Uint8Array(16)
  crypto.getRandomValues(out)
  return out
}

/**
 * Deterministic JSON encoding so signatures are stable. Sorts keys at every
 * level and emits no whitespace.
 */
export function canonicalize(value: unknown): string {
  if (value === null) return 'null'
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new Error('non-finite number')
    return JSON.stringify(value)
  }
  if (typeof value === 'boolean' || typeof value === 'string') return JSON.stringify(value)
  if (Array.isArray(value)) return '[' + value.map(canonicalize).join(',') + ']'
  if (typeof value === 'object') {
    const keys = Object.keys(value as Record<string, unknown>).sort()
    return (
      '{' +
      keys
        .map(k => JSON.stringify(k) + ':' + canonicalize((value as Record<string, unknown>)[k]))
        .join(',') +
      '}'
    )
  }
  throw new Error(`unserializable: ${typeof value}`)
}

export interface BuildEnvelopeArgs {
  from: Hex
  to: Hex
  type: Envelope['type']
  payload: unknown
  ts?: number
  nonce?: Hex
}

export async function signEnvelope(args: BuildEnvelopeArgs, signMessage: SignMessage): Promise<Envelope> {
  const ts = args.ts ?? Date.now()
  const nonce = args.nonce ?? randomNonce()
  const msgId = makeMsgId(args.from, nonce, ts)

  const unsigned: UnsignedEnvelope = {
    v: PROTOCOL_VERSION,
    type: args.type,
    msgId,
    from: args.from,
    to: args.to,
    ts,
    nonce,
    payload: args.payload,
  }
  const sig = await signMessage(canonicalize(unsigned))
  return { ...unsigned, sig }
}

/** True iff the signature recovers to `env.from`. */
export async function verifyEnvelope(env: Envelope): Promise<boolean> {
  const { sig, ...unsigned } = env
  try {
    const recovered = await recoverMessageAddress({
      message: canonicalize(unsigned),
      signature: sig,
    })
    return isAddressEqual(recovered, env.from)
  } catch {
    return false
  }
}

export function encodeEnvelope(env: Envelope): Uint8Array {
  return new TextEncoder().encode(JSON.stringify(env))
}

export function decodeEnvelope(bytes: Uint8Array | string): Envelope {
  const text = typeof bytes === 'string' ? bytes : new TextDecoder().decode(bytes)
  return JSON.parse(text) as Envelope
}
