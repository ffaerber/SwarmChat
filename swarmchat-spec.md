# SwarmChat — Decentralized Messaging & Video Calls on Swarm + Gnosis Chain

A WhatsApp-style messenger and WebRTC video conferencing dApp built on Ethereum Swarm (PSS for transport, feeds for store-and-forward) with a Gnosis Chain smart contract as the user directory. Designed to run inside [Freedom Browser](https://freedombrowser.eth.limo/), which ships with a local Bee node.

---

## 1. Vision

A fully decentralized 1:1 messenger with video calling, no central server, no account system, no phone number. Identity is your Ethereum wallet. Discovery is a public on-chain registry. Messages are end-to-end encrypted and travel over Swarm's PSS gossip network. Offline delivery is handled by Swarm feeds acting as a per-user outbox.

The architecture is heavily inspired by Meshtastic's reliability patterns (message IDs, explicit acks, bounded retry, store-and-forward) adapted to Swarm.

---

## 2. Tech Stack

| Layer | Technology |
|---|---|
| Runtime | [Freedom Browser](https://github.com/solardev-xyz/freedom-browser) (Electron, ships with Bee + IPFS) |
| Transport | Swarm PSS via local Bee node at `http://127.0.0.1:1633` |
| Offline storage | Swarm feeds (per-user outbox) |
| Identity / directory | Smart contract on **Gnosis Chain** |
| Wallet | Injected EIP-1193 provider (MetaMask / WalletConnect) |
| Swarm SDK | [`@ethersphere/bee-js`](https://bee-js.ethswarm.org/) |
| Web3 SDK | `viem` (preferred) or `ethers v6` |
| ENS resolution | Mainnet ENS via public RPC (Freedom does this natively) |
| Crypto | `noble-secp256k1` / `noble-hashes` for signatures, browser SubtleCrypto for AES |
| Video | Native WebRTC (`RTCPeerConnection`, `getUserMedia`) |
| UI | Vanilla JS + minimal framework (no build step ideal for Swarm hosting), or Vite + React if needed |
| Hosting | Upload built dApp to Swarm, point ENS name at the bzz hash |

---

## 3. Smart Contract — `ContactRegistry`

Deployed on **Gnosis Chain** (chain ID 100). One contract, minimal state, gas-efficient.

### Responsibilities
- Register a wallet address with a profile (display name, PSS public key, Swarm overlay address)
- Allow profile updates
- Allow soft deactivation
- Enable enumeration of all registered users (paginated)
- Allow lookup by address
- Emit events for client-side indexing via `eth_getLogs`

### Solidity (drop into `contracts/ContactRegistry.sol`)

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

contract ContactRegistry {
    struct Profile {
        string displayName;       // <= 64 chars
        bytes pssPublicKey;       // 33-byte compressed secp256k1 PSS public key
        bytes32 swarmOverlay;     // 32-byte Swarm overlay address
        uint64 updatedAt;
        bool active;
    }

    mapping(address => Profile) private _profiles;
    address[] private _users;
    mapping(address => uint256) private _userIndex; // index+1, 0 = absent

    event Registered(address indexed user, string displayName);
    event Updated(address indexed user, string displayName);
    event Deactivated(address indexed user);

    function register(
        string calldata displayName,
        bytes calldata pssPublicKey,
        bytes32 swarmOverlay
    ) external {
        require(bytes(displayName).length > 0 && bytes(displayName).length <= 64, "bad name");
        require(pssPublicKey.length == 33, "pss key must be 33 bytes");
        require(swarmOverlay != bytes32(0), "overlay required");

        Profile storage p = _profiles[msg.sender];
        bool isNew = !p.active && _userIndex[msg.sender] == 0;

        p.displayName = displayName;
        p.pssPublicKey = pssPublicKey;
        p.swarmOverlay = swarmOverlay;
        p.updatedAt = uint64(block.timestamp);
        p.active = true;

        if (isNew) {
            _users.push(msg.sender);
            _userIndex[msg.sender] = _users.length;
            emit Registered(msg.sender, displayName);
        } else {
            emit Updated(msg.sender, displayName);
        }
    }

    function deactivate() external {
        require(_profiles[msg.sender].active, "not active");
        _profiles[msg.sender].active = false;
        emit Deactivated(msg.sender);
    }

    function isRegistered(address user) external view returns (bool) {
        return _profiles[user].active;
    }

    function getProfile(address user) external view returns (
        string memory displayName,
        bytes memory pssPublicKey,
        bytes32 swarmOverlay,
        uint64 updatedAt,
        bool active
    ) {
        Profile storage p = _profiles[user];
        return (p.displayName, p.pssPublicKey, p.swarmOverlay, p.updatedAt, p.active);
    }

    function getUserCount() external view returns (uint256) {
        return _users.length;
    }

    function getUsers(uint256 offset, uint256 limit)
        external view returns (address[] memory page)
    {
        uint256 total = _users.length;
        if (offset >= total) return new address[](0);
        uint256 end = offset + limit;
        if (end > total) end = total;
        page = new address[](end - offset);
        for (uint256 i = offset; i < end; i++) {
            page[i - offset] = _users[i];
        }
    }
}
```

### Deployment
- Use **Foundry** or **Hardhat**
- Target Gnosis Chain (RPC: `https://rpc.gnosischain.com`, chain ID 100)
- Verify on Gnosisscan after deploy
- Save the deployed address into a frontend config file

---

## 4. Identity Model

| Field | Source | Notes |
|---|---|---|
| Wallet address | User's Ethereum wallet | Primary identity |
| ENS name | Optional, resolved on Mainnet | Display only; address is canonical |
| PSS public key | Local Bee node `/addresses` endpoint | 33-byte compressed secp256k1 |
| Swarm overlay | Local Bee node `/addresses` endpoint | 32-byte Kademlia routing address |
| Display name | User-chosen, stored on-chain | <= 64 chars |

A user is "registered" when their profile exists and `active == true` in the registry contract.

---

## 5. Message Protocol

All messages are JSON, signed by the sender's wallet, encrypted with the recipient's PSS public key, and sent over PSS to the recipient's inbox topic.

### Inbox topic
Each user listens on a single inbox topic derived from their address:
```
topic = Topic.fromString("swarmchat:inbox:" + address.toLowerCase())
```

### Envelope
Every message uses this envelope:

```json
{
  "v": 1,
  "type": "msg" | "ack" | "read" | "typing" | "call-offer" | "call-answer" | "ice" | "call-hangup",
  "msgId": "0x<keccak256(from + nonce + timestamp)>",
  "from": "0x<sender address>",
  "to":   "0x<recipient address>",
  "ts":   1737043200000,
  "nonce": "0x<random 16 bytes hex>",
  "payload": { ... type-specific ... },
  "sig": "0x<EIP-191 signature over canonical JSON of all fields above except sig>"
}
```

### Type-specific payloads

```json
// Text message
{ "type": "msg", "payload": { "text": "hey" } }

// Delivery acknowledgment (recipient -> sender)
{ "type": "ack", "payload": { "ackMsgId": "0x..." } }

// Read receipt (recipient -> sender)
{ "type": "read", "payload": { "readMsgId": "0x..." } }

// Typing indicator
{ "type": "typing", "payload": { "isTyping": true } }

// Video call signaling
{ "type": "call-offer",  "payload": { "callId": "0x...", "sdp": "..." } }
{ "type": "call-answer", "payload": { "callId": "0x...", "sdp": "..." } }
{ "type": "ice",         "payload": { "callId": "0x...", "candidate": {...} } }
{ "type": "call-hangup", "payload": { "callId": "0x...", "reason": "..." } }
```

### Signature verification
On receipt:
1. Recover signer address via `ecrecover` from `sig`
2. Reject if recovered address != `from`
3. Reject if `from` is in local blocklist
4. Reject if `msgId` is in recent-seen dedup cache (last 10k entries, LRU)
5. Process payload

---

## 6. Reliability Model (Meshtastic-inspired)

### Message states (sender side)
- `pending` — composed, not yet sent
- `sent` — pushed to PSS, awaiting ack
- `delivered` — recipient sent `ack`
- `read` — recipient sent `read`
- `failed` — retry budget exhausted

### Retry policy
- On send: write to local outbox, push to PSS
- If no `ack` within 30s → retry (same msgId)
- Backoff: 30s, 2min, 10min, 1h, 6h
- Cap: 5 retries over ~7h
- After cap: mark `failed`, surface to user

### Store-and-forward via Swarm feeds
For recipients offline beyond PSS chunk lifetime:
- Each user maintains an **outbox feed**: `feed:<senderAddress>/outbox/<recipientAddress>`
- Every sent message is **also** written to this feed (encrypted to recipient)
- On startup, client iterates known contacts, fetches their outbox feeds, pulls messages newer than `lastSeenTs` for that contact
- Feed entries persist as long as their postage stamp is funded

### Deduplication
LRU cache of last 10,000 `msgId` values. Drop duplicates silently.

### Postage stamps
- Use a single shared postage batch per user (pre-funded on first registration)
- App should help user purchase a small batch on Gnosis Chain via Bee's stamp purchase API
- Batch TTL configurable; default to 30 days for outbox feeds, shorter for ephemeral PSS

---

## 7. Blocklist

**Local-only** in v1, stored in IndexedDB.

- User can block any address from a chat
- Block = silently drop all incoming messages from that `from` address (after sig verification)
- No on-chain state, no notification to blocked user
- v2: optional encrypted backup to a Swarm feed for cross-device sync

---

## 8. Application Screens

### 8.1 Onboarding
1. **Connect wallet** — button triggers wallet connect, request Gnosis Chain (offer to switch network if wrong)
2. **Detect Bee node** — health check `GET http://127.0.0.1:1633/health`
3. **Fetch local node info** — `GET /addresses` for PSS pubkey + overlay
4. **Purchase postage** (if no usable batch) — `POST /stamps` with small amount
5. **Register profile** — input display name, call `registry.register(name, pssPubkey, overlay)`, sign tx

### 8.2 Main UI

```
┌─────────────────────────────────────────────────────┐
│  SwarmChat                       0xAlice... ▼       │
├──────────────┬──────────────────────────────────────┤
│ [Chats] [Dir]│  ┌────────────────────────────────┐  │
│              │  │ Bob (bob.eth)         online   │  │
│ Bob       2m │  ├────────────────────────────────┤  │
│ Charlie  1h  │  │ hey                       ✓✓   │  │
│ Dan      3d  │  │                                │  │
│              │  │              hi alice    14:32 │  │
│              │  │ how are you?              ✓    │  │
│              │  │                                │  │
│              │  ├────────────────────────────────┤  │
│              │  │ [📎] Type a message...  [📞🎥] │  │
│              │  └────────────────────────────────┘  │
└──────────────┴──────────────────────────────────────┘
```

- **Sidebar tabs:**
  - **Chats** — conversations with last message preview, unread badge, sorted by most recent
  - **Directory** — browse all registered users from contract, search by address or ENS, "Start chat"
- **Conversation pane** — message bubbles, status ticks (✓ sent, ✓✓ delivered, ✓✓ blue read), timestamps, typing indicator
- **Composer** — text input, attach button (v2), call buttons (audio + video)
- **Header menu** — view profile, block user, clear chat

### 8.3 Settings
- Profile: edit display name, view address, view PSS pubkey, view overlay
- Bee node: status, postage batch info, refresh
- Blocklist: view/unblock
- Deactivate account (calls `registry.deactivate()`)

### 8.4 Incoming call modal
- Caller name + avatar
- Accept (📞) / Decline (✖)
- On accept: open video call view

### 8.5 Video call view
- Local + remote video tiles
- Mute / camera off / hangup controls
- Connection state indicator

---

## 9. Video Call Flow (WebRTC over PSS)

1. Alice clicks "Video call" in Bob's chat
2. Alice creates `RTCPeerConnection`, attaches local `MediaStream` from `getUserMedia({video:true,audio:true})`
3. Alice creates SDP offer, sends `call-offer` PSS message to Bob
4. Bob's client shows incoming call modal
5. Bob accepts → creates `RTCPeerConnection`, attaches local stream, sets remote description from offer, creates answer
6. Bob sends `call-answer` PSS message to Alice
7. Both sides emit ICE candidates as they're discovered → batch and send as `ice` PSS messages (batch every ~500ms to reduce stamp cost)
8. Once ICE connected, video flows peer-to-peer over WebRTC; PSS no longer involved
9. Either side can send `call-hangup` to terminate

### TURN fallback
- ~15% of users behind strict NATs cannot establish direct WebRTC
- App should be configured with at least one TURN server
- Options: self-host coturn, use Cloudflare TURN, use Twilio
- Configure in `RTCPeerConnection` `iceServers`
- Document that this is the one centralized dependency

---

## 10. Anti-spam & Abuse

v1 (ship with):
- Local blocklist
- Sig verification (no spoofing)
- Client-side rate limit: drop messages from any single address sent more than N per minute

v2 (add later if needed):
- Optional on-chain stake to register (small refundable BZZ deposit)
- Reputation: count of distinct contacts who haven't blocked you
- Encrypted blocklist sync via Swarm feeds

---

## 11. Project Structure

```
swarmchat/
├── contracts/
│   ├── ContactRegistry.sol
│   └── deploy/
│       └── deploy.ts
├── frontend/
│   ├── index.html
│   ├── src/
│   │   ├── main.ts
│   │   ├── lib/
│   │   │   ├── bee.ts          # bee-js wrapper
│   │   │   ├── registry.ts     # contract reads/writes
│   │   │   ├── crypto.ts       # signing, encryption helpers
│   │   │   ├── transport.ts    # PSS send/subscribe + envelope
│   │   │   ├── outbox.ts       # feed-based store-and-forward
│   │   │   ├── reliability.ts  # ack/retry/dedup
│   │   │   ├── storage.ts      # IndexedDB wrapper
│   │   │   ├── webrtc.ts       # call setup
│   │   │   └── ens.ts          # ENS resolution
│   │   ├── ui/
│   │   │   ├── onboarding.ts
│   │   │   ├── chat-list.ts
│   │   │   ├── conversation.ts
│   │   │   ├── directory.ts
│   │   │   ├── settings.ts
│   │   │   └── call.ts
│   │   └── styles.css
│   ├── package.json
│   └── vite.config.ts
├── README.md
└── DEPLOYMENT.md
```

---

## 12. Build Order (suggested for Claude Code)

Build in vertical slices. Each slice should be testable end-to-end before moving on.

### Phase 1 — Contract
- [ ] Foundry/Hardhat project setup
- [ ] `ContactRegistry.sol` with full tests
- [ ] Deploy script for Gnosis Chain (testnet first: Chiado, chain ID 10200)
- [ ] Deploy to Chiado, verify

### Phase 2 — Onboarding
- [ ] Frontend project skeleton (Vite + TypeScript)
- [ ] Wallet connect flow
- [ ] Bee node detection & `/addresses` fetch
- [ ] Postage batch check + purchase UI
- [ ] Registration form → contract `register()`

### Phase 3 — Directory
- [ ] Read `getUserCount` + paginated `getUsers`
- [ ] Render user list with display names
- [ ] Address / ENS lookup field
- [ ] "Start chat" → opens empty conversation

### Phase 4 — Messaging core
- [ ] Envelope sign/verify helpers
- [ ] PSS send wrapper using recipient pubkey + overlay
- [ ] PSS subscribe to own inbox topic on startup
- [ ] Conversation UI with text send/receive
- [ ] IndexedDB persistence of messages
- [ ] Message dedup cache

### Phase 5 — Reliability
- [ ] Ack-on-receipt
- [ ] Retry queue with exponential backoff
- [ ] Status ticks in UI
- [ ] Outbox feed write on send
- [ ] Outbox feed pull on startup (catch-up)

### Phase 6 — Blocklist & quality of life
- [ ] Block user from chat menu
- [ ] Filter incoming by blocklist
- [ ] Read receipts
- [ ] Typing indicators
- [ ] Settings screen

### Phase 7 — Video calls
- [ ] WebRTC peer connection helpers
- [ ] Call-offer/answer/ice message handling
- [ ] Incoming call modal
- [ ] Call view with local + remote video
- [ ] Hangup, mute, camera toggle
- [ ] TURN server configuration

### Phase 8 — Hosting
- [ ] Build production bundle (single HTML if possible for easy Swarm hosting)
- [ ] Upload to Swarm via Bee
- [ ] Point ENS name (e.g. `swarmchat.eth`) at the bzz hash
- [ ] Test in Freedom Browser

---

## 13. Key Constraints & Gotchas

- **Freedom Browser is alpha (0.6.x)** — small user base, expect rough edges. Have a fallback path for users on regular browsers connecting to a public Bee gateway.
- **PSS recipients must be Bee full nodes.** Light/gateway nodes can send but not receive PSS. This is why Freedom (with bundled full Bee) is ideal.
- **Postage stamps cost BZZ on Gnosis Chain.** Users need a small BZZ balance. The app should make purchase frictionless.
- **PSS has no delivery guarantee at the network layer** — that's why we built the reliability layer on top.
- **PSS message size practical limit: ~4KB per chunk.** Long messages need chunking. Trivial for text, matters for media.
- **Duplicate delivery is normal** — always dedupe by `msgId`.
- **No message ordering guarantee** — sort by `ts` client-side.
- **TURN is the one un-decentralizable piece** for video. Be honest about this in docs.
- **Wallet network mismatch** — always check chain ID, prompt to switch to Gnosis Chain (100).
- **ENS lives on Mainnet, not Gnosis** — resolve ENS via mainnet RPC, not the Gnosis RPC.

---

## 14. References

- Freedom Browser: <https://freedombrowser.eth.limo/> · <https://github.com/solardev-xyz/freedom-browser>
- Swarm PSS docs: <https://docs.ethswarm.org/docs/develop/tools-and-features/pss/>
- bee-js PSS guide: <https://bee-js.ethswarm.org/docs/pss/>
- Swarm feeds: <https://docs.ethswarm.org/docs/develop/tools-and-features/feeds/>
- Gnosis Chain: <https://docs.gnosischain.com/>
- Meshtastic mesh algorithm (reliability inspiration): <https://meshtastic.org/docs/overview/mesh-algo/>
- ENS docs: <https://docs.ens.domains/>

---

## 15. Open Questions to Resolve During Build

1. **Vanilla JS vs framework?** Vanilla keeps the bundle small and Swarm-friendly. React/Svelte is more productive. Recommend Svelte if a framework is needed.
2. **Wallet for Freedom Browser?** Confirm whether Freedom has injected wallet support or if WalletConnect is required.
3. **Postage purchase UX.** Investigate the smoothest path — possibly partner with a gateway service initially.
4. **Gas sponsorship?** Could a paymaster cover registration tx so users don't need xDAI? Worth exploring for v2.
5. **Group chats.** Out of scope for v1; design space for v2.
