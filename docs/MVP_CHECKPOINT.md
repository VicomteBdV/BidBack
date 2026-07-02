# BidBack MVP Checkpoint

This document summarizes the current MVP state for the BidBack smart contracts, local Codespaces workflow, frontend, local-dev actions, wallet-signed flows, testnet readiness, and CI.

---

## 1. Current MVP Status

The current MVP supports:

* Local Anvil deployment on chain ID `31337`
* Modular smart contract deployment through Foundry
* Local demo auction creation during deployment
* Read-only deployment and auction views through Next.js server routes
* Read-only auction detail page
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
* Wallet-signed claims / withdrawals panel
* Frontend Vitest tests for critical guards and UI separation
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
* Auction detail
* Auction rules snapshot
* Auction fee recipient snapshot
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
* No backend or event indexer persistence is available yet.
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
* Run the manual post-deployment smoke test with a real testnet NFT.
* Verify contracts on a block explorer.
* Improve RPC and wallet configuration for wallet-signed flows.
* Add event indexing for auctions, bids, finalization, claims, withdrawals, and auction rule snapshots.
* Harden transaction error UX.
* Add post-deployment verification checks for auction-level snapshots where practical.
* Plan external smart contract security review before production deployment.
