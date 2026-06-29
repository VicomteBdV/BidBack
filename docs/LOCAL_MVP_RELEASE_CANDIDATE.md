# Local MVP Release Candidate

This document describes the local BidBack MVP release candidate and the manual validation checklist for Codespaces.

This is a local release candidate only. It is not a production release and it is not a public testnet deployment.

---

## Scope

This release candidate covers the current BidBack MVP running in the local Codespaces workflow.

### Included

* Local Anvil deployment on chain ID `31337`
* Foundry deployment through `script/DeployLocal.s.sol`
* Local deployment sync into `frontend/public/deployments/31337.json`
* Deployment JSON validation for generated local deployment files
* Read-only deployment and auction views
* Read-only auction detail sections:

  * `Auction overview`
  * `Economic state`
  * `Technical details`
* Local-dev full auction cycle through guarded `/api/dev/*` routes
* Local-dev auction creation
* Local-dev primary and secondary bids
* Local-dev finalization
* Local-dev NFT claim
* Local-dev refund claim
* Local-dev reward claim
* Local-dev seller proceeds withdrawal
* Local-dev protocol fee withdrawal
* Wallet-signed create auction panel
* Wallet-signed bid panel
* Wallet-signed claims / withdrawals panel
* Contract tests with Foundry
* Frontend/API tests with Vitest
* TypeScript checks
* Next.js production build
* Testnet readiness preparation

### Not Included

* No real public testnet deployment yet
* No production deployment
* No external audit
* No backend persistence
* No indexer
* No production security posture
* No production governance handoff

---

## Manual Validation Checklist

### A. Start Local Environment

Open Terminal 1 and start Anvil:

```bash
anvil --host 0.0.0.0 --chain-id 31337
```

Keep Terminal 1 open.

Open Terminal 2 and deploy the local contracts:

```bash
npm run local:deploy
```

The local deployment script should:

* deploy the modular contracts;
* deploy `LocalERC721`;
* mint local mock NFTs to the seller;
* create a demo auction;
* sync `frontend/public/deployments/31337.json`.

Validate the generated deployment JSON:

```bash
npm run validate:deployment -- 31337
```

This command assumes `frontend/public/deployments/31337.json` exists, so run it after `npm run local:deploy` or `npm run frontend:sync`.

Start the frontend:

```bash
npm run frontend:dev
```

Open the forwarded Codespaces port `3000`.

If Anvil restarts, redeploy and refresh:

```bash
npm run local:deploy
npm run frontend:sync
npm run validate:deployment -- 31337
```

---

### B. Validate Read-Only Mode

Open the frontend home page.

Confirm:

* the page loads without requiring MetaMask;
* the deployment console is visible;
* chain ID is `31337`;
* `AuctionHouse` is displayed;
* `NFTVault` is displayed;
* `EscrowVault` is displayed;
* `DistributionVault` is displayed;
* `ParamsController` is displayed;
* `ReputationAdapter` is displayed;
* `LocalERC721` is displayed for the local deployment;
* Auction #1 is visible after local deployment.

Open Auction #1 detail.

Confirm these sections are visible:

* `Auction overview`
* `Economic state`
* `Local dev actions`
* `Wallet-signed actions`
* `Technical details`

Confirm the read-only data is coherent:

* auction ID is correct;
* seller address is shown;
* NFT contract address is shown;
* token ID is shown;
* start price is shown;
* auction state is shown;
* highest bidder and highest bid update after bids;
* finalization state updates after finalization.

---

### C. Validate Local-Dev Mode

Local-dev actions are for Codespaces MVP testing only.

They must remain:

* Anvil only;
* chain ID `31337` only;
* protected by `ENABLE_LOCAL_DEV_ACTIONS=true`;
* not production-ready.

Before testing local-dev actions, confirm `frontend/.env.local` exists and contains local Anvil development private keys only.

Create an additional local-dev auction from `/create`.

Confirm:

* the form is marked as local-dev only;
* `LocalERC721` is prefilled when available;
* token #2 or higher can be used on a fresh deployment;
* `NFTVault` approval is handled before `AuctionHouse.createAuction`;
* the created auction appears in the auction list.

On an open auction detail page, validate the local-dev cycle:

1. Place primary demo bid.
2. Confirm highest bid updates.
3. Place second demo bid.
4. Confirm bidder #1 becomes the losing bidder.
5. Finalize the auction.
6. Confirm auction state becomes `FINALIZED`.
7. Claim NFT.
8. Confirm NFT claimed becomes `Yes`.
9. Claim refund for the losing bidder.
10. Confirm refund claimed state updates.
11. Claim reward when entitlement is greater than zero.
12. Confirm reward claimed state updates.
13. Withdraw seller proceeds.
14. Confirm seller proceeds credit is reduced.
15. Withdraw protocol fees.
16. Confirm protocol fee credit is reduced.

Confirm no local-dev action is presented as production architecture.

---

### D. Validate Wallet-Signed Mode

Wallet-signed panels are the production-target transaction model.

They must:

* use MetaMask or an injected wallet;
* use user-signed transactions;
* use no server private key;
* call no `/api/dev/*` route;
* never silently fall back to local-dev mode.

Connect MetaMask.

Confirm:

* wallet connection works;
* the UI shows the connected address;
* the UI shows whether the wallet is on the target chain;
* wrong-network messaging is clear and non-blocking.

If MetaMask can access the target RPC, validate wallet-signed create auction:

1. Open `/create`.
2. Use the `Wallet-signed create auction` panel.
3. Confirm the connected wallet owns the NFT token.
4. Approve `NFTVault`.
5. Create the auction.
6. Confirm the new auction appears in the list.

If MetaMask can access the target RPC, validate wallet-signed bidding:

1. Open an `OPEN` auction detail page.
2. Confirm minimum required bid is displayed.
3. Confirm current wallet cap is displayed.
4. Enter a bid cap greater than or equal to `minimumNextBid`.
5. Confirm value sent equals `newCap - current wallet cap`.
6. Sign the transaction.
7. Confirm auction state refreshes.

If MetaMask can access the target RPC, validate wallet-signed claims and withdrawals after finalization:

1. Finalize an auction.
2. Connect as the winner and claim NFT.
3. Connect as a losing bidder and claim refund.
4. Claim reward if entitlement is greater than zero.
5. Connect as seller and withdraw seller proceeds.
6. Connect as fee recipient and withdraw protocol fees.

If MetaMask cannot access Anvil through Codespaces forwarding, confirm:

* wallet-signed panels remain visible;
* wallet-signed errors are clear;
* read-only mode still works;
* local-dev mode remains available for Codespaces validation.

---

### E. Validate Tests

From the repo root:

```bash
forge test -vv
```

From the frontend directory:

```bash
npm run test
npm run typecheck
npm run build
```

Or run the local aggregate check from the repo root:

```bash
npm run local:check
```

Expected result:

* Foundry tests pass;
* frontend/API tests pass;
* TypeScript typecheck passes;
* Next.js build passes.

Validate the generated local deployment JSON after local deployment:

```bash
npm run validate:deployment -- 31337
```

This deployment validation is not part of `local:check` yet because `frontend/public/deployments/31337.json` is generated locally and may be absent in a fresh clone.

---

## Known Non-Goals

This release candidate does not include:

* real public testnet deployment;
* production deployment;
* external security audit;
* production governance setup;
* multisig/timelock ownership handoff;
* contract verification workflow;
* indexer;
* backend persistence;
* production RPC provider strategy;
* production monitoring;
* production incident response;
* production-grade frontend design;
* production support for local-dev server-side actions.

Local-dev actions are strictly a local Codespaces demonstration tool. They are not production architecture.

Production user actions must be wallet-signed by the user and must not rely on server-held private keys.

---

## Release Criteria

This local MVP release candidate can be considered valid when all criteria below are met:

* CI is green.
* `forge test -vv` passes.
* `npm run test` passes in `frontend/`.
* `npm run typecheck` passes in `frontend/`.
* `npm run build` passes in `frontend/`.
* The local app can be relaunched from a clean Anvil restart.
* `npm run local:deploy` recreates a usable local deployment.
* `frontend/public/deployments/31337.json` is regenerated correctly.
* `npm run validate:deployment -- 31337` validates the generated deployment JSON.
* The read-only deployment console loads without MetaMask.
* Auction list and auction detail load through Next.js server routes.
* The local-dev full cycle is manually validated.
* Wallet-signed panels are visible and non-blocking.
* Wallet-signed panels do not call `/api/dev/*`.
* Local-dev actions remain clearly labeled as local only.
* Documentation is up to date.
* No real private key or secret is committed.
* No UI or documentation presents BidBack as guaranteed yield.
