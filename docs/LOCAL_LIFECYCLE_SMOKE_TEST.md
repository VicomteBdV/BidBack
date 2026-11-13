# Local Lifecycle Smoke Test

## Purpose

`npm run smoke:local:lifecycle -- --profile amount-rank-v1` is designed to perform a deterministic, exhaustive BidBack auction lifecycle on a local Anvil chain. It deploys a fresh local contract set, validates the generated deployment, and exercises every custody and pull-payment action with valueless development ETH and a local mock ERC-721.

This workflow is **LOCAL ANVIL ONLY**. It is separate from the one complete canonical Base Sepolia cycle validated on 22 August 2026, and no asset of real value should ever be used. Neither run proves the other environment or any production-readiness claim.

## Profile selection and current evidence

The current source deployment uses `amount-rank-v1`; its root wrapper requires
that explicit profile for a full run. `legacy-capped-v1` is for compatible
historical verification and is rejected by the current full deployment wrapper.
Both profiles can be named for network-only `--preflight-only`, which exits
before deployment and does not certify a contract or formula. Missing, duplicate
or unknown arguments fail before the wrapper starts any command.

New tooling is checked with pure calculations, mocked RPC transports and a
fake-npm wrapper boundary. No new Anvil, wallet or public-chain lifecycle was
executed as part of this adaptation. Running the operational commands below
still requires separate authorization; an instruction example is not permission.

## Prerequisites

- GitHub Codespaces or another environment with Foundry, Anvil, Node.js and the frontend dependencies installed.
- Anvil running separately on chain ID `31337`.
- The standard Anvil development mnemonic/accounts.
- No public RPC, testnet key or production key is needed or read.

The lifecycle command does not start, stop or kill Anvil.

## Run in Two Terminals

Terminal 1:

```bash
cd /workspaces/BidBack
anvil --host 0.0.0.0 --chain-id 31337
```

Terminal 2:

```bash
cd /workspaces/BidBack
npm run smoke:local:lifecycle -- --profile amount-rank-v1
```

The root command runs the pure Node tests before any transaction, then reuses the existing local workflow:

1. test the lifecycle calculation and guards with `node --test`;
2. verify that Anvil responds on `31337`;
3. run the existing local deployment and deployment JSON synchronization;
4. validate `frontend/public/deployments/31337.json`;
5. run the existing read-only on-chain deployment verification;
6. execute the full lifecycle through Viem.

Anvil must already be running. The generated deployment JSON, Foundry broadcast, cache and output directories remain local artifacts and must not be committed.

## Network and Key Safety

The lifecycle script:

- accepts `http://127.0.0.1:8545` by default;
- optionally accepts `LOCAL_ANVIL_RPC_URL` only when its hostname is loopback;
- refuses non-loopback hosts and credential-bearing URLs;
- reads `eth_chainId` and requires exactly `31337`;
- validates the deployment JSON and deployed bytecode before creating wallet clients;
- never reads `TESTNET_RPC_URL`, `BIDBACK_RPC_URL` or `TESTNET_PRIVATE_KEY`;
- uses only the public, insecure standard Anvil development keys;
- never prints private keys.

The actor mapping is:

| Role | Local account |
| --- | --- |
| Owner, seller, fee recipient | Anvil account #0 |
| Bidder A | Anvil account #1 |
| Bidder B | Anvil account #2 |

These development accounts must never receive real funds.

## Scenario

The fresh deployment creates its normal demo auction and mints local test NFTs. The lifecycle script reads `nextAuctionId` before creating its auction and confirms the derived ID against the `AuctionCreated` event. It does not hard-code auction `#2`.

Before creation, local token `#2` must:

- exist on the `LocalERC721` address from the current deployment JSON;
- belong to the local seller;
- not already be held in `NFTVault`;
- have no active or released lock for the new auction ID.

The script explicitly approves `NFTVault`, creates a two-hour auction, and runs these bids away from the anti-sniping window:

| Step | Cap | ETH sent |
| --- | ---: | ---: |
| Bidder A initial bid | 1.2 ETH | 1.2 ETH |
| Bidder B outbid | 1.5 ETH | 1.5 ETH |
| Bidder A step-up | 2 ETH | 0.8 ETH |

The script advances Anvil time between bids, confirms that `endTime` is unchanged, then advances to `endTime + 1` and mines a block before finalization.

## Expected Economics

The calculation uses the auction parameter snapshot, not mutable global parameters.

```text
start price                 = 1.00 ETH
final price                 = 2.00 ETH
gross premium               = 1.00 ETH
protocol fee                = 0.05 ETH
net premium                 = 0.95 ETH
candidate distribution      = 0.475 ETH
assigned losing reward      = 0.475 ETH
seller proceeds             = 1.475 ETH
losing bidder refund        = 1.50 ETH
winner surplus refund       = 0 ETH
total deposits              = 3.50 ETH
```

Bidder B receives its full `1.5 ETH` refundable cap independently from its `0.475 ETH` reward. The reward is funded only from net premium created by the final price.

The historical capped profile assigns `0.19 ETH` and seller proceeds
`1.76 ETH` for these same bids. That remains a legacy reference, not a claim
that the new implementation repeated the historical lifecycle. Fees, deposits
and cap refunds are the same in both profiles.

The current profile checks the five reported identity constants, exact static
parameter return width (20 fields), global and captured `rankSoftness=4`, and
on-chain scores against integer Q136 own-cap increments. The winner's whole
score is excluded. Initial identity and current-parameter checks use pinned blocks with reorg
rechecks before wallet creation. The captured snapshot is checked after auction
creation and before bids; its reads and scores use their pinned snapshot block. These are reported identities, not bytecode
source verification.

## Assertions

The script verifies:

- deployment chain, JSON, bytecode, ownership and expected local parameters;
- NFT owner, approval, custody and lock state;
- auction fields, parameter snapshot, fee recipient snapshot and module snapshot;
- cap, highest bid, participant count, bid count, escrow balance and unchanged end time after every bid;
- exact `0.8 ETH` step-up transaction value;
- final settlement, refunds, rewards, credits and reserves;
- NFT, refund, reward, seller proceeds and protocol fee pull actions separately;
- final NFT ownership, claim flags, zero credits, zero reserve and zero escrow balance;
- rejection of every duplicate claim and withdrawal through read-only simulations.

EOA balance deltas are not used for economic assertions because they include gas costs.

## Expected Output

Successful output is concise and includes:

```text
LOCAL ANVIL ONLY
[OK] Deployment loaded
[OK] Test NFT available
[OK] NFTVault approval verified
[OK] Auction created: #<derived-id>
[OK] Bidder A cap: 1.2 ETH
[OK] Bidder B highest bid: 1.5 ETH
[OK] Bidder A step-up: cap 2 ETH, value 0.8 ETH
[OK] Auction finalized
[OK] NFT claimed
[OK] Refund claimed: 1.5 ETH
[OK] Reward claimed: 0.475 ETH
[OK] Seller proceeds withdrawn: 1.475 ETH
[OK] Protocol fees withdrawn: 0.05 ETH
[OK] Double claims and withdrawals rejected
[OK] Final balances verified
```

Failures use this form and set a non-zero process exit code:

```text
[FAIL] <step>: expected <value>, observed <value>
```

## Common Errors

| Error | Resolution |
| --- | --- |
| Anvil RPC unreachable | Start Anvil in the first terminal on port `8545`. |
| RPC URL rejected | Use a loopback URL through `LOCAL_ANVIL_RPC_URL`; public and LAN hosts are intentionally refused. |
| Wrong chain ID | Restart the local node with `--chain-id 31337`. |
| Deployment or artifact missing | Run the root smoke command, not the frontend-only lifecycle command. |
| Token #2 unavailable | Rerun the root command so it creates and synchronizes a fresh deployment. |
| Unexpected parameter value | Review the local parameter defaults; the deterministic scenario intentionally fails on economic drift. |
| Reward is zero | Treat this as a failure for this scenario; the expected positive entitlement is exactly `0.19 ETH`. |

## Base Sepolia Distinction

The script targets a complete deterministic Anvil scenario, where time can be advanced and development accounts have no value. Its mocked checks do not establish a new execution of that scenario. One bounded canonical Base Sepolia multi-wallet lifecycle completed on 22 August 2026 with a separately deployed valueless test-only NFT and manual transaction review. Passing this local command is not evidence for that public run, and the single public run does not replace deterministic local coverage or prove repeatability.
