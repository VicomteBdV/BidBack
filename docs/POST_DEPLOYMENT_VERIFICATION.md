# Post-Deployment Verification

This document defines the manual checks to run after a future BidBack public testnet deployment.

No public testnet deployment exists yet.

This is a preparation document only. It does not trigger deployment and does not replace contract tests, frontend tests, or a security audit.

For the controlled testnet deployment procedure, start with:

```text
docs/TESTNET_DEPLOYMENT_RUNBOOK.md
```

---

## Purpose

The deployment JSON validator checks that a file such as:

```text
frontend/public/deployments/<chainId>.json
```

has the expected shape.

It verifies:

* the JSON is readable;
* `chainId` exists;
* `chainId` matches the expected chain;
* core contract fields are present;
* core contract addresses are valid Ethereum addresses;
* `localNft` is optional;
* unknown fields do not break validation.

However, the deployment JSON validator does not verify real on-chain state.

It does not prove that:

* the addresses contain bytecode;
* the bytecode matches the expected contracts;
* contracts are wired to each other correctly;
* ownership/admin setup is correct;
* parameters are correct;
* the frontend points to the same chain that was deployed;
* the deployment is safe for production.

Post-deployment verification closes that gap.

---

## On-Chain Verification Script

BidBack includes a read-only on-chain verification script:

```bash
npm run verify:deployment:onchain -- <chainId>
```

For local Anvil:

```bash
npm run verify:deployment:onchain -- 31337
```

For chain ID `31337`, the script uses:

* `ANVIL_RPC_URL` if set;
* otherwise `http://127.0.0.1:8545`.

For a future testnet:

```bash
BIDBACK_RPC_URL=<testnet-rpc-url> npm run verify:deployment:onchain -- <chainId>
```

The script requires:

* a reachable RPC;
* a deployment JSON file at `frontend/public/deployments/<chainId>.json`;
* a deployment JSON file that passes `npm run validate:deployment -- <chainId>`.

The script verifies:

* deployment JSON shape and address format;
* RPC reachability;
* RPC chain ID matches the deployment file chain ID;
* bytecode exists for all core contracts;
* bytecode exists for `localNft` if present;
* `AuctionHouse.nextAuctionId()` can be read;
* `ParamsController.paused()` can be read;
* `ParamsController.params()` can be read;
* deployment-level module linkage that is exposed by public getters.

The script verifies these module links:

* `AuctionHouse.nftVault()` matches `deployment.contracts.nftVault`;
* `AuctionHouse.escrowVault()` matches `deployment.contracts.escrowVault`;
* `AuctionHouse.distributionVault()` matches `deployment.contracts.distributionVault`;
* `AuctionHouse.paramsController()` matches `deployment.contracts.paramsController`;
* `AuctionHouse.reputationAdapter()` matches `deployment.contracts.reputationAdapter`;
* `NFTVault.auctionHouse()` matches `deployment.contracts.auctionHouse`;
* `EscrowVault.auctionHouse()` matches `deployment.contracts.auctionHouse`;
* `DistributionVault.auctionHouse()` matches `deployment.contracts.auctionHouse`.

The script fails with exit code `1` if:

* the deployment file is missing;
* the deployment JSON is invalid;
* the RPC is inaccessible;
* the RPC chain ID is wrong;
* a checked contract address has no bytecode;
* a critical read fails;
* a verifiable module linkage check fails.

The script intentionally skips these auction-scoped checks for now:

* `DistributionVault.escrowForAuction(auctionId)`, because it exists per auction after a distribution is opened;
* `AuctionHouse.getAuctionModules(auctionId)`, because it is an auction-specific snapshot.

The script does not verify yet:

* ownership;
* governance handoff;
* transaction smoke tests;
* block explorer verification;
* multisig or timelock governance state;
* external security audit status.

It is not integrated into CI because it requires a live RPC and, for Anvil, a generated local deployment file.

---

## What Must Be Verified On-Chain

After a future testnet deployment, verify every item below against the target RPC and block explorer.

### Chain and Deployment File

Confirm:

* the controlled testnet runbook was followed;
* the RPC chain ID matches the deployment JSON filename;
* the deployment JSON `chainId` matches the target chain;
* `frontend/public/deployments/<chainId>.json` is the latest deployment artifact;
* the deployment JSON was generated from `broadcast/DeployTestnet.s.sol/<chainId>/run-latest.json`.

Run the local deployment JSON validator:

```bash
npm run validate:deployment -- <chainId>
```

Run read-only on-chain verification:

```bash
BIDBACK_RPC_URL=<testnet-rpc-url> npm run verify:deployment:onchain -- <chainId>
```

### Bytecode Presence

For each core contract address in the deployment JSON, confirm bytecode exists on-chain:

* `AuctionHouse`
* `NFTVault`
* `EscrowVault`
* `DistributionVault`
* `ParamsController`
* `ReputationAdapter`

A controlled public testnet deployment should not include `localNft` unless a mock NFT was deliberately deployed for a test-only environment.

An address with empty bytecode means the deployment JSON is wrong or stale.

### ABI Compatibility

Confirm each contract responds to critical read functions expected by the frontend and scripts.

Expected examples include:

* `AuctionHouse.nextAuctionId()`
* `AuctionHouse.getAuction(uint256)`
* `AuctionHouse.minimumNextBid(uint256)`
* `AuctionHouse.feeRecipient()`
* `AuctionHouse.getAuctionParams(uint256)`
* `AuctionHouse.getAuctionFeeRecipient(uint256)`
* `EscrowVault.capOf(uint256,address)`
* `EscrowVault.refundableAmount(uint256,address)`
* `EscrowVault.sellerCredits(address)`
* `EscrowVault.protocolFeeCredits(address)`
* `DistributionVault.entitlementOf(uint256,address)`
* `DistributionVault.claimed(uint256,address)`
* `ParamsController.params()`
* `ParamsController.paused()`

If these calls fail, the address, ABI, or deployment version is wrong.

### Module Linkage

Confirm `AuctionHouse` references the intended deployed modules.

The on-chain verification script already checks the deployment-level getters currently exposed by the MVP contracts:

* `AuctionHouse.nftVault()`
* `AuctionHouse.escrowVault()`
* `AuctionHouse.distributionVault()`
* `AuctionHouse.paramsController()`
* `AuctionHouse.reputationAdapter()`
* `NFTVault.auctionHouse()`
* `EscrowVault.auctionHouse()`
* `DistributionVault.auctionHouse()`

A mismatch means the deployment JSON is stale, a module was wired incorrectly, or a vault is locked to the wrong `AuctionHouse`.

The script does not check auction-scoped module snapshots yet:

* `DistributionVault.escrowForAuction(auctionId)`;
* `AuctionHouse.getAuctionModules(auctionId)`.

Those should be checked later with an auction-aware verification or smoke test.

### Vault AuctionHouse Locks

Confirm each vault has the intended `AuctionHouse` set:

* `NFTVault`
* `EscrowVault`
* `DistributionVault`

Confirm the one-time set / lock behavior has not left any vault pointing to a stale or wrong `AuctionHouse`.

A wrong vault-to-house link can break custody, settlement, refunds, or redistribution.

### Ownership and Admin State

Confirm temporary ownership/admin state is explicit and documented.

Verify:

* deployer address;
* final owner address from `TESTNET_OWNER`;
* owner/admin address for each module;
* pause authority;
* parameter authority;
* fee recipient from `TESTNET_FEE_RECIPIENT`;
* any remaining EOA ownership.

For real production, ownership should move to multisig/timelock governance. A controlled testnet may temporarily use an EOA, but that must be intentional and documented.

### ParamsController State

Confirm `ParamsController` contains expected MVP parameters.

Verify at minimum:

* minimum auction duration;
* minimum participants;
* premium threshold;
* protocol fee configuration;
* redistribution fraction;
* bid increment;
* anti-sniping window and extension;
* max participants;
* pause state.

Confirm values match the intended testnet configuration and do not imply guaranteed yield.

### ReputationAdapter State

Confirm `ReputationAdapter` is in the expected testnet mode.

Verify:

* reputation is non-blocking;
* it affects only redistribution;
* it cannot block refunds;
* configured multipliers are bounded as expected.

### NFTVault Behavior

Confirm `NFTVault` can receive and release ERC-721 tokens through the intended auction flow.

Verify:

* NFT approval targets `NFTVault`, not `AuctionHouse`;
* auction creation transfers custody as expected;
* NFT claim after finalization is pull-based;
* no-bid seller reclaim behavior works if applicable.

### EscrowVault Behavior

Confirm `EscrowVault` is correctly configured.

Verify:

* caps are tracked per auction and bidder;
* cap step-up accounting works;
* losing bidder refund remains fully recoverable;
* winner surplus refund remains recoverable;
* seller proceeds are pull-based;
* protocol fee withdrawal is pull-based;
* claims are not blocked by pause.

### DistributionVault Behavior

Confirm `DistributionVault` is correctly configured.

Verify:

* redistribution opens only after finalization;
* entitlements are deterministic;
* reward claims are pull-based;
* double claim is rejected;
* total claimed cannot exceed assigned rewards;
* assigned rewards cannot exceed available distribution reserve.

---

## Smoke Test Flow

Run a small end-to-end testnet scenario with test assets and test funds only.

### Setup

Confirm:

* wallet is on the target testnet;
* frontend points to `frontend/public/deployments/<chainId>.json`;
* the deployment JSON validator passes;
* read-only on-chain verification passes;
* all core addresses have bytecode;
* a real testnet ERC-721 NFT is available;
* the seller wallet owns the NFT;
* bidder wallets have enough test ETH for gas and bids.

### Auction Creation

1. Approve `NFTVault` for the NFT token.
2. Call `AuctionHouse.createAuction(nft, tokenId, startPrice, duration)`.
3. Confirm the NFT moves into vault custody.
4. Confirm the auction appears in the frontend read-only list.
5. Confirm auction detail shows `OPEN`.
6. Confirm auction parameter snapshot and fee recipient snapshot are visible.

### Bidding

1. Place first bid from bidder #1.
2. Confirm highest bidder and highest bid update.
3. Place second bid from bidder #2 with a higher cap.
4. Confirm bidder #1 becomes a losing bidder.
5. Confirm caps are visible through `EscrowVault.capOf`.

### Finalization

1. Wait until actual auction end time.
2. Finalize the auction.
3. Confirm auction state becomes `FINALIZED`.

Confirm settlement values:

* final price;
* seller proceeds;
* protocol fee;
* distribution reserve;
* total assigned rewards.

### Claims and Withdrawals

1. Winner claims NFT through `AuctionHouse.claimNft`.
2. Losing bidder claims refund through `EscrowVault.claimRefund`.
3. Eligible bidder claims reward through `DistributionVault.claim`.
4. Seller withdraws proceeds through `EscrowVault.withdrawSellerProceeds`.
5. Fee recipient withdraws protocol fees through `EscrowVault.withdrawProtocolFees`.

### Expected Results

Confirm:

* losing bidder recovers the refundable cap;
* winner can recover any surplus where applicable;
* rewards come only from the available premium-derived reserve;
* no claim makes `EscrowVault` insolvent;
* double claims are rejected;
* pause does not block post-finalization claims.

---

## Failure Modes

Watch for these failure modes during testnet verification.

### Network and RPC

* Wrong RPC URL.
* Wrong chain ID.
* MetaMask connected to the wrong network.
* RPC rate limits.
* Stale RPC state.
* Chain fork or reset on a temporary testnet.

### Deployment File

* Deployment JSON is stale.
* Deployment JSON has the wrong `chainId`.
* Deployment JSON points to an old deployment.
* Deployment JSON contains a valid address with no bytecode.
* Deployment JSON contains an address for the wrong contract.

### Contract Wiring

* Vault points to the wrong `AuctionHouse`.
* `AuctionHouse` references the wrong vault.
* `DistributionVault` or `EscrowVault` is not the one expected by `AuctionHouse`.
* `ParamsController` is not the intended instance.
* `ReputationAdapter` is not the intended instance.
* Auction-scoped module snapshots differ from the expected deployment for auctions created before a module update.

### Admin and Ownership

* Owner is an unexpected EOA.
* Fee recipient is wrong.
* Pause authority is wrong.
* Params authority is wrong.
* Ownership handoff plan is missing or unclear.

### ABI and Versioning

* Frontend ABI does not match deployed bytecode.
* Critical read functions revert.
* Transaction functions revert unexpectedly.
* Constructor arguments do not match documentation.
* Source is not verified on the explorer.

### User Flow

* NFT approval targets the wrong address.
* NFT custody transfer fails.
* Bid value is wrong.
* Step-up cap value is wrong.
* Finalization happens too early or reverts after end time.
* Claims fail after finalization.
* Refund or reward already claimed unexpectedly.
* Seller proceeds or protocol fee credits are zero unexpectedly.

### Security and Economic Invariants

* Losing bidder cannot recover full refundable cap.
* Reward appears funded from losing bidder refundable cap.
* Reward total exceeds available premium-derived reserve.
* Claims can make escrow insolvent.
* Pause blocks claims.
* UI or docs imply guaranteed rewards or yield.

---

## Manual Checklist

Use this checklist on the day of a real testnet deployment.

### Pre-Verification

* Confirm `docs/TESTNET_DEPLOYMENT_RUNBOOK.md` was followed.
* Confirm target chain ID.
* Confirm target RPC URL.
* Confirm block explorer URL.
* Confirm deployment transaction hashes.
* Confirm deployment JSON path: `frontend/public/deployments/<chainId>.json`.
* Confirm deployment JSON was generated with `npm run testnet:sync -- <chainId>`.
* Run `npm run validate:deployment -- <chainId>`.
* Run `BIDBACK_RPC_URL=<testnet-rpc-url> npm run verify:deployment:onchain -- <chainId>`.
* Confirm no real private key is committed.
* Confirm frontend env points to the target chain.
* Confirm `ENABLE_LOCAL_DEV_ACTIONS` is not enabled in the hosted frontend.

### Bytecode and ABI

* Confirm `AuctionHouse` has bytecode.
* Confirm `NFTVault` has bytecode.
* Confirm `EscrowVault` has bytecode.
* Confirm `DistributionVault` has bytecode.
* Confirm `ParamsController` has bytecode.
* Confirm `ReputationAdapter` has bytecode.
* Confirm critical read calls work.
* Confirm frontend ABI matches deployed contracts.

### Module Linkage

* Confirm `AuctionHouse` references expected `NFTVault`.
* Confirm `AuctionHouse` references expected `EscrowVault`.
* Confirm `AuctionHouse` references expected `DistributionVault`.
* Confirm `AuctionHouse` references expected `ParamsController`.
* Confirm `AuctionHouse` references expected `ReputationAdapter`.
* Confirm `NFTVault` points to expected `AuctionHouse`.
* Confirm `EscrowVault` points to expected `AuctionHouse`.
* Confirm `DistributionVault` points to expected `AuctionHouse`.
* Confirm auction-scoped module snapshots are checked separately when relevant.

### Admin and Params

* Confirm owner/admin addresses.
* Confirm fee recipient.
* Confirm pause authority.
* Confirm params authority.
* Confirm `ParamsController.params()`.
* Confirm `ParamsController.paused()` is expected.
* Confirm `ReputationAdapter` state is expected.
* Confirm testnet EOA ownership is temporary and documented.

### Smoke Test

* Confirm seller owns test NFT.
* Approve `NFTVault`.
* Create auction.
* Confirm auction is visible in frontend.
* Place first bid.
* Place second bid.
* Confirm highest bidder and highest bid.
* Wait until end time.
* Finalize auction.
* Winner claims NFT.
* Losing bidder claims refund.
* Eligible bidder claims reward if entitlement exists.
* Seller withdraws proceeds.
* Fee recipient withdraws protocol fees.

### Post-Smoke-Test Checks

* Confirm losing bidder refund behavior.
* Confirm reward source is premium-derived reserve only.
* Confirm total claimed does not exceed total assigned.
* Confirm escrow remains solvent.
* Confirm double claims fail.
* Confirm read-only frontend refreshes correctly.
* Confirm wallet-signed panels remain separate from local-dev mode.
* Confirm no `/api/dev/*` route is used for wallet-signed flows.

### Documentation

* Update deployment JSON if needed.
* Update testnet deployment notes.
* Record deployment transaction hashes.
* Record smoke test transaction hashes.
* Record known issues.
* Confirm docs do not imply guaranteed yield.

---

## Future Automation

A future verification script can automate more of this checklist.

Already automated:

* deployment JSON validation;
* RPC chain ID check;
* bytecode presence checks;
* selected critical read checks;
* deployment-level module linkage checks exposed by public getters.

Potential future automation:

* ownership/admin checks;
* auction-scoped module snapshot checks;
* `ParamsController` expected-value checks;
* pause authority checks;
* fee recipient checks;
* read-only smoke checks for `getAuction`;
* optional dry-run transaction simulations;
* explorer source verification checks.

Automation should not replace manual review for:

* economic parameter reasonableness;
* governance readiness;
* deployment approval;
* security review;
* UI/product language review.
