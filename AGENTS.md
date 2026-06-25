# BidBack Agent Instructions

This file is the local source of truth for Codex work on BidBack.

## Product Positioning

BidBack is an NFT auction marketplace with conditional redistribution. It is not gambling, not a financial product, and not a guaranteed-yield mechanism.

Do not introduce:

- Guaranteed yield
- Lending
- Leverage
- Derivatives
- Minting
- Redistribution funded by losing bidders' refundable caps

## Economic Rules

The final auction price is the highest valid bid.

Redistribution can only be funded from net premium actually created by the auction:

```text
gross premium = final price - starting price
net premium = gross premium - protocol fee - configured costs
```

If no premium is created, no fee and no redistribution are allowed.

Losing bidders must be able to recover 100% of their locked cap. The winner must be able to recover any surplus above the final price.

## Architecture

Keep the MVP modular:

- `AuctionHouse`
- `EscrowVault`
- `NFTVault`
- `DistributionVault`
- `ReputationAdapter`
- `ParamsController`

Avoid monolithic rewrites. Keep custody, accounting, scoring, and parameters separated.

## Security Defaults

- Use pull payments for ETH claims.
- Keep NFT release pull-based after finalization.
- Avoid unbounded loops.
- Keep participant counts bounded.
- Use reentrancy protection on state-changing claim and settlement paths.
- Emergency pause must not block refunds, proceeds, fees, NFT release after finalization, or redistribution claims.
- Production ownership must be assigned to multisig/timelock governance rather than an EOA.

## Frontend Language

Frontend user-facing text must be in English.
