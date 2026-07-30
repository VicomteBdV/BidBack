import {
  getClaimNftActionState,
  getClaimRefundActionState,
  getClaimRewardActionState,
  getFinalizeActionState,
  sameAddress
} from "@/lib/auctionActionState";
import { getAuctionLifecycle } from "@/lib/auctionLifecycle";
import type { AuctionStateValue, SerializedAuction } from "@/lib/auctionTypes";
import { isZeroAddress } from "@/lib/format";

export type WalletAuctionPosition = {
  cap: string;
  refundableAmount: string;
  refundClaimed: boolean;
  rewardEntitlement: string;
  rewardClaimed: boolean;
  sellerCredit?: string;
  protocolFeeCredit?: string;
  auctionFeeRecipient: `0x${string}`;
  isAuctionFeeRecipient: boolean;
};

export type WalletActivityAuction = SerializedAuction & {
  walletPosition?: WalletAuctionPosition;
  walletPositionError?: string;
};

export type WalletAuctionRole =
  | "seller"
  | "bidder"
  | "highest-bidder"
  | "winner"
  | "nft-claimant"
  | "fee-recipient";

export type WalletAuctionActionKind = "claimNft" | "claimRefund" | "claimReward" | "finalize";
export type WalletGlobalActionKind = "withdrawSellerProceeds" | "withdrawProtocolFees";

export type WalletAuctionAction = {
  kind: WalletAuctionActionKind;
  label: string;
  description: string;
  priority: number;
  amount?: string;
};

export type WalletAuctionQueueItem = {
  auctionId: string;
  href: string;
  state: AuctionStateValue;
  stateLabel: string;
  lifecycleLabel: string;
  endTime: string;
  roles: WalletAuctionRole[];
  reason: string;
  partial: boolean;
  partialReason?: string;
  actions: WalletAuctionAction[];
};

export type WalletGlobalActionItem = {
  kind: WalletGlobalActionKind;
  label: string;
  description: string;
  priority: number;
  amount: string;
  targetAuctionId?: string;
  href?: string;
};

export type WalletActionQueue = {
  auctionActions: WalletAuctionQueueItem[];
  globalActions: WalletGlobalActionItem[];
  watching: WalletAuctionQueueItem[];
  history: WalletAuctionQueueItem[];
  availableActionCount: number;
  relatedAuctionCount: number;
  partial: boolean;
  warnings: string[];
};

export type WalletGlobalCredits = {
  sellerCredit?: string | null;
  protocolFeeCredit?: string | null;
};

export type WalletActionQueueOptions = {
  nowSeconds?: number | bigint;
  globalCredits?: WalletGlobalCredits;
  partial?: boolean;
  warnings?: string[];
};

// Read-only classification is based on the configured chain data, not the wallet's selected network.
const projectionContext = {
  isConnected: true,
  wrongNetwork: false,
  targetChainLabel: "configured target chain",
  deploymentLoaded: true,
  deploymentError: null,
  auctionIdValid: true,
  loading: false,
  pending: false
};

const roleOrder: WalletAuctionRole[] = [
  "seller",
  "bidder",
  "highest-bidder",
  "winner",
  "nft-claimant",
  "fee-recipient"
];

function parseAmount(value?: string | bigint | number | null) {
  try {
    const parsed = typeof value === "bigint" ? value : BigInt(value ?? "0");
    return parsed >= 0n ? parsed : null;
  } catch {
    return null;
  }
}

function positiveAmount(value?: string | bigint | number | null) {
  const parsed = parseAmount(value);
  return parsed !== null && parsed > 0n ? parsed : null;
}

function decimalString(value?: string | bigint | number | null) {
  const parsed = parseAmount(value);
  return parsed === null ? undefined : parsed.toString();
}

function auctionIdValue(value: string) {
  return parseAmount(value) ?? 0n;
}

function endTimeValue(value: string) {
  return parseAmount(value) ?? 0n;
}

function compareBigInt(a: bigint, b: bigint) {
  return a === b ? 0 : a < b ? -1 : 1;
}

function claimantOf(auction: SerializedAuction) {
  return isZeroAddress(auction.highestBidder) ? auction.seller : auction.highestBidder;
}

function rolesForAuction(auction: WalletActivityAuction, wallet: `0x${string}`, finalized: boolean) {
  const position = auction.walletPosition;
  const roles = new Set<WalletAuctionRole>();
  const isSeller = sameAddress(auction.seller, wallet);
  const isHighestBidder = sameAddress(auction.highestBidder, wallet) && !isZeroAddress(auction.highestBidder);
  const hasBidderEvidence = Boolean(
    position &&
      (positiveAmount(position.cap) ||
        positiveAmount(position.refundableAmount) ||
        positiveAmount(position.rewardEntitlement) ||
        position.refundClaimed ||
        position.rewardClaimed)
  );

  if (isSeller) roles.add("seller");
  if (hasBidderEvidence) roles.add("bidder");
  if (isHighestBidder) roles.add("highest-bidder");
  if (finalized && isHighestBidder) roles.add("winner");
  if (finalized && sameAddress(claimantOf(auction), wallet)) roles.add("nft-claimant");
  if (position?.isAuctionFeeRecipient && sameAddress(position.auctionFeeRecipient, wallet)) roles.add("fee-recipient");

  return roleOrder.filter((role) => roles.has(role));
}

function auctionActionsFor(
  auction: WalletActivityAuction,
  wallet: `0x${string}`,
  nowSeconds: number | bigint
): WalletAuctionAction[] {
  const lifecycle = getAuctionLifecycle(auction, nowSeconds);
  const position = auction.walletPosition;
  const actions: WalletAuctionAction[] = [];

  const claimNftState = getClaimNftActionState({
    ...projectionContext,
    account: wallet,
    claimant: claimantOf(auction),
    claimantRoleLabel: isZeroAddress(auction.highestBidder) ? "seller" : "winner",
    nftClaimed: auction.nftClaimed,
    finalized: lifecycle.isFinalized
  });

  if (!claimNftState.disabledReason) {
    actions.push({
      kind: "claimNft",
      label: "Claim NFT",
      description: isZeroAddress(auction.highestBidder)
        ? "No valid bid was placed, so the seller can reclaim the NFT."
        : "The connected wallet is the winner and can claim the NFT.",
      priority: 10
    });
  }

  if (position && !auction.walletPositionError) {
    const refundableAmount = parseAmount(position.refundableAmount);
    const refundState = getClaimRefundActionState({
      ...projectionContext,
      refundableAmount,
      refundClaimed: position.refundClaimed,
      finalized: lifecycle.isFinalized
    });

    if (!refundState.disabledReason && refundableAmount !== null) {
      actions.push({
        kind: "claimRefund",
        label: "Claim refund",
        description: "A refundable wallet cap is currently available for this auction.",
        amount: refundableAmount.toString(),
        priority: 20
      });
    }

    const rewardEntitlement = parseAmount(position.rewardEntitlement);
    const rewardState = getClaimRewardActionState({
      ...projectionContext,
      rewardEntitlement,
      rewardClaimed: position.rewardClaimed,
      finalized: lifecycle.isFinalized
    });

    if (!rewardState.disabledReason && rewardEntitlement !== null) {
      actions.push({
        kind: "claimReward",
        label: "Claim reward",
        description:
          "A positive redistribution entitlement is currently claimable. Redistribution depends on auction conditions and is not guaranteed in advance.",
        amount: rewardEntitlement.toString(),
        priority: 30
      });
    }
  }

  const finalizeState = getFinalizeActionState({
    ...projectionContext,
    finalized: lifecycle.isFinalized,
    endTime: auction.endTime,
    nowSeconds
  });

  if (!finalizeState.disabledReason) {
    actions.push({
      kind: "finalize",
      label: "Finalize auction",
      description: "The auction end time has passed. Finalization opens pull-based claims and withdrawals.",
      priority: 40
    });
  }

  return actions.sort((a, b) => a.priority - b.priority);
}

function watchingReason(item: { auction: WalletActivityAuction; roles: WalletAuctionRole[]; partial: boolean }) {
  if (item.partial) {
    return "Wallet position data is incomplete. Review the auction detail before treating this activity as settled.";
  }

  if (item.roles.includes("highest-bidder")) {
    return "Your wallet is currently the highest bidder. Continue monitoring the auction until it ends.";
  }

  if (item.roles.includes("bidder")) {
    return "Your wallet participated and is not the current highest bidder. Bidding remains optional while the auction is open.";
  }

  if (item.roles.includes("seller")) {
    return "Your seller auction is still active. No immediate wallet action is required.";
  }

  return "This active auction is related to your wallet, with no immediate action currently available.";
}

function queueItem(
  auction: WalletActivityAuction,
  roles: WalletAuctionRole[],
  actions: WalletAuctionAction[],
  lifecycleLabel: string,
  reason: string
): WalletAuctionQueueItem {
  return {
    auctionId: auction.auctionId,
    href: `/auctions/${auction.auctionId}`,
    state: auction.state,
    stateLabel: auction.stateLabel,
    lifecycleLabel,
    endTime: auction.endTime,
    roles,
    reason,
    partial: Boolean(auction.walletPositionError),
    partialReason: auction.walletPositionError,
    actions
  };
}

function compareActionItems(a: WalletAuctionQueueItem, b: WalletAuctionQueueItem) {
  const priority = (a.actions[0]?.priority ?? Number.MAX_SAFE_INTEGER) - (b.actions[0]?.priority ?? Number.MAX_SAFE_INTEGER);
  if (priority !== 0) return priority;

  const endTime = compareBigInt(endTimeValue(a.endTime), endTimeValue(b.endTime));
  if (endTime !== 0) return endTime;
  return compareBigInt(auctionIdValue(a.auctionId), auctionIdValue(b.auctionId));
}

function compareWatching(a: WalletAuctionQueueItem, b: WalletAuctionQueueItem) {
  const endTime = compareBigInt(endTimeValue(a.endTime), endTimeValue(b.endTime));
  if (endTime !== 0) return endTime;
  return compareBigInt(auctionIdValue(a.auctionId), auctionIdValue(b.auctionId));
}

function compareHistory(a: WalletAuctionQueueItem, b: WalletAuctionQueueItem) {
  const endTime = compareBigInt(endTimeValue(b.endTime), endTimeValue(a.endTime));
  if (endTime !== 0) return endTime;
  return compareBigInt(auctionIdValue(b.auctionId), auctionIdValue(a.auctionId));
}

function derivedCredit(
  auctions: WalletActivityAuction[],
  explicitValue: string | null | undefined,
  key: "sellerCredit" | "protocolFeeCredit"
) {
  if (explicitValue !== undefined && explicitValue !== null) return decimalString(explicitValue);

  let maximum = 0n;
  for (const auction of auctions) {
    const value = positiveAmount(auction.walletPosition?.[key]);
    if (value !== null && value > maximum) maximum = value;
  }
  return maximum.toString();
}

function mostRecentTarget(items: WalletAuctionQueueItem[], role: WalletAuctionRole) {
  return [...items]
    .filter((item) => item.roles.includes(role) && (item.state === 2 || item.lifecycleLabel === "Finalized" || item.lifecycleLabel === "Settled"))
    .sort(compareHistory)[0];
}

function uniqueWarnings(values: Array<string | undefined>) {
  return [...new Set(values.filter((value): value is string => Boolean(value)))];
}

export function buildWalletActionQueue(
  auctions: WalletActivityAuction[],
  wallet?: `0x${string}` | null,
  options: WalletActionQueueOptions = {}
): WalletActionQueue {
  const nowSeconds = options.nowSeconds ?? Math.floor(Date.now() / 1000);
  const positionWarnings = auctions.map((auction) =>
    auction.walletPositionError ? `Auction #${auction.auctionId}: ${auction.walletPositionError}` : undefined
  );
  const warnings = uniqueWarnings([...(options.warnings ?? []), ...positionWarnings]);
  const emptyQueue: WalletActionQueue = {
    auctionActions: [],
    globalActions: [],
    watching: [],
    history: [],
    availableActionCount: 0,
    relatedAuctionCount: 0,
    partial: Boolean(options.partial) || warnings.length > 0,
    warnings
  };

  if (!wallet) return emptyQueue;

  const auctionActions: WalletAuctionQueueItem[] = [];
  const watching: WalletAuctionQueueItem[] = [];
  const history: WalletAuctionQueueItem[] = [];

  for (const auction of auctions) {
    const lifecycle = getAuctionLifecycle(auction, nowSeconds);
    const roles = rolesForAuction(auction, wallet, lifecycle.isFinalized);
    if (roles.length === 0 && !auction.walletPositionError) continue;

    const actions = roles.length > 0 ? auctionActionsFor(auction, wallet, nowSeconds) : [];
    const partial = Boolean(auction.walletPositionError);

    if (actions.length > 0) {
      auctionActions.push(
        queueItem(
          auction,
          roles,
          actions,
          lifecycle.statusLabel,
          `${actions.length} auction-specific wallet action${actions.length === 1 ? " is" : "s are"} currently available.`
        )
      );
      continue;
    }

    if (!lifecycle.isFinalized || partial) {
      watching.push(
        queueItem(
          auction,
          roles,
          [],
          lifecycle.statusLabel,
          watchingReason({ auction, roles, partial })
        )
      );
      continue;
    }

    history.push(
      queueItem(
        auction,
        roles,
        [],
        lifecycle.statusLabel,
        "This finalized auction has no remaining auction-specific wallet action currently known."
      )
    );
  }

  auctionActions.sort(compareActionItems);
  watching.sort(compareWatching);
  history.sort(compareHistory);

  const allRelatedItems = [...auctionActions, ...watching, ...history];
  const sellerCredit = derivedCredit(auctions, options.globalCredits?.sellerCredit, "sellerCredit");
  const protocolFeeCredit = derivedCredit(auctions, options.globalCredits?.protocolFeeCredit, "protocolFeeCredit");
  const globalActions: WalletGlobalActionItem[] = [];
  const sellerTarget = mostRecentTarget(allRelatedItems, "seller");
  const feeTarget = mostRecentTarget(allRelatedItems, "fee-recipient");

  if (positiveAmount(sellerCredit)) {
    globalActions.push({
      kind: "withdrawSellerProceeds",
      label: "Withdraw seller proceeds",
      description:
        "This is a global wallet credit held by EscrowVault. It is not attributed to a single auction in this view.",
      amount: sellerCredit ?? "0",
      priority: 10,
      targetAuctionId: sellerTarget?.auctionId,
      href: sellerTarget?.href
    });
  }

  if (positiveAmount(protocolFeeCredit)) {
    globalActions.push({
      kind: "withdrawProtocolFees",
      label: "Withdraw protocol fees",
      description:
        "This is a global wallet credit held by EscrowVault. It is not attributed to a single auction in this view.",
      amount: protocolFeeCredit ?? "0",
      priority: 20,
      targetAuctionId: feeTarget?.auctionId,
      href: feeTarget?.href
    });
  }

  globalActions.sort((a, b) => a.priority - b.priority);

  return {
    auctionActions,
    globalActions,
    watching,
    history,
    availableActionCount:
      auctionActions.reduce((total, item) => total + item.actions.length, 0) + globalActions.length,
    relatedAuctionCount: allRelatedItems.length,
    partial: Boolean(options.partial) || warnings.length > 0,
    warnings
  };
}
