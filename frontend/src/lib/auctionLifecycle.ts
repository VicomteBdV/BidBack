import type { SerializedAuction } from "@/lib/auctionTypes";
import { formatDurationSeconds, isZeroAddress } from "@/lib/format";

export type AuctionLifecycleTone = "success" | "warning" | "info" | "complete" | "neutral";

export type AuctionTimeInput = string | number | bigint;

export type AuctionLifecycle = {
  statusLabel: string;
  statusTone: AuctionLifecycleTone;
  currentPhase: string;
  nextActionLabel: string;
  nextActionReason: string;
  timeStatusLabel: string;
  isOpen: boolean;
  isExpired: boolean;
  isFinalized: boolean;
  canFinalize: boolean;
  canBid: boolean;
  hasClaimableNft: boolean;
  hasRefund: boolean;
  hasReward: boolean;
  hasSellerProceeds: boolean;
  hasProtocolFees: boolean;
  hasAnyClaimOrWithdrawal: boolean;
  winnerAddress: `0x${string}` | null;
  nftClaimantAddress: `0x${string}` | null;
  claimableItems: string[];
};

function parseOptionalBigInt(value?: string | bigint | number | null) {
  if (value === undefined || value === null) return null;

  try {
    return typeof value === "bigint" ? value : BigInt(value);
  } catch {
    return null;
  }
}

function parseBigInt(value?: string | bigint | number | null) {
  return parseOptionalBigInt(value) ?? 0n;
}

function parseTimestampSeconds(value?: string | bigint | number | null) {
  const parsed = parseBigInt(value);
  return parsed > 0n ? parsed : null;
}

function gtZero(value?: string | bigint | number | null) {
  return parseBigInt(value) > 0n;
}

export function resolveAuctionSnapshotNowSeconds(
  auctions: readonly Pick<SerializedAuction, "chainTimestamp">[],
  nowSeconds?: AuctionTimeInput
): bigint {
  const explicitNow = parseOptionalBigInt(nowSeconds);
  if (explicitNow !== null) return explicitNow;

  for (const auction of auctions) {
    const chainTimestamp = parseTimestampSeconds(auction.chainTimestamp);
    if (chainTimestamp !== null) return chainTimestamp;
  }

  return BigInt(Math.floor(Date.now() / 1000));
}

function isAuctionExpired(endTime: string | bigint | number | null | undefined, nowSeconds: bigint) {
  const parsedEndTime = parseTimestampSeconds(endTime);
  if (parsedEndTime === null) return false;

  return nowSeconds >= parsedEndTime;
}

function timeStatusLabel(auction: SerializedAuction, nowSeconds: bigint) {
  if (auction.finalized || auction.state === 2) return "Auction finalized";
  if (auction.state === 1) return "Auction ended";

  const endTime = parseTimestampSeconds(auction.endTime);
  if (endTime === null) return "End time unavailable";

  if (nowSeconds >= endTime) return "Expired";

  return `${formatDurationSeconds(endTime - nowSeconds)} remaining`;
}

function hasBidderRefund(auction: SerializedAuction, key: "primaryBidder" | "secondBidder") {
  const bidder = auction.economics?.[key];
  return Boolean(bidder && gtZero(bidder.refundableAmount) && !bidder.refundClaimed);
}

function hasBidderReward(auction: SerializedAuction, key: "primaryBidder" | "secondBidder") {
  const bidder = auction.economics?.[key];
  return Boolean(bidder && gtZero(bidder.rewardEntitlement) && !bidder.rewardClaimed);
}

export function getAuctionLifecycle(auction: SerializedAuction, nowSeconds?: AuctionTimeInput): AuctionLifecycle {
  const resolvedNowSeconds = resolveAuctionSnapshotNowSeconds([auction], nowSeconds);
  const isOpen = auction.state === 0 && !auction.finalized;
  const isFinalized = auction.finalized || auction.state === 2;
  const isExpired = isAuctionExpired(auction.endTime, resolvedNowSeconds) || auction.state === 1;
  const canBid = isOpen && !isExpired;
  const canFinalize = !isFinalized && isExpired;

  const winnerAddress = isZeroAddress(auction.highestBidder) ? null : auction.highestBidder;
  const nftClaimantAddress = isFinalized ? winnerAddress ?? auction.seller : null;

  const hasClaimableNft = isFinalized && !auction.nftClaimed;
  const hasRefund = hasBidderRefund(auction, "primaryBidder") || hasBidderRefund(auction, "secondBidder");
  const hasReward = hasBidderReward(auction, "primaryBidder") || hasBidderReward(auction, "secondBidder");
  const hasSellerProceeds = Boolean(auction.economics && gtZero(auction.economics.seller.credit));
  const hasProtocolFees = Boolean(auction.economics && gtZero(auction.economics.feeRecipient.credit));
  const hasAnyClaimOrWithdrawal = hasClaimableNft || hasRefund || hasReward || hasSellerProceeds || hasProtocolFees;

  const claimableItems = [
    hasClaimableNft ? "NFT claim" : null,
    hasRefund ? "Refund" : null,
    hasReward ? "Reward" : null,
    hasSellerProceeds ? "Seller proceeds" : null,
    hasProtocolFees ? "Protocol fees" : null
  ].filter((item): item is string => Boolean(item));

  if (isFinalized && auction.nftClaimed && !hasRefund && !hasReward && !hasSellerProceeds && !hasProtocolFees) {
    return {
      statusLabel: "Settled",
      statusTone: "complete",
      currentPhase: "Settled",
      nextActionLabel: "No pending action detected",
      nextActionReason: "The auction is finalized, the NFT is claimed, and no claimable amounts are currently visible.",
      timeStatusLabel: timeStatusLabel(auction, resolvedNowSeconds),
      isOpen,
      isExpired,
      isFinalized,
      canFinalize,
      canBid,
      hasClaimableNft,
      hasRefund,
      hasReward,
      hasSellerProceeds,
      hasProtocolFees,
      hasAnyClaimOrWithdrawal,
      winnerAddress,
      nftClaimantAddress,
      claimableItems
    };
  }

  if (isFinalized) {
    return {
      statusLabel: auction.nftClaimed ? "Claimed" : "Finalized",
      statusTone: "info",
      currentPhase: "Claims and withdrawals",
      nextActionLabel: hasAnyClaimOrWithdrawal ? "Process claims / withdrawals" : "Review settlement",
      nextActionReason: hasAnyClaimOrWithdrawal
        ? "The auction is finalized. Eligible wallets can now use pull-based claims or withdrawals."
        : "The auction is finalized. No claimable amount is currently visible in the read-only data.",
      timeStatusLabel: timeStatusLabel(auction, resolvedNowSeconds),
      isOpen,
      isExpired,
      isFinalized,
      canFinalize,
      canBid,
      hasClaimableNft,
      hasRefund,
      hasReward,
      hasSellerProceeds,
      hasProtocolFees,
      hasAnyClaimOrWithdrawal,
      winnerAddress,
      nftClaimantAddress,
      claimableItems
    };
  }

  if (canFinalize) {
    return {
      statusLabel: "Ready to finalize",
      statusTone: "warning",
      currentPhase: "Finalization",
      nextActionLabel: "Finalize auction",
      nextActionReason: "The end time has passed. Finalization opens NFT, refund, reward, proceeds, and fee claims.",
      timeStatusLabel: timeStatusLabel(auction, resolvedNowSeconds),
      isOpen,
      isExpired,
      isFinalized,
      canFinalize,
      canBid,
      hasClaimableNft,
      hasRefund,
      hasReward,
      hasSellerProceeds,
      hasProtocolFees,
      hasAnyClaimOrWithdrawal,
      winnerAddress,
      nftClaimantAddress,
      claimableItems
    };
  }

  if (canBid) {
    return {
      statusLabel: "Open",
      statusTone: "success",
      currentPhase: "Bidding",
      nextActionLabel: winnerAddress ? "Outbid current highest bidder" : "Place first bid",
      nextActionReason: "The auction is open and accepts step-up bid caps until the end time.",
      timeStatusLabel: timeStatusLabel(auction, resolvedNowSeconds),
      isOpen,
      isExpired,
      isFinalized,
      canFinalize,
      canBid,
      hasClaimableNft,
      hasRefund,
      hasReward,
      hasSellerProceeds,
      hasProtocolFees,
      hasAnyClaimOrWithdrawal,
      winnerAddress,
      nftClaimantAddress,
      claimableItems
    };
  }

  return {
    statusLabel: auction.stateLabel || "Unknown",
    statusTone: "neutral",
    currentPhase: "Awaiting refresh",
    nextActionLabel: "Refresh auction state",
    nextActionReason: "The current read-only data is not enough to infer the next action with confidence.",
    timeStatusLabel: timeStatusLabel(auction, resolvedNowSeconds),
    isOpen,
    isExpired,
    isFinalized,
    canFinalize,
    canBid,
    hasClaimableNft,
    hasRefund,
    hasReward,
    hasSellerProceeds,
    hasProtocolFees,
    hasAnyClaimOrWithdrawal,
    winnerAddress,
    nftClaimantAddress,
    claimableItems
  };
}
