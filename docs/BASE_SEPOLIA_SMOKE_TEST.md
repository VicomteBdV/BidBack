# Base Sepolia Canonical Multi-Wallet Smoke Test

This runbook defines the canonical wallet-signed BidBack lifecycle on Base Sepolia (`84532`). It is a controlled public-testnet procedure using valueless assets. It is not production, an audit, or evidence of guaranteed rewards.

**Current status — 22 August 2026: One complete canonical Base Sepolia cycle validated.** Auction `#2` completed the procedure across five distinct public role wallets and a separately deployed valueless test-only NFT. The lifecycle verifier succeeded successively from `after-create` through `final`, five duplicate-action `eth_call` simulations reverted as expected, and `final` still passed afterward. The bounded accepted record is [`evidence/base-sepolia/2026-08-22-auction-2-bd56f90/REPORT.md`](./evidence/base-sepolia/2026-08-22-auction-2-bd56f90/REPORT.md).

This runbook remains the procedure for future canonical runs. Each later run must independently satisfy the transaction and read-only checks below and retain its own evidence. The deterministic Anvil lifecycle is a separate prerequisite and never substitutes for a public-chain run. One successful public run does not prove repeatability or any beta or production readiness gate.

## 1. Deployment Decision

The 22 August 2026 canonical run used the fresh six-contract deployment recorded in `frontend/public/deployments/84532.json` at commit `bd56f9005b52dcae61b8c16599f10e67e29de3f6`. Deployment transaction hashes, checksums, exact block metadata, and BaseScan source-verification status remain pending archival evidence in the run report.

For a future replacement deployment, use a fresh deployment from its validated commit. Reuse the current deployment only after its manifest, source, bytecode, ownership, parameter, wiring, current accounting state, and provenance are reviewed for that later run.

The public manifest is `frontend/public/deployments/84532.json`. It must contain only:

- `AuctionHouse`
- `NFTVault`
- `EscrowVault`
- `DistributionVault`
- `ParamsController`
- `ReputationAdapter`

The smoke NFT is deliberately excluded from the BidBack core manifest.

## 2. Five Distinct Wallets

| Label | Role | Transactions |
| --- | --- | --- |
| `W_OWNER` | deployer and temporary testnet owner | core deployment and smoke NFT deployment |
| `W_SELLER` | NFT seller | approval, creation, finalization, seller withdrawal |
| `W_FEE` | snapshotted fee recipient | protocol fee withdrawal |
| `W_A` | bidder A and expected winner | initial bid, step-up, NFT claim |
| `W_B` | bidder B and expected losing recipient | outbid, refund claim, reward claim |

All five addresses must be valid and pairwise distinct. Store keys only in wallets or an approved secret environment. Never put keys, seed phrases, credential-bearing RPC URLs, or wallet exports in the repository or evidence.

## 3. Funding Estimate

| Wallet | Initial target |
| --- | ---: |
| `W_OWNER` | approximately `0.05 ETH`, adjusted to at least twice the deployment gas estimate |
| `W_SELLER` | approximately `0.005 ETH` |
| `W_A` | approximately `0.035 ETH` |
| `W_B` | approximately `0.020 ETH` |
| `W_FEE` | approximately `0.002 ETH` |

The auction deposits exactly `0.045 ETH`. Before each transaction, require the transaction value plus twice the current gas estimate; the table is a planning estimate, not a fixed guarantee.

## 4. Canonical Economics

Use a two-hour auction and finish all bids during the first 30 minutes so the anti-sniping window is not entered.

| Step | Total cap | Value sent |
| --- | ---: | ---: |
| Start price | `0.010 ETH` | — |
| Bidder A initial bid | `0.012 ETH` | `0.012 ETH` |
| Bidder B outbid | `0.015 ETH` | `0.015 ETH` |
| Bidder A step-up | `0.030 ETH` | `0.018 ETH` delta |

Expected settlement under the exact snapshotted parameter profile:

```text
gross premium             0.0200 ETH
protocol fee              0.0010 ETH
net premium               0.0190 ETH
candidate distribution    0.0095 ETH
bidder B reward           0.0038 ETH
seller proceeds           0.0252 ETH
bidder B refund           0.0150 ETH
total deposits            0.0450 ETH
final escrow balance      0 ETH
```

The `0.015 ETH` refund is the losing bidder's full cap and is independent of the conditional `0.0038 ETH` reward. The positive reward is expected only for this controlled scenario; rewards can be zero in other auctions.

## 5. Prerequisites

Before any public transaction:

1. Validate the approved commit in Codespaces with the commands in section 13.
2. Complete the fresh core deployment under `docs/TESTNET_DEPLOYMENT_RUNBOOK.md` with separately approved broadcast authority.
3. Generate and validate `frontend/public/deployments/84532.json`.
4. Verify source, bytecode, owner, fee recipient, exact parameters and module wiring.
5. Configure the local frontend for Base Sepolia and keep `ENABLE_LOCAL_DEV_ACTIONS=false` or unset.
6. Confirm local-dev forms and panels are absent while wallet-signed and read-only surfaces remain available.
7. Deploy the separate valueless smoke NFT and record its address and token ID without adding it to the core manifest.
8. Confirm `ownerOf(tokenId) = W_SELLER`.
9. Record the next auction ID before creation; never assume it is `1`.

## 6. Read-Only Verifier

The verifier creates only a Viem public client. It does not import a wallet account, read a private key, sign, broadcast, or modify on-chain state.

Example from the repository root:

```text
npm run verify:base-sepolia:lifecycle -- \
  --rpc-url <BASE_SEPOLIA_RPC> \
  --manifest frontend/public/deployments/84532.json \
  --auction-id <AUCTION_ID> \
  --owner <W_OWNER> \
  --seller <W_SELLER> \
  --fee-recipient <W_FEE> \
  --bidder-a <W_A> \
  --bidder-b <W_B> \
  --nft <SMOKE_NFT> \
  --token-id 1 \
  --phase <PHASE> \
  --output <NEW_JSON_EVIDENCE_PATH>
```

The legacy explicit-argument output path is optional. When supplied, it must not already exist. For a future repeatable run, use the session form in section 14; it requires an output path and adds run/source/manifest identity. Supported phases are:

- `before-create`
- `after-create`
- `after-bid-a`
- `after-bid-b`
- `after-step-up`
- `after-finalize`
- `after-nft-claim`
- `after-refund`
- `after-reward`
- `after-seller-withdraw`
- `final`

The verifier prints `[OK]` only after the phase succeeds. Divergence exits non-zero with `[FAIL]`. CLI diagnostics are bounded and omit raw provider errors and input values to avoid leaking RPC credentials; the pure lifecycle assertions retain detailed expected/observed errors for deterministic tests.

## 7. Transaction Sequence and Phase Checks

### P1 — Test-only NFT preparation

`W_OWNER` deploys `LocalERC721` through `DeployBaseSepoliaSmokeNft.s.sol`; its first token is minted to `W_SELLER`.

Expected: NFT bytecode exists and `ownerOf(1) = W_SELLER`.

### T1 — NFT approval

`W_SELLER` calls `approve(NFTVault, tokenId)`.

Expected: `getApproved(tokenId) = NFTVault`. Run `before-create`; it must also prove the derived auction ID, Base Sepolia chain lock, empty fresh escrow and seller custody.

### T2 — Create auction

`W_SELLER` calls `createAuction(nft, tokenId, 0.01 ether, 7200)`.

Run `after-create`. Expected: open auction, exact seller/NFT/token/start/duration, zero bids and participants, zero caps, exact parameter/fee/module snapshots, active NFTVault lock, NFT held by NFTVault, no extension.

### T3 — Bidder A initial bid

`W_A` calls `placeBid(auctionId, 0.012 ether)` with `0.012 ETH`.

Run `after-bid-a`. Expected: A is highest, cap A `0.012`, one participant, one bid, escrow `0.012`, no extension.

### T4 — Bidder B outbid

`W_B` calls `placeBid(auctionId, 0.015 ether)` with `0.015 ETH`.

Run `after-bid-b`. Expected: B is highest, caps A/B `0.012/0.015`, two participants, two bids, escrow `0.027`, no extension.

### T5 — Bidder A step-up

`W_A` calls `placeBid(auctionId, 0.030 ether)` with exactly `0.018 ETH`.

Run `after-step-up`. Expected: A highest at `0.030`, cap A `0.030`, cap B `0.015`, two participants, three exact bid records, escrow `0.045`, no extension.

### Wait for real expiry

Do not manipulate time. Wait until the public-chain timestamp is greater than `endTime`. The stored state can remain `OPEN` until finalization while the frontend derives `Ready to finalize`.

### T6 — Finalize

`W_SELLER` calls `finalizeAuction(auctionId)`.

Run `after-finalize`. Expected: finalized, A winner, final price `0.030`, fee `0.001`, B refund `0.015`, B entitlement and reserve `0.0038`, seller credit `0.0252`, fee credit `0.001`, escrow `0.045`.

### T7 — Winner claims NFT

`W_A` calls `claimNft(auctionId)` and then run `after-nft-claim`.

Expected: `nftClaimed=true`, lock released, NFT owned by A, escrow unchanged.

### T8 — Losing bidder claims refund

`W_B` calls `claimRefund(auctionId)` and then run `after-refund`.

Expected: refund flag true, full refund remains readable as `0.015`, escrow `0.030`.

### T9 — Losing bidder claims reward

`W_B` calls `DistributionVault.claim(auctionId)` and then run `after-reward`.

Expected: reward flag true, total claimed `0.0038`, reserve zero, escrow `0.0262`.

### T10 — Seller withdraws

`W_SELLER` calls `withdrawSellerProceeds()` and then run `after-seller-withdraw`.

Expected: seller credit zero, fee credit `0.001`, escrow `0.001`.

### T11 — Fee recipient withdraws

`W_FEE` calls `withdrawProtocolFees()` and then run `final`.

Expected: all credits and reserve zero, assigned equals claimed `0.0038`, claim flags true, NFT owned by A, escrow zero.

## 8. Evidence to Retain for Each Run

For every public run retain:

- validated commit and clean-worktree status;
- tool versions and chain ID;
- public role addresses;
- public manifest plus checksum;
- deployment, P1 and T1–T11 hashes;
- receipt status, block, timestamp, from/to, gas and decoded events;
- one verifier JSON snapshot per phase;
- explorer links and redacted screenshots;
- retry/anomaly notes;
- read-only simulations showing duplicate NFT, refund, reward and withdrawal actions revert.

EOA balance deltas include gas and are supporting evidence only. Contract state, receipts and events are authoritative for the accounting checks.

## 9. Stop Conditions

Stop before funds if chain, manifest, bytecode, source, owner, fee recipient, wiring, exact parameters, pause state, NFT ownership, role separation or frontend boundary is wrong.

Stop new economic actions if any cap, delta, highest bidder, count, custody field, extension, settlement amount, refund, reward, credit or escrow balance differs from the expected phase. Preserve the failing snapshot and transaction receipt.

## 10. Safe Recovery

- Approval only: revoke approval if abandoning the run.
- Auction with no bids: wait for expiry, finalize, and let the seller reclaim the NFT.
- Auction with deposits: do not abandon funds; wait for expiry, finalize and execute the legitimate exit claims.
- Never overwrite the manifest or evidence to conceal a failed run.
- Use global pause only after an explicit incident decision; it blocks creation and bidding but must not block exits.
- A recovered anomalous run is evidence for diagnosis, not a successful canonical smoke.

## 11. Frontend Boundary

For Base Sepolia:

- local-dev forms and `AuctionDevActions` must not render;
- `/api/dev/*` remains server-disabled;
- wallet-signed create, bid, finalize, claim and withdrawal controls remain available;
- read-only pages remain available without a wallet;
- no copy may describe the configured Base Sepolia RPC as a local Anvil RPC;
- public participant economics comes from bounded `getParticipants(auctionId)` reads, not Anvil account keys.

## 12. Go / No-Go

Proceed only when every prerequisite and pre-funded check passes. Record a dated canonical Base Sepolia cycle as validated only after T11, the final verifier snapshot, duplicate simulations, and evidence review succeed. Keep the claim bounded to that named run.

## 13. Validation Before the Public Run

Windows:

```powershell
cd C:\Users\Vibe\Code\BidBack
npm --prefix frontend run test:base-sepolia-verifier
npm --prefix frontend run test
npm --prefix frontend run typecheck
npm --prefix frontend run build
```

Codespaces:

```bash
cd /workspaces/BidBack
forge test -vv
npm --prefix frontend run test:base-sepolia-verifier
npm --prefix frontend run test
npm --prefix frontend run typecheck
npm --prefix frontend run build
npm run smoke:local:lifecycle
```

Passing Anvil proves the local deterministic lifecycle only. Passing this Base Sepolia run proves one canonical public multi-wallet execution only; neither is a production-readiness claim.

## 14. Repeatable Session Evidence — Lot 7

This procedure prepares evidence for a **separately authorized future session**. Lot 7 itself performs no public transaction. The existing P1 and T1–T11 actions, five roles, amounts and phase checks remain canonical. The first run's evidence is historical and must not be edited or relabelled as a second run.

### Prepare the public session

Copy [SESSION_TEMPLATE.json](./evidence/base-sepolia/SESSION_TEMPLATE.json) into a new evidence workspace **outside the Git checkout** and replace every placeholder. The committed template is deliberately invalid until completed. Store the session, hash input, snapshots, and output in that external workspace; never commit future real run data as part of this implementation lot.

Use schema version `1`, chain ID `84532`, a unique lowercase run ID (letters, digits and hyphens; at most 80 characters), the exact approved 40-character lowercase source SHA, and the literal repository-relative manifest path `frontend/public/deployments/84532.json`. Supply five valid, non-zero, pairwise distinct public role addresses. NFT address must be valid and non-zero; token ID is a decimal uint256 string. Auction ID is the positive decimal `nextAuctionId` observed before creation. Do not assume the historical auction ID `2`.

Only the documented fields are accepted, including within `roles` and `nft`. Private keys, seeds, RPC URLs, credentials, wallet exports and extra fields are unsupported. RPC configuration remains runtime-only. The operator/reviewer must approve the SHA independently: a matching SHA proves checkout consistency, not approval, deployed-source equivalence, or the browser bundle's identity.

### Preflight and phase persistence

Check out the approved source with a clean tracked and untracked worktree, align the browser build/runtime environment, run the controlled-environment validator in `TESTNET_READINESS.md`, and complete the deployment/source/role checks in sections 1–5. Review the manifest's exact bytes before the run. The session loader resolves its manifest from the script's repository root regardless of the command's working directory; it rejects redirected manifest symlinks. It reuses deployment JSON validation, requires precisely the six non-zero core addresses and retains `generatedAt`, `source`, and SHA-256 of the file bytes.

For a separately authorized public session, after P1 preparation and T1 approval but **before T2 creation**, persist the `before-create` preflight:

```bash
npm --prefix frontend run verify:base-sepolia:lifecycle -- \
  --rpc-url "$BIDBACK_RPC_URL" \
  --session /absolute/evidence-workspace/session.json \
  --phase before-create \
  --output /absolute/evidence-workspace/snapshots/before-create.json
```

Create the `snapshots` directory first. Use an explicit runtime RPC value supplied by the authorized operator; this procedure selects no vendor. Never save the value or an environment dump with the evidence. Session invocation checks clean checkout HEAD against `sourceCommit`; legacy role/NFT/auction/manifest overrides are rejected.

Repeat that command immediately after each action, changing only `--phase` and the new output filename:

| Action just completed | Snapshot phase |
| --- | --- |
| T1 approval | `before-create` |
| T2 creation | `after-create` |
| T3 A initial bid | `after-bid-a` |
| T4 B bid | `after-bid-b` |
| T5 A step-up | `after-step-up` |
| T6 finalization | `after-finalize` |
| T7 NFT claim | `after-nft-claim` |
| T8 refund | `after-refund` |
| T9 reward | `after-reward` |
| T10 seller withdrawal | `after-seller-withdraw` |
| T11 fee withdrawal | `final` |

**Wait for each successful snapshot before the next wallet action.** Each snapshot records schema/run/source/chain/auction/phase, UTC generation time, manifest provenance, a block number/hash/UTC timestamp, deployment checks and verified lifecycle state. All reads are pinned to that block and its hash is checked again. File creation is exclusive: an existing snapshot is never overwritten. A failing phase does not produce a successful snapshot; retain its bounded console diagnostic and public receipt separately and stop new economic actions. Preserve previous snapshots. A retry uses a new filename; keep exactly one accepted JSON for each phase in the assembly directory, with failed/retry records outside it.

The legacy explicit arguments still work, but their outputs lack session identity and cannot satisfy this final evidence command. Every future run must use the session form for all eleven phases.

### Supply public transaction hashes

Record the hash displayed by the wallet/frontend immediately after each authorized action. Create `transactions.json` outside the checkout with this exact envelope. Copy `manifestChecksum` from the `manifest.checksum` in the first successful snapshot; it is 64 hexadecimal SHA-256 characters without `0x`.

```json
{
  "schemaVersion": 1,
  "runId": "<same-run-id>",
  "sourceCommit": "<same-approved-source-sha>",
  "chainId": 84532,
  "auctionId": "<same-auction-id>",
  "manifestChecksum": "<sha256-of-manifest-bytes>",
  "transactions": {
    "P1": "<test-only-nft-deployment-hash>",
    "T1": "<approval-hash>",
    "T2": "<create-hash>",
    "T3": "<bid-a-hash>",
    "T4": "<bid-b-hash>",
    "T5": "<step-up-hash>",
    "T6": "<finalize-hash>",
    "T7": "<nft-claim-hash>",
    "T8": "<refund-hash>",
    "T9": "<reward-hash>",
    "T10": "<seller-withdraw-hash>",
    "T11": "<fee-withdraw-hash>"
  }
}
```

Every hash must be `0x` plus 64 hex characters and unique across IDs. Actors are P1 owner; T1/T2/T6/T10 seller; T3/T5/T7 bidder A; T4/T8/T9 bidder B; T11 fee recipient. P1 must be the NFT contract-creation receipt for the session NFT. T1–T11 targets, calldata and transaction values are checked against the existing canonical methods, auction/NFT identifiers and amounts. This collector supports the documented direct wallet calls, not batched/router transactions.

### Assemble and validate

After T11 and its saved `final` phase, run:

```bash
npm --prefix frontend run evidence:base-sepolia -- \
  --rpc-url "$BIDBACK_RPC_URL" \
  --session /absolute/evidence-workspace/session.json \
  --transactions /absolute/evidence-workspace/transactions.json \
  --snapshots /absolute/evidence-workspace/snapshots \
  --output /absolute/evidence-workspace/new-evidence-package
```

The output parent must exist; the output directory must not exist, even if empty or previously failed. Success produces `public-evidence.json` and `REPORT.md`. A failure after reserving the directory retains a bounded `failure.json` with `missing`, `pending`, `failed`, or `invalid` status; it never silently replaces an earlier run. A directory containing `failure.json` or lacking a complete `public-evidence.json` is not successful, even if a report file was written before an output failure. Retry into a new directory.

Assembly requires all twelve successful transactions and eleven unique phases; a correct final state alone is insufficient. It verifies the RPC chain, manifest/source/session identity, actors, receipt/transaction/block agreement, and canonical transaction order. Saved phase blocks must fall after their action and before the next action. The RPC must support historical state reads at all saved blocks; assembly re-runs the existing verifier there and requires equality with the saved snapshot. Unavailable history or reorged/altered evidence fails closed. Receipt logs are retained as deterministic public address/topics/data/log-index records; no decoded-event or explorer-verification claim is inferred.

Transaction records include receipt status, block number/hash/UTC timestamp, from/to, value in wei, gas used, effective gas price when supplied, transaction index, NFT creation address where relevant, and receipt logs. UTC `generatedAt` is operator-machine collection time; block UTC is derived from the chain timestamp.

Assembly verifies current `final`, performs five block-pinned `eth_call` duplicate simulations for NFT/refund/reward claims and seller/fee withdrawals, then verifies current `final` again. Each simulation records actor, target, calldata, block and expected custom-error selector. An RPC/network failure or arbitrary revert string is insufficient: the expected contract error bytes must be available. No signing, broadcasting, private-key handling, `/api/dev/*` or `/api/local-create-context` execution occurs in these scripts.

### Manual evidence and remaining limits

The machine package is a review artifact, not the Orchestrator's verdict or a readiness-gate approval. Independently retain browser/OS/MetaMask/Rabby versions; selected connector/account; frontend build SHA and configuration alignment; wallet prompts, network switching and rejection/recovery observations; redacted screenshots; explorer/source and constructor verification; core deployment/wiring/ownership receipts; and anomaly/retry notes. Session SHA consistency does not prove a served browser build. The collector explicitly marks source verification, core deployment transaction evidence and manual wallet observations as pending/not evidenced; P1 supplies the separate test-only NFT deployment receipt.

Lot 7 adds tooling and deterministic mock tests only. Manual MetaMask and Rabby validation, a second Base Sepolia execution, controlled hosting/access, source-verification evidence, monitoring/support/incident handling and independent evidence review remain open. No Controlled beta-ready claim or other readiness-gate advancement follows from this lot.
