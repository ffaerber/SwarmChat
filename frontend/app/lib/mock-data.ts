import type { Address, ChatMessage, Conversation, Profile } from "./types";

export const ME: Address = "0xA11CE0000000000000000000000000000000A11C";

export const MOCK_PROFILES: Profile[] = [
  {
    address: "0xB0B0000000000000000000000000000000000B0B",
    displayName: "Bob",
    ensName: "bob.eth",
    pssPublicKey: "0x02".padEnd(68, "b") as `0x${string}`,
    swarmOverlay: ("0x" + "bb".repeat(32)) as `0x${string}`,
    updatedAt: Date.now() - 60_000 * 5,
    active: true,
  },
  {
    address: "0xC4A12E0000000000000000000000000000000000",
    displayName: "Charlie",
    pssPublicKey: "0x02".padEnd(68, "c") as `0x${string}`,
    swarmOverlay: ("0x" + "cc".repeat(32)) as `0x${string}`,
    updatedAt: Date.now() - 60_000 * 60,
    active: true,
  },
  {
    address: "0xDA40000000000000000000000000000000000DA4",
    displayName: "Dan",
    ensName: "dan.eth",
    pssPublicKey: "0x02".padEnd(68, "d") as `0x${string}`,
    swarmOverlay: ("0x" + "dd".repeat(32)) as `0x${string}`,
    updatedAt: Date.now() - 86_400_000 * 3,
    active: true,
  },
  {
    address: "0xE7E0000000000000000000000000000000000E7E",
    displayName: "Eve",
    pssPublicKey: "0x02".padEnd(68, "e") as `0x${string}`,
    swarmOverlay: ("0x" + "ee".repeat(32)) as `0x${string}`,
    updatedAt: Date.now() - 86_400_000 * 14,
    active: false,
  },
];

export const MOCK_CONVERSATIONS: Conversation[] = [
  {
    peer: MOCK_PROFILES[0].address,
    peerName: MOCK_PROFILES[0].displayName,
    lastMessage: "how are you?",
    lastTs: Date.now() - 60_000 * 2,
    unread: 0,
    online: true,
  },
  {
    peer: MOCK_PROFILES[1].address,
    peerName: MOCK_PROFILES[1].displayName,
    lastMessage: "let's sync tomorrow",
    lastTs: Date.now() - 60_000 * 60,
    unread: 2,
    online: false,
  },
  {
    peer: MOCK_PROFILES[2].address,
    peerName: MOCK_PROFILES[2].displayName,
    lastMessage: "👍",
    lastTs: Date.now() - 86_400_000 * 3,
    unread: 0,
    online: false,
  },
];

export function mockMessagesFor(peer: Address): ChatMessage[] {
  const now = Date.now();
  return [
    {
      msgId: ("0x" + "01".repeat(32)) as `0x${string}`,
      from: ME,
      to: peer,
      ts: now - 60_000 * 30,
      text: "hey",
      status: "read",
      outbound: true,
    },
    {
      msgId: ("0x" + "02".repeat(32)) as `0x${string}`,
      from: peer,
      to: ME,
      ts: now - 60_000 * 28,
      text: "hi alice",
      status: "delivered",
      outbound: false,
    },
    {
      msgId: ("0x" + "03".repeat(32)) as `0x${string}`,
      from: ME,
      to: peer,
      ts: now - 60_000 * 2,
      text: "how are you?",
      status: "sent",
      outbound: true,
    },
  ];
}
