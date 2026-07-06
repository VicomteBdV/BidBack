import type {
  AuctionEconomicAddress,
  AuctionEconomicAmount,
  AuctionEconomicParameterSnapshot,
  AuctionEconomicsSummary,
  SerializedAuction
} from "@/lib/auctionTypes";
import { isZeroAddress } from "@/lib/format";

function amount(status: AuctionEconomicAmount["status"], value?: string, note?: string): AuctionEconomicAmount {
  return {
    status,
    value,
    note
  };
}

function address(status: AuctionEconomicAddress["status"], value?: `0x${string}`, note?: string): AuctionEconomicAddress {
  return {
    status,
    value,
    note
  };
}

function parseAmount(value?: string | null) {
  try {
    return BigInt(value ?? "0");
  } catch {
    return 0n;
  }
}

function sumAmounts(values: Array<string | undefined | null>) {
  return values.reduce((total, value) => total + parseAmount(value), 0n).toString();
}

function hasPositiveAmount(value?: string | null) {
  return parseAmount(value) > 0n;
}

function parametersSnapshot(auction: SerializedAuction): AuctionEconomicParameterSnapshot | null {
  const snapshot = auction.paramsSnapshot;

  if (!snapshot) return null;

  return {
    bidbackFeeBps: snapshot.bidbackFeeBps,
    redistributionBps: snapshot.redistributionBps,
    minPremiumNet: snapshot.minPremiumNet,
    minParticipants: snapshot.minParticipants,
    perUserRewardCapBps: snapshot.perUserRewardCapBps,
    minBidIncrementBps: snapshot.minBidIncrementBps
  };
}

function distributionStatus(auction: SerializedAuction) {
  const economics = auction.economics;

  if (!auction.finalized) {
    return amount("pending", undefined, "Redistribution is evaluated only after finalization.");
  }

  if (!economics) {
    return amount("unavailable", undefined, "Distribution reads are unavailable.");
  }

  if (!economics.distribution.opened && isZeroAddress(auction.highestBidder)) {
    return amount("not-applicable", "0", "No bid was placed, so no premium or redistribution exists.");
  }

  return amount(
    "known",
    economics.distribution.totalAssigned,
    hasPositiveAmount(economics.distribution.totalAssigned)
      ? "Assigned rewards are claimable by eligible losers only. They are not guaranteed."
      : "No reward was assigned. Rewards can be zero when premium or eligibility conditions are not met."
  );
}

function visibleRefunds(auction: SerializedAuction) {
  const economics = auction.economics;

  if (!auction.finalized) {
    return amount("pending", undefined, "Refunds open after finalization. Losing caps remain recoverable when settlement is complete.");
  }

  if (!economics) {
    return amount("unavailable", undefined, "Refund reads are unavailable.");
  }

  return amount(
    "known",
    sumAmounts([economics.primaryBidder.refundableAmount, economics.secondBidder.refundableAmount]),
    "Visible configured bidder wallets only in the MVP read model. Refunds are separate from redistribution."
  );
}

function visibleRewards(auction: SerializedAuction) {
  const economics = auction.economics;

  if (!auction.finalized) {
    return amount("pending", undefined, "Rewards are evaluated after finalization and can be zero.");
  }

  if (!economics) {
    return amount("unavailable", undefined, "Reward reads are unavailable.");
  }

  return amount(
    "known",
    sumAmounts([economics.primaryBidder.rewardEntitlement, economics.secondBidder.rewardEntitlement]),
    "Visible configured bidder wallets only in the MVP read model. Rewards are conditional and never guaranteed."
  );
}

export function buildAuctionEconomicSummary(
  auction: SerializedAuction,
  options: { extraWarnings?: string[] } = {}
): AuctionEconomicsSummary {
  const economics = auction.economics;
  const settlement = economics?.settlement;
  const distribution = economics?.distribution;
  const isFinalized = auction.finalized || Boolean(settlement?.finalized);
  const unavailableFields: string[] = [];
  const warnings = [...(options.extraWarnings ?? [])];
  const notes = [
    "Refunds do not depend on redistribution.",
    "Rewards are conditional and can be zero; this UI must not be read as a yield promise.",
    "Protocol fees settle to the fee recipient snapshot captured at auction creation."
  ];

  if (!economics) {
    unavailableFields.push("settlement", "distribution", "refunds", "rewards", "sellerCredit", "protocolFeeCredit");
    warnings.push("Detailed economic reads are unavailable; showing auction-level values only.");
  }

  if (!auction.paramsSnapshot) {
    unavailableFields.push("economicParameterSnapshot");
    if (auction.paramsSnapshotError) warnings.push(auction.paramsSnapshotError);
  }

  if (!auction.auctionFeeRecipient && auction.auctionFeeRecipientError) {
    unavailableFields.push("feeRecipientSnapshot");
    warnings.push(auction.auctionFeeRecipientError);
  }

  if (!isFinalized) {
    notes.push("Final price, proceeds, protocol fees, refunds, and rewards remain pending until finalization.");
  }

  const finalPrice = isFinalized && settlement
    ? amount("known", settlement.finalPrice)
    : amount("pending", undefined, "Final price is fixed by settlement after finalization.");
  const sellerProceeds = isFinalized && settlement
    ? amount("known", settlement.sellerProceeds)
    : amount("pending", undefined, "Seller proceeds are credited after finalization.");
  const protocolFees = isFinalized && settlement
    ? amount("known", settlement.feeAmount)
    : amount("pending", undefined, "Protocol fees are credited after finalization and only when premium exists.");

  return {
    auctionId: auction.auctionId,
    settlement: {
      isFinalized,
      isDistributionAvailable: Boolean(distribution?.opened),
      currentHighestBid: amount("known", auction.highestBid),
      finalPrice,
      sellerProceeds,
      protocolFees,
      sellerCredit: economics
        ? amount("known", economics.seller.credit, economics.seller.canWithdraw ? "Seller wallet has withdrawable proceeds." : undefined)
        : amount("unavailable", undefined, "Seller credit read is unavailable."),
      protocolFeeCredit: economics
        ? amount("known", economics.feeRecipient.credit, economics.feeRecipient.canWithdraw ? "Fee recipient wallet has withdrawable protocol fees." : undefined)
        : amount("unavailable", undefined, "Protocol fee credit read is unavailable."),
      refundsAvailable: visibleRefunds(auction),
      rewardsAvailable: visibleRewards(auction),
      redistributionAvailable: distributionStatus(auction),
      distributionReserve: settlement
        ? amount("known", settlement.distributionReserve)
        : amount(isFinalized ? "unavailable" : "pending", undefined, "Distribution reserve is known after settlement."),
      totalAssignedRewards: distribution
        ? amount("known", distribution.totalAssigned)
        : amount(isFinalized ? "unavailable" : "pending", undefined, "Assigned rewards are known after distribution opens."),
      totalClaimedRewards: distribution
        ? amount("known", distribution.totalClaimed)
        : amount(isFinalized ? "unavailable" : "pending", undefined, "Claimed rewards are known after distribution opens."),
      feeRecipient: auction.auctionFeeRecipient
        ? address("known", auction.auctionFeeRecipient)
        : economics
          ? address("known", economics.feeRecipient.address, "Fallback from economic read; auction snapshot read was unavailable.")
          : address("unavailable", undefined, "Fee recipient snapshot is unavailable."),
      seller: address("known", auction.seller),
      winner: isZeroAddress(auction.highestBidder)
        ? address(isFinalized ? "not-applicable" : "pending", undefined, isFinalized ? "No bid was placed." : "No highest bidder yet.")
        : address("known", auction.highestBidder),
      nftClaimant: economics?.nftClaim.claimant
        ? address("known", economics.nftClaim.claimant)
        : address(isFinalized ? "unavailable" : "pending", undefined, "NFT claimant is known after finalization or when a highest bidder exists.")
    },
    parameters: parametersSnapshot(auction),
    warnings: Array.from(new Set(warnings)),
    unavailableFields: Array.from(new Set(unavailableFields)),
    notes
  };
}
