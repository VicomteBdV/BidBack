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
- bid transaction hashes only when the complete bid event sequence is verified;
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

The bid table preserves the exact `getBid` index and uses descending pages with an exclusive decimal `before` cursor. Each request reads at most 200 records, returned in ascending index order. The initial page contains the latest records. For 205 bids, it returns indices 5–204 and `nextBefore: "5"`; requesting `?before=5` returns 0–4. For 450 bids, pages contain 250–449, 50–249, then 0–49.

`GET /api/auctions/[auctionId]/history` retains its existing response fields and adds:

| Field | Meaning |
| --- | --- |
| `totalBidCount` | Decimal on-chain count observed for this request, or `null` if unavailable. |
| `bidsAvailable` | Whether the entire requested canonical page was read successfully. |
| `returnedBidCount` | Number of canonical records in this server response, at most 200. |
| `hasMoreBids` | Whether canonical indices precede this successful page. |
| `nextBefore` | Exclusive index for the next earlier page, or `null`. |

These additive fields are optional in the frontend type for compatibility with older loaded responses; the updated reader always emits them. Cursors use `bigint` throughout index arithmetic. They must be canonical unsigned decimal strings within uint256 and cannot exceed the current bid count. Malformed, duplicate, negative, or out-of-range `before` parameters receive HTTP 400 with a controlled message. Zero is a valid terminal cursor.

For an earlier page, the history reader performs one count read and at most 200 sequential `getBid` reads, with no event queries or event-timestamp block reads. The API also retains its existing `readAuctionById` validation and transparency reads, including `getBlock(latest)`; the history-reader bound is not a bound of 201 RPC calls for the entire HTTP request. A failed earlier page returns a controlled HTTP 503 and does not advance its cursor. Initial canonical-read failure retains available timeline entries, marks `bidsAvailable: false`, and never synthesizes canonical bid indices from event positions.

The panel merges earlier pages by canonical index, removes overlaps, and keeps the initial event timeline and warnings. Its loaded/total counter retains the initial view's count until refresh; bids appended afterward appear after refresh. Exclusive indices keep older pages stable when new bids arrive. Counts, bids, and logs are separate reads, so this is not a blockchain snapshot guarantee. Refresh replaces accumulated pages and their cursor together. Failed pagination keeps loaded records and enables the same action for retry; navigation and late responses cannot mix auction identities.

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

Logs supply timeline entries. Bid transaction hashes, block numbers, and log indices are attached only when the initial canonical history fits in one page (at most 200 bids), the complete returned `BidPlaced` sequence has exactly the canonical count, and the entire chronologically sorted sequence matches auction ID, bidder, amount, and canonical ordinal index. Ordering must use real block numbers and safe log indices, with no removed logs or duplicate block/log positions. Valid hashes are also required. Reversed RPC delivery is sorted before comparison.

Partial, mismatched, unavailable, or ambiguous sequences omit all bid transaction metadata and add a warning. Histories over 200 bids and earlier pages deliberately omit this metadata rather than make an unverified positional match. The table displays `Transaction unavailable`. Timeline transaction links describe their own event log and do not establish a canonical bid index.

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
- the event timeline retains only the earliest 250 returned logs, independently of canonical bid pagination; loading earlier bids never extends it;
- truncation and event-read errors are both reported when they occur together;
- retained event data is bounded (at most 250 per event type before the combined 250-entry timeline), bid verification retains at most 200 events, and block timestamps use at most eight concurrent reads;
- the initial request still uses the existing nine event queries from block 0 to latest; provider range restrictions and large raw RPC responses remain possible, and retained-memory limits do not bound the provider response itself;
- seller proceeds withdrawals and protocol fee withdrawals are not currently tied to a specific auction by event arguments;
- complete participant-level historical reporting still needs a production indexer or richer event schema;
- bid records are available through explicit bounded pages; exhaustive event, claim, and withdrawal history remains outside this read model;
- the read model is suitable for local MVP and controlled testnet smoke tests, not high-volume production analytics.

Settlement-critical values should continue to be verified through direct on-chain reads.

---

## Future Work

Before production-scale usage, BidBack should define an indexed read model for:

- indexed bid transaction metadata for histories spanning multiple canonical pages;
- complete event timeline pagination;
- auction finalization history;
- claim and withdrawal history;
- participant-level refund and reward states;
- seller and protocol fee withdrawal attribution;
- stale indexer detection;
- fallback behavior when RPC logs are unavailable.

This future indexer must remain a read layer only. It must not make claims, refunds, rewards, or settlement depend on opaque off-chain computation.
