#!/bin/sh
set -e

RPC_URL="${ETH_RPC_URL:-http://localhost:8545}"

# Anvil deterministic wallets
DEPLOYER="0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266"
ALICE="0x70997970C51812dc3A010C7d01b50e0d17dc79C8"
BOB="0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC"
CAROL="0x90F79bf6EB2c4f870365E785982E1f101E93b906"
DAVE="0x15d34AAf54267DB7D7c367839AAf71A00a2C6A65"

echo "=== Funding wallets with xDAI ==="
for WALLET in $DEPLOYER $ALICE $BOB $CAROL $DAVE; do
    cast rpc --rpc-url $RPC_URL anvil_setBalance "$WALLET" 0x8AC7230489E80000
    echo "Funded $WALLET with 10 xDAI"
done

echo "=== Deploying ContactRegistry contract ==="
DEPLOYED=$(forge create --rpc-url $RPC_URL \
    --private-key 0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80 \
    --broadcast \
    src/ContactRegistry.sol:ContactRegistry)

CONTRACT_ADDRESS=$(echo "$DEPLOYED" | grep "Deployed to:" | awk '{print $3}')
echo "ContactRegistry deployed at: $CONTRACT_ADDRESS"

echo "$CONTRACT_ADDRESS" > contract-address.txt

echo "=== Init complete ==="
echo "Contract: $CONTRACT_ADDRESS"
echo "Chain: Gnosis (forked)"
echo ""
echo "Set in frontend/.env:"
echo "  VITE_CONTRACT_ADDRESS=$CONTRACT_ADDRESS"
