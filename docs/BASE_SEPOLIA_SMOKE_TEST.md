# Base Sepolia Canonical Multi-Wallet Smoke Test

This runbook defines the canonical wallet-signed BidBack lifecycle on Base Sepolia (`84532`). It is a controlled public-testnet procedure using valueless assets. It is not production, an audit, or evidence of guaranteed rewards.

The public smoke remains incomplete until every transaction and read-only phase check below succeeds and its evidence is retained. The deterministic Anvil lifecycle is a separate prerequisite and never substitutes for this run.

## 1. Deployment Decision

Use a fresh deployment of the six core contracts from the validated commit. The previously referenced Base Sepolia deployment cannot be reconstructed from retained repository addresses and transaction hashes. Do not reuse it unless an independently recovered manifest passes source, bytecode, ownership, parameter, wiring, and provenance review before funds are used.

The public manifest is `frontend/public/deployments/84532.json`. It must contain only:

- `AuctionHouse`
- `NFTVault`
- `EscrowVault`
- `DistributionVault`
- `ParamsController`
- `ReputationAdapter`

The smoke NFT is deliberately excluded from the BidBack core manifest.

## 2. Five Distinct Wallets

| Label | Role | Transactions |
| --- | --- | --- |
| `W_OWNER` | deployer and temporary testnet owner | core deployment and smoke NFT deployment |
| `W_SELLER` | NFT seller | approval, creation, finalization, seller withdrawal |
| `W_FEE` | snapshotted fee recipient | protocol fee withdrawal |
| `W_A` | bidder A and expected winner | initial bid, step-up, NFT claim |
| `W_B` | bidder B and expected losing recipient | outbid, refund claim, reward claim |

All five addresses must be valid and pairwise distinct. Store keys only in wallets or an approved secret environment. Never put keys, seed phrases, credential-bearing RPC URLs, or wallet exports in the repository or evidence.

## 3. Funding Estimate

| Wallet | Initial target |
| --- | ---: |
| `W_OWNER` | approximately `0.05 ETH`, adjusted to at least twice the deployment gas estimate |
| `W_SELLER` | approximately `0.005 ETH` |
| `W_A` | approximately `0.035 ETH` |
| `W_B` | approximately `0.020 ETH` |
| `W_FEE` | approximately `0.002 ETH` |

The auction deposits exactly `0.045 ETH`. Before each transaction, require the transaction value plus twice the current gas estimate; the table is a planning estimate, not a fixed guarantee.

## 4. Canonical Economics

Use a two-hour auction and finish all bids during the first 30 minutes so the anti-sniping window is not entered.

| Step | Total cap | Value sent |
| --- | ---: | ---: |
| Start price | `0.010 ETH` | — |
| Bidder A initial bid | `0.012 ETH` | `0.012 ETH` |
| Bidder B outbid | `0.015 ETH` | `0.015 ETH` |
| Bidder A step-up | `0.030 ETH` | `0.018 ETH` delta |

Expected settlement under the exact snapshotted parameter profile:

```text
gross premium             0.0200 ETH
protocol fee              0.0010 ETH
net premium               0.0190 ETH
candidate distribution    0.0095 ETH
bidder B reward           0.0038 ETH
seller proceeds           0.0252 ETH
bidder B refund           0.0150 ETH
total deposits            0.0450 ETH
final escrow balance      0 ETH
```

The `0.015 ETH` refund is the losing bidder's full cap and is independent of the conditional `0.0038 ETH` reward. The positive reward is expected only for this controlled scenario; rewards can be zero in other auctions.

## 5. Prerequisites

Before any public transaction:

1. Validate the approved commit in Codespaces with the commands in section 13.
2. Complete the fresh core deployment under `docs/TESTNET_DEPLOYMENT_RUNBOOK.md` with separately approved broadcast authority.
3. Generate and validate `frontend/public/deployments/84532.json`.
4. Verify source, bytecode, owner, fee recipient, exact parameters and module wiring.
5. Configure the local frontend for Base Sepolia and keep `ENABLE_LOCAL_DEV_ACTIONS=false` or unset.
6. Confirm local-dev forms and panels are absent while wallet-signed and read-only surfaces remain available.
7. Deploy the separate valueless smoke NFT and record its address and token ID without adding it to the core manifest.
8. Confirm `ownerOf(tokenId) = W_SELLER`.
9. Record the next auction ID before creation; never assume it is `1`.

## 6. Read-Only Verifier

The verifier creates only a Viem public client. It does not import a wallet account, read a private key, sign, broadcast, or modify on-chain state.

Example from the repository root:

```text
npm run verify:base-sepolia:lifecycle -- \
  --rpc-url <BASE_SEPOLIA_RPC> \
  --manifest frontend/public/deployments/84532.json \
  --auction-id <AUCTION_ID> \
  --owner <W_OWNER> \
  --seller <W_SELLER> \
  --fee-recipient <W_FEE> \
  --bidder-a <W_A> \
  --bidder-b <W_B> \
  --nft <SMOKE_NFT> \
  --token-id 1 \
  --phase <PHASE> \
  --output <NEW_JSON_EVIDENCE_PATH>
```

The output path is optional. When supplied, it must not already exist. Supported phases are:

- `before-create`
- `after-create`
- `after-bid-a`
- `after-bid-b`
- `after-step-up`
- `after-finalize`
- `after-nft-claim`
- `after-refund`
- `after-reward`
- `after-seller-withdraw`
- `final`

The verifier must print `[OK]` for completed checks and exit non-zero with `[FAIL]`, the failed step, expected value and observed value on any divergence.

## 7. Transaction Sequence and Phase Checks

### P1 — Test-only NFT preparation

`W_OWNER` deploys `LocalERC721` through `DeployBaseSepoliaSmokeNft.s.sol`; its first token is minted to `W_SELLER`.

Expected: NFT bytecode exists and `ownerOf(1) = W_SELLER`.

### T1 — NFT approval

`W_SELLER` calls `approve(NFTVault, tokenId)`.

Expected: `getApproved(tokenId) = NFTVault`. Run `before-create`; it must also prove the derived auction ID, Base Sepolia chain lock, empty fresh escrow and seller custody.

### T2 — Create auction

`W_SELLER` calls `createAuction(nft, tokenId, 0.01 ether, 7200)`.

Run `after-create`. Expected: open auction, exact seller/NFT/token/start/duration, zero bids and participants, zero caps, exact parameter/fee/module snapshots, active NFTVault lock, NFT held by NFTVault, no extension.

### T3 — Bidder A initial bid

`W_A` calls `placeBid(auctionId, 0.012 ether)` with `0.012 ETH`.

Run `after-bid-a`. Expected: A is highest, cap A `0.012`, one participant, one bid, escrow `0.012`, no extension.

### T4 — Bidder B outbid

`W_B` calls `placeBid(auctionId, 0.015 ether)` with `0.015 ETH`.

Run `after-bid-b`. Expected: B is highest, caps A/B `0.012/0.015`, two participants, two bids, escrow `0.027`, no extension.

### T5 — Bidder A step-up

`W_A` calls `placeBid(auctionId, 0.030 ether)` with exactly `0.018 ETH`.

Run `after-step-up`. Expected: A highest at `0.030`, cap A `0.030`, cap B `0.015`, two participants, three exact bid records, escrow `0.045`, no extension.

### Wait for real expiry

Do not manipulate time. Wait until the public-chain timestamp is greater than `endTime`. The stored state can remain `OPEN` until finalization while the frontend derives `Ready to finalize`.

### T6 — Finalize

`W_SELLER` calls `finalizeAuction(auctionId)`.

Run `after-finalize`. Expected: finalized, A winner, final price `0.030`, fee `0.001`, B refund `0.015`, B entitlement and reserve `0.0038`, seller credit `0.0252`, fee credit `0.001`, escrow `0.045`.

### T7 — Winner claims NFT

`W_A` calls `claimNft(auctionId)` and then run `after-nft-claim`.

Expected: `nftClaimed=true`, lock released, NFT owned by A, escrow unchanged.

### T8 — Losing bidder claims refund

`W_B` calls `claimRefund(auctionId)` and then run `after-refund`.

Expected: refund flag true, full refund remains readable as `0.015`, escrow `0.030`.

### T9 — Losing bidder claims reward

`W_B` calls `DistributionVault.claim(auctionId)` and then run `after-reward`.

Expected: reward flag true, total claimed `0.0038`, reserve zero, escrow `0.0262`.

### T10 — Seller withdraws

`W_SELLER` calls `withdrawSellerProceeds()` and then run `after-seller-withdraw`.

Expected: seller credit zero, fee credit `0.001`, escrow `0.001`.

### T11 — Fee recipient withdraws

`W_FEE` calls `withdrawProtocolFees()` and then run `final`.

Expected: all credits and reserve zero, assigned equals claimed `0.0038`, claim flags true, NFT owned by A, escrow zero.

## 8. Evidence to Retain Later

Do not create evidence files before the public run. For the actual run retain:

- validated commit and clean-worktree status;
- tool versions and chain ID;
- public role addresses;
- public manifest plus checksum;
- deployment, P1 and T1–T11 hashes;
- receipt status, block, timestamp, from/to, gas and decoded events;
- one verifier JSON snapshot per phase;
- explorer links and redacted screenshots;
- retry/anomaly notes;
- read-only simulations showing duplicate NFT, refund, reward and withdrawal actions revert.

EOA balance deltas include gas and are supporting evidence only. Contract state, receipts and events are authoritative for the accounting checks.

## 9. Stop Conditions

Stop before funds if chain, manifest, bytecode, source, owner, fee recipient, wiring, exact parameters, pause state, NFT ownership, role separation or frontend boundary is wrong.

Stop new economic actions if any cap, delta, highest bidder, count, custody field, extension, settlement amount, refund, reward, credit or escrow balance differs from the expected phase. Preserve the failing snapshot and transaction receipt.

## 10. Safe Recovery

- Approval only: revoke approval if abandoning the run.
- Auction with no bids: wait for expiry, finalize, and let the seller reclaim the NFT.
- Auction with deposits: do not abandon funds; wait for expiry, finalize and execute the legitimate exit claims.
- Never overwrite the manifest or evidence to conceal a failed run.
- Use global pause only after an explicit incident decision; it blocks creation and bidding but must not block exits.
- A recovered anomalous run is evidence for diagnosis, not a successful canonical smoke.

## 11. Frontend Boundary

For Base Sepolia:

- local-dev forms and `AuctionDevActions` must not render;
- `/api/dev/*` remains server-disabled;
- wallet-signed create, bid, finalize, claim and withdrawal controls remain available;
- read-only pages remain available without a wallet;
- no copy may describe the configured Base Sepolia RPC as a local Anvil RPC;
- public participant economics comes from bounded `getParticipants(auctionId)` reads, not Anvil account keys.

## 12. Go / No-Go

Proceed only when every prerequisite and pre-funded check passes. Do not describe Base Sepolia as fully validated until T11, the final verifier snapshot, duplicate simulations and evidence review all succeed.

## 13. Validation Before the Public Run

Windows:

```powershell
cd C:\Users\Vibe\Code\BidBack
npm --prefix frontend run test:base-sepolia-verifier
npm --prefix frontend run test
npm --prefix frontend run typecheck
npm --prefix frontend run build
```

Codespaces:

```bash
cd /workspaces/BidBack
forge test -vv
npm --prefix frontend run test:base-sepolia-verifier
npm --prefix frontend run test
npm --prefix frontend run typecheck
npm --prefix frontend run build
npm run smoke:local:lifecycle
```

Passing Anvil proves the local deterministic lifecycle only. Passing this Base Sepolia run proves one canonical public multi-wallet execution only; neither is a production-readiness claim.
