export type Address = `0x${string}`;

export type MessageStatus = "pending" | "sent" | "delivered" | "read" | "failed";

export type MessageType =
  | "msg"
  | "ack"
  | "read"
  | "typing"
  | "call-offer"
  | "call-answer"
  | "ice"
  | "call-hangup";

export interface Envelope<P = unknown> {
  v: 1;
  type: MessageType;
  msgId: `0x${string}`;
  from: Address;
  to: Address;
  ts: number;
  nonce: `0x${string}`;
  payload: P;
  sig: `0x${string}`;
}

export interface Profile {
  address: Address;
  displayName: string;
  pssPublicKey: `0x${string}`;
  swarmOverlay: `0x${string}`;
  updatedAt: number;
  active: boolean;
  ensName?: string;
}

export interface ChatMessage {
  msgId: `0x${string}`;
  from: Address;
  to: Address;
  ts: number;
  text: string;
  status: MessageStatus;
  outbound: boolean;
}

export interface Conversation {
  peer: Address;
  peerName: string;
  lastMessage?: string;
  lastTs?: number;
  unread: number;
  online?: boolean;
}
