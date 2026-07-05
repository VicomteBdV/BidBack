import { getAuctionLifecycle } from "@/lib/auctionLifecycle";
import type { AuctionDiscovery, SerializedAuction } from "@/lib/auctionTypes";
import { isZeroAddress } from "@/lib/format";

export type WalletAuctionPosition = {
  cap: string;
  refundableAmount: string;
  refundClaimed: boolean;
  rewardEntitlement: string;
  rewardClaimed: boolean;
  sellerCredit: string;
  protocolFeeCredit: string;
  auctionFeeRecipient: `0x${string}`;
  isAuctionFeeRecipient: boolean;
};

export type WalletActivityAuction = SerializedAuction & {
  walletPosition?: WalletAuctionPosition;
  walletPositionError?: string;
};

export type WalletActivitySummary = {
  wallet: `0x${string}` | null;
  walletConnected: boolean;
  createdAuctions: number;
  activeBids: number;
  wonAuctions: number;
  lostAuctions: number;
  claimableNfts: number;
  claimableRefunds: number;
  claimableRewards: number;
  withdrawableSellerProceeds: number;
  withdrawableProtocolFees: number;
  totalRefundableAmount: string;
  totalRewardEntitlement: string;
  sellerProceedsAvailable: string;
  protocolFeesAvailable: string;
  hasActivity: boolean;
  nextActions: WalletActivityAction[];
  warnings: string[];
};

export type WalletActivityActionKind =
  | "bid"
  | "finalize"
  | "claimNft"
  | "claimRefund"
  | "claimReward"
  | "withdrawSellerProceeds"
  | "withdrawProtocolFees";

export type WalletActivityAction = {
  kind: WalletActivityActionKind;
  auctionId: string;
  label: string;
  description: string;
  href: string;
  amount?: string;
  priority: number;
};

export type WalletActivityApiResponse = {
  chainId: number;
  auctionHouse: `0x${string}`;
  wallet: `0x${string}`;
  count: number;
  discovery: AuctionDiscovery;
  activity: WalletActivitySummary;
};

function sameAddress(a?: string | null, b?: string | null) {
  return Boolean(a && b && a.toLowerCase() === b.toLowerCase());
}

function toBigInt(value?: string | bigint | number | null) {
  try {
    return typeof value === "bigint" ? value : BigInt(value ?? "0");
  } catch {
    return 0n;
  }
}

function addWei(a: string, b?: string | bigint | number | null) {
  return (toBigInt(a) + toBigInt(b)).toString();
}

function gtZero(value?: string | bigint | number | null) {
  return toBigInt(value) > 0n;
}

function getNftClaimant(auction: SerializedAuction) {
  return isZeroAddress(auction.highestBidder) ? auction.seller : auction.highestBidder;
}

function isWalletRelatedToAuction(auction: WalletActivityAuction, wallet: `0x${string}`) {
  const position = auction.walletPosition;

  return (
    sameAddress(auction.seller, wallet) ||
    sameAddress(auction.highestBidder, wallet) ||
    sameAddress(getNftClaimant(auction), wallet) ||
    sameAddress(position?.auctionFeeRecipient, wallet) ||
    gtZero(position?.cap) ||
    gtZero(position?.refundableAmount) ||
    gtZero(position?.rewardEntitlement)
  );
}

function pushAction(actions: WalletActivityAction[], action: WalletActivityAction) {
  const duplicate = actions.some((candidate) => candidate.kind === action.kind && candidate.auctionId === action.auctionId);
  if (!duplicate) actions.push(action);
}

export function buildWalletActivity(
  auctions: WalletActivityAuction[],
  wallet?: `0x${string}` | null,
  nowSeconds?: number | bigint
): WalletActivitySummary {
  const warnings = auctions
    .filter((auction) => Boolean(auction.walletPositionError))
    .map((auction) => `Auction #${auction.auctionId}: ${auction.walletPositionError}`);

  if (!wallet) {
    return {
      wallet: null,
      walletConnected: false,
      createdAuctions: 0,
      activeBids: 0,
      wonAuctions: 0,
      lostAuctions: 0,
      claimableNfts: 0,
      claimableRefunds: 0,
      claimableRewards: 0,
      withdrawableSellerProceeds: 0,
      withdrawableProtocolFees: 0,
      totalRefundableAmount: "0",
      totalRewardEntitlement: "0",
      sellerProceedsAvailable: "0",
      protocolFeesAvailable: "0",
      hasActivity: false,
      nextActions: [],
      warnings: ["Connect a wallet to see your activity.", ...warnings]
    };
  }

  const actions: WalletActivityAction[] = [];
  const summary: WalletActivitySummary = {
    wallet,
    walletConnected: true,
    createdAuctions: 0,
    activeBids: 0,
    wonAuctions: 0,
    lostAuctions: 0,
    claimableNfts: 0,
    claimableRefunds: 0,
    claimableRewards: 0,
    withdrawableSellerProceeds: 0,
    withdrawableProtocolFees: 0,
    totalRefundableAmount: "0",
    totalRewardEntitlement: "0",
    sellerProceedsAvailable: "0",
    protocolFeesAvailable: "0",
    hasActivity: false,
    nextActions: actions,
    warnings
  };

  let sellerProceedsActionAdded = false;
  let protocolFeesActionAdded = false;

  for (const auction of auctions) {
    const position = auction.walletPosition;
    const lifecycle = getAuctionLifecycle(auction, nowSeconds);
    const href = `/auctions/${auction.auctionId}`;
    const isSeller = sameAddress(auction.seller, wallet);
    const isHighestBidder = sameAddress(auction.highestBidder, wallet);
    const isNftClaimant = sameAddress(getNftClaimant(auction), wallet);
    const hasWalletCap = gtZero(position?.cap);
    const isOutbid = hasWalletCap && !isHighestBidder;
    const isWinner = lifecycle.isFinalized && isHighestBidder && !isZeroAddress(auction.highestBidder);
    const isLost = lifecycle.isFinalized && isOutbid;

    if (isSeller) summary.createdAuctions += 1;

    if (!lifecycle.isFinalized && hasWalletCap) {
      summary.activeBids += 1;

      if (lifecycle.canBid && isOutbid) {
        pushAction(actions, {
          kind: "bid",
          auctionId: auction.auctionId,
          label: `Bid again on Auction #${auction.auctionId}`,
          description: "Your wallet has a cap on this open auction and is not the current highest bidder.",
          href,
          priority: 50
        });
      }
    }

    if (isWinner) summary.wonAuctions += 1;
    if (isLost) summary.lostAuctions += 1;

    if (lifecycle.canFinalize && isWalletRelatedToAuction(auction, wallet)) {
      pushAction(actions, {
        kind: "finalize",
        auctionId: auction.auctionId,
        label: `Finalize Auction #${auction.auctionId}`,
        description: "The auction end time has passed. Finalization opens pull-based claims and withdrawals.",
        href,
        priority: 40
      });
    }

    if (lifecycle.isFinalized && !auction.nftClaimed && isNftClaimant) {
      summary.claimableNfts += 1;
      pushAction(actions, {
        kind: "claimNft",
        auctionId: auction.auctionId,
        label: `Claim NFT from Auction #${auction.auctionId}`,
        description: isZeroAddress(auction.highestBidder) ? "No bid was placed, so the seller can reclaim the NFT." : "Your wallet is the winner for this auction.",
        href,
        priority: 10
      });
    }

    if (position && gtZero(position.refundableAmount) && !position.refundClaimed) {
      summary.claimableRefunds += 1;
      summary.totalRefundableAmount = addWei(summary.totalRefundableAmount, position.refundableAmount);
      pushAction(actions, {
        kind: "claimRefund",
        auctionId: auction.auctionId,
        label: `Claim refund from Auction #${auction.auctionId}`,
        description: "Your wallet has refundable cap available for this auction.",
        href,
        amount: position.refundableAmount,
        priority: 20
      });
    }

    if (position && gtZero(position.rewardEntitlement) && !position.rewardClaimed) {
      summary.claimableRewards += 1;
      summary.totalRewardEntitlement = addWei(summary.totalRewardEntitlement, position.rewardEntitlement);
      pushAction(actions, {
        kind: "claimReward",
        auctionId: auction.auctionId,
        label: `Claim reward from Auction #${auction.auctionId}`,
        description: "Your wallet has a redistribution entitlement for this finalized auction.",
        href,
        amount: position.rewardEntitlement,
        priority: 30
      });
    }

    if (isSeller && position && gtZero(position.sellerCredit)) {
      summary.sellerProceedsAvailable = position.sellerCredit;

      if (!sellerProceedsActionAdded) {
        summary.withdrawableSellerProceeds = 1;
        sellerProceedsActionAdded = true;
        pushAction(actions, {
          kind: "withdrawSellerProceeds",
          auctionId: auction.auctionId,
          label: "Withdraw seller proceeds",
          description: "Your seller proceeds credit is available through pull-based withdrawal.",
          href,
          amount: position.sellerCredit,
          priority: 35
        });
      }
    }

    if (position?.isAuctionFeeRecipient && gtZero(position.protocolFeeCredit)) {
      summary.protocolFeesAvailable = position.protocolFeeCredit;

      if (!protocolFeesActionAdded) {
        summary.withdrawableProtocolFees = 1;
        protocolFeesActionAdded = true;
        pushAction(actions, {
          kind: "withdrawProtocolFees",
          auctionId: auction.auctionId,
          label: "Withdraw protocol fees",
          description: "Your wallet is the fee recipient snapshot for at least one auction with fees available.",
          href,
          amount: position.protocolFeeCredit,
          priority: 36
        });
      }
    }
  }

  summary.nextActions.sort((a, b) => a.priority - b.priority);
  summary.hasActivity =
    summary.createdAuctions > 0 ||
    summary.activeBids > 0 ||
    summary.wonAuctions > 0 ||
    summary.lostAuctions > 0 ||
    summary.claimableNfts > 0 ||
    summary.claimableRefunds > 0 ||
    summary.claimableRewards > 0 ||
    summary.withdrawableSellerProceeds > 0 ||
    summary.withdrawableProtocolFees > 0 ||
    summary.nextActions.length > 0;

  return summary;
}
