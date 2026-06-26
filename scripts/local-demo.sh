#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
FRONTEND_DIR="$ROOT_DIR/frontend"
RPC_URL="${ANVIL_RPC_URL:-http://127.0.0.1:8545}"

cd "$ROOT_DIR"

echo "Checking local Anvil RPC at $RPC_URL..."

CHAIN_RESPONSE="$(
  curl -sS \
    -X POST \
    -H "content-type: application/json" \
    --data '{"jsonrpc":"2.0","id":1,"method":"eth_chainId","params":[]}' \
    "$RPC_URL" || true
)"

if ! printf "%s" "$CHAIN_RESPONSE" | grep -q '"result"'; then
  echo "Anvil is not responding."
  echo "Start it in another terminal:"
  echo "  anvil --host 0.0.0.0 --chain-id 31337"
  exit 1
fi

if ! printf "%s" "$CHAIN_RESPONSE" | grep -q '"result":"0x7a69"'; then
  echo "Local demo requires Anvil chainId 31337."
  echo "Start Anvil with:"
  echo "  anvil --host 0.0.0.0 --chain-id 31337"
  exit 1
fi

if [ ! -d "$FRONTEND_DIR/node_modules" ]; then
  echo "frontend/node_modules is missing."
  echo "Install frontend dependencies first:"
  echo "  cd frontend"
  echo "  npm install"
  exit 1
fi

if [ ! -f "$FRONTEND_DIR/.env.local" ]; then
  cp "$FRONTEND_DIR/.env.example" "$FRONTEND_DIR/.env.local"
  echo "Created frontend/.env.local from frontend/.env.example."
  echo "ENABLE_LOCAL_DEV_ACTIONS=true is intended for local Anvil only."
  echo "Review the private keys if your Anvil terminal printed different keys."
else
  echo "frontend/.env.local already exists. Leaving it unchanged."
fi

echo "Deploying local BidBack contracts and demo auction..."

forge script script/DeployLocal.s.sol:DeployLocal \
  --rpc-url "$RPC_URL" \
  --broadcast \
  -vvv

echo "Synchronizing frontend deployment file..."

npm --prefix frontend run sync:deployment

echo "Local deployment is ready."
echo "Start the frontend with:"
echo "  npm run frontend:dev"
echo
echo "If Anvil restarts, rerun:"
echo "  npm run local:deploy"
echo "  npm run frontend:sync"