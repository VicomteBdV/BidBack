# BidBack

BidBack is a Web3 NFT auction marketplace focused on reducing bidder frustration through conditional redistribution of value created during an auction.

BidBack is **not**:

* a gambling product;
* a lending protocol;
* a derivative product;
* a financial product.

BidBack must never present guaranteed yield or remove auction risk.

---

## MVP Scope

### In Scope

The MVP covers:

* Existing ERC-721 NFTs only
* English auctions
* Deterministic anti-sniping extensions
* On-chain custody of NFTs and ETH
* Step-up-only bidder caps
* Pull-based NFT, refund, proceeds, fee, and redistribution claims
* On-chain, deterministic redistribution scoring
* Non-blocking reputation multiplier

### Out of Scope

The MVP does not cover:

* Minting
* Lending
* Leverage
* Guaranteed yield
* Derivatives
* Heavy KYC

---

## Economic Model

The seller sets the starting price.

The final price is the highest valid bid cap.

```text
gross premium = final price - starting price
protocol fee = fixed percentage of gross premium
net premium = gross premium - protocol fee
candidate redistribution pool = fixed percentage of net premium
```

No protocol fee is charged when there is no premium.

Redistribution only opens when all conditions are met:

* Net premium is above the configured threshold
* Minimum participant count is reached
* Initial auction duration is above the configured threshold

Rewards are capped per user and can never exceed the available net premium.

If caps leave part of the candidate redistribution pool unassigned, the unassigned amount remains seller proceeds.

The system never funds redistribution from losing bidders' refundable caps.

---

## Contracts

### AuctionHouse

Creates auctions, accepts bids, applies anti-sniping, finalizes auctions, and computes redistribution rights.

### NFTVault

Locks and releases ERC-721 NFTs.

### EscrowVault

Holds ETH caps, seller proceeds, protocol fees, refund reserves, and distribution reserves.

### DistributionVault

Records redistribution entitlements and exposes user claims.

### ReputationAdapter

Stores a non-blocking multiplier used only for redistribution.

### ParamsController

Stores bounded economic and safety parameters.

---

## MVP Checkpoint

The current MVP status, UI modes, local workflow, test commands, CI coverage, known limitations, and recommended next steps are documented in:

```text
docs/MVP_CHECKPOINT.md
```

The local MVP release candidate checklist is documented in:

```text
docs/LOCAL_MVP_RELEASE_CANDIDATE.md
```

Testnet readiness and future deployment-environment preparation are documented in:

```text
docs/TESTNET_READINESS.md
```

---

## Local Codespaces Demo

Codespaces is the reference local development environment for the BidBack MVP.

### Install Frontend Dependencies

Run once:

```bash
cd frontend
npm install
cd ..
```

---

## Terminal 1: Start Anvil

```bash
anvil --host 0.0.0.0 --chain-id 31337
```

Keep this terminal open.

If Anvil stops or restarts, the local blockchain state is reset.

`DeployLocal.s.sol` assumes the standard Anvil account #0 private key. If Anvil is launched with another mnemonic or account set, either restart Anvil with its standard defaults or update the local development keys and deployment script accordingly.

---

## Terminal 2: Deploy and Run the Local Demo

Deploy the local contracts, create the demo auction, and sync the frontend deployment file:

```bash
npm run local:deploy
```

Then start the frontend:

```bash
npm run frontend:dev
```

Open the forwarded Codespaces port `3000`.

---

## Full Local Check

Run the full local check with:

```bash
npm run local:check
```

This runs:

```bash
forge test -vv
cd frontend
npm run typecheck
npm run test
npm run build
```

You can also run the checks manually:

```bash
forge test -vv

cd frontend
npm run typecheck
npm run test
npm run build
```

---

## Frontend Tests

The frontend includes a small Vitest test suite for critical MVP behavior.

The tests cover:

* guarded `/api/dev/*` routes refusing execution when local dev actions are disabled
* guarded `/api/dev/*` routes refusing execution when the RPC chain ID is not Anvil `31337`
* wallet-signed components not calling `/api/dev/*`
* the auction detail page rendering the main mode-separated sections

The tests do not require Anvil.

The tests do not require `frontend/.env.local`.

Run them with:

```bash
cd frontend
npm run test
```

The full local check from the repo root also runs the frontend tests:

```bash
npm run local:check
```

---

## Anvil Accounts and Private Keys

Anvil prints two different sections at startup:

* `Available Accounts`: public wallet addresses
* `Private Keys`: private keys for those local accounts

For `frontend/.env.local`, use the values from `Private Keys`, not the public addresses.

Each private key must use this format:

```text
0x + 64 hexadecimal characters
```

Recommended local demo mapping:

* seller / fee recipient = Anvil account #0
* bidder #1 = Anvil account #1
* bidder #2 = Anvil account #2

The default development keys are public, known Anvil keys. They are only valid for local development and must never receive real funds.

Never use a real private key in this project.

Never commit:

```text
frontend/.env.local
```

---

## Local Dev Action Guard

The routes under `/api/dev/*` are local demonstration tools only.

They are disabled unless `frontend/.env.local` contains:

```env
ENABLE_LOCAL_DEV_ACTIONS=true
```

The value must be exactly:

```text
true
```

These routes also verify that `ANVIL_RPC_URL` points to Anvil chain ID `31337`.

If the flag is missing, disabled, or the chain ID is not `31337`, the route refuses before reading private keys or sending any transaction.

Never enable local dev actions in production.

Production user actions must be wallet-signed by the user. Production must not rely on server-held private keys.

---

## If Anvil Restarts

A restarted Anvil chain loses the previous deployment state.

Run again:

```bash
npm run local:deploy
```

Then refresh the site on port `3000`.

If the frontend shows stale contract addresses or auction data, also run:

```bash
npm run frontend:sync
```

Then refresh the page again.

---

## Local Demo Cycle

The auction detail page includes a clearly marked **Local dev actions only** panel.

A complete local BidBack economic cycle can be tested as follows:

1. Auction #1 is `OPEN`
2. Place primary demo bid with bidder #1
3. Place second demo bid with bidder #2
4. Bidder #1 becomes the losing bidder
5. Finalize the auction
6. Bidder #2 claims the NFT
7. Bidder #1 claims the refund
8. Bidder #1 claims the reward when entitlement is greater than zero
9. Seller withdraws proceeds
10. Fee recipient withdraws fees

These actions are executed by Next.js API routes using `viem` on the server side and local Anvil dev private keys from `frontend/.env.local`.

This is not production architecture. Production user actions must be wallet-signed by the user and must not rely on server-held private keys.

### Create Additional Local Auctions

The home page includes a `Create local auction` link.

This opens `/create`, a strictly local development form that calls:

```text
POST /api/dev/create-auction
```

This route is protected by the same local dev guard as the other `/api/dev/*` routes:

* `ENABLE_LOCAL_DEV_ACTIONS` must be exactly `true`
* `ANVIL_RPC_URL` must be reachable
* The RPC chain ID must be Anvil `31337`

The route uses the local Anvil seller private key from `frontend/.env.local`.

It then:

1. Verifies that the configured seller owns the NFT token
2. Approves `NFTVault`, not `AuctionHouse`
3. Calls `AuctionHouse.createAuction`
4. Returns the new auction ID and transaction hash

This is not production architecture. Production auction creation must be wallet-signed by the NFT owner.

On a fresh local deployment, `DeployLocal.s.sol` mints 12 `LocalERC721` tokens to the seller. Token #1 is locked by the demo auction, so use token #2 or higher for additional local auctions.

`LocalERC721` is a local mock only. It is not a BidBack product minting feature.

### Wallet-Signed Auction Creation

The `/create` page also includes a separate **Wallet-signed create auction** panel.

This is the production-target flow:

1. The connected wallet must own the NFT
2. The user signs `approve(NFTVault, tokenId)`
3. The user signs `AuctionHouse.createAuction(nft, tokenId, startPrice, duration)`

This flow does not call `/api/dev/*`.

It does not use server-held private keys.

It only works when MetaMask can access the target RPC and is connected to the expected chain ID.

In Codespaces, MetaMask may be unable to reach the forwarded Anvil RPC reliably. In that case, keep using the local-dev panel for MVP testing, or expose Anvil through a reliable localhost or testnet RPC.

The local-dev panel and wallet-signed panel are intentionally separate. There is no silent fallback from wallet-signed actions to local-dev server-side actions.

### Wallet-Signed Bidding

The auction detail page includes a separate **Wallet-signed bid** panel.

This is the production-target bid flow:

1. The wallet must be connected
2. The wallet must be on Anvil chain ID `31337`
3. The auction must be `OPEN`
4. The frontend reads `AuctionHouse.minimumNextBid(auctionId)`
5. The frontend reads `EscrowVault.capOf(auctionId, connectedAddress)`
6. The user enters a new bid cap in ETH
7. The user signs `AuctionHouse.placeBid(auctionId, newCap)`

BidBack uses step-up-only caps. Therefore the transaction value is not always the full new cap.

```text
value sent = newCap - current wallet cap
```

For a first bid, the current wallet cap is zero, so value sent = `newCap`.

For a later step-up bid from the same wallet, only the difference is sent.

This flow does not call `/api/dev/*`.

It does not use server-held private keys.

It only works when MetaMask can access the target RPC and is connected to the expected chain ID.

In Codespaces, MetaMask may be unable to reach the forwarded Anvil RPC reliably. In that case, keep using the local-dev panel for MVP testing, or expose Anvil through a reliable localhost or testnet RPC.

The local-dev bid buttons and wallet-signed bid panel are intentionally separate. There is no silent fallback from wallet-signed bidding to local-dev server-side actions.

### Wallet-Signed Claims and Withdrawals

The auction detail page includes a separate **Wallet-signed claims / withdrawals** panel.

This is the production-target post-finalization flow:

1. The wallet must be connected
2. The wallet must be on Anvil chain ID `31337`
3. The auction must be finalized for claim and withdrawal actions
4. The user signs the relevant transaction in MetaMask

Supported wallet-signed actions:

* `AuctionHouse.claimNft(auctionId)`
* `EscrowVault.claimRefund(auctionId)`
* `DistributionVault.claim(auctionId)`
* `EscrowVault.withdrawSellerProceeds()`
* `EscrowVault.withdrawProtocolFees()`

The frontend reads claimable and withdrawable amounts before enabling actions:

* `EscrowVault.refundableAmount(auctionId, connectedAddress)`
* `EscrowVault.refundClaimed(auctionId, connectedAddress)`
* `DistributionVault.entitlementOf(auctionId, connectedAddress)`
* `DistributionVault.claimed(auctionId, connectedAddress)`
* `EscrowVault.sellerCredits(connectedAddress)`
* `EscrowVault.protocolFeeCredits(connectedAddress)`

This flow does not call `/api/dev/*`.

It does not use server-held private keys.

Claims and withdrawals remain pull-based.

It only works when MetaMask can access the target RPC and is connected to the expected chain ID.

In Codespaces, MetaMask may be unable to reach the forwarded Anvil RPC reliably. In that case, keep using the local-dev panel for MVP testing, or expose Anvil through a reliable localhost or testnet RPC.

The local-dev claim buttons and wallet-signed claim panel are intentionally separate. There is no silent fallback from wallet-signed claims to local-dev server-side actions.

### UI Modes

The auction detail page separates the MVP into explicit modes:

* `Read-only`: auction and economic data loaded through Next.js server routes.
* `Local dev only`: guarded `/api/dev/*` routes using local Anvil private keys from `frontend/.env.local`; Codespaces MVP testing only.
* `Wallet-signed`: MetaMask-signed transactions with no server-held private key; requires the wallet to access the target RPC.

Local-dev actions are not production architecture.

Wallet-signed actions never call `/api/dev/*`.

There is no silent fallback between local-dev and wallet-signed modes.

---

## Frontend Architecture

Auction reads are routed through Next.js server routes:

```text
Browser -> Next.js on port 3000 -> Anvil at http://127.0.0.1:8545
```

This means the read-only deployment and auction views can work even when MetaMask cannot connect directly to the Codespaces Anvil RPC.

The frontend lives in:

```text
frontend/
```

Useful commands:

```bash
npm run frontend:dev
npm run frontend:sync
npm run local:deploy
npm run local:check
```

---

## CI

GitHub Actions runs the minimal MVP checks on push and pull request:

```bash
forge test -vv
npm --prefix frontend ci
npm --prefix frontend run typecheck
npm --prefix frontend run test
npm --prefix frontend run build
```

CI does not require:

* Anvil
* `frontend/.env.local`
* `frontend/public/deployments/31337.json`

---

## Safety Principles

* Pull payments for user ETH flows
* NFT release is pull-based after finalization
* No unbounded loops: participant count is capped by governance parameters
* Refunds are never blocked by reputation or redistribution logic
* Pause is limited to new auction creation and bidding; claims remain available
* No claim path depends on opaque off-chain computation
* Unclaimed refunds and rewards remain claimable indefinitely
* Production ownership should be assigned to a multisig and timelock, not to an EOA
