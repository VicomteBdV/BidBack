# Post-Deployment Verification

This document defines the read-only checks required after a controlled Base Sepolia deployment and during its canonical smoke. It does not authorize a broadcast or transaction.

## 1. Deployment Manifest

Validate `frontend/public/deployments/84532.json`:

```text
npm run validate:deployment -- 84532
```

Expected:

- `chainId` is exactly `84532`;
- all six core addresses are valid and non-zero;
- no `localNft` is present;
- addresses match the reviewed Foundry broadcast;
- the file checksum is recorded for later evidence.

## 2. Deployment-Level On-Chain Checks

Run after explicit RPC authorization:

```text
EXPECTED_OWNER=<W_OWNER> \
EXPECTED_FEE_RECIPIENT=<W_FEE> \
BIDBACK_RPC_URL=<Base Sepolia RPC> \
npm run verify:deployment:onchain -- 84532
```

This verifies chain ID, bytecode presence, readable non-zero owners, expected owner, global fee recipient, parameter sanity and deployment-level module wiring.

Human review must additionally confirm:

- every deployed source and constructor argument on BaseScan;
- source commit and compiler settings;
- every deployment, wiring and ownership receipt;
- exact parameter values, not only sanity bounds;
- `paused=false`;
- no unexpected existing credits or activity in the fresh deployment.

## 3. Exact Core Configuration

All six `owner()` values must equal `W_OWNER`. `AuctionHouse.feeRecipient()` must equal `W_FEE`.

The five AuctionHouse module getters must match the manifest. Each of `NFTVault`, `EscrowVault` and `DistributionVault` must point back to the same `AuctionHouse`.

Required exact parameter profile:

| Parameter | Expected |
| --- | ---: |
| `bidbackFeeBps` | 500 |
| `redistributionBps` | 5000 |
| `minParticipants` | 2 |
| `alphaBps / betaBps / gammaBps` | 6000 / 3000 / 1000 |
| `minBidIncrementBps` | 500 |
| `perUserRewardCapBps` | 4000 |
| `maxParticipants` | 64 |
| `maxInteractionCount` | 5 |
| `minAuctionDuration` | 3600 |
| `antiSnipeWindow / extension / max` | 600 / 600 / 6 |
| `minExposure` | 300 |
| `minPremiumNet` | 0.01 ETH |
| `efCap / etCap / iiCap` | 1e18 / 1e18 / 1e18 |

## 4. Test-Only NFT

The smoke NFT is external to BidBack core and absent from the manifest. Verify its bytecode, `ownerOf(tokenId) = W_SELLER`, approval target before creation, NFTVault custody after creation and winner ownership after claim.

Metadata availability is optional and must never affect custody or settlement checks.

## 5. Lifecycle Verifier

`frontend/scripts/verify-base-sepolia-lifecycle.mjs` is chain-locked to `84532` and creates only a public client. It requires explicit RPC, manifest, auction, NFT and five public role inputs. It never reads a private key or signs a transaction.

Run it after each phase described in `BASE_SEPOLIA_SMOKE_TEST.md`. The verifier checks:

- manifest and all core bytecodes;
- all owners, fee recipient, pause state and exact parameters;
- deployment and auction module wiring;
- auction parameter and fee recipient snapshots;
- seller, NFT, token ID, duration and start price;
- bounded participant list and three bounded bid records;
- caps, highest bidder, participant and bid counts;
- zero anti-sniping extensions;
- NFT custody and lock flags;
- settlement, refunds, reward entitlements, claim flags and credits;
- distribution reserve, assigned/claimed totals and escrow link;
- exact escrow balance for the selected phase.

An optional output path creates a JSON snapshot with exclusive-create semantics. Never overwrite a prior phase snapshot.

## 6. Canonical Phase Matrix

| Phase | Key expected state |
| --- | --- |
| `before-create` | derived next ID, seller owns NFT, fresh escrow zero |
| `after-create` | open, custody locked, no participants or bids |
| `after-bid-a` | A cap/highest 0.012, escrow 0.012 |
| `after-bid-b` | B highest 0.015, two participants, escrow 0.027 |
| `after-step-up` | A highest/cap 0.030, three bids, escrow 0.045 |
| `after-finalize` | fee 0.001, reward/reserve 0.0038, seller 0.0252, refund B 0.015 |
| `after-nft-claim` | NFT owned by A, lock released |
| `after-refund` | B refund claimed, escrow 0.030 |
| `after-reward` | B reward claimed, reserve zero, escrow 0.0262 |
| `after-seller-withdraw` | seller credit zero, escrow 0.001 |
| `final` | fee credit zero, escrow zero, assigned equals claimed |

## 7. Duplicate-Action Diagnostics

After the final state, use read-only simulations at a recorded block to confirm duplicate NFT claim, refund claim, reward claim, seller withdrawal and protocol fee withdrawal revert. Do not send intentionally reverting public transactions merely to obtain a hash.

## 8. Failure Policy

Any `[FAIL]`, missing field, RPC chain mismatch, unexpected extension, stale manifest, zero bytecode, source mismatch or economic divergence invalidates the canonical run. Preserve the JSON and receipt, stop new bids, and follow the safe recovery procedure in `BASE_SEPOLIA_SMOKE_TEST.md`.

## 9. Evidence Review

Before changing product status, a reviewer must reconcile:

- manifest and verified source addresses;
- P1 and T1–T11 receipts;
- all phase JSON snapshots;
- expected and observed accounting totals;
- NFT final owner;
- zero final credits, reserve and escrow balance;
- duplicate-action simulations;
- absence of secrets and `/api/dev/*` usage.

Only then may status documentation record one dated canonical Base Sepolia multi-wallet lifecycle. It must not imply production readiness or guaranteed rewards.

## 10. Local/Public Distinction

`npm run smoke:local:lifecycle` is deterministic Anvil validation on `31337`, with controllable time and known valueless development accounts. The Base Sepolia verifier is read-only and observes real public-chain time and transactions. Neither result substitutes for the other.
