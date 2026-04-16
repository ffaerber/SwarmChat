import { describe, expect, it } from "vitest";

import {
  buildEnvelope,
  inboxTopic,
  newMsgId,
  newNonce,
} from "~/lib/transport";
import type { Address } from "~/lib/types";

const ALICE: Address = "0xA11CE0000000000000000000000000000000A11C";
const BOB: Address = "0xB0B0000000000000000000000000000000000B0B";

describe("inboxTopic", () => {
  it("derives a lowercase topic from an address", () => {
    expect(inboxTopic(ALICE)).toBe(
      "swarmchat:inbox:0xa11ce0000000000000000000000000000000a11c",
    );
  });
});

describe("newMsgId / newNonce", () => {
  it("returns a 0x-prefixed 32-byte hex msgId", () => {
    const id = newMsgId();
    expect(id.startsWith("0x")).toBe(true);
    expect(id.length).toBe(2 + 64);
    expect(id).toMatch(/^0x[0-9a-f]{64}$/);
  });

  it("returns a 0x-prefixed 16-byte hex nonce", () => {
    const n = newNonce();
    expect(n).toMatch(/^0x[0-9a-f]{32}$/);
  });

  it("produces unique ids across calls", () => {
    const ids = new Set(Array.from({ length: 200 }, () => newMsgId()));
    expect(ids.size).toBe(200);
  });
});

describe("buildEnvelope", () => {
  it("constructs a v1 envelope with all required fields", () => {
    const before = Date.now();
    const env = buildEnvelope({
      type: "msg",
      from: ALICE,
      to: BOB,
      payload: { text: "hi" },
    });
    const after = Date.now();

    expect(env.v).toBe(1);
    expect(env.type).toBe("msg");
    expect(env.from).toBe(ALICE);
    expect(env.to).toBe(BOB);
    expect(env.payload).toEqual({ text: "hi" });
    expect(env.msgId).toMatch(/^0x[0-9a-f]{64}$/);
    expect(env.nonce).toMatch(/^0x[0-9a-f]{32}$/);
    expect(env.ts).toBeGreaterThanOrEqual(before);
    expect(env.ts).toBeLessThanOrEqual(after);
    expect(env.sig).toBe("0x");
  });

  it("uses provided signature when supplied", () => {
    const env = buildEnvelope({
      type: "ack",
      from: ALICE,
      to: BOB,
      payload: { ackMsgId: "0xabc" },
      sig: "0xdeadbeef",
    });
    expect(env.sig).toBe("0xdeadbeef");
    expect(env.type).toBe("ack");
  });
});
