# Controlled Testnet Deployment Runbook

This runbook describes how to prepare and execute a first controlled public testnet deployment of BidBack.

No deployment is performed by this document.

The current lot only adds the deployment scaffold, JSON sync tooling, and documentation required to make a future deployment reproducible.

BidBack testnet deployments must remain aligned with the project constraints:

* no guaranteed yield;
* no lending;
* no leverage;
* no derivatives;
* no redistribution funded by losing bidders' refundable caps;
* no real private key committed to the repository.

---

## Status and Warning

A first public testnet deployment should be treated as:

```text
controlled public testnet / unaudited
```

It is not production.

It is not externally audited.

It should use testnet assets and testnet ETH only.

No frontend, documentation, or demo copy should imply guaranteed rewards or yield.

---

## Scope

This runbook covers:

* selecting a target EVM testnet;
* preparing RPC and wallet configuration;
* deploying the core BidBack contracts with Foundry;
* syncing `frontend/public/deployments/<chainId>.json`;
* validating the deployment JSON;
* running read-only on-chain verification;
* configuring a hosted frontend;
* running a manual wallet-signed smoke test.

This runbook does not cover:

* production deployment;
* multisig or timelock setup;
* block explorer automation;
* account abstraction;
* session keys;
* relayers;
* indexers;
* external security audit.

---

## Prerequisites

Before attempting a real testnet broadcast, confirm:

* CI is green;
* `forge test -vv` passes;
* frontend tests pass;
* frontend typecheck passes;
* frontend build passes;
* a target EVM testnet is selected;
* the deployer wallet is funded with testnet gas only;
* the owner/admin address is decided;
* the fee recipient address is decided;
* the browser wallet can access the target testnet RPC;
* a server-side RPC URL is available for Next.js read-only routes;
* no real private key is committed or pasted into docs.

Run the local checks first:

```bash
forge test -vv
npm --prefix frontend run test
npm --prefix frontend run typecheck
npm --prefix frontend run build
```

---

## Required Environment Variables

Set these variables outside the repository, for example in your shell or secure deployment environment.

```bash
export TESTNET_RPC_URL=<testnet-rpc-url>
export TESTNET_PRIVATE_KEY=<deployer-private-key>
export TESTNET_OWNER=<final-owner-address>
export TESTNET_FEE_RECIPIENT=<protocol-fee-recipient-address>
```

Rules:

* `TESTNET_PRIVATE_KEY` is used only by Foundry deployment tooling.
* `TESTNET_PRIVATE_KEY` must never be committed.
* `TESTNET_PRIVATE_KEY` must never be exposed through `NEXT_PUBLIC_*` variables.
* `TESTNET_OWNER` should be the final owner/admin for the controlled testnet.
* `TESTNET_FEE_RECIPIENT` is the protocol fee recipient used by future auctions.
* For production, ownership should move to multisig and timelock governance. A controlled testnet may temporarily use a documented EOA.

---

## Deployment Script

The testnet deployment script is:

```text
script/DeployTestnet.s.sol
```

It deploys only the BidBack core contracts:

* `ParamsController`
* `NFTVault`
* `EscrowVault`
* `DistributionVault`
* `ReputationAdapter`
* `AuctionHouse`

It does not deploy:

* `LocalERC721`
* mock NFTs
* demo auctions

It wires the vaults to the deployed `AuctionHouse`, then transfers final ownership to `TESTNET_OWNER`.

---

## Dry-Run

Run a dry-run before any broadcast:

```bash
forge script script/DeployTestnet.s.sol:DeployTestnet \
  --rpc-url "$TESTNET_RPC_URL" \
  -vvv
```

Review the output carefully.

Confirm:

* no `LocalERC721` is deployed;
* no NFT is minted;
* no demo auction is created;
* `TESTNET_OWNER` is correct;
* `TESTNET_FEE_RECIPIENT` is correct;
* all core contracts are deployed;
* vaults are wired to the expected `AuctionHouse`.

---

## Future Broadcast

Only broadcast after human review of the dry-run output and environment variables.

```bash
forge script script/DeployTestnet.s.sol:DeployTestnet \
  --rpc-url "$TESTNET_RPC_URL" \
  --broadcast \
  -vvv
```

This creates a Foundry broadcast artifact under:

```text
broadcast/DeployTestnet.s.sol/<chainId>/run-latest.json
```

Do not commit private keys, `.env` files, or raw secret material.

---

## Sync Deployment JSON

After a successful future broadcast, generate the frontend deployment file:

```bash
npm run testnet:sync -- <chainId>
```

Equivalent frontend command:

```bash
npm --prefix frontend run sync:deployment:testnet -- <chainId>
```

The sync script reads:

```text
broadcast/DeployTestnet.s.sol/<chainId>/run-latest.json
```

It writes:

```text
frontend/public/deployments/<chainId>.json
```

The generated file includes only core BidBack contracts:

* `auctionHouse`
* `nftVault`
* `escrowVault`
* `distributionVault`
* `paramsController`
* `reputationAdapter`

It intentionally does not include `localNft`.

---

## Validate Deployment JSON

Validate the generated deployment JSON:

```bash
npm run validate:deployment -- <chainId>
```

The validator checks the file shape and Ethereum address format.

It does not prove on-chain bytecode or wiring.

---

## Read-Only On-Chain Verification

Run the on-chain verification script against the target RPC:

```bash
BIDBACK_RPC_URL=<testnet-rpc-url> npm run verify:deployment:onchain -- <chainId>
```

This verifies:

* RPC reachability;
* RPC chain ID;
* bytecode presence for core contracts;
* critical reads;
* deployment-level module linkage through public getters.

It does not yet verify:

* ownership;
* governance handoff;
* explorer source verification;
* transaction smoke tests;
* external audit status.

---

## Hosted Frontend Configuration

For a hosted testnet frontend, configure public browser/wallet variables:

```env
NEXT_PUBLIC_CHAIN_ID=<testnet-chain-id>
NEXT_PUBLIC_CHAIN_NAME=<testnet-name>
NEXT_PUBLIC_WALLET_RPC_URL=<wallet-reachable-testnet-rpc-url>
NEXT_PUBLIC_BLOCK_EXPLORER_URL=<optional-block-explorer-url>
```

Configure server-side read variables:

```env
BIDBACK_CHAIN_ID=<testnet-chain-id>
BIDBACK_RPC_URL=<server-side-testnet-rpc-url>
```

Important:

* `NEXT_PUBLIC_*` values are public.
* `BIDBACK_RPC_URL` may be private to the server runtime, but it must not contain private keys.
* Do not set `ENABLE_LOCAL_DEV_ACTIONS=true` in hosted testnet or production environments.
* The `/api/dev/*` routes are for local Anvil only.

---

## Local-Dev Boundary Check

Before opening a controlled public testnet frontend, confirm:

* `ENABLE_LOCAL_DEV_ACTIONS` is unset or not exactly `true`;
* `/api/dev/*` routes refuse execution;
* no Anvil private keys are configured in the hosted frontend;
* wallet-signed panels do not call `/api/dev/*`;
* user transactions are signed by the connected wallet.

Local-dev actions are not production architecture.

---

## Manual Smoke Test With A Real Testnet NFT

Use testnet assets only.

### Setup

Confirm:

* seller wallet owns an ERC-721 testnet NFT;
* bidder wallets have testnet ETH;
* wallet is connected to the target testnet;
* frontend points to `frontend/public/deployments/<chainId>.json`;
* deployment JSON validation passes;
* on-chain verification passes.

### Create Auction

1. Connect the seller wallet.
2. Approve `NFTVault` for the NFT token.
3. Call `AuctionHouse.createAuction(nft, tokenId, startPrice, duration)` through the wallet-signed UI.
4. Confirm the NFT moves into `NFTVault` custody.
5. Confirm the auction appears in the read-only auction list.
6. Confirm the auction detail page shows `OPEN`.

### Bid

1. Connect bidder #1.
2. Place a wallet-signed bid.
3. Confirm highest bid and highest bidder update.
4. Connect bidder #2.
5. Place a higher wallet-signed bid.
6. Confirm bidder #1 becomes a losing bidder.
7. Confirm caps are visible through read-only state.

### Finalize

1. Wait until actual end time.
2. Finalize the auction.
3. Confirm auction state becomes `FINALIZED`.
4. Confirm final price, seller proceeds, protocol fee, distribution reserve, total assigned, and auction rules snapshot.

### Claims and Withdrawals

1. Winner claims NFT.
2. Losing bidder claims refund.
3. Eligible bidder claims reward if entitlement is greater than zero.
4. Seller withdraws proceeds.
5. Fee recipient withdraws protocol fees.

### Expected Results

Confirm:

* losing bidder recovers the refundable cap;
* winner can recover surplus when applicable;
* rewards come only from premium-derived reserve;
* no claim makes `EscrowVault` insolvent;
* double claims fail;
* pause does not block post-finalization claims.

---

## Post-Deployment Notes

Record:

* target chain ID;
* RPC provider used;
* deployment transaction hashes;
* contract addresses;
* deployment JSON file path;
* smoke test transaction hashes;
* known issues;
* current owner/admin address;
* current fee recipient address;
* whether explorer verification is complete.

Keep these notes free of secrets.

---

## Rollback / Reset

If the deployment is wrong:

* do not reuse a stale deployment JSON;
* remove or replace the bad `frontend/public/deployments/<chainId>.json` before pointing the frontend at the chain;
* deploy a fresh set of contracts if vaults are wired incorrectly;
* rerun deployment JSON validation;
* rerun on-chain verification;
* rerun the smoke test.

Vault `setAuctionHouse` is intentionally one-time locked. A vault wired to the wrong `AuctionHouse` should be treated as unusable for that deployment.
