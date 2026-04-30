export type Hex = `0x${string}`

export type EnvelopeType =
  | 'msg'
  | 'ack'
  | 'read'
  | 'typing'
  | 'call-offer'
  | 'call-answer'
  | 'ice'
  | 'call-hangup'

/** A Swarm reference. 32-byte hash for plain uploads or 64-byte hash+key for encrypted ones. */
export type SwarmRef = `0x${string}`

export type MsgPayload =
  | { kind: 'text'; text: string }
  | { kind: 'image'; ref: SwarmRef; mime: string; size: number; name?: string; w?: number; h?: number }
  | { kind: 'video'; ref: SwarmRef; mime: string; size: number; name?: string; durationMs?: number }
  | { kind: 'file';  ref: SwarmRef; mime: string; size: number; name: string }

/** Older clients sent { text } at the top of payload without `kind`. Accept both. */
export type LegacyTextPayload = { text: string }


export interface UnsignedEnvelope {
  v: 1
  type: EnvelopeType
  msgId: Hex
  from: Hex
  to: Hex
  /** Sender's feed owner address. Recipients cache this to read the
   *  sender's outbox feed for offline catch-up (spec §6, store-and-forward). */
  feedOwner: Hex
  ts: number
  nonce: Hex
  payload: unknown
}

export interface Envelope extends UnsignedEnvelope {
  sig: Hex
}

export interface PeerProfile {
  wallet: Hex
  pssPublicKey: Hex   // 33-byte compressed secp256k1
  swarmOverlay: Hex   // 32-byte Swarm overlay
}

/** Pluggable signer so the lib doesn't depend on wagmi/viem directly. */
export type SignMessage = (message: string) => Promise<Hex>
