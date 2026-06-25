# BidBack

BidBack is a Web3 NFT auction marketplace focused on reducing bidder frustration through conditional redistribution of value created during an auction.

It is not a gambling product, not a lending protocol, not a derivative product, and not a financial product. BidBack must never present guaranteed yield or remove auction risk.

## MVP Scope

The MVP covers:

- Existing ERC-721 NFTs only
- English auctions
- Deterministic anti-sniping extensions
- On-chain custody of NFTs and ETH
- Step-up-only bidder caps
- Pull-based NFT, refund, proceeds, fee, and redistribution claims
- On-chain, deterministic redistribution scoring
- Non-blocking reputation multiplier

Out of scope:

- Minting
- Lending
- Leverage
- Guaranteed yield
- Derivatives
- Heavy KYC

## Economic Model

The seller sets the starting price.

The final price is the highest valid bid cap.

```text
gross premium = final price - starting price
protocol fee = fixed percentage of gross premium
net premium = gross premium - protocol fee
candidate redistribution pool = fixed percentage of net premium
```

No protocol fee is charged when there is no premium.

Redistribution only opens when all conditions are met:

- Net premium is above the configured threshold
- Minimum participant count is reached
- Initial auction duration is above the configured threshold

Rewards are capped per user and can never exceed the available net premium. If caps leave part of the candidate pool unassigned, the unassigned amount remains seller proceeds. The system never funds redistribution from losing bidders' refundable caps.

## Redistribution Score

The MVP uses an on-chain composite score:

```text
SCR_i = (alpha * EF_i + beta * ET_i + gamma * II_i) * R_i
```

Where:

- `EF` is capped financial engagement, based on maximum cap proximity to the final price
- `ET` is capped time engagement, based on exposure before the initial end time
- `II` is capped interaction intensity, based on significant overbids
- `R` is a non-blocking reputation multiplier

Constraints are enforced in `ParamsController`:

- `alpha > beta >= gamma`
- `alpha + beta + gamma = 10_000`
- Every score component is capped

The MVP redistributes only to non-winning participants. This avoids rewarding the winner from the premium they pay and keeps the redistribution aligned with BidBack's purpose.

Auction parameters and module addresses are snapshotted at creation time, so later governance updates do not alter the economic or custody rules of already-open auctions.

## Contracts

- `AuctionHouse`: creates auctions, accepts bids, applies anti-sniping, finalizes auctions, computes redistribution rights
- `NFTVault`: locks and releases ERC-721 NFTs
- `EscrowVault`: holds ETH caps, seller proceeds, protocol fees, refund reserves, and distribution reserves
- `DistributionVault`: records redistribution entitlements and exposes user claims
- `ReputationAdapter`: stores a non-blocking multiplier used only for redistribution
- `ParamsController`: stores bounded economic and safety parameters

## Safety Principles

- Pull payments for user ETH flows
- NFT release is pull-based after finalization
- No unbounded loops: participant count is capped by governance parameters
- Refunds are never blocked by reputation or redistribution logic
- Pause is limited to new auction creation and bidding; claims remain available
- No claim path depends on opaque off-chain computation
- Unclaimed refunds and rewards remain claimable indefinitely
- Production ownership should be assigned to a multisig and timelock, not to an EOA

## Local Checks

Codespaces is the reference development environment. The devcontainer installs Foundry automatically.

Run:

```bash
forge test -vv
```
