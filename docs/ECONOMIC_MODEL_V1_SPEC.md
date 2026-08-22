# BidBack Economic Model V1 — Solidity Baseline Specification

**Specification version:** `1.0.0-draft`

**Baseline:** the Solidity implementation present when Lot A was created.

## 1. Scope and Authority

This document specifies the current BidBack auction economics before any Python simulator, parameter recommendation, or alternative scoring model exists. Solidity is authoritative. The fixtures under `economic-model/fixtures/` are traceable test vectors, not an independent implementation.

This specification covers bidding, cap deposits, final price, premium, protocol fee, redistribution eligibility, candidate pool, losing-bidder scoring, reward allocation, refunds, seller proceeds, rounding, snapshots, and conservation. It does not claim that the current formula is economically optimal, manipulation-resistant, or production-ready.

The authoritative code paths are:

| Behavior | Solidity authority |
| --- | --- |
| Creation and parameter/module/fee snapshots | [`AuctionHouse.createAuction`](../src/AuctionHouse.sol) |
| Bid validation, cap update, interaction count and anti-sniping | [`AuctionHouse.placeBid`](../src/AuctionHouse.sol) |
| Minimum bid ceil | [`AuctionHouse.minimumNextBid`](../src/AuctionHouse.sol) |
| Settlement order, premium and fee | [`AuctionHouse.finalizeAuction`](../src/AuctionHouse.sol) |
| Candidate pool | [`AuctionHouse._candidateDistributionPool`](../src/AuctionHouse.sol) |
| Score collection, normalization and reward caps | [`AuctionHouse._buildDistribution`](../src/AuctionHouse.sol) |
| EF, ET, II, weighted score and reputation | [`AuctionHouse._score`](../src/AuctionHouse.sol), [`_financialEngagement`](../src/AuctionHouse.sol), [`_timeEngagement`](../src/AuctionHouse.sol), [`_interactionIntensity`](../src/AuctionHouse.sol) |
| Exact cap delta deposits | [`EscrowVault.depositCap`](../src/EscrowVault.sol) |
| Seller proceeds and settlement reserve | [`EscrowVault.finalizeSettlement`](../src/EscrowVault.sol) |
| Refunds | [`EscrowVault.refundableAmount`](../src/EscrowVault.sol), [`claimRefund`](../src/EscrowVault.sol) |
| Reward entitlements and claims | [`DistributionVault.openDistribution`](../src/DistributionVault.sol), [`claim`](../src/DistributionVault.sol) |
| Parameter defaults and bounds | [`ParamsController`](../src/ParamsController.sol) |
| Reputation defaults and bounds | [`ReputationAdapter`](../src/ReputationAdapter.sol) |

`test/harness/AuctionHouseEconomicHarness.sol` only exposes these inherited internal functions or calls the real production path. It contains no copied EF, ET, II, scoring, pool, or allocation formula.

## 2. Units and Arithmetic

- ETH accounting unit: integer wei.
- Time unit: integer seconds.
- Basis-point denominator: `BPS = 10_000`.
- Score scale: `SCALE = 1e18`.
- Arithmetic is Solidity `uint256` arithmetic unless a smaller stored type is named.
- Division truncates toward zero; because every economic operand is non-negative, this is floor division.
- Solidity 0.8 checked arithmetic reverts on overflow or underflow.
- The baseline must preserve the exact order of multiplication, division, capping, and rounding. Algebraically equivalent real-number expressions may not be wei-equivalent.

Fixture monetary and score values are decimal strings representing integers. JSON floating-point values are forbidden.

## 3. Auction and Bid Order

Let:

- `S` be `startPrice` in wei;
- `H_j` be the highest bid after valid bid `j`;
- `C_i` be bidder `i`'s latest maximum cap;
- `C_i_prev` be that bidder's prior cap;
- `B = 10_000` and `Q = 1e18`.

### 3.1 Minimum bid

Before any bid:

```text
minimumBid = 1 wei    when startPrice == 0
minimumBid = startPrice otherwise
```

After a highest bid `H`:

```text
increment = floor((H * minBidIncrementBps + B - 1) / B)
minimumNextBid = H + increment
```

This is a ceil of `H * minBidIncrementBps / B`. The explicit `+ B - 1` occurs before division and is part of the authoritative rounding order.

### 3.2 Cap and deposit delta

A valid bid requires:

```text
newCap >= minimumNextBid
newCap > previousCapForBidder
msg.value == newCap - previousCapForBidder
```

The escrow stores the new cap, not the cumulative sum of submitted transaction values. Step-ups deposit only the delta.

### 3.3 Highest bid and final price

Every valid bid becomes the new highest bid. At finalization with at least one bid:

```text
winner = highestBidder
finalPrice = highestBid = winner.maxCap
```

This is not a second-price auction and there is no automatic proxy-bidding calculation.

## 4. Trace Attribution Metrics

Lot A defines two mechanical trace metrics for future experiments. Neither is causal.

For bid `j`:

```text
observedPriceLift_j = H_j - H_(j-1)
```

where `H_0` is the trace's pre-bid highest bid, normally zero.

```text
premiumLift_j = max(H_j - max(H_(j-1), startPrice), 0)
```

For a valid completed trace:

```text
sum(premiumLift_j) = grossPremium
```

`observedPriceLift` and `premiumLift` are mechanical attributions from the observed trace. They do not show what the price would have been without a bidder or bid. Any future causal contribution metric must define an explicit matched counterfactual and behavioral assumptions.

## 5. Premium, Fee and Candidate Pool

For a final price `F`:

```text
grossPremium = max(F - S, 0)
```

```text
feeAmount = 0                                      when grossPremium == 0
feeAmount = floor(grossPremium * bidbackFeeBps / B) otherwise
```

```text
netPremium = grossPremium - feeAmount
```

The current contracts contain no additional configured-cost deduction.

Redistribution is eligible only when all three conditions hold:

```text
netPremium >= minPremiumNet
participantCount >= minParticipants
initialEndTime - startTime >= minAuctionDuration
```

The duration condition is redundant for normally created auctions because `createAuction` already enforces the same snapshotted minimum.

When eligible:

```text
candidatePoolRaw = floor(netPremium * redistributionBps / B)
candidatePool = min(candidatePoolRaw, netPremium)
```

Otherwise `candidatePool = 0`. The final min is defensive but redundant under the current validation bound `redistributionBps <= B`.

## 6. Losing-Bidder Score

The winner is skipped before scoring and cannot receive a distribution entitlement.

**Current reward score is not a direct measure of marginal price contribution.** It is a weighted combination of the bidder's maximum cap relative to the final price, the exposure implied by the first bid time, and the count of times the bidder overtook another current leader, followed by a reputation multiplier. It does not compare the final price to a counterfactual auction without that bidder, and it does not use `observedPriceLift` or `premiumLift` directly.

### 6.1 Financial engagement (EF)

For losing bidder `i`:

```text
cappedCap_i = min(maxCap_i, finalPrice)
ratio_i = floor(cappedCap_i * Q / finalPrice)
EF_i = min(floor(ratio_i * ratio_i / Q), efCap)
```

If `finalPrice == 0` or `maxCap_i == 0`, `EF_i = 0`.

For an ordinary loser `maxCap_i < finalPrice`, so EF is approximately the squared cap/final-price ratio. Both the ratio and square divisions floor independently.

### 6.2 Time engagement (ET)

Let `firstBidTime_i`, `startTime`, and `initialEndTime` be integer timestamps.

ET is zero when:

- `firstBidTime_i == 0`;
- `firstBidTime_i >= initialEndTime`; or
- `initialEndTime - firstBidTime_i < minExposure`.

Otherwise:

```text
exposure_i = initialEndTime - firstBidTime_i
initialDuration = initialEndTime - startTime
ET_i = min(floor(exposure_i * Q / initialDuration), etCap)
```

ET uses the initial end time. Anti-sniping can extend `endTime`, but it does not extend the ET measurement window. A bidder whose first bid occurs after `initialEndTime` during an extension receives `ET = 0`.

### 6.3 Interaction intensity (II)

`significantOverbids_i` increases when bidder `i` submits a valid bid while another bidder is currently highest. It does not increase for the first auction bid or a step-up by the current leader.

```text
cappedInteractions_i = min(significantOverbids_i, maxInteractionCount)
II_i = min(floor(cappedInteractions_i * Q / maxInteractionCount), iiCap)
```

If `significantOverbids_i == 0`, `II_i = 0`. The stored counter saturates at `uint16.max` before this formula is applied.

### 6.4 Weighted score and reputation

```text
weightedScore_i = floor(
    (alphaBps * EF_i + betaBps * ET_i + gammaBps * II_i) / B
)
```

The parameter validator requires:

```text
alphaBps > betaBps
betaBps >= gammaBps
alphaBps + betaBps + gammaBps == B
```

The final score is:

```text
finalScore_i = floor(weightedScore_i * reputationBps_i / B)
```

Default reputation is `10_000`; stored values are bounded to `5_000..15_000`.

The `ReputationAdapter` address is snapshotted at auction creation, but `reputationBps_i` is read live at scoring/finalization. A reputation update after creation and before finalization can therefore change reward normalization.

## 7. Normalization and Allocation

Let:

```text
totalScore = sum(finalScore_i for every loser)
perUserCap = floor(candidatePool * perUserRewardCapBps / B)
```

If `candidatePool == 0` or `totalScore == 0`, no reward is assigned.

For each positive-score loser:

```text
rawReward_i = floor(candidatePool * finalScore_i / totalScore)
reward_i = min(rawReward_i, perUserCap)
```

An allocation that floors to zero is omitted. The allocation loop does not redistribute amounts removed by a per-user cap and does not redistribute integer dust.

```text
assignedDistribution = sum(reward_i)
assignedDistribution <= candidatePool <= netPremium
```

The distribution vault records only `assignedDistribution`. The escrow reserves only that assigned amount.

With one positive-score loser and `perUserRewardCapBps = 4_000`, the raw reward is the whole candidate pool and the actual reward is exactly 40% of that pool. Consequently, the canonical Anvil and Base Sepolia cases prove settlement values but do not discriminate EF, ET, or II formulas.

## 8. Seller Proceeds, Refunds and Remainder

```text
sellerProceeds = finalPrice - feeAmount - assignedDistribution
```

The difference:

```text
candidatePool - assignedDistribution
```

is not reserved. It remains economically part of seller proceeds. Sources include reward caps, zero scores, zero-rounded rewards, and proportional-allocation dust.

For bidder `i` after settlement:

```text
refund_i = maxCap_i                         when i is not winner
refund_i = max(maxCap_i - finalPrice, 0)    when i is winner
```

In the current AuctionHouse path `winner.maxCap == finalPrice`, so the winner refund is normally zero. `EscrowVault` independently supports a surplus for other authorized settlement inputs.

Refunds do not depend on reward eligibility, score, entitlement, or claim order.

## 9. No-Bid Path

When there is no highest bidder, `finalizeAuction` marks the auction finalized and emits a zero-value finalization event, then returns before opening a distribution or creating an escrow settlement. No ETH liability exists. The seller becomes the NFT claimant and pulls the NFT from `NFTVault`.

## 10. Snapshots and Mutable State

At auction creation, `AuctionHouse` snapshots:

- the complete `ParamsController.Params` value;
- NFT, escrow, distribution, and reputation module addresses;
- the fee recipient.

Later global parameter, module, or fee-recipient updates do not affect the existing auction.

Not snapshotted:

- `ParamsController.paused`, which remains a global create/bid gate;
- bidder reputation values stored inside the snapshotted adapter.

Pause does not enter the economic formulas and does not block finalization or exits.

## 11. Conservation and Solvability

For each bidder, cap deposits are monotone and each deposit is the exact cap delta. Therefore, before claims:

```text
totalDeposits = sum(maxCap_i)
```

For a settled auction:

```text
totalDeposits
= sum(loserRefund_i)
 + winnerSurplusRefund
 + sellerProceeds
 + feeAmount
 + assignedDistribution
```

Because:

```text
sellerProceeds + feeAmount + assignedDistribution = finalPrice
```

and:

```text
sum(refunds) = sum(loserCaps) + winnerCap - finalPrice
```

the liabilities equal deposits exactly.

Additional executable invariants:

- `feeAmount <= grossPremium`;
- `candidatePool <= netPremium`;
- `assignedDistribution <= candidatePool`;
- each reward is no greater than `perUserCap`;
- `totalClaimed <= totalAssigned`;
- `distributionReserve = totalAssigned - totalClaimed` while claims succeed;
- full losing refunds remain available independently of rewards;
- winner has no distribution entitlement;
- only assigned distribution, not the candidate pool, reduces seller proceeds;
- all completed claims can reduce isolated auction liabilities to zero.

`EscrowVault` pools ETH for multiple auctions and aggregate seller/fee credits. A future simulator must track per-auction liabilities and global vault solvency separately when modeling concurrent auctions.

## 12. Configurable Parameters

| Parameter | Current default | Runtime role |
| --- | ---: | --- |
| `bidbackFeeBps` | `500` | Fee on gross premium |
| `redistributionBps` | `5000` | Candidate pool fraction |
| `minParticipants` | `2` | Pool eligibility; includes winner |
| `alphaBps/betaBps/gammaBps` | `6000/3000/1000` | EF/ET/II weights |
| `minBidIncrementBps` | `500` | Next-bid minimum |
| `perUserRewardCapBps` | `4000` | Individual reward cap |
| `maxParticipants` | `64` | Participant bound |
| `maxInteractionCount` | `5` | II saturation |
| `minAuctionDuration` | `3600` | Creation and pool threshold |
| `antiSnipeWindow` | `600` | Extension trigger window |
| `antiSnipeExtension` | `600` | Extension duration |
| `maxAntiSnipeExtensions` | `6` | Extension count bound |
| `minExposure` | `300` | Minimum positive ET exposure |
| `minPremiumNet` | `0.01 ether` | Pool threshold |
| `efCap/etCap/iiCap` | `1e18/1e18/1e18` | Component caps |

Reputation is separately configurable per address in the adapter.

## 13. Structural Bounds

- fee ≤ 2,000 bps;
- redistribution ≤ 10,000 bps;
- minimum participants ≥ 2;
- maximum participants between the minimum and 256;
- minimum bid increment in `1..10_000` bps;
- per-user cap in `1..10_000` bps;
- non-zero maximum interaction count and minimum duration;
- non-zero anti-sniping window/extension;
- at most 20 extensions;
- `minExposure <= minAuctionDuration`;
- component caps in `1..1e18`;
- at most 256 distribution recipients;
- reputation in `5_000..15_000` when explicitly stored.

These bounds require Solidity changes to widen or reinterpret, even though values inside them are configurable.

## 14. Algorithmic Structure

The following are algorithmic rather than parameter-only choices:

- highest cap becomes final price;
- full-cap custody and delta step-ups;
- full refunds for losing caps;
- fee derived only from gross premium;
- candidate pool derived only from net premium;
- winner exclusion;
- squared cap/final-price EF;
- first-bid/initial-end ET;
- takeover-count II;
- linear EF/ET/II weighting followed by reputation;
- proportional score normalization;
- per-user cap without reallocation;
- unassigned remainder retained by seller;
- live reputation at finalization;
- identity count used as participant count.

Changing any of these requires a separately approved Solidity design and implementation lot.

## 15. Desired but Not Guaranteed Properties

The current implementation guarantees accounting constraints, not the following economic properties:

- reward tracks causal contribution to the final price;
- reward is bounded by `observedPriceLift` or `premiumLift`;
- truthful bidding is optimal;
- deliberate losing is irrational;
- identity splitting is neutral;
- collusion is unprofitable;
- timing and interaction scores represent external economic value;
- reputation cannot be manipulated before finalization;
- the candidate pool is fully utilized;
- higher redistribution increases seller revenue through participation;
- BidBack causally increases participation or price discovery;
- rewards are fair by valuation, opportunity cost, or bidder rank.

These are experiment questions, not baseline claims.

## 16. Coalition-Aware Adversarial Standard

Future adversarial work will use this standard:

> No actor or coordinated group should obtain, through the BidBack mechanism, a positive net advantage that is nearly risk-free and lacks sufficient external economic contribution.

Attack advantage must be measured against a matched reference:

```text
attackAdvantage
= utility_coordinated_with_BidBack
 - utility_matched_reference
```

Absolute coalition profit alone is insufficient because the coalition may have earned or transferred value in the matched auction without BidBack. Lot A defines only this standard; it implements no attacker, bidder strategy, utility engine, or alternative model.

## 17. Golden-Vector Policy

Every fixture vector has:

```text
id
description
sourceTest
inputs
params
participants
bidTrace
expected
```

The top-level fixture object has `schemaVersion`. Non-applicable or unproven values are `null`.

Fixture roles:

- `golden-v1.json`: scoring-component and scoring-discriminating vectors;
- `canonical-anvil.json`: canonical local settlement vector;
- `canonical-base-sepolia.json`: retained public settlement facts, with unproven timing and scoring explicitly null;
- `edge-cases.json`: no-bid, threshold, zero-score, rounding, extension and overflow vectors.

The Solidity tests named by `sourceTest` assert the authoritative expected values. A future Python baseline must consume the fixtures and match them exactly, but the JSON files do not override the Solidity behavior.

## 18. Canonical Settlement vs Scoring Evidence

The Anvil and Base Sepolia canonical vectors validate:

- bids, caps and step-up deltas;
- final price;
- premium, fee and net premium;
- candidate and assigned distribution;
- full refund;
- seller proceeds;
- final liabilities and solvability.

They do not prove EF/ET/II parity. Each has one loser and a 40% per-user cap, so any positive loser score produces the same capped reward. Scoring parity is instead established by dedicated component vectors and multi-loser vectors in `golden-v1.json`, including uncapped unequal allocations, cap-active allocations, zero scores, live reputation, and integer dust.
