# BidBack MVP Checkpoint

This document summarizes the current MVP state for the BidBack smart contracts, local Codespaces workflow, frontend, local-dev actions, wallet-signed flows, and CI.

---

## 1. Current MVP Status

The current MVP supports:

* Local Anvil deployment on chain ID `31337`
* Modular smart contract deployment through Foundry
* Local demo auction creation during deployment
* Read-only deployment and auction views through Next.js server routes
* Read-only auction detail page
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
* Wallet-signed claims / withdrawals panel
* Frontend Vitest tests for critical guards and UI separation
* GitHub Actions CI covering Foundry and frontend checks

The MVP keeps local-dev actions and wallet-signed actions visually and technically separated.

---

## 2. UI Modes

### Read-only

Read-only mode loads data through Next.js server/read-only routes.

It does not send transactions.

It is used for:

* Local deployment display
* Auction list
* Auction detail
* Economic state
* Technical details

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
* No public testnet deployment is available yet.
* No backend or event indexer persistence is available yet.
* No external security audit has been completed yet.

---

## 7. Next Recommended Steps

Recommended next steps:

* Prepare a public testnet deployment workflow.
* Improve RPC and wallet configuration for wallet-signed flows.
* Add event indexing for auctions, bids, finalization, claims, and withdrawals.
* Harden transaction error UX.
* Prepare README sections for testnet and production-style usage.
* Plan external smart contract security review before production deployment.
