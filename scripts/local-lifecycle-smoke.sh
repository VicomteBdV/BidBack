#!/usr/bin/env bash
set -euo pipefail

# Validate before npm, RPC access, or the existing deployment command.
PROFILE=""
PREFLIGHT_ONLY=false
while (($#)); do
  case "$1" in
    --profile)
      if [[ -n "$PROFILE" || $# -lt 2 ]]; then
        echo "[FAIL] Pass one --profile with a supported value." >&2
        exit 1
      fi
      PROFILE="$2"
      shift 2
      ;;
    --preflight-only)
      if [[ "$PREFLIGHT_ONLY" == true ]]; then
        echo "[FAIL] Duplicate preflight flag." >&2
        exit 1
      fi
      PREFLIGHT_ONLY=true
      shift
      ;;
    *) echo "[FAIL] Unsupported lifecycle argument." >&2; exit 1 ;;
  esac
done
case "$PROFILE" in
  legacy-capped-v1|amount-rank-v1) ;;
  *) echo "[FAIL] An explicit supported --profile is required." >&2; exit 1 ;;
esac

# This wrapper deploys the current amount-rank source. Historical full cycles
# need their matching older checkout; only the network preflight is shared.
if [[ "$PROFILE" == legacy-capped-v1 && "$PREFLIGHT_ONLY" != true ]]; then
  echo "[FAIL] A full legacy lifecycle requires its matching older checkout; use --preflight-only here." >&2
  exit 1
fi

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
RPC_URL="${LOCAL_ANVIL_RPC_URL:-http://127.0.0.1:8545}"

# Keep every reused local command pinned to the same lifecycle-specific RPC.
# The Node preflight rejects non-loopback hosts and every chain ID except 31337
# before the Foundry deployment sends its first transaction.
export LOCAL_ANVIL_RPC_URL="$RPC_URL"
export ANVIL_RPC_URL="$RPC_URL"

cd "$ROOT_DIR"

npm --prefix frontend run test:local-lifecycle
npm --prefix frontend run preflight:local-lifecycle -- --profile "$PROFILE"
if [[ "$PREFLIGHT_ONLY" == true ]]; then
  exit 0
fi
npm run local:deploy
npm run validate:deployment -- 31337
npm run verify:deployment:onchain -- 31337
npm --prefix frontend run smoke:local:lifecycle -- --profile "$PROFILE"
