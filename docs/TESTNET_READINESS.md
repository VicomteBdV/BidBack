# Testnet Readiness

BidBack is not deployed to a public testnet yet.

This document prepares the repository for a future controlled public testnet deployment while keeping the current local Anvil workflow as the default and reliable MVP environment.

The concrete deployment runbook for a future controlled testnet is documented in:

```text
docs/TESTNET_DEPLOYMENT_RUNBOOK.md
```

Post-deployment verification steps are documented in:

```text
docs/POST_DEPLOYMENT_VERIFICATION.md
```

---

## Current Status

### Ready Today

* Local Anvil chain `31337`
* Foundry local deployment script
* Controlled testnet deployment scaffold through `script/DeployTestnet.s.sol`
* Frontend deployment files under `frontend/public/deployments/`
* Local deployment sync script for Anvil `31337`
* Testnet deployment sync script for `frontend/public/deployments/<chainId>.json`
* Read-only auction views through Next.js server routes
* Local-dev demo actions guarded by `ENABLE_LOCAL_DEV_ACTIONS=true`
* Wallet-signed UI panels for the production-target transaction model
* CI for Foundry tests, frontend tests, typecheck, and build
* Deployment JSON validation command for local and future deployment files
* Read-only on-chain deployment verification script for local and future deployments
* Deployment-level module linkage verification through public getters
* Owner, global fee recipient, and selected parameter sanity checks in on-chain deployment verification

### Not Done Yet

* No public testnet deployment
* No production deployment
* No broadcast performed by the testnet scaffold lot
* No contract verification workflow
* No production governance ownership handoff
* No hosted frontend environment
* No production indexer
* No production RPC provider selection
* No external security audit

---

## Environment Separation

### Local Anvil

Local Anvil remains the default environment.

Defaults:

```text
chainId = 31337
deployment file = frontend/public/deployments/31337.json
RPC = http://127.0.0.1:8545
```

Local-dev actions remain strictly limited to:

* `/api/dev/*`
* Anvil only
* chain ID `31337` only
* Codespaces MVP testing only

They must never be enabled in production or in a hosted testnet frontend.

### Controlled Public Testnet

A future controlled public testnet deployment should use:

```text
frontend/public/deployments/<chainId>.json
```

The testnet deployment scaffold is:

```text
script/DeployTestnet.s.sol
```

It deploys only the core BidBack contracts:

* `ParamsController`
* `NFTVault`
* `EscrowVault`
* `DistributionVault`
* `ReputationAdapter`
* `AuctionHouse`

It does not deploy `LocalERC721`, does not mint NFTs, and does not create a demo auction.

Server-side reads should use a server-side RPC URL.

Wallet-signed actions require the connected wallet to access the target RPC directly.

---

## Deployment JSON Format

Deployment files live in:

```text
frontend/public/deployments/
```

Local Anvil uses:

```text
frontend/public/deployments/31337.json
```

Future testnet deployments should use:

```text
frontend/public/deployments/<chainId>.json
```

Expected format:

```json
{
  "chainId": 31337,
  "generatedAt": "2026-06-29T00:00:00.000Z",
  "source": "foundry-broadcast",
  "contracts": {
    "auctionHouse": "0x0000000000000000000000000000000000000000",
    "nftVault": "0x0000000000000000000000000000000000000000",
    "escrowVault": "0x0000000000000000000000000000000000000000",
    "distributionVault": "0x0000000000000000000000000000000000000000",
    "paramsController": "0x0000000000000000000000000000000000000000",
    "reputationAdapter": "0x0000000000000000000000000000000000000000"
  }
}
```

Required contracts:

* `auctionHouse`
* `nftVault`
* `escrowVault`
* `distributionVault`
* `paramsController`
* `reputationAdapter`

Optional contracts:

* `localNft`

`localNft` is expected for the local Anvil demo because `LocalERC721` is a local mock.

`localNft` should not be included in a controlled public testnet deployment unless a test-only NFT mock is deliberately deployed there.

---

## Deployment JSON Validation

BidBack includes a local deployment JSON validator to catch malformed deployment files before they are used by the frontend.

Validate the local Anvil deployment after running `npm run local:deploy` or `npm run frontend:sync`:

```bash
npm run validate:deployment -- 31337
```

From inside `frontend/`, the equivalent command is:

```bash
npm run validate:deployment:local
```

For a future testnet deployment file:

```bash
npm run validate:deployment -- <testnet-chain-id>
```

The validator checks:

* the deployment file exists;
* the JSON is readable;
* `chainId` exists;
* `chainId` matches the CLI argument and filename expectation;
* `contracts` exists;
* all core contract fields are present;
* all core contract addresses are valid Ethereum addresses;
* `localNft` is optional;
* `localNft` is a valid Ethereum address when present;
* unknown fields produce warnings but do not fail validation.

The validator guarantees only the shape and address format of the JSON file.

It does not guarantee:

* the contracts exist on-chain;
* the addresses contain the expected bytecode;
* the contracts are wired correctly;
* ownership or governance is production-ready;
* the deployment was verified on a block explorer;
* the deployment is economically safe.

This command is intentionally not part of CI yet because `frontend/public/deployments/31337.json` is generated locally and can be absent in a fresh clone.

---

## On-Chain Deployment Verification

BidBack also includes a read-only on-chain verification script.

It validates the deployment JSON first, then checks the target RPC, deployed bytecode, critical reads, owners, global fee recipient, selected parameter sanity, and module linkage exposed by public getters.

For local Anvil:

```bash
npm run verify:deployment:onchain -- 31337
```

This command assumes:

* Anvil is running;
* `frontend/public/deployments/31337.json` exists;
* the local deployment has already been created with `npm run local:deploy` or synced with `npm run frontend:sync`.

For future testnet verification:

```bash
BIDBACK_RPC_URL=<testnet-rpc-url> npm run verify:deployment:onchain -- <chainId>
```

For stricter testnet verification when expected values are known:

```bash
EXPECTED_OWNER=<expected-owner-address> \
EXPECTED_FEE_RECIPIENT=<expected-fee-recipient-address> \
BIDBACK_RPC_URL=<testnet-rpc-url> \
npm run verify:deployment:onchain -- <chainId>
```

For chain ID `31337`, the script uses:

* `ANVIL_RPC_URL` if set;
* otherwise `http://127.0.0.1:8545`.

For any other chain ID, the script requires:

```text
BIDBACK_RPC_URL
```

The script checks:

* deployment JSON validity;
* RPC reachability;
* RPC chain ID matches the deployment file chain ID;
* bytecode exists for each core contract;
* bytecode exists for `localNft` if present;
* `AuctionHouse.nextAuctionId()` can be read;
* `ParamsController.paused()` can be read;
* `ParamsController.params()` can be read;
* every core `owner()` is readable and non-zero;
* `EXPECTED_OWNER` matches every readable core owner when provided;
* `AuctionHouse.feeRecipient()` is readable and non-zero;
* `EXPECTED_FEE_RECIPIENT` matches `AuctionHouse.feeRecipient()` when provided;
* selected economic and operational parameter sanity checks pass;
* `AuctionHouse.nftVault()` matches the deployment JSON;
* `AuctionHouse.escrowVault()` matches the deployment JSON;
* `AuctionHouse.distributionVault()` matches the deployment JSON;
* `AuctionHouse.paramsController()` matches the deployment JSON;
* `AuctionHouse.reputationAdapter()` matches the deployment JSON;
* `NFTVault.auctionHouse()` matches the deployment JSON;
* `EscrowVault.auctionHouse()` matches the deployment JSON;
* `DistributionVault.auctionHouse()` matches the deployment JSON.

The script intentionally does not verify yet:

* governance multisig or timelock state;
* auction-scoped linkage such as `DistributionVault.escrowForAuction(auctionId)`;
* auction-scoped module snapshots from `AuctionHouse.getAuctionModules(auctionId)`;
* transaction smoke tests;
* block explorer verification;
* source-bytecode equivalence;
* external security audit status.

This command is intentionally not part of CI yet because it requires a running RPC and, for local Anvil, a generated deployment file.

---

## Environment Variables

### Local Defaults

The repo defaults to Anvil `31337` when no testnet variables are set.

```env
NEXT_PUBLIC_CHAIN_ID=31337
NEXT_PUBLIC_CHAIN_NAME=Anvil Local
NEXT_PUBLIC_WALLET_RPC_URL=http://127.0.0.1:8545
NEXT_PUBLIC_ANVIL_RPC_URL=http://127.0.0.1:8545
ANVIL_RPC_URL=http://127.0.0.1:8545
```

### Controlled Testnet Deployment Variables

Prepare these outside the repo before a future broadcast:

```bash
export TESTNET_RPC_URL=<testnet-rpc-url>
export TESTNET_PRIVATE_KEY=<deployer-private-key>
export TESTNET_OWNER=<final-owner-address>
export TESTNET_FEE_RECIPIENT=<protocol-fee-recipient-address>
```

`TESTNET_PRIVATE_KEY` must never be committed and must never be exposed to the frontend.

### Future Testnet Verification Variables

Prepare these when you want the on-chain verifier to enforce expected owner and fee recipient values:

```bash
export EXPECTED_OWNER=<expected-owner-address>
export EXPECTED_FEE_RECIPIENT=<expected-fee-recipient-address>
```

These variables are optional. Without them, the script reports owners and fee recipient without failing on address mismatch.

### Future Testnet Frontend Variables

Prepare these when a public testnet deployment exists:

```env
NEXT_PUBLIC_CHAIN_ID=<testnet-chain-id>
NEXT_PUBLIC_CHAIN_NAME=<testnet-name>
NEXT_PUBLIC_WALLET_RPC_URL=<rpc-url-that-wallets-can-reach>
NEXT_PUBLIC_BLOCK_EXPLORER_URL=<optional-block-explorer-url>
```

These values are public frontend configuration. They must not contain private keys.

### Future Testnet Server-Side Variables

Prepare these for Next.js server-side reads:

```env
BIDBACK_CHAIN_ID=<testnet-chain-id>
BIDBACK_RPC_URL=<server-side-rpc-url>
```

`BIDBACK_RPC_URL` may use a private RPC provider URL, but it must not expose private keys.

Do not enable local dev actions in any hosted testnet environment:

```env
ENABLE_LOCAL_DEV_ACTIONS=false
```

or leave the variable unset.

---

## Commands for Future Testnet Day

Follow the full runbook first:

```text
docs/TESTNET_DEPLOYMENT_RUNBOOK.md
```

Run local checks:

```bash
forge test -vv
npm --prefix frontend run test
npm --prefix frontend run typecheck
npm --prefix frontend run build
```

Prepare environment variables outside the repo:

```bash
export TESTNET_RPC_URL=<rpc-url>
export TESTNET_PRIVATE_KEY=<private-key>
export TESTNET_OWNER=<owner-address>
export TESTNET_FEE_RECIPIENT=<fee-recipient-address>
```

Dry-run first:

```bash
forge script script/DeployTestnet.s.sol:DeployTestnet \
  --rpc-url "$TESTNET_RPC_URL" \
  -vvv
```

Broadcast only after review:

```bash
forge script script/DeployTestnet.s.sol:DeployTestnet \
  --rpc-url "$TESTNET_RPC_URL" \
  --broadcast \
  -vvv
```

Then create the frontend deployment JSON:

```bash
npm run testnet:sync -- <chainId>
```

Validate the deployment JSON before using it in the frontend:

```bash
npm run validate:deployment -- <chainId>
```

Run read-only on-chain verification:

```bash
BIDBACK_RPC_URL=<testnet-rpc-url> npm run verify:deployment:onchain -- <chainId>
```

Run read-only on-chain verification with expected owner and fee recipient:

```bash
EXPECTED_OWNER="$TESTNET_OWNER" \
EXPECTED_FEE_RECIPIENT="$TESTNET_FEE_RECIPIENT" \
BIDBACK_RPC_URL="$TESTNET_RPC_URL" \
npm run verify:deployment:onchain -- <chainId>
```

Run the post-deployment verification checklist before treating the deployment as usable:

```text
docs/POST_DEPLOYMENT_VERIFICATION.md
```

Finally run:

```bash
npm --prefix frontend run test
npm --prefix frontend run typecheck
npm --prefix frontend run build
```

---

## Known Risks Before Real Testnet

* Current production ownership handoff is not finalized.
* A multisig and timelock process should be defined before production-like deployment.
* A controlled testnet may temporarily use an EOA owner, but that must be intentional and documented.
* Public RPC reliability must be tested from both Next.js server runtime and user wallets.
* Wallet-signed actions require the wallet to reach the configured RPC.
* Contract verification is not automated yet.
* Deployment JSON must exactly match the deployed contract addresses.
* Deployment JSON validation checks shape and address format only; it does not verify on-chain bytecode.
* On-chain verification checks bytecode, owner reads, fee recipient, selected parameter sanity, critical reads, and deployment-level module linkage; it does not verify multisig/timelock state or auction-scoped linkage yet.
* `LocalERC721` is a mock and must not be treated as a product minting feature.
* No indexer exists yet, so read-only auction discovery still depends on bounded on-chain reads.
* Economic parameters should be reviewed before public testing even when automated sanity checks pass.
* Any public deployment must avoid language implying guaranteed rewards or yield.

---

## Checklist Before Real Testnet

Before broadcasting any public testnet deployment:

* Confirm target chain ID.
* Confirm RPC provider and rate limits.
* Confirm deployer wallet is funded only for testnet gas.
* Confirm no real private key is committed.
* Run `forge test -vv`.
* Run frontend tests, typecheck, and build.
* Review constructor parameters and module wiring.
* Confirm vault `setAuctionHouse` one-time locks are expected.
* Confirm `ParamsController` values.
* Confirm parameter sanity checks pass.
* Confirm fee recipient address.
* Confirm final owner address.
* Confirm pause behavior.
* Confirm claims remain pull-based.
* Confirm deployment JSON format.
* Validate the deployment JSON with `npm run validate:deployment -- <chainId>`.
* Run on-chain verification with `npm run verify:deployment:onchain -- <chainId>`.
* Run stricter on-chain verification with `EXPECTED_OWNER` and `EXPECTED_FEE_RECIPIENT` when those values are final.
* Confirm frontend points to the target chain.
* Confirm MetaMask can reach the target RPC.
* Confirm hosted frontend does not enable `ENABLE_LOCAL_DEV_ACTIONS=true`.
* Confirm block explorer verification plan.
* Review `docs/TESTNET_DEPLOYMENT_RUNBOOK.md`.
* Review `docs/POST_DEPLOYMENT_VERIFICATION.md`.
* Confirm no docs or UI imply guaranteed yield.
