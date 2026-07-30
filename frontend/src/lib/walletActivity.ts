import { getAuctionLifecycle } from "@/lib/auctionLifecycle";
import { isZeroAddress } from "@/lib/format";
import {
  buildWalletActionQueue,
  type WalletActionQueue,
  type WalletActivityAuction,
  type WalletAuctionPosition,
  type WalletGlobalCredits
} from "@/lib/walletActionQueue";

export type { WalletActivityAuction, WalletAuctionPosition } from "@/lib/walletActionQueue";

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
  actionQueue: WalletActionQueue;
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

export type WalletActivityDiscoveryStrategy =
  | "event-scoped"
  | "general-event-window"
  | "bounded-fallback"
  | "unavailable";

export type WalletActivityDiscovery = {
  strategy: WalletActivityDiscoveryStrategy;
  limit: number;
  requestedLimit: number;
  returnedIds: number;
  warning?: string;
};

export type WalletActivityApiResponse = {
  chainId: number;
  auctionHouse: `0x${string}`;
  wallet: `0x${string}`;
  count: number;
  discovery: WalletActivityDiscovery;
  activity: WalletActivitySummary;
};

export type BuildWalletActivityOptions = {
  globalCredits?: WalletGlobalCredits;
  partial?: boolean;
  warnings?: string[];
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

function flattenActions(actionQueue: WalletActionQueue): WalletActivityAction[] {
  const auctionActions = actionQueue.auctionActions.flatMap((item) =>
    item.actions.map((action) => ({
      ...action,
      auctionId: item.auctionId,
      label: `${action.label} — Auction #${item.auctionId}`,
      href: item.href
    }))
  );
  const globalActions = actionQueue.globalActions.map((action) => ({
    ...action,
    auctionId: action.targetAuctionId ?? "global",
    href: action.href ?? "/"
  }));

  return [...auctionActions, ...globalActions].sort((a, b) => a.priority - b.priority);
}

export function buildWalletActivity(
  auctions: WalletActivityAuction[],
  wallet?: `0x${string}` | null,
  nowSeconds?: number | bigint,
  options: BuildWalletActivityOptions = {}
): WalletActivitySummary {
  const resolvedNowSeconds = nowSeconds ?? Math.floor(Date.now() / 1000);
  const actionQueue = buildWalletActionQueue(auctions, wallet, {
    nowSeconds: resolvedNowSeconds,
    globalCredits: options.globalCredits,
    partial: options.partial,
    warnings: options.warnings
  });
  const warnings = wallet
    ? actionQueue.warnings
    : ["Connect a wallet to see your activity.", ...actionQueue.warnings];
  const summary: WalletActivitySummary = {
    wallet: wallet ?? null,
    walletConnected: Boolean(wallet),
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
    nextActions: flattenActions(actionQueue),
    warnings,
    actionQueue
  };

  if (!wallet) return summary;

  for (const auction of auctions) {
    const lifecycle = getAuctionLifecycle(auction, resolvedNowSeconds);
    const position = auction.walletPosition;
    const isSeller = sameAddress(auction.seller, wallet);
    const isHighestBidder = sameAddress(auction.highestBidder, wallet) && !isZeroAddress(auction.highestBidder);
    const hasWalletCap = gtZero(position?.cap);

    if (isSeller) summary.createdAuctions += 1;
    if (!lifecycle.isFinalized && hasWalletCap) summary.activeBids += 1;
    if (lifecycle.isFinalized && isHighestBidder) summary.wonAuctions += 1;
    if (lifecycle.isFinalized && hasWalletCap && !isHighestBidder) summary.lostAuctions += 1;
  }

  for (const item of actionQueue.auctionActions) {
    for (const action of item.actions) {
      if (action.kind === "claimNft") summary.claimableNfts += 1;
      if (action.kind === "claimRefund") {
        summary.claimableRefunds += 1;
        summary.totalRefundableAmount = addWei(summary.totalRefundableAmount, action.amount);
      }
      if (action.kind === "claimReward") {
        summary.claimableRewards += 1;
        summary.totalRewardEntitlement = addWei(summary.totalRewardEntitlement, action.amount);
      }
    }
  }

  for (const action of actionQueue.globalActions) {
    if (action.kind === "withdrawSellerProceeds") {
      summary.withdrawableSellerProceeds = 1;
      summary.sellerProceedsAvailable = action.amount;
    }
    if (action.kind === "withdrawProtocolFees") {
      summary.withdrawableProtocolFees = 1;
      summary.protocolFeesAvailable = action.amount;
    }
  }

  summary.hasActivity = actionQueue.relatedAuctionCount > 0 || actionQueue.globalActions.length > 0;
  return summary;
}
