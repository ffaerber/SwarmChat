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
