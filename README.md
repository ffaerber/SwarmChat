# SwarmChat

A decentralized 1:1 messenger and WebRTC video-calling dApp on Gnosis Chain + Ethereum Swarm.

Identity is your Ethereum wallet. Discovery is a public on-chain registry (`ContactRegistry`) on Gnosis Chain. Messages are signed, encrypted, and transported over Swarm PSS, with Swarm feeds acting as a per-user outbox for offline delivery. Designed to run inside [Freedom Browser](https://freedombrowser.eth.limo/), which ships with a local Bee node.

See [`swarmchat-spec.md`](./swarmchat-spec.md) for the full protocol specification.

## Architecture

- **Smart Contract**: Solidity 0.8.28, built with Foundry
- **Frontend**: React 19 + TypeScript + Vite SPA (hash router for Swarm hosting)
- **Chain**: Gnosis Chain (xDAI for gas)
- **Storage**: Ethereum Swarm (PSS for real-time transport, feeds for store-and-forward)
- **Transport**: PSS via local Bee node at `http://127.0.0.1:1633`
- **ENS**: `swarmchat.eth`

## How It Works

| Action | Wallet | Bee node |
|---|---|---|
| Browse directory | No | No |
| Register profile | Yes + xDAI | Yes (PSS pubkey + overlay) |
| Send message | Yes | Yes + postage stamp |
| Receive message | Yes | Yes (full node, not gateway) |
| Video call | Yes | Yes (signaling) |

- **Identity** — your wallet address. Optionally an ENS name.
- **Discovery** — `ContactRegistry.register()` stores your display name, PSS public key, and Swarm overlay on-chain.
- **Messages** — JSON envelope, signed with your wallet, encrypted to the recipient's PSS public key, sent over PSS.
- **Offline delivery** — each sent message is also written to a per-recipient Swarm feed; recipients pull missed messages on startup.
- **Reliability** — Meshtastic-inspired: explicit ack, exponential-backoff retry (30s → 6h, cap 5), 10k-entry msgId dedup cache.
- **Blocklist** — local-only (IndexedDB) in v1.
- **Video** — WebRTC signaling over PSS; media flows peer-to-peer once ICE is up. TURN fallback is the single centralized dependency.

## Contracts

| Contract | Address |
|---|---|
| ContactRegistry | `0x...` (set after deploy) |

## Prerequisites

- [Foundry](https://getfoundry.sh/) (`curl -L https://foundry.paradigm.xyz | bash && foundryup`)
- Node.js 20+
- A Bee node (bundled with [Freedom Browser](https://freedombrowser.eth.limo/), or stand-alone Bee)
- MetaMask or injected wallet

## Quick Start

```bash
# Install all dependencies
make install

# Run tests against Gnosis Chain fork
make test-fork
```

### Local Development

```bash
# Terminal 1: start Anvil fork of Gnosis Chain
make anvil

# Terminal 2: fund wallets + deploy contract
make anvil-init

# Terminal 3: start frontend dev server
make dev
```

## Deploy

### Contract

```bash
make deploy-contract-chiado     # Deploy to Chiado testnet (chain 10200)
make deploy-contract            # Deploy to Gnosis Chain mainnet (chain 100)
make verify-contract CONTRACT=0x...
```

### Frontend

```bash
make deploy-frontend            # Build + upload to Swarm + update ENS
```

This builds the frontend, uploads to Swarm, and updates the ENS content hash on mainnet.

Target:
- https://swarmchat.eth.limo
- https://swarmchat.eth.bzz.link

### ENS Only

```bash
make update-ens SWARM_HASH=<hash>
```

### Full Deploy

```bash
make deploy-all                 # Contract + frontend
```

## All Make Commands

```
make help                       # Show all commands

# Setup
make install                    # Install contracts + frontend deps

# Development
make anvil                      # Start local Anvil fork of Gnosis Chain
make anvil-init                 # Fund wallets + deploy contract to local Anvil
make dev                        # Start frontend dev server

# Testing
make test                       # Run unit tests
make test-fork                  # Run all tests against Gnosis Chain fork
make test-unit                  # Run only unit tests (no fork)
make test-gas                   # Run tests with gas report
make coverage                   # Run test coverage

# Build
make build                      # Build contracts
make build-frontend             # Build frontend for production
make build-all                  # Build contracts + frontend
make abi                        # Extract ABI to frontend
make typecheck                  # Type-check frontend

# Deploy
make deploy-contract            # Deploy contract to Gnosis Chain
make deploy-contract-chiado     # Deploy contract to Chiado testnet
make deploy-contract-local      # Deploy contract to local Anvil
make deploy-frontend            # Build + upload to Swarm + update ENS
make update-ens                 # Update ENS content hash (SWARM_HASH=...)
make deploy-all                 # Contract + frontend to production
make verify-contract            # Verify on Blockscout (CONTRACT=0x...)

# Utilities
make clean                      # Remove build artifacts
make fmt                        # Format Solidity code
make snapshot                   # Create gas snapshot
```

## Project Structure

```
swarmchat/
├── src/
│   └── ContactRegistry.sol           # On-chain user directory
├── test/
│   └── ContactRegistry.t.sol         # Unit + fork tests
├── script/
│   └── Deploy.s.sol                  # Foundry deploy script
├── frontend/
│   ├── src/
│   │   ├── components/               # Nav, Sidebar, ChatList, Conversation,
│   │   │                             # Directory, Modal, ChainGuard, EnsName
│   │   ├── hooks/                    # useBee, BeeContext
│   │   ├── config/                   # wagmi, contract addresses + ABIs
│   │   └── abi/                      # ContactRegistry ABI
│   └── index.html
├── anvil-init.sh                     # Fund wallets + deploy to local fork
├── Makefile                          # Dev, test, build, deploy commands
├── foundry.toml                      # Foundry config
└── swarmchat-spec.md                 # Protocol specification
```

## Tech Stack

| Layer | Technology |
|---|---|
| Smart Contracts | Solidity 0.8.28, Foundry |
| Frontend | React 19, TypeScript, Vite, Tailwind CSS 4 |
| Web3 | wagmi v2, viem |
| Swarm SDK | @ethersphere/bee-js v11 |
| Routing | React Router 7 (hash router) |
| Chain | Gnosis Chain (ID: 100) |
| Storage | Ethereum Swarm (PSS + feeds) |
| Video | Native WebRTC |
| Hosting | Swarm + ENS |
