# Auction Economic Transparency

BidBack now exposes a read-only `Economic transparency / Settlement breakdown` panel on each auction detail page.

The panel is a verification aid for the MVP. It is not a financial product view, not a yield view, and not a production accounting indexer.

---

## Scope

The panel helps users inspect the economic state of a specific auction:

- current highest bid;
- final price, once finalized;
- seller proceeds;
- protocol fees;
- seller withdrawable credit;
- protocol fee recipient withdrawable credit;
- visible refund amounts for configured/readable wallets;
- visible reward entitlements for configured/readable wallets;
- redistribution status;
- distribution reserve;
- total assigned rewards;
- total claimed rewards;
- seller;
- winner / highest bidder;
- NFT claimant;
- fee recipient snapshot;
- key auction economic parameter snapshot values.

The panel is read-only. It does not send transactions and does not call `/api/dev/*`.

---

## Data Sources

The panel uses values already available through the auction detail read model.

Primary sources:

- `AuctionHouse.getAuction(auctionId)` for auction status, seller, highest bid, winner, and NFT claim state;
- `AuctionHouse.getAuctionParams(auctionId)` for the auction-specific parameter snapshot;
- `AuctionHouse.getAuctionFeeRecipient(auctionId)` for the fee recipient snapshot;
- `EscrowVault.settlements(auctionId)` for final price, seller proceeds, protocol fees, and distribution reserve;
- `EscrowVault.sellerCredits(seller)` for seller withdrawable credit;
- `EscrowVault.protocolFeeCredits(feeRecipient)` for protocol fee recipient credit;
- `EscrowVault.refundableAmount(auctionId, bidder)` for visible configured bidder refunds;
- `DistributionVault.distributions(auctionId)` for assigned and claimed rewards;
- `DistributionVault.entitlementOf(auctionId, bidder)` for visible configured bidder reward entitlements.

No smart contract change is required for this panel.

---

## Status Semantics

The panel distinguishes values by status:

- `Known`: the value was read or derived from already loaded contract reads;
- `Pending`: the auction has not reached the lifecycle step where the value exists;
- `Not applicable`: the value does not apply, for example a finalized auction with no bids;
- `Unavailable`: the read model could not retrieve the value.

Amounts are serialized as strings before reaching the client. No `bigint` is exposed in JSON responses.

---

## Economic Invariants

The panel reinforces core BidBack rules:

- refunds do not depend on redistribution;
- losing bidders' refundable caps must not fund rewards;
- rewards are conditional;
- rewards can be zero;
- rewards are not guaranteed;
- protocol fees are credited to the fee recipient snapshot captured when the auction was created;
- displayed parameter values are the auction snapshot, not necessarily the current global parameters.

The UI must not describe rewards as yield, income, interest, or guaranteed return.

---

## Known Limits

The MVP panel is not a production accounting indexer.

Known limits:

- visible refunds and rewards are limited to wallets currently readable through the MVP detail model;
- full participant-level reporting still needs an indexer or a richer event/read model;
- seller and protocol fee withdrawals are visible as current credits, not full historical accounting;
- external RPC failures can make some fields unavailable;
- the panel is suitable for local MVP and controlled testnet smoke tests, not high-volume reporting.

Settlement-critical values should continue to be verified through direct on-chain reads.

---

## Future Work

Before production-scale usage, BidBack should define a dedicated economic reporting/indexing model for:

- all bidder caps;
- all refund claim states;
- all reward entitlements and claims;
- seller proceeds attribution;
- protocol fee attribution;
- withdrawal history;
- stale read detection;
- pagination and historical exports.

This reporting layer must remain read-only and must not make settlement or claims depend on opaque off-chain computation.
