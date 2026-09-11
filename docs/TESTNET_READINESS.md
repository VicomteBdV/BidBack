# Testnet Readiness

**One complete canonical Base Sepolia cycle validated:** on 22 August 2026, auction `#2` completed the public multi-wallet lifecycle on Base Sepolia (`84532`) using five distinct role wallets and a separately deployed valueless test-only NFT. The confirmed run covered creation, bidding, delta-only step-up, finalization, all claims and withdrawals, exact economic reconciliation, a passing final verifier, and five rejected duplicate-action simulations. The retained report is [`evidence/base-sepolia/2026-08-22-auction-2-bd56f90/REPORT.md`](./evidence/base-sepolia/2026-08-22-auction-2-bd56f90/REPORT.md).

This is one bounded canonical scenario. It does not establish repeatability, hosted-beta readiness, public-beta readiness, production readiness, or external audit coverage.

This document describes readiness for controlled public-testnet deployment, redeployment, repetition, and continued validation while keeping the local Anvil workflow as the default deterministic MVP environment. Current status is maintained in [`PRODUCT_STATUS.md`](./PRODUCT_STATUS.md).

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
* Six-contract Base Sepolia deployment recorded in `frontend/public/deployments/84532.json`
* One complete canonical Base Sepolia cycle validated on 22 August 2026 for auction `#2`
* Successive lifecycle verifier checks from `after-create` through `final`
* Five expected duplicate-action rejections through read-only `eth_call`, followed by another passing `final` check
* Foundry local deployment script
* Controlled testnet deployment scaffold through `script/DeployTestnet.s.sol`
* Frontend deployment files under `frontend/public/deployments/`
* Local deployment sync script for Anvil `31337`
* Testnet deployment sync script for `frontend/public/deployments/<chainId>.json`
* Read-only auction views through Next.js server routes
* Local-dev demo actions guarded by explicit matching Anvil application targets, `ENABLE_LOCAL_DEV_ACTIONS=true`, and an RPC reporting `31337`
* Wallet-signed UI panels for the production-target transaction model
* CI for Foundry tests, frontend tests, typecheck, and build
* Deployment JSON validation command for local and future deployment files
* Read-only on-chain deployment verification script for local and future deployments
* Deployment-level module linkage verification through public getters
* Owner, global fee recipient, and selected parameter sanity checks in on-chain deployment verification

### Not Done Yet

* No production deployment
* No repeated Base Sepolia wallet/browser/RPC support matrix
* No complete archival transaction metadata for the canonical run; P1/T1–T11 hashes, blocks, exact timestamps, checksums, deployment hashes, and BaseScan verification status remain pending evidence
* No automated contract source-verification workflow
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

* `/api/dev/*` and `/api/local-create-context`
* Anvil only
* chain ID `31337` only
* Codespaces MVP testing only

Local UI and server routes require `NEXT_PUBLIC_CHAIN_ID=31337`, `BIDBACK_CHAIN_ID=31337`, and `ENABLE_LOCAL_DEV_ACTIONS=true` exactly. Missing, malformed, or non-local chain IDs fail closed, even if the read-only configuration helpers would fall back to Anvil. The server additionally requires `ANVIL_RPC_URL` to report `0x7a69` (31337). UI visibility reflects the configuration policy, not RPC health.

Every guard refusal returns HTTP 404 with `{"error":"Not available."}`. Public-target rejection happens before RPC access, request-body parsing, local writers, or the local create-context reader. RPC failures inside the guard use the same fixed response without exposing upstream errors or configuration values. This is a runtime boundary; local code remains in the build.

They must never be enabled in production or in a hosted testnet frontend.

### Controlled Public Testnet

Any controlled public-testnet deployment or redeployment should use:

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

## Controlled Frontend Environment Prerequisite

For the bounded Base Sepolia reference profile, prepare a separate environment with:

```env
NEXT_PUBLIC_CHAIN_ID=84532
BIDBACK_CHAIN_ID=84532
ENABLE_LOCAL_DEV_ACTIONS=false
NEXT_PUBLIC_WALLET_RPC_URL=<browser-reachable-http-or-https-rpc-url>
BIDBACK_RPC_URL=<server-side-http-or-https-rpc-url>
```

Unset all `ANVIL_DEV_*PRIVATE_KEY` variables (including seller, both bidders, and fee recipient). Omit the Anvil RPC variables. Do not copy the active Anvil defaults and dummy-key assignments from `frontend/.env.example` into this environment. Public URLs must not contain secret credentials. No deployer or testnet signing key belongs in the frontend environment; user transactions remain wallet-signed.

With the intended environment exported, run from the repository root:

```bash
npm --prefix frontend run validate:env:controlled
node --test frontend/scripts/validate-controlled-testnet-env.test.mjs
```

The validator reads **only its process environment**, not Next.js `.env*` files. If using an environment file, explicitly load it with Node (shell values take precedence):

```bash
node --env-file=/path/to/controlled-frontend.env frontend/scripts/validate-controlled-testnet-env.mjs
```

Keep the validator, build, and server runtime configurations aligned, and remove conflicting local `.env*` files from the controlled environment. `NEXT_PUBLIC_*` values are fixed during the Next.js build; rebuild when they change. Changing runtime variables alone is not proof that an existing browser bundle targets the intended chain.

This deterministic command performs no DNS, RPC, or other network access. It requires both chain IDs to be exactly `84532`, local actions unset/false, empty/unset Anvil key variables, explicit HTTP(S) browser/server RPC URLs, and the existing valid `public/deployments/84532.json` with matching chain ID and core addresses. Browser RPCs with embedded credentials, localhost/local names, or recognized loopback/private/link-local literals are rejected. Failure exits with code 1 and fixed messages without environment values; success exits with code 0.

The validator reuses the deployment JSON shape/address check. It does not prove DNS resolution, RPC reachability, reported chain ID, bytecode, contract wiring, secret-free provider URL paths/query strings, or on-chain correctness. The standalone validator tests are run separately from current GitHub CI; runtime-boundary tests are included in the existing frontend suite. No CI change is made by this lot.

This prerequisite does not select a host or production chain, deploy a frontend, establish access control, prove a public wallet lifecycle, or advance a readiness gate. Hosting/environment isolation, supported wallet/RPC reachability, repeatable Base Sepolia sessions, and minimum operational evidence remain later work. Wallet-signed creation, bidding, finalization, claims, and withdrawals remain independent of local routes.

---

## Controlled Wallet and RPC Support Contract

Lot 6 (`BIDBACK-CONTROLLED-FOUNDATION-LOT6-WALLET-RPC-READINESS-v2`, superseding V1) retains wallet-signed desktop injected wallets through wagmi. The connector selected in the wallet selector supplies network switching, transaction-related wallet reads, NFT approval, creation, bidding/step-up, finalization, all three claims, and both withdrawals. No transaction provider is chosen independently from `window.ethereum`.

| Surface / target | Code path available | Deterministic coverage | Manual browser/wallet evidence |
| --- | --- | --- | --- |
| Generic injected / EIP-6963 desktop connectors | Yes; explicit choice for multiple discovered wallets, direct connection for one, read-only for zero | Selector, active-provider switching, A/B isolation, shared viem dispatch, transaction components, stale/missing provider rejection | Mocks only; no extension or hosted lifecycle validation in this lot |
| MetaMask desktop extension / Chromium | Generic injected path; no proprietary integration | Generic connector/provider tests only | **Manual validation pending** |
| Rabby desktop extension / Chromium | Generic injected path; no proprietary integration | Generic connector/provider tests only | **Manual validation pending** |
| Other injected wallets | May work through the generic path | No wallet-specific validation claimed | Not validated |
| WalletConnect, mobile links, Coinbase-specific integration | Outside this lot | None added | Not validated |

The tests' executed results and exact tested SHA are retained in the lot PR. Test presence does not itself establish success. When named connectors are discovered, the selector hides the legacy global “Browser wallet” alias. A legacy-only provider can still connect, but that generic label does not prove that all installed extensions were discovered or that a multi-extension session works. Wagmi retains its existing reconnection behavior for previously authorized connections.

For any non-local target, `NEXT_PUBLIC_WALLET_RPC_URL` must be explicit and valid HTTP(S); missing, blank, malformed, or embedded-credential URLs fail configuration initialization. No fallback to either `127.0.0.1:8545` or `NEXT_PUBLIC_ANVIL_RPC_URL` is used. Anvil `31337` retains its local fallback. Configuration failure is a build/start configuration error, not proof that a public RPC is unavailable. URL validation makes no network calls and does not prove DNS, reachability, chain identity, rate limits, or credential-free paths/query strings.

Browser RPC configuration supplies wagmi's transport and add-chain metadata. A wallet with an existing chain entry may retain its own RPC endpoint; a switch/add request does not prove which endpoint the extension uses. Server reads may use a different `BIDBACK_RPC_URL`, but `BIDBACK_CHAIN_ID` and build-time `NEXT_PUBLIC_CHAIN_ID` must agree. Run the [existing controlled-environment preflight](#controlled-frontend-environment-prerequisite) with aligned build/runtime configuration. No RPC vendor is selected.

For later authorized manual validation, retain browser/OS and extension versions, source/build SHA, chain IDs, non-secret environment evidence, and observed results. Test each extension alone, then both together: select the non-first wallet B, confirm its identity/account, switch the wrong network, exercise rejection and pending-request recovery, and verify NFT approval/create, bid/step-up, finalize, NFT/refund/reward claims, seller proceeds, and protocol-fee withdrawal all prompt the selected extension while A remains untouched. Check disconnect/account/connector changes and repeat at desktop and narrow viewport widths. Public transaction portions require a separately authorized testnet session; none are performed by this lot.

No Controlled beta-ready claim is made. Hosted access/environment evidence, actual browser/RPC support validation, repeatable Base Sepolia execution with retained evidence, and minimum monitoring, support, and incident handling remain open.

---

## Repeatable Session Evidence Tooling — Lot 7

The 11 September 2026 implementation checkpoint adds a strict public session specification, create-only phase snapshots, manifest SHA-256, P1 + T1–T11 receipt collection, historical phase verification, and five read-only duplicate-action simulations followed by another final lifecycle check. See the [session evidence procedure](./BASE_SEPOLIA_SMOKE_TEST.md#14-repeatable-session-evidence--lot-7) and [placeholder template](./evidence/base-sepolia/SESSION_TEMPLATE.json).

The tooling reuses the existing canonical verifier and deployment validator. It checks the session source against a clean checkout HEAD and rejects conflicting static arguments. Assembly requires historical RPC reads at the saved blocks; missing history, missing receipt fields, unexpected custom-error data, mismatched metadata, and incomplete phases prevent success. No provider is selected. All transaction actions remain separately authorized and wallet-signed; the evidence scripts create only public clients and perform no public transaction.

Run the standalone suites separately from existing CI:

```bash
npm --prefix frontend run test:base-sepolia-verifier
node --test frontend/scripts/collect-base-sepolia-evidence.test.mjs
node --test frontend/scripts/validate-controlled-testnet-env.test.mjs
```

These tests use deterministic mocks without network access. Actual outcomes and delivered SHA are retained in the Lot 7 PR. This prepares a future run; it does not demonstrate repetition. MetaMask and Rabby manual validation, second Base Sepolia execution, hosted controlled access, source-verification evidence, monitoring, support and incident handling remain incomplete. No readiness gate advances, and no Controlled beta-ready claim is made. The 22 August evidence remains unchanged.

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

For a future testnet deployment or replacement file:

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

For controlled public-testnet verification or re-verification:

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
BIDBACK_CHAIN_ID=31337
BIDBACK_RPC_URL=http://127.0.0.1:8545
ANVIL_RPC_URL=http://127.0.0.1:8545
ENABLE_LOCAL_DEV_ACTIONS=true
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

### Testnet Verification Variables

Prepare these when you want the on-chain verifier to enforce expected owner and fee recipient values:

```bash
export EXPECTED_OWNER=<expected-owner-address>
export EXPECTED_FEE_RECIPIENT=<expected-fee-recipient-address>
```

These variables are optional. Without them, the script reports owners and fee recipient without failing on address mismatch.

### Testnet Frontend Variables

Prepare these when a public testnet deployment exists:

```env
NEXT_PUBLIC_CHAIN_ID=<testnet-chain-id>
NEXT_PUBLIC_CHAIN_NAME=<testnet-name>
NEXT_PUBLIC_WALLET_RPC_URL=<rpc-url-that-wallets-can-reach>
NEXT_PUBLIC_BLOCK_EXPLORER_URL=<optional-block-explorer-url>
```

These values are public frontend configuration. They must not contain private keys.

### Testnet Server-Side Variables

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

## Commands for a Future Testnet Deployment or Repetition

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

## Known Risks After the Canonical Testnet Checkpoint

* Current production ownership handoff is not finalized.
* A multisig and timelock process should be defined before production-like deployment.
* A controlled testnet may temporarily use an EOA owner, but that must be intentional and documented.
* Public RPC reliability must be tested from both Next.js server runtime and user wallets.
* Wallet-signed actions require the wallet to reach the configured RPC.
* BaseScan source-verification status for the accepted canonical deployment remains pending archival evidence, and contract source verification is not automated.
* Deployment JSON must exactly match the deployed contract addresses.
* Deployment JSON validation checks shape and address format only; it does not verify on-chain bytecode.
* On-chain verification checks bytecode, owner reads, fee recipient, selected parameter sanity, critical reads, and deployment-level module linkage; it does not verify multisig/timelock state or auction-scoped linkage yet.
* `LocalERC721` is a mock and must not be treated as a product minting feature.
* No indexer exists yet, so read-only auction discovery still depends on bounded on-chain reads.
* Economic parameters should be reviewed before public testing even when automated sanity checks pass.
* Any public deployment must avoid language implying guaranteed rewards or yield.

---

## Checklist Before a Future Public-Testnet Deployment or Canonical Repetition

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
