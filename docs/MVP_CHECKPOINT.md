# BidBack MVP Checkpoint

This document summarizes the current MVP state for the BidBack smart contracts, local Codespaces workflow, frontend, local-dev actions, wallet-signed flows, testnet readiness, and CI.

---

## 1. Current MVP Status

The current MVP supports:

* Local Anvil deployment on chain ID `31337`
* Modular smart contract deployment through Foundry
* Local demo auction creation during deployment
* Read-only deployment and auction views through Next.js server routes
* Event-based auction list discovery through `AuctionCreated` logs with a bounded `nextAuctionId` fallback
* Auction browsing controls for search, status filtering, wallet-scoped filtering when a wallet is connected, sorting, and configurable loaded-list limits
* Read-only auction detail page
* Read-only auction lifecycle summary with current phase, next action, timing, winner, claimant, and visible claimable / withdrawable items
* Opportunistic NFT metadata previews for auctions, using ERC-721 `name`, `symbol`, `tokenURI`, HTTP metadata, and simple IPFS gateway conversion when available
* Read-only wallet activity dashboard for the connected wallet, including created auctions, active bids, won/lost auctions, claimable NFTs, refunds, rewards, seller proceeds, protocol fees, and next action links
* Event-based wallet activity discovery using wallet-scoped `AuctionCreated`, `BidPlaced`, `AuctionFinalized`, and `NFTClaimed` logs, with a general event window and bounded fallback when needed
* Read-only auction parameter snapshot display
* Read-only auction fee recipient snapshot display
* Explicit Foundry tests proving auction parameter snapshots remain stable after global parameter updates
* Explicit Foundry tests proving fee recipient snapshots remain stable after global fee recipient updates
* Local-dev full auction cycle:

  * Primary demo bid
  * Second demo bid
  * Finalize auction
  * Claim NFT
  * Claim refund
  * Claim reward
  * Withdraw seller proceeds
  * Withdraw protocol fees
* Local-dev create auction from the UI
* Wallet-signed create auction panel
* Wallet-signed bid panel
* Wallet-signed finalization panel
* Wallet-signed claims / withdrawals panel
* Wallet-signed lifecycle action guards for expired auctions, finalized auctions, claimable funds, claimant wallets, seller proceeds, and auction fee recipient withdrawals
* Wallet-signed transaction feedback for signature prompts, pending transactions, confirmations, rejected requests, failures, transaction hashes, and explorer links when configured
* Frontend Vitest tests for critical guards, UI separation, read-only auction discovery fallback behavior, auction browsing filters, NFT metadata fallbacks, wallet-signed lifecycle action-state rules, wallet transaction feedback helpers, auction lifecycle UI rules, wallet activity summaries, and wallet activity event discovery fallbacks
* Controlled public testnet deployment scaffold through `script/DeployTestnet.s.sol`
* Testnet deployment JSON sync through `npm run testnet:sync -- <chainId>`
* Deployment JSON validation through `npm run validate:deployment -- <chainId>`
* Read-only on-chain deployment verification through `npm run verify:deployment:onchain -- <chainId>`
* Owner, global fee recipient, parameter sanity, bytecode, critical read, and module linkage checks in deployment verification
* GitHub Actions CI covering Foundry and frontend checks

The MVP keeps local-dev actions and wallet-signed actions visually and technically separated.

Auction economic and operational parameters are copied into an auction-specific snapshot at creation time. Existing auctions continue to use their snapshot even if `ParamsController.setParams(...)` changes the global parameters later.

The protocol fee recipient is also copied into an auction-specific snapshot at creation time. `feeRecipient()` remains the current global configuration for future auctions, while existing auctions continue to settle protocol fees to the fee recipient captured during `createAuction`.

No public testnet deployment has been executed yet. The repository is prepared for a controlled public testnet deployment, but the deployment must still be reviewed, broadcast, verified, and smoke-tested manually.

---

## 2. UI Modes

### Read-only

Read-only mode loads data through Next.js server/read-only routes.

It does not send transactions.

It is used for:

* Local deployment display
* Auction list
* Auction browsing controls
* Auction detail
* Auction lifecycle summary
* NFT metadata previews
* Wallet activity dashboard
* Auction rules snapshot
* Auction fee recipient snapshot
* Economic state
* Technical details

The auction list uses `AuctionCreated` events for discovery and falls back to a bounded newest-first `nextAuctionId` read if event scanning fails or returns no events for a deployment that already has auctions.

The list applies client-side browsing controls to the currently loaded read-only auction window. Supported controls include text search across auction ID, NFT address, token ID, seller, highest bidder, winner-like fields, and NFT metadata; status filters for open, ready-to-finalize, finalized, claimable, settled, created-by-wallet, and involving-wallet views; and sorting by newest, oldest, ending soon, or highest bid / final price.

The list and detail pages now show a read-only lifecycle status such as `Open`, `Ready to finalize`, `Finalized`, `Claimed`, or `Settled`, plus the next expected action when the available data is sufficient.

NFT previews are loaded opportunistically from ERC-721 collection reads, `tokenURI`, and external metadata JSON. HTTP/HTTPS metadata URLs are supported directly, and simple `ipfs://<cid>` or `ipfs://ipfs/<cid>` values are converted through an IPFS gateway. Missing, invalid, slow, or unsupported metadata never blocks the auction read.

The wallet activity dashboard first tries wallet-scoped `AuctionCreated`, `BidPlaced`, `AuctionFinalized`, and `NFTClaimed` events. If no wallet-scoped activity is found, it can use a bounded general `AuctionCreated` event window, then direct read-only contract calls to identify claimable balances, seller proceeds, protocol fee credits, and next actions for the connected wallet. If event reads fail, it falls back to a bounded newest-first `nextAuctionId` window.

The dashboard exposes its discovery strategy as `event-scoped`, `general-event-window`, `bounded-fallback`, or `unavailable`, and displays a warning when the result is bounded. It is a usability layer for the MVP, not a production indexer.

The browser does not need direct access to Anvil RPC for read-only data.

### Local dev only

Local-dev actions call guarded routes under:

```text
/api/dev/*
```

These routes use local Anvil private keys from:

```text
frontend/.env.local
```

They are intended for Codespaces MVP testing only.

They are not production-ready and must never be enabled in production.

Local-dev actions are protected by:

```env
ENABLE_LOCAL_DEV_ACTIONS=true
```

They also require Anvil chain ID `31337`.

### Wallet-signed

Wallet-signed actions are signed by MetaMask.

They use no server-held private key.

They do not call:

```text
/api/dev/*
```

They require MetaMask to access the target RPC.

The detail page now blocks impossible wallet-signed actions with explicit reasons before asking the user to sign, including wrong network, expired bidding window, auction not finalized, NFT already claimed, missing refund/reward, wrong claimant wallet, wrong seller wallet, and wrong auction fee recipient wallet.

Wallet-signed transactions show a dedicated transaction status for signature prompts, pending confirmations, confirmed transactions, user rejection, and failures. When `NEXT_PUBLIC_BLOCK_EXPLORER_URL` is configured, transaction hashes link to the target explorer. After confirmation, the UI refreshes the relevant auction, approval, bid, claim, or withdrawal data where the current read-only routes allow it.

If MetaMask cannot reach Anvil through Codespaces port forwarding, use local-dev mode for MVP testing or expose Anvil through a reliable localhost or public testnet RPC.

---

## 3. How to Run Locally

### Terminal 1

Start Anvil:

```bash
cd /workspaces/BidBack
anvil --host 0.0.0.0 --chain-id 31337
```

Keep this terminal open.

### Terminal 2

Deploy local contracts and sync the frontend deployment file:

```bash
cd /workspaces/BidBack
npm run local:deploy
npm run frontend:sync
```

### Terminal 3

Start the frontend:

```bash
cd /workspaces/BidBack
npm run frontend:dev
```

Ports:

* `3000` = frontend app
* `8545` = Anvil RPC

---

## 4. How to Test

Run smart contract tests:

```bash
cd /workspaces/BidBack
forge test -vv
```

Run frontend checks:

```bash
cd frontend
npm run test
npm run typecheck
npm run build
```

Run the full local check from the repository root:

```bash
cd /workspaces/BidBack
npm run local:check
```

Validate a generated deployment JSON:

```bash
cd /workspaces/BidBack
npm run validate:deployment -- 31337
```

Run the minimal technical deployment smoke test against local Anvil:

```bash
cd /workspaces/BidBack
npm run verify:deployment:onchain -- 31337
```

`verify:deployment:onchain` requires a running RPC and an existing deployment JSON file. For local Anvil, run `npm run local:deploy` and `npm run frontend:sync` first if the local deployment was reset.

---

## 5. CI Coverage

GitHub Actions currently covers:

* Foundry install
* `forge test -vv`
* Frontend dependency install with `npm ci`
* Frontend Vitest tests
* Frontend TypeScript typecheck
* Frontend production build

CI does not require:

* A running Anvil node
* `frontend/.env.local`
* A generated `frontend/public/deployments/31337.json`

---

## 6. Known Limitations

* Local Anvil state is not persistent.
* `frontend/public/deployments/31337.json` is locally generated and is not a production source of truth.
* MetaMask may not be able to reach Anvil through Codespaces port forwarding.
* Local-dev actions use known Anvil test private keys.
* Local-dev actions are not production architecture.
* No public testnet deployment has been executed yet.
* No backend or persistent event indexer exists yet.
* Read-only auction discovery uses contract events and a bounded fallback, but it is not a production indexing layer.
* Auction browsing filters and sorting apply only to the currently loaded bounded auction window, not to complete historical auction data.
* The MVP does not implement production pagination, recently-updated ordering, or cross-window search yet.
* NFT metadata previews depend on external `tokenURI` responses and are not production-grade NFT indexing.
* NFT metadata can be missing, invalid, slow, mutable, or unavailable.
* IPFS media depends on the configured gateway and can fail independently from the auction state.
* No persistent NFT metadata cache, content validation, moderation, or media proxy exists yet.
* The wallet activity dashboard uses wallet-scoped events, a bounded general event window, and a bounded fallback. It can miss historical activity outside the scanned window and is not a complete production history view.
* Fee recipient activity is derived from the auction fee recipient snapshot and credit reads; without a persistent indexer or richer event schema, it is still bounded by the auctions discovered for the dashboard.
* No external security audit has been completed yet.
* No block explorer source verification workflow has been automated yet.
* No production monitoring or alerting exists yet.
* Production governance, multisig ownership, timelock policy, and incident response are not finalized yet.

---

## 7. Next Recommended Steps

Recommended next steps:

* Select the controlled public testnet and RPC provider.
* Dry-run `script/DeployTestnet.s.sol` against the selected testnet RPC.
* Broadcast only after human review of deployment variables and dry-run output.
* Sync, validate, and verify the generated deployment JSON.