import { parseEther } from "viem";
import type { AuctionStateValue } from "@/lib/auctionTypes";

export type ActionState = {
  disabledReason: string | null;
};

export type BidActionState = ActionState & {
  parsedBidCap: bigint | null;
  valueToSend: bigint;
};

type WalletContext = {
  isConnected: boolean;
  wrongNetwork: boolean;
  targetChainLabel: string;
  deploymentLoaded: boolean;
  deploymentError?: string | null;
  auctionIdValid: boolean;
  loading?: boolean;
  pending?: boolean;
};

export function sameAddress(a?: string | null, b?: string | null) {
  return Boolean(a && b && a.toLowerCase() === b.toLowerCase());
}

export function parseBidCap(value: string): { value: bigint | null; error: string | null } {
  const trimmed = value.trim();

  if (!trimmed) {
    return { value: null, error: "Bid cap is required." };
  }

  if (trimmed.startsWith("-")) {
    return { value: null, error: "Bid cap must be greater than zero." };
  }

  try {
    const parsed = parseEther(trimmed);

    if (parsed <= 0n) {
      return { value: parsed, error: "Bid cap must be greater than zero." };
    }

    return { value: parsed, error: null };
  } catch {
    return { value: null, error: "Bid cap must be a valid ETH amount." };
  }
}

function baseWalletDisabledReason(context: WalletContext) {
  if (!context.isConnected) return "Wallet not connected.";
  if (context.wrongNetwork) return `Wallet connected, but not on the target chain (${context.targetChainLabel}).`;
  if (context.deploymentError) return context.deploymentError;
  if (!context.deploymentLoaded) return "Deployment missing or stale.";
  if (!context.auctionIdValid) return "Invalid auction ID.";
  if (context.loading) return "Wallet data is loading.";
  if (context.pending) return "Another wallet transaction is pending.";
  return null;
}

function parseTimestampSeconds(value?: string | number | bigint | null) {
  try {
    const parsed = typeof value === "bigint" ? value : BigInt(value ?? "0");
    return parsed > 0n ? parsed : null;
  } catch {
    return null;
  }
}

export function isAuctionExpired(endTime?: string | number | bigint | null, nowSeconds?: number | bigint) {
  const parsedEndTime = parseTimestampSeconds(endTime);
  if (parsedEndTime === null) return false;

  const now = typeof nowSeconds === "bigint" ? nowSeconds : BigInt(nowSeconds ?? Math.floor(Date.now() / 1000));
  return now >= parsedEndTime;
}

export function getBidActionState({
  bidCapEth,
  minimumNextBid,
  currentCap,
  auctionState,
  endTime,
  nowSeconds,
  ...context
}: WalletContext & {
  bidCapEth: string;
  minimumNextBid: bigint | null;
  currentCap: bigint | null;
  auctionState: AuctionStateValue;
  endTime?: string | number | bigint | null;
  nowSeconds?: number | bigint;
}): BidActionState {
  const base = baseWalletDisabledReason(context);
  if (base) return { disabledReason: base, parsedBidCap: null, valueToSend: 0n };

  if (auctionState !== 0) {
    return { disabledReason: "Auction is not OPEN.", parsedBidCap: null, valueToSend: 0n };
  }

  if (isAuctionExpired(endTime, nowSeconds)) {
    return {
      disabledReason: "Auction has reached its end time. Refresh auction state or finalize it.",
      parsedBidCap: null,
      valueToSend: 0n
    };
  }

  if (minimumNextBid === null || currentCap === null) {
    return { disabledReason: "Load wallet bid data before placing a bid.", parsedBidCap: null, valueToSend: 0n };
  }

  const parsed = parseBidCap(bidCapEth);

  if (parsed.error) {
    return { disabledReason: parsed.error, parsedBidCap: parsed.value, valueToSend: 0n };
  }

  const bidCap = parsed.value ?? 0n;

  if (bidCap < minimumNextBid) {
    return { disabledReason: "Bid cap must be at least minimumNextBid.", parsedBidCap: bidCap, valueToSend: 0n };
  }

  if (bidCap <= currentCap) {
    return { disabledReason: "Bid cap must be greater than your current cap.", parsedBidCap: bidCap, valueToSend: 0n };
  }

  return {
    disabledReason: null,
    parsedBidCap: bidCap,
    valueToSend: bidCap - currentCap
  };
}

export function getFinalizeActionState({
  finalized,
  endTime,
  nowSeconds,
  ...context
}: WalletContext & {
  finalized: boolean;
  endTime?: string | number | bigint | null;
  nowSeconds?: number | bigint;
}): ActionState {
  const base = baseWalletDisabledReason(context);
  if (base) return { disabledReason: base };

  if (finalized) return { disabledReason: "Auction is already finalized." };

  const parsedEndTime = parseTimestampSeconds(endTime);
  if (parsedEndTime === null) return { disabledReason: "Auction end time is unavailable." };

  if (!isAuctionExpired(parsedEndTime, nowSeconds)) {
    return { disabledReason: "Auction is not expired yet." };
  }

  return { disabledReason: null };
}

function finalizedWalletDisabledReason(context: WalletContext & { finalized: boolean }) {
  const base = baseWalletDisabledReason(context);
  if (base) return base;
  if (!context.finalized) return "Auction is not finalized.";
  return null;
}

export function getClaimNftActionState({
  account,
  claimant,
  claimantRoleLabel,
  nftClaimed,
  finalized,
  ...context
}: WalletContext & {
  account?: string | null;
  claimant?: string | null;
  claimantRoleLabel: string;
  nftClaimed: boolean;
  finalized: boolean;
}): ActionState {
  const base = finalizedWalletDisabledReason({ ...context, finalized });
  if (base) return { disabledReason: base };
  if (nftClaimed) return { disabledReason: "NFT already claimed." };
  if (!sameAddress(account, claimant)) {
    return { disabledReason: `Connected wallet is not the NFT claimant. Expected ${claimantRoleLabel}.` };
  }
  return { disabledReason: null };
}

export function getClaimRefundActionState({
  refundableAmount,
  refundClaimed,
  finalized,
  ...context
}: WalletContext & {
  refundableAmount: bigint | null;
  refundClaimed: boolean | null;
  finalized: boolean;
}): ActionState {
  const base = finalizedWalletDisabledReason({ ...context, finalized });
  if (base) return { disabledReason: base };
  if (refundableAmount === null || refundClaimed === null) return { disabledReason: "Refresh wallet claim data." };
  if (refundClaimed) return { disabledReason: "Refund already claimed." };
  if (refundableAmount === 0n) return { disabledReason: "No refund available." };
  return { disabledReason: null };
}

export function getClaimRewardActionState({
  rewardEntitlement,
  rewardClaimed,
  finalized,
  ...context
}: WalletContext & {
  rewardEntitlement: bigint | null;
  rewardClaimed: boolean | null;
  finalized: boolean;
}): ActionState {
  const base = finalizedWalletDisabledReason({ ...context, finalized });
  if (base) return { disabledReason: base };
  if (rewardEntitlement === null || rewardClaimed === null) return { disabledReason: "Refresh wallet claim data." };
  if (rewardClaimed) return { disabledReason: "Reward already claimed." };
  if (rewardEntitlement === 0n) return { disabledReason: "No reward available." };
  return { disabledReason: null };
}

export function getWithdrawSellerActionState({
  account,
  seller,
  sellerCredit,
  finalized,
  ...context
}: WalletContext & {
  account?: string | null;
  seller: string;
  sellerCredit: bigint | null;
  finalized: boolean;
}): ActionState {
  const base = finalizedWalletDisabledReason({ ...context, finalized });
  if (base) return { disabledReason: base };
  if (!sameAddress(account, seller)) return { disabledReason: "Connect the seller wallet." };
  if (sellerCredit === null) return { disabledReason: "Refresh wallet claim data." };
  if (sellerCredit === 0n) return { disabledReason: "No seller proceeds." };
  return { disabledReason: null };
}

export function getWithdrawProtocolFeesActionState({
  account,
  feeRecipient,
  protocolFeeCredit,
  finalized,
  ...context
}: WalletContext & {
  account?: string | null;
  feeRecipient?: string | null;
  protocolFeeCredit: bigint | null;
  finalized: boolean;
}): ActionState {
  const base = finalizedWalletDisabledReason({ ...context, finalized });
  if (base) return { disabledReason: base };
  if (feeRecipient && !sameAddress(account, feeRecipient)) return { disabledReason: "Connect the auction fee recipient wallet." };
  if (protocolFeeCredit === null) return { disabledReason: "Refresh wallet claim data." };
  if (protocolFeeCredit === 0n) return { disabledReason: "No protocol fees." };
  return { disabledReason: null };
}
