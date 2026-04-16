import { beforeEach, describe, expect, it } from "vitest";

import {
  blockAddress,
  listBlocked,
  listMessages,
  putMessage,
} from "~/lib/storage";
import type { Address, ChatMessage } from "~/lib/types";

const ALICE: Address = "0xA11CE0000000000000000000000000000000A11C";
const BOB: Address = "0xB0B0000000000000000000000000000000000B0B";

function makeMsg(overrides: Partial<ChatMessage> = {}): ChatMessage {
  return {
    msgId: ("0x" +
      Math.random().toString(16).slice(2).padEnd(64, "0").slice(0, 64)) as
      `0x${string}`,
    from: ALICE,
    to: BOB,
    ts: Date.now(),
    text: "hello",
    status: "sent",
    outbound: true,
    ...overrides,
  };
}

beforeEach(async () => {
  // fake-indexeddb provides a fresh in-memory DB per test file; clear stores
  // by deleting the database between tests.
  const { indexedDB } = globalThis as unknown as {
    indexedDB: IDBFactory;
  };
  await new Promise<void>((res) => {
    const req = indexedDB.deleteDatabase("swarmchat");
    req.onsuccess = () => res();
    req.onerror = () => res();
    req.onblocked = () => res();
  });
});

describe("storage: messages", () => {
  it("persists and lists messages", async () => {
    const m1 = makeMsg({ text: "first" });
    const m2 = makeMsg({ text: "second" });
    await putMessage(m1);
    await putMessage(m2);

    const list = await listMessages();
    const texts = list.map((m) => m.text).sort();
    expect(texts).toEqual(["first", "second"]);
  });

  it("upserts on duplicate msgId", async () => {
    const m = makeMsg({ text: "before", status: "pending" });
    await putMessage(m);
    await putMessage({ ...m, text: "after", status: "delivered" });

    const list = await listMessages();
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ text: "after", status: "delivered" });
  });
});

describe("storage: blocklist", () => {
  it("stores blocked addresses and lists them", async () => {
    await blockAddress("0xdeadbeef");
    await blockAddress("0xfeedface");
    const blocked = await listBlocked();
    expect(blocked.sort()).toEqual(["0xdeadbeef", "0xfeedface"]);
  });
});
