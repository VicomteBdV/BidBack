# Controlled Base Sepolia Deployment Runbook

This runbook prepares a fresh controlled Base Sepolia deployment. It does not authorize or perform a deployment. Broadcast, public RPC access and transactions always require separate explicit approval.

**Current status — 22 August 2026: One complete canonical Base Sepolia cycle validated.** The accepted auction `#2` run used the six-contract deployment recorded in `frontend/public/deployments/84532.json` and is documented in [`evidence/base-sepolia/2026-08-22-auction-2-bd56f90/REPORT.md`](./evidence/base-sepolia/2026-08-22-auction-2-bd56f90/REPORT.md). This runbook remains applicable to an explicitly approved replacement deployment; it does not imply that another deployment is currently required.

## Safety Boundary

- Base Sepolia chain ID: `84532`.
- Test ETH and explicitly valueless test NFTs only.
- No private key, seed phrase, `.env` file or credential-bearing RPC URL in the repository.
- No guaranteed reward language.
- No hosted frontend, relayer, account abstraction, WalletConnect or indexer in this lot.
- `ENABLE_LOCAL_DEV_ACTIONS` must be false or unset outside Anvil.

## Fresh Deployment Decision

Use a fresh deployment when an explicitly approved replacement is required. A fresh isolated deployment starts with zero credits and an unambiguous accounting baseline. Do not overwrite or silently substitute the current accepted manifest.

The current Base Sepolia deployment source of truth is `frontend/public/deployments/84532.json` at commit `bd56f9005b52dcae61b8c16599f10e67e29de3f6`. Its canonical lifecycle is confirmed, while deployment transaction hashes, checksums, exact block metadata, and BaseScan source-verification status remain pending archival evidence. A future run may reuse it only after current state and provenance are reviewed for that run.

The existing `script/DeployTestnet.s.sol` is the approved core deployment script and must not be modified for this run. It deploys the six core modules, wires the vaults once and transfers ownership to `TESTNET_OWNER`. It does not deploy a test NFT or create an auction.

## Roles

Prepare five distinct public addresses:

- `W_OWNER`: deployer and `TESTNET_OWNER`;
- `W_SELLER`: `TESTNET_SMOKE_NFT_RECIPIENT` and auction seller;
- `W_FEE`: `TESTNET_FEE_RECIPIENT`;
- `W_A`: bidder A;
- `W_B`: bidder B.

The owner EOA is temporary testnet administration, not production governance.

## Pre-Broadcast Validation

Run the full Windows or Codespaces validation suite documented in `BASE_SEPOLIA_SMOKE_TEST.md`. Review the exact commit and require a clean approved diff.

Set deployment values only in the secure execution environment:

```text
TESTNET_RPC_URL=<Base Sepolia RPC>
TESTNET_PRIVATE_KEY=<W_OWNER signing key>
TESTNET_OWNER=<W_OWNER public address>
TESTNET_FEE_RECIPIENT=<W_FEE public address>
TESTNET_SMOKE_NFT_RECIPIENT=<W_SELLER public address>
```

Never echo or record the signing key. Public addresses can be recorded.

## Core Dry-Run

After separate approval, run without `--broadcast`:

```text
forge script script/DeployTestnet.s.sol:DeployTestnet --rpc-url "$TESTNET_RPC_URL" -vvv
```

Confirm six creates, correct constructor inputs, three one-time vault links, ownership ending at `W_OWNER`, fee recipient `W_FEE`, no mock NFT and no demo auction.

## Controlled Core Broadcast

Only after human review and a separate broadcast authorization:

```text
forge script script/DeployTestnet.s.sol:DeployTestnet --rpc-url "$TESTNET_RPC_URL" --broadcast -vvv
```

Retain every deployment, wiring and ownership transaction hash from the Foundry artifact. Do not commit `broadcast/`, `cache/` or `out/`.

## Public Manifest

Generate the manifest from the successful broadcast:

```text
npm run testnet:sync -- 84532
npm run validate:deployment -- 84532
```

`frontend/public/deployments/84532.json` is explicitly allowed by `.gitignore`; local `31337.json` and other generated deployment files remain ignored. Do not use `git add -f`.

The public manifest must omit `localNft`. Record its checksum and confirm its addresses match the verified broadcast.

## Deployment Verification

Run the existing deployment verifier with explicit expected public addresses:

```text
EXPECTED_OWNER=<W_OWNER> \
EXPECTED_FEE_RECIPIENT=<W_FEE> \
BIDBACK_RPC_URL=<Base Sepolia RPC> \
npm run verify:deployment:onchain -- 84532
```

Additionally verify source and constructor arguments on BaseScan. The repository verifier checks bytecode presence, not source-bytecode equivalence.

Expected exact parameters:

```text
fee bps                    500
redistribution bps         5000
minimum participants       2
SCR weights                6000 / 3000 / 1000
minimum bid increment      500 bps
per-user reward cap        4000 bps
maximum participants       64
minimum duration           3600 seconds
anti-snipe                 600 / 600 seconds, max 6
minimum exposure           300 seconds
minimum net premium        0.01 ETH
EF / ET / II caps          1e18
paused                     false
```

## Separate Smoke NFT

`script/DeployBaseSepoliaSmokeNft.s.sol` reuses the existing simple `LocalERC721` implementation solely as a valueless public-testnet helper. It is technically sufficient for mint, ownership, approval and safe transfer, so no second ERC-721 implementation is needed.

Dry-run first and confirm recipient `W_SELLER`. After separate authorization, deploy it independently. Its token ID `1` is minted to `W_SELLER`.

Dry-run command:

```text
forge script script/DeployBaseSepoliaSmokeNft.s.sol:DeployBaseSepoliaSmokeNft --rpc-url "$TESTNET_RPC_URL" -vvv
```

Separately approved broadcast command:

```text
forge script script/DeployBaseSepoliaSmokeNft.s.sol:DeployBaseSepoliaSmokeNft --rpc-url "$TESTNET_RPC_URL" --broadcast -vvv
```

Record the NFT deployment hash, address, token ID and recipient. Do not run the smoke NFT script more than once for the canonical run.

The helper:

- is not part of BidBack core;
- is not included in `84532.json`;
- must not be described as a marketplace-minted or valuable NFT;
- can be replaced for later runs without redeploying BidBack core.

## Frontend Configuration

Configure the untracked local frontend environment with:

```text
NEXT_PUBLIC_CHAIN_ID=84532
NEXT_PUBLIC_CHAIN_NAME=Base Sepolia
NEXT_PUBLIC_WALLET_RPC_URL=<wallet-accessible RPC>
NEXT_PUBLIC_BLOCK_EXPLORER_URL=https://sepolia.basescan.org
BIDBACK_CHAIN_ID=84532
BIDBACK_RPC_URL=<server-side RPC>
ENABLE_LOCAL_DEV_ACTIONS=false
```

Never expose a credential-bearing server RPC through `NEXT_PUBLIC_*`.

Before the smoke, confirm local-dev controls are absent, wallet-signed controls remain available, wrong-network switching targets 84532, read-only pages work without a wallet, and no `/api/dev/*` request is used.

## Funding Plan

Use the estimates in `BASE_SEPOLIA_SMOKE_TEST.md`: owner approximately `0.05 ETH`, seller `0.005`, bidder A `0.035`, bidder B `0.020`, fee recipient `0.002`, always adjusted to transaction value plus twice the current gas estimate.

## Execution Handoff

After a future deployment, manifest, source and frontend checks pass, follow `BASE_SEPOLIA_SMOKE_TEST.md` exactly for P1 and T1–T11. Derive the auction ID from `nextAuctionId`; do not hard-code it. Auction `#2` is the identifier of the accepted 22 August 2026 run only.

## Failure and Recovery

Before any deposit, stop on an address, chain, bytecode, source, owner, parameter, wiring, pause, NFT or frontend mismatch. Do not replace the manifest with an unverified deployment.

If an auction already exists, preserve it. With no bids, wait, finalize and let the seller reclaim. With bids, wait, finalize and complete legitimate exit claims. A recovered run does not count as a successful canonical smoke.

## Evidence and Status

For each future run, retain deployment hashes, addresses, source-verification links, manifest checksum and lifecycle evidence. Create or accept that run's evidence report and update product status only after its public cycle succeeds and is reviewed. The accepted 22 August 2026 run remains bounded by the confirmed and pending fields in its own report.
