import type { Address, Envelope, MessageType } from "./types";

export function inboxTopic(address: Address): string {
  return `swarmchat:inbox:${address.toLowerCase()}`;
}

export function newMsgId(): `0x${string}` {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return ("0x" +
    Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join(
      "",
    )) as `0x${string}`;
}

export function newNonce(): `0x${string}` {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return ("0x" +
    Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join(
      "",
    )) as `0x${string}`;
}

export function buildEnvelope<P>(args: {
  type: MessageType;
  from: Address;
  to: Address;
  payload: P;
  sig?: `0x${string}`;
}): Omit<Envelope<P>, "sig"> & { sig: `0x${string}` } {
  return {
    v: 1,
    type: args.type,
    msgId: newMsgId(),
    from: args.from,
    to: args.to,
    ts: Date.now(),
    nonce: newNonce(),
    payload: args.payload,
    sig: args.sig ?? ("0x" as `0x${string}`),
  };
}
