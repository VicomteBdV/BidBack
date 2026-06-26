# BidBack

BidBack is a Web3 NFT auction marketplace focused on reducing bidder frustration through conditional redistribution of value created during an auction.

It is not a gambling product, not a lending protocol, not a derivative product, and not a financial product. BidBack must never present guaranteed yield or remove auction risk.

## MVP Scope

The MVP covers:

* Existing ERC-721 NFTs only
* English auctions
* Deterministic anti-sniping extensions
* On-chain custody of NFTs and ETH
* Step-up-only bidder caps
* Pull-based NFT, refund, proceeds, fee, and redistribution claims
* On-chain, deterministic redistribution scoring
* Non-blocking reputation multiplier

Out of scope:

* Minting
* Lending
* Leverage
* Guaranteed yield
* Derivatives
* Heavy KYC

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

## Contracts

* `AuctionHouse`: creates auctions, accepts bids, applies anti-sniping, finalizes auctions, and computes redistribution rights
* `NFTVault`: locks and releases ERC-721 NFTs
* `EscrowVault`: holds ETH caps, seller proceeds, protocol fees, refund reserves, and distribution reserves
* `DistributionVault`: records redistribution entitlements and exposes user claims
* `ReputationAdapter`: stores a non-blocking multiplier used only for redistribution
* `ParamsController`: stores bounded economic and safety parameters

## Local Codespaces Demo

Codespaces is the reference local development environment for the BidBack MVP.

### Install frontend dependencies once

```bash
cd frontend
npm install
cd ..
```

### Terminal 1: start Anvil

```bash
anvil --host 0.0.0.0 --chain-id 31337
```

Keep this terminal open. If Anvil stops or restarts, the local blockchain state is reset.

### Terminal 2: deploy and run the local demo

Deploy the local contracts, create the demo auction, and sync the frontend deployment file:

```bash
npm run local:deploy
```

Then start the frontend:

```bash
npm run frontend:dev
```

Open the forwarded Codespaces port `3000`.

### Full local check

Run the full local check with:

```bash
npm run local:check
```

This runs:

```bash
forge test -vv
cd frontend
npm run typecheck
npm run build
```

You can also run the checks manually:

```bash
forge test -vv

cd frontend
npm run typecheck
npm run build
```

## Anvil Accounts And Private Keys

Anvil prints two different sections at startup:

* `Available Accounts`: public wallet addresses
* `Private Keys`: private keys for those local accounts

For `frontend/.env.local`, use the values from `Private Keys`, not the public addresses.

Each private key must use this format:

```text
0x + 64 hexadecimal characters
```

Recommended local demo mapping:

```text
seller / fee recipient = Anvil account #0
bidder #1 = Anvil account #1
bidder #2 = Anvil account #2
```

The default development keys are public, known Anvil keys. They are only valid for local development and must never receive real funds.

Never use a real private key in this project.

Never commit:

```text
frontend/.env.local
```

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

## Local Demo Cycle

The auction detail page includes a clearly marked **Local dev actions only** panel.

A complete local BidBack economic cycle can be tested as follows:

1. Auction `#1` is `OPEN`
2. Place primary demo bid with bidder `#1`
3. Place second demo bid with bidder `#2`
4. Bidder `#1` becomes the losing bidder
5. Finalize the auction
6. Bidder `#2` claims the NFT
7. Bidder `#1` claims the refund
8. Bidder `#1` claims the reward when entitlement is greater than zero
9. Seller withdraws proceeds
10. Fee recipient withdraws fees

These actions are executed by Next.js API routes using `viem` on the server side and local Anvil dev private keys from `frontend/.env.local`.

This is not production architecture. Production user actions must be wallet-signed by the user and must not rely on server-held private keys.

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

## Safety Principles

* Pull payments for user ETH flows
* NFT release is pull-based after finalization
* No unbounded loops: participant count is capped by governance parameters
* Refunds are never blocked by reputation or redistribution logic
* Pause is limited to new auction creation and bidding; claims remain available
* No claim path depends on opaque off-chain computation
* Unclaimed refunds and rewards remain claimable indefinitely
* Production ownership should be assigned to a multisig and timelock, not to an EOA
