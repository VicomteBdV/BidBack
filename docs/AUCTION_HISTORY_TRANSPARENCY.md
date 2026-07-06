# Auction History Transparency

BidBack now exposes a read-only `Bid history / Auction transparency` panel on each auction detail page.

This document describes what the MVP panel verifies, where the data comes from, and what remains outside the current read model.

---

## Scope

The panel is read-only.

It does not send transactions, does not call `/api/dev/*`, does not use server-held private keys, and does not modify auction state.

It is intended to help users inspect:

- bid history;
- bidder addresses;
- bid amounts;
- transaction hashes when logs are available;
- block numbers and timestamps when the RPC exposes them;
- highest bid;
- final price;
- seller proceeds;
- protocol fees;
- distribution reserve;
- visible refund / reward values already available from the existing read model;
- NFT claimed state.

---

## Data Sources

The history reader uses two complementary sources.

### AuctionHouse Bid Records

`AuctionHouse.getBidCount(auctionId)` and `AuctionHouse.getBid(auctionId, index)` are the primary source for the bid table.

They provide deterministic on-chain bid records:

- bidder;
- cap amount;
- auction timestamp.

This path does not depend on event log availability.

### Event Logs

The reader also attempts to read logs for:

- `AuctionCreated`;
- `BidPlaced`;
- `AuctionExtended`;
- `AuctionEnded`;
- `AuctionFinalized`;
- `NFTClaimed`;
- `RefundClaimed`;
- `DistributionOpened`;
- `DistributionClaimed`.

Logs enrich the UI with transaction hashes, block numbers, and timeline entries.

If log reads fail because of RPC limits or provider behavior, the panel remains usable with direct bid records and already loaded auction economics.

---

## Economic Transparency

The panel displays settlement values that are already available from the existing read-only auction detail model:

- highest bidder / winner;
- highest bid;
- final price;
- seller proceeds;
- protocol fees;
- distribution reserve;
- total assigned rewards;
- total claimed rewards;
- visible configured refunds;
- visible configured reward entitlements;
- NFT claimed state.

`visible configured refunds` and `visible configured reward entitlements` are intentionally labeled as visible/configured values. In the local MVP they are derived from the configured demo bidder accounts already used by the existing economic state panel. They should not be treated as a complete production index of every participant until a persistent event/indexing layer exists.

---

## Known Limits

The MVP history panel is not a production indexer.

Known limits:

- RPC providers can restrict log range reads;
- event timestamps depend on successful block reads;
- seller proceeds withdrawals and protocol fee withdrawals are not currently tied to a specific auction by event arguments;
- complete participant-level historical reporting still needs a production indexer or richer event schema;
- the panel limits bid records and timeline events to bounded reads for MVP safety;
- the read model is suitable for local MVP and controlled testnet smoke tests, not high-volume production analytics.

Settlement-critical values should continue to be verified through direct on-chain reads.

---

## Future Work

Before production-scale usage, BidBack should define an indexed read model for:

- complete bid history pagination;
- auction finalization history;
- claim and withdrawal history;
- participant-level refund and reward states;
- seller and protocol fee withdrawal attribution;
- stale indexer detection;
- fallback behavior when RPC logs are unavailable.

This future indexer must remain a read layer only. It must not make claims, refunds, rewards, or settlement depend on opaque off-chain computation.
