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