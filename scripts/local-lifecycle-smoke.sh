#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
RPC_URL="${LOCAL_ANVIL_RPC_URL:-http://127.0.0.1:8545}"

# Keep every reused local command pinned to the same lifecycle-specific RPC.
# The Node preflight rejects non-loopback hosts and every chain ID except 31337
# before the Foundry deployment sends its first transaction.
export LOCAL_ANVIL_RPC_URL="$RPC_URL"
export ANVIL_RPC_URL="$RPC_URL"

cd "$ROOT_DIR"

npm --prefix frontend run test:local-lifecycle
npm --prefix frontend run preflight:local-lifecycle
npm run local:deploy
npm run validate:deployment -- 31337
npm run verify:deployment:onchain -- 31337
npm --prefix frontend run smoke:local:lifecycle
