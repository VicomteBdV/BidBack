"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  decodeEventLog,
  formatEther,
  type EIP1193Provider,
  type ReplacementReason
} from "viem";
import { useAccount, useConfig } from "wagmi";
import { createConnectedWalletClients } from "@/lib/walletProvider";
import { WalletButton } from "@/components/WalletButton";
import { TechnicalDisclosure } from "@/components/TechnicalDisclosure";
import { TransactionReview } from "@/components/TransactionReview";
import { StateNotice } from "@/components/ui/StateNotice";
import { WalletTransactionStatus } from "@/components/WalletTransactionStatus";
import { auctionHouseAbi } from "@/contracts/auctionHouseAbi";
import { escrowVaultAbi } from "@/contracts/escrowVaultAbi";
import { getBidActionState, parseBidAmount, sameAddress } from "@/lib/auctionActionState";
import type { SerializedAuction } from "@/lib/auctionTypes";
import { targetChainId, targetChainLabel } from "@/lib/chains";
import { fetchDeployment, type Deployment } from "@/lib/deployment";
import { formatEth, shortenAddress } from "@/lib/format";
import {
  awaitingSignatureState,
  confirmedTransactionState,
  failedTransactionState,
  pendingTransactionState,
  refreshingTransactionState,
  revertedTransactionState,
  unknownConfirmationState,
  type WalletTransactionState
} from "@/lib/walletTransaction";

function walletErrorMessage(error: unknown, fallback: string) {
  if (error && typeof error === "object") {
    const candidate = error as { shortMessage?: unknown; details?: unknown; message?: unknown };

    if (typeof candidate.shortMessage === "string") return candidate.shortMessage;
    if (typeof candidate.details === "string") return candidate.details;
    if (typeof candidate.message === "string") return candidate.message;
  }

  return error instanceof Error ? error.message : fallback;
}

function parseChainTimestamp(value?: string) {
  if (!value || !/^\d+$/.test(value)) return undefined;

  try {
    const parsed = BigInt(value);
    return parsed > 0n ? parsed : undefined;
  } catch {
    return undefined;
  }
}

async function verifyWalletChain(provider: Pick<EIP1193Provider, "request">) {
  let walletChainId: unknown;

  try {
    walletChainId = await provider.request({ method: "eth_chainId" });
  } catch (error) {
    throw new Error(
      `Wallet-signed bidding requires your wallet to access the target RPC. ${walletErrorMessage(error, "")}`
    );
  }

  if (typeof walletChainId !== "string" || Number.parseInt(walletChainId, 16) !== targetChainId) {
    throw new Error(`Wallet connected, but not on the target chain (${targetChainLabel}).`);
  }
}

const pendingBidStoragePrefix = "bidback:pending-wallet-bid:v1";
const transactionHashPattern = /^0x[0-9a-fA-F]{64}$/;

type ResolvedBidReplacement = {
  reason: "cancelled" | "replaced";
  hash: `0x${string}`;
  originalHash: `0x${string}`;
  outcome: "confirmed" | "reverted";
  blockNumber: string;
  blockHash: `0x${string}`;
};

type StoredTerminalBlockEvidence = {
  blockNumber: string;
  blockHash: `0x${string}`;
};

type StoredBidIntent = {
  version: 1;
  kind: "wallet-dispatch-intent";
};

type StoredRejectedBidCleanup = {
  version: 1;
  kind: "wallet-rejected-cleanup-pending";
};

type StoredPreDispatchCleanup = {
  version: 1;
  kind: "wallet-not-opened-cleanup-pending";
};

type StoredBidLotIdentity = {
  chainId: number;
  auctionHouse: `0x${string}`;
  auctionId: string;
  bidder: `0x${string}`;
  seller: `0x${string}`;
  nft: `0x${string}`;
  tokenId: string;
  startPrice: string;
  startTime: string;
  initialEndTime: string;
  modules: {
    nftVault: `0x${string}`;
    escrowVault: `0x${string}`;
    distributionVault: `0x${string}`;
    reputationAdapter: `0x${string}`;
  };
  reviewBlock: {
    number: string;
    hash: `0x${string}`;
  };
};

type StoredBidSubmission = {
  version: 2;
  kind: "submitted-wallet-bid";
  hash: `0x${string}`;
  expectedNewCap: string;
  lot: StoredBidLotIdentity;
  resolvedReplacement?: ResolvedBidReplacement;
  resolvedOutcome?: {
    kind: "confirmed" | "reverted";
    hash: `0x${string}`;
    blockNumber: string;
    blockHash: `0x${string}`;
  };
};

type StoredBidRecovery = StoredBidIntent | StoredRejectedBidCleanup | StoredPreDispatchCleanup | StoredBidSubmission;

type StorageResult<T> = { ok: true; value: T } | { ok: false; error: string };

type StoredBidReadResult = StorageResult<StoredBidRecovery | null> & {
  fallback?: StoredBidRecovery | null;
};

const pendingBidMemoryRegistry = new Map<string, { recovery: StoredBidRecovery; storageWriteFailed: boolean }>();

type BidOperation = {
  identity: string;
  token: number;
};

type ReviewedBid = {
  auctionHouse: `0x${string}`;
  auctionId: bigint;
  bidder: `0x${string}`;
  expectedNewCap: bigint;
  submission: StoredBidSubmission;
};

type BidPublicClient = Awaited<ReturnType<typeof createConnectedWalletClients>>["publicClient"];

type TrackedBidReceipt = {
  effectiveHash: `0x${string}`;
  receipt: Awaited<ReturnType<BidPublicClient["waitForTransactionReceipt"]>>;
  replacement: { reason: ReplacementReason; hash: `0x${string}` } | null;
};

type TerminalReceiptClassification =
  | { ok: true; outcome: "confirmed" | "reverted" }
  | { ok: false; error: string };

function isTransactionHash(value: unknown): value is `0x${string}` {
  return typeof value === "string" && transactionHashPattern.test(value);
}

function isStoredAddress(value: unknown): value is `0x${string}` {
  return typeof value === "string" && /^0x[0-9a-fA-F]{40}$/.test(value);
}

function isUnsignedDecimal(value: unknown) {
  return typeof value === "string" && /^\d+$/.test(value);
}

function isStoredTerminalBlockEvidence(value: unknown): value is StoredTerminalBlockEvidence {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<StoredTerminalBlockEvidence>;
  return isUnsignedDecimal(candidate.blockNumber) && isTransactionHash(candidate.blockHash);
}

function pendingBidStorageKey(auctionHouse: string, auctionId: string, account: string) {
  const canonicalAuctionId = /^\d+$/.test(auctionId)
    ? auctionId.replace(/^0+(?=\d)/, "")
    : auctionId;
  return [
    pendingBidStoragePrefix,
    String(targetChainId),
    auctionHouse.toLowerCase(),
    canonicalAuctionId,
    account.toLowerCase()
  ].join(":");
}

function storageFailure(operation: "read" | "write" | "remove", error: unknown) {
  const detail = error instanceof Error && error.message ? ` ${error.message}` : "";
  return `Session recovery storage ${operation} failed.${detail}`;
}

function readSessionStorage(key: string): StorageResult<string | null> {
  try {
    return { ok: true, value: globalThis.sessionStorage.getItem(key) };
  } catch (error) {
    return { ok: false, error: storageFailure("read", error) };
  }
}

function writeSessionStorage(key: string, value: string): StorageResult<undefined> {
  try {
    globalThis.sessionStorage.setItem(key, value);
    return { ok: true, value: undefined };
  } catch (error) {
    return { ok: false, error: storageFailure("write", error) };
  }
}

function removeSessionStorage(key: string): StorageResult<undefined> {
  try {
    globalThis.sessionStorage.removeItem(key);
    return { ok: true, value: undefined };
  } catch (error) {
    return { ok: false, error: storageFailure("remove", error) };
  }
}

function isStoredBidSubmission(value: unknown): value is StoredBidSubmission {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<StoredBidSubmission>;
  if (candidate.version !== 2 || candidate.kind !== "submitted-wallet-bid" || !isTransactionHash(candidate.hash) ||
    typeof candidate.expectedNewCap !== "string" || !/^[1-9]\d*$/.test(candidate.expectedNewCap)) return false;
  const lot = candidate.lot as Partial<StoredBidLotIdentity> | undefined;
  if (!lot || !Number.isSafeInteger(lot.chainId) || Number(lot.chainId) <= 0 ||
    !isStoredAddress(lot.auctionHouse) || !isUnsignedDecimal(lot.auctionId) ||
    !isStoredAddress(lot.bidder) || !isStoredAddress(lot.seller) || !isStoredAddress(lot.nft) ||
    !isUnsignedDecimal(lot.tokenId) || !isUnsignedDecimal(lot.startPrice) ||
    !isUnsignedDecimal(lot.startTime) || !isUnsignedDecimal(lot.initialEndTime)) return false;
  const modules = lot.modules as Partial<StoredBidLotIdentity["modules"]> | undefined;
  if (!modules || !isStoredAddress(modules.nftVault) || !isStoredAddress(modules.escrowVault) ||
    !isStoredAddress(modules.distributionVault) || !isStoredAddress(modules.reputationAdapter)) return false;
  const reviewBlock = lot.reviewBlock as Partial<StoredBidLotIdentity["reviewBlock"]> | undefined;
  if (!reviewBlock || !isUnsignedDecimal(reviewBlock.number) || !isTransactionHash(reviewBlock.hash)) return false;
  if (candidate.resolvedReplacement && candidate.resolvedOutcome) return false;
  if (candidate.resolvedReplacement) {
    const { reason, hash, originalHash, outcome } = candidate.resolvedReplacement;
    if ((reason !== "cancelled" && reason !== "replaced") || !isTransactionHash(hash)) return false;
    if (!isTransactionHash(originalHash) || originalHash.toLowerCase() !== candidate.hash.toLowerCase()) return false;
    if (outcome !== "confirmed" && outcome !== "reverted") return false;
    if (!isStoredTerminalBlockEvidence(candidate.resolvedReplacement)) return false;
  }
  if (candidate.resolvedOutcome) {
    const { kind, hash } = candidate.resolvedOutcome;
    if ((kind !== "confirmed" && kind !== "reverted") || !isTransactionHash(hash)) return false;
    if (hash.toLowerCase() !== candidate.hash.toLowerCase()) return false;
    if (!isStoredTerminalBlockEvidence(candidate.resolvedOutcome)) return false;
  }
  return true;
}

function isLegacyStoredBidSubmission(value: unknown) {
  if (!value || typeof value !== "object") return false;
  const candidate = value as { version?: unknown; hash?: unknown; expectedNewCap?: unknown; kind?: unknown };
  return candidate.version === 1 && candidate.kind === undefined &&
    (candidate.hash !== undefined || candidate.expectedNewCap !== undefined);
}

function isStoredBidIntent(value: unknown): value is StoredBidIntent {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<StoredBidIntent>;
  return candidate.version === 1 && candidate.kind === "wallet-dispatch-intent";
}

function isStoredRejectedBidCleanup(value: unknown): value is StoredRejectedBidCleanup {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<StoredRejectedBidCleanup>;
  return candidate.version === 1 && candidate.kind === "wallet-rejected-cleanup-pending";
}

function isStoredPreDispatchCleanup(value: unknown): value is StoredPreDispatchCleanup {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<StoredPreDispatchCleanup>;
  return candidate.version === 1 && candidate.kind === "wallet-not-opened-cleanup-pending";
}

function isStoredBidRecovery(value: unknown): value is StoredBidRecovery {
  return isStoredBidIntent(value) || isStoredRejectedBidCleanup(value) ||
    isStoredPreDispatchCleanup(value) || isStoredBidSubmission(value);
}

function readStoredBidRecovery(key: string): StoredBidReadResult {
  const memory = pendingBidMemoryRegistry.get(key);
  const read = readSessionStorage(key);
  if (!read.ok) return { ...read, fallback: memory?.recovery ?? null };
  if (read.value === null) {
    if (memory?.storageWriteFailed) {
      return {
        ok: false,
        error: "Session recovery storage does not contain the bid recovery state retained in memory.",
        fallback: memory.recovery
      };
    }
    pendingBidMemoryRegistry.delete(key);
    return { ok: true, value: null };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(read.value);
  } catch {
    if (memory?.storageWriteFailed) {
      return {
        ok: false,
        error: "Session recovery storage is older than the bid recovery state retained in memory.",
        fallback: memory.recovery
      };
    }
    pendingBidMemoryRegistry.delete(key);
    return {
      ok: false,
      error: "Session recovery storage contains a malformed bid marker. It was retained because a previous wallet request cannot be ruled out."
    };
  }
  if (!isStoredBidRecovery(parsed)) {
    if (memory?.storageWriteFailed) {
      return {
        ok: false,
        error: "Session recovery storage is older than the bid recovery state retained in memory.",
        fallback: memory.recovery
      };
    }
    pendingBidMemoryRegistry.delete(key);
    return {
      ok: false,
      error: isLegacyStoredBidSubmission(parsed)
        ? "Session recovery storage contains a legacy bid marker without a complete immutable lot identity. It was retained and cannot be migrated safely."
        : "Session recovery storage contains an invalid or incomplete bid marker without a verifiable lot identity. It was retained because a previous wallet request cannot be ruled out."
    };
  }
  if (memory?.storageWriteFailed && JSON.stringify(memory.recovery) !== JSON.stringify(parsed)) {
    const repricedHashIsNewer = isStoredBidSubmission(memory.recovery) && isStoredBidSubmission(parsed) &&
      memory.recovery.hash.toLowerCase() !== parsed.hash.toLowerCase() &&
      memory.recovery.expectedNewCap === parsed.expectedNewCap;
    return {
      ok: false,
      error: repricedHashIsNewer
        ? "Session recovery storage contains an older transaction hash than the repriced bid retained in memory."
        : "Session recovery storage contains an older bid state than the recovery state retained in memory.",
      fallback: memory.recovery
    };
  }

  pendingBidMemoryRegistry.set(key, { recovery: parsed, storageWriteFailed: false });
  return { ok: true, value: parsed };
}

function writeAndVerifyStoredBidRecovery(key: string, recovery: StoredBidRecovery): StorageResult<undefined> {
  const serializedRecovery = JSON.stringify(recovery);
  pendingBidMemoryRegistry.set(key, { recovery, storageWriteFailed: true });
  const write = writeSessionStorage(key, serializedRecovery);
  if (!write.ok) return write;

  const read = readSessionStorage(key);
  if (!read.ok) {
    return {
      ok: false,
      error: `Session recovery storage write could not be verified. ${read.error}`
    };
  }
  if (read.value !== serializedRecovery) {
    return {
      ok: false,
      error: "Session recovery storage write could not be verified because the stored value does not match the latest recovery state."
    };
  }

  pendingBidMemoryRegistry.set(key, { recovery, storageWriteFailed: false });
  return { ok: true, value: undefined };
}

function writeStoredBidRecovery(key: string, recovery: StoredBidRecovery): StorageResult<undefined> {
  return writeAndVerifyStoredBidRecovery(key, recovery);
}

function retainBidRecoveryAfterCleanupFailure(
  key: string,
  error: string,
  resolvedSubmission?: StoredBidSubmission
): { ok: false; error: string } {
  const retained = resolvedSubmission ?? pendingBidMemoryRegistry.get(key)?.recovery;
  if (retained) pendingBidMemoryRegistry.set(key, { recovery: retained, storageWriteFailed: true });
  if (!resolvedSubmission) return { ok: false, error };

  const markerWrite = writeAndVerifyStoredBidRecovery(key, resolvedSubmission);
  if (!markerWrite.ok) return { ok: false, error: `${error} ${markerWrite.error}` };
  return { ok: false, error };
}

function clearStoredBidRecovery(
  key: string,
  resolvedSubmission?: StoredBidSubmission
): StorageResult<undefined> {
  const remove = removeSessionStorage(key);
  if (!remove.ok) return retainBidRecoveryAfterCleanupFailure(key, remove.error, resolvedSubmission);

  const read = readSessionStorage(key);
  if (!read.ok) return retainBidRecoveryAfterCleanupFailure(key, read.error, resolvedSubmission);
  if (read.value !== null) {
    return retainBidRecoveryAfterCleanupFailure(
      key,
      "Session recovery storage cleanup could not be verified.",
      resolvedSubmission
    );
  }

  pendingBidMemoryRegistry.delete(key);
  return remove;
}

type DurableBidIntentResult = StorageResult<undefined> & { intentWritten?: boolean };

function establishDurableBidIntent(key: string): DurableBidIntentResult {
  const existing = readStoredBidRecovery(key);
  if (!existing.ok) return existing;
  if (existing.value) {
    return { ok: false, error: "Session recovery storage already contains an unresolved bid marker." };
  }

  const intent: StoredBidIntent = { version: 1, kind: "wallet-dispatch-intent" };
  const serializedIntent = JSON.stringify(intent);
  const write = writeSessionStorage(key, serializedIntent);
  if (!write.ok) return write;

  pendingBidMemoryRegistry.set(key, { recovery: intent, storageWriteFailed: false });
  const read = readSessionStorage(key);
  if (!read.ok) return { ...read, intentWritten: true };
  if (read.value !== serializedIntent) {
    return {
      ok: false,
      error: "Session recovery storage did not retain the wallet dispatch marker.",
      intentWritten: true
    };
  }

  return { ok: true, value: undefined };
}

function retainPreDispatchCleanupMarker(key: string): StorageResult<undefined> {
  return writeStoredBidRecovery(key, {
    version: 1,
    kind: "wallet-not-opened-cleanup-pending"
  });
}

function clearPreDispatchRecoveryAndVerify(key: string): StorageResult<undefined> {
  const fallback: StoredPreDispatchCleanup = {
    version: 1,
    kind: "wallet-not-opened-cleanup-pending"
  };
  const remove = removeSessionStorage(key);
  if (!remove.ok) {
    pendingBidMemoryRegistry.set(key, { recovery: fallback, storageWriteFailed: true });
    return remove;
  }
  const read = readSessionStorage(key);
  if (!read.ok) {
    pendingBidMemoryRegistry.set(key, { recovery: fallback, storageWriteFailed: true });
    return read;
  }
  if (read.value !== null) {
    pendingBidMemoryRegistry.set(key, { recovery: fallback, storageWriteFailed: true });
    return { ok: false, error: "Session recovery storage cleanup could not be verified." };
  }
  pendingBidMemoryRegistry.delete(key);
  return { ok: true, value: undefined };
}

function retainRejectedBidCleanupMarker(key: string, cleanupError: string): { ok: false; error: string } {
  const rejectedCleanup: StoredRejectedBidCleanup = {
    version: 1,
    kind: "wallet-rejected-cleanup-pending"
  };
  const write = writeStoredBidRecovery(key, rejectedCleanup);
  return write.ok
    ? { ok: false, error: cleanupError }
    : { ok: false, error: `${cleanupError} ${write.error}` };
}

function probeSessionStorage(key: string): StorageResult<undefined> {
  const probeKey = `${key}:capability-probe`;
  const probeValue = "bidback-session-storage-probe";
  const write = writeSessionStorage(probeKey, probeValue);
  if (!write.ok) return write;
  const read = readSessionStorage(probeKey);
  if (!read.ok) {
    const cleanup = removeSessionStorage(probeKey);
    return cleanup.ok ? read : { ok: false, error: `${read.error} ${cleanup.error}` };
  }
  const remove = removeSessionStorage(probeKey);
  if (!remove.ok) return remove;
  if (read.value !== probeValue) {
    return { ok: false, error: "Session recovery storage capability check returned inconsistent data." };
  }
  return { ok: true, value: undefined };
}

function recoveryStorageMessage(detail: string) {
  return `Recovery storage unavailable. Bidding is locked to prevent an unsafe resubmission. ${detail}`;
}

function replacementTransactionState(replacement: ResolvedBidReplacement, refreshIncomplete: boolean): WalletTransactionState {
  const cancelled = replacement.reason === "cancelled";
  const replacementOutcome = replacement.outcome === "confirmed"
    ? "confirmed on-chain"
    : replacement.outcome === "reverted"
      ? "included on-chain but reverted"
      : "not retained in recovery storage";
  return {
    phase: "failed",
    message: cancelled
      ? "The original reviewed bid was cancelled and was not confirmed."
      : "The original reviewed bid was replaced and was not confirmed.",
    txHash: replacement.originalHash,
    nextAction: refreshIncomplete
      ? "Refresh the auction and wallet bid data before deciding whether to retry."
      : "Auction and wallet bid data were refreshed. Review the current state before deciding whether to retry.",
    technicalDetail: `Replacement transaction ${replacement.hash} was ${replacementOutcome}.`
  };
}

function bidIntentRecoveryState(error?: unknown): WalletTransactionState {
  return {
    phase: "confirmation-unknown",
    message: "A wallet bid request may have been submitted, but no transaction hash was saved.",
    nextAction: "Check this account's wallet activity for the request. Do not submit another bid unless you independently confirm that no transaction was sent.",
    technicalDetail: error ? walletErrorMessage(error, "Wallet submission result is unavailable.") : undefined
  };
}

function rejectedBidCleanupState(): WalletTransactionState {
  return failedTransactionState(
    { code: 4001, message: "User rejected the wallet bid request." },
    "Bid transaction was rejected before submission."
  );
}

function isCanonicalUserRejectedTransaction(error: unknown) {
  const seen = new Set<object>();
  let current = error;

  while (current && typeof current === "object" && !seen.has(current)) {
    seen.add(current);
    const candidate = current as { code?: unknown; cause?: unknown };
    if (candidate.code === 4001) return true;
    current = candidate.cause;
  }

  return false;
}

async function waitForTrackedBidReceipt({
  publicClient,
  hash,
  submission,
  storageKey,
  onRepriced,
  onStorageFailure
}: {
  publicClient: BidPublicClient;
  hash: `0x${string}`;
  submission: StoredBidSubmission;
  storageKey: string;
  onRepriced?: (hash: `0x${string}`) => void;
  onStorageFailure?: (error: string) => void;
}): Promise<TrackedBidReceipt> {
  let replacement: TrackedBidReceipt["replacement"] = null;
  const receipt = await publicClient.waitForTransactionReceipt({
    hash,
    onReplaced: ({ reason, transaction }) => {
      const effectiveHash = transaction.hash;
      replacement = { reason, hash: effectiveHash };
      if (reason === "repriced") {
        const write = writeStoredBidRecovery(storageKey, {
          ...submission,
          hash: effectiveHash,
        });
        if (!write.ok) onStorageFailure?.(write.error);
        onRepriced?.(effectiveHash);
      }
    }
  });
  const observedReplacement = replacement as TrackedBidReceipt["replacement"];
  const effectiveHash = observedReplacement?.hash ?? hash;
  return { effectiveHash, receipt, replacement: observedReplacement };
}

function successfulReceiptMatchesReviewedBid({
  tracked,
  auctionHouse,
  auctionId,
  bidder,
  expectedNewCap
}: {
  tracked: TrackedBidReceipt;
  auctionHouse: `0x${string}`;
  auctionId: bigint;
  bidder: `0x${string}`;
  expectedNewCap: bigint;
}) {
  if (!isTransactionHash(tracked.receipt.transactionHash) ||
    tracked.receipt.transactionHash.toLowerCase() !== tracked.effectiveHash.toLowerCase()) return false;

  if (!Array.isArray(tracked.receipt.logs)) return false;
  return tracked.receipt.logs.some((log) => {
    if (!sameAddress(log.address, auctionHouse)) return false;
    try {
      const decoded = decodeEventLog({
        abi: auctionHouseAbi,
        eventName: "BidPlaced",
        data: log.data,
        topics: log.topics,
        strict: true
      });
      return decoded.args.auctionId === auctionId &&
        sameAddress(decoded.args.bidder, bidder) &&
        decoded.args.amount === expectedNewCap;
    } catch {
      return false;
    }
  });
}

function classifyTerminalReceipt(tracked: TrackedBidReceipt): TerminalReceiptClassification {
  const receipt = tracked.receipt as { status?: unknown; transactionHash?: unknown };
  if (receipt.status !== "success" && receipt.status !== "reverted") {
    return {
      ok: false,
      error: "The receipt did not contain a terminal success or reverted status. Recovery remains locked."
    };
  }
  if (!isTransactionHash(receipt.transactionHash) ||
    receipt.transactionHash.toLowerCase() !== tracked.effectiveHash.toLowerCase()) {
    return {
      ok: false,
      error: "The receipt transaction hash is missing or does not match the tracked transaction. Recovery remains locked."
    };
  }
  return { ok: true, outcome: receipt.status === "success" ? "confirmed" : "reverted" };
}

async function verifyCanonicalReceiptBlock(
  publicClient: BidPublicClient,
  tracked: TrackedBidReceipt
): Promise<StoredTerminalBlockEvidence> {
  const receipt = tracked.receipt as { blockNumber?: unknown; blockHash?: unknown };
  if (typeof receipt.blockNumber !== "bigint" || receipt.blockNumber < 0n || !isTransactionHash(receipt.blockHash)) {
    throw new Error(
      "The receipt does not contain a valid canonical block number and hash. Recovery remains locked."
    );
  }

  const canonicalBlock = await publicClient.getBlock({ blockNumber: receipt.blockNumber });
  if (canonicalBlock.number !== receipt.blockNumber || !isTransactionHash(canonicalBlock.hash) ||
    canonicalBlock.hash.toLowerCase() !== receipt.blockHash.toLowerCase()) {
    throw new Error(
      "The receipt block is no longer canonical or cannot be verified. Recovery remains locked."
    );
  }
  return {
    blockNumber: receipt.blockNumber.toString(),
    blockHash: receipt.blockHash
  };
}

async function verifyStoredTerminalCanonicalBlock(
  publicClient: BidPublicClient,
  evidence: StoredTerminalBlockEvidence
) {
  const blockNumber = BigInt(evidence.blockNumber);
  const canonicalBlock = await publicClient.getBlock({ blockNumber });
  if (canonicalBlock.number !== blockNumber || !isTransactionHash(canonicalBlock.hash) ||
    canonicalBlock.hash.toLowerCase() !== evidence.blockHash.toLowerCase()) {
    throw new Error(
      "The stored terminal transaction block is no longer canonical or cannot be verified. Recovery remains locked."
    );
  }
}

type OnchainAuctionIdentity = {
  seller: string;
  nft: string;
  tokenId: bigint;
  startPrice: bigint;
  startTime: bigint;
  initialEndTime: bigint;
};

type OnchainAuctionModules = StoredBidLotIdentity["modules"];

function numericAuctionFieldMatches(displayed: string, onchain: bigint) {
  try {
    return BigInt(displayed) === onchain;
  } catch {
    return false;
  }
}

function immutableAuctionMismatches(onchain: OnchainAuctionIdentity, displayed: SerializedAuction) {
  const mismatches: string[] = [];
  if (!sameAddress(onchain.seller, displayed.seller)) mismatches.push("seller");
  if (!sameAddress(onchain.nft, displayed.nft)) mismatches.push("NFT contract");
  if (!numericAuctionFieldMatches(displayed.tokenId, onchain.tokenId)) mismatches.push("token ID");
  if (!numericAuctionFieldMatches(displayed.startPrice, onchain.startPrice)) mismatches.push("start price");
  if (!numericAuctionFieldMatches(displayed.startTime, onchain.startTime)) mismatches.push("start time");
  if (!numericAuctionFieldMatches(displayed.initialEndTime, onchain.initialEndTime)) mismatches.push("initial end time");
  return mismatches;
}

function storedBidDisplayedLotMismatches(stored: StoredBidLotIdentity, displayed: SerializedAuction) {
  const mismatches: string[] = [];
  if (!sameAddress(stored.seller, displayed.seller)) mismatches.push("seller");
  if (!sameAddress(stored.nft, displayed.nft)) mismatches.push("NFT contract");
  if (!numericAuctionFieldMatches(displayed.tokenId, BigInt(stored.tokenId))) mismatches.push("token ID");
  if (!numericAuctionFieldMatches(displayed.startPrice, BigInt(stored.startPrice))) mismatches.push("start price");
  if (!numericAuctionFieldMatches(displayed.startTime, BigInt(stored.startTime))) mismatches.push("start time");
  if (!numericAuctionFieldMatches(displayed.initialEndTime, BigInt(stored.initialEndTime))) {
    mismatches.push("initial end time");
  }
  return mismatches;
}

function storedBidLotIdentity({
  auctionHouse,
  auctionId,
  bidder,
  onchain,
  modules,
  blockNumber,
  blockHash
}: {
  auctionHouse: `0x${string}`;
  auctionId: bigint;
  bidder: `0x${string}`;
  onchain: OnchainAuctionIdentity;
  modules: OnchainAuctionModules;
  blockNumber: bigint;
  blockHash: `0x${string}`;
}): StoredBidLotIdentity {
  return {
    chainId: targetChainId,
    auctionHouse,
    auctionId: auctionId.toString(),
    bidder,
    seller: onchain.seller as `0x${string}`,
    nft: onchain.nft as `0x${string}`,
    tokenId: onchain.tokenId.toString(),
    startPrice: onchain.startPrice.toString(),
    startTime: onchain.startTime.toString(),
    initialEndTime: onchain.initialEndTime.toString(),
    modules,
    reviewBlock: {
      number: blockNumber.toString(),
      hash: blockHash
    }
  };
}

function storedBidLotMismatches({
  stored,
  auctionHouse,
  auctionId,
  bidder,
  onchain,
  modules
}: {
  stored: StoredBidLotIdentity;
  auctionHouse: `0x${string}`;
  auctionId: bigint;
  bidder: `0x${string}`;
  onchain: OnchainAuctionIdentity;
  modules: OnchainAuctionModules;
}) {
  const mismatches: string[] = [];
  if (stored.chainId !== targetChainId) mismatches.push("chain ID");
  if (!sameAddress(stored.auctionHouse, auctionHouse)) mismatches.push("AuctionHouse");
  if (stored.auctionId !== auctionId.toString()) mismatches.push("auction ID");
  if (!sameAddress(stored.bidder, bidder)) mismatches.push("bidder");
  if (!sameAddress(stored.seller, onchain.seller)) mismatches.push("seller");
  if (!sameAddress(stored.nft, onchain.nft)) mismatches.push("NFT contract");
  if (stored.tokenId !== onchain.tokenId.toString()) mismatches.push("token ID");
  if (stored.startPrice !== onchain.startPrice.toString()) mismatches.push("start price");
  if (stored.startTime !== onchain.startTime.toString()) mismatches.push("start time");
  if (stored.initialEndTime !== onchain.initialEndTime.toString()) mismatches.push("initial end time");
  if (!sameAddress(stored.modules.nftVault, modules.nftVault)) mismatches.push("NFTVault snapshot");
  if (!sameAddress(stored.modules.escrowVault, modules.escrowVault)) mismatches.push("EscrowVault snapshot");
  if (!sameAddress(stored.modules.distributionVault, modules.distributionVault)) {
    mismatches.push("DistributionVault snapshot");
  }
  if (!sameAddress(stored.modules.reputationAdapter, modules.reputationAdapter)) {
    mismatches.push("ReputationAdapter snapshot");
  }
  return mismatches;
}

function isUsableContractAddress(value: unknown): value is `0x${string}` {
  return typeof value === "string" && /^0x[0-9a-fA-F]{40}$/.test(value) &&
    value.toLowerCase() !== "0x0000000000000000000000000000000000000000";
}

function lotVerificationMessage(error: unknown) {
  const detail = walletErrorMessage(error, "The on-chain lot could not be read.");
  if (detail.includes("Bidding is locked.")) {
    return detail;
  }
  return `Unable to verify the displayed auction at one pinned block. Bidding is locked. ${detail}`;
}

export function WalletBidPanel({
  auction,
  expectedChainId,
  expectedAuctionHouse,
  onBidComplete
}: {
  auction: SerializedAuction;
  expectedChainId: number;
  expectedAuctionHouse: `0x${string}`;
  onBidComplete: () => Promise<void>;
}) {
  const { address, chainId, isConnected, connector } = useAccount();
  const config = useConfig();

  const [deployment, setDeployment] = useState<Deployment | null>(null);
  const [deploymentError, setDeploymentError] = useState<string | null>(null);
  const [isDeploymentLoading, setIsDeploymentLoading] = useState(true);

  const [minimumNextBid, setMinimumNextBid] = useState<bigint | null>(null);
  const [currentCap, setCurrentCap] = useState<bigint | null>(null);
  const [verifiedChainTimestamp, setVerifiedChainTimestamp] = useState<bigint | null>(null);
  const [verifiedAuctionState, setVerifiedAuctionState] = useState<SerializedAuction["state"] | null>(null);
  const [verifiedAuctionEndTime, setVerifiedAuctionEndTime] = useState<bigint | null>(null);
  const [lotVerificationError, setLotVerificationError] = useState<string | null>(null);
  const [bidAmountEth, setBidAmountEth] = useState("");

  const [isLoadingBidData, setIsLoadingBidData] = useState(false);
  const [isPlacingBid, setIsPlacingBid] = useState(false);
  const [isReviewingBid, setIsReviewingBid] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [txStatus, setTxStatus] = useState<WalletTransactionState | null>(null);
  const [resolvedReplacement, setResolvedReplacement] = useState<ResolvedBidReplacement | null>(null);
  const [storageRecoveryError, setStorageRecoveryError] = useState<string | null>(null);
  const [recoveryIdentityError, setRecoveryIdentityError] = useState<string | null>(null);
  const [storageCleanupSubmission, setStorageCleanupSubmission] = useState<StoredBidSubmission | null>(null);
  const [rejectedCleanupPending, setRejectedCleanupPending] = useState(false);
  const [preDispatchCleanupPending, setPreDispatchCleanupPending] = useState(false);

  const identity = [
    address,
    chainId,
    connector?.uid,
    expectedChainId,
    expectedAuctionHouse.toLowerCase(),
    auction.auctionId,
    auction.seller.toLowerCase(),
    auction.nft.toLowerCase(),
    auction.tokenId,
    auction.startPrice,
    auction.startTime,
    auction.initialEndTime,
    isConnected
  ].join(":");
  const identityRef = useRef(identity);
  identityRef.current = identity;
  const readSequence = useRef(0);
  const operationSequence = useRef(0);
  const activeOperationRef = useRef<BidOperation | null>(null);
  useEffect(() => {
    identityRef.current = identity;
    return () => {
      identityRef.current = "unmounted";
      readSequence.current += 1;
      operationSequence.current += 1;
      activeOperationRef.current = null;
    };
  }, [identity]);
  const reviewRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (isReviewingBid) reviewRef.current?.focus();
  }, [isReviewingBid]);

  const wrongNetwork = isConnected && chainId !== targetChainId;
  const auctionOpen = auction.state === 0;
  const auctionChainTimestamp = parseChainTimestamp(auction.chainTimestamp);
  const targetBindingError = expectedChainId !== targetChainId
    ? `This auction was loaded for chain ${expectedChainId}, but wallet bidding is configured for ${targetChainLabel} (${targetChainId}). Bidding is locked.`
    : deployment && !sameAddress(expectedAuctionHouse, deployment.contracts.auctionHouse)
      ? `The displayed AuctionHouse (${expectedAuctionHouse}) does not match the configured AuctionHouse (${deployment.contracts.auctionHouse}). Bidding is locked.`
      : null;
  const pendingBidKey = useMemo(() => {
    if (!deployment || !address || !isConnected || wrongNetwork || targetBindingError) return null;
    return pendingBidStorageKey(deployment.contracts.auctionHouse, auction.auctionId, address);
  }, [address, auction.auctionId, deployment, isConnected, targetBindingError, wrongNetwork]);

  const auctionIdBigInt = useMemo(() => {
    if (!/^\d+$/.test(auction.auctionId)) return null;
    return BigInt(auction.auctionId);
  }, [auction.auctionId]);

  useEffect(() => {
    let active = true;

    async function loadDeployment() {
      try {
        setIsDeploymentLoading(true);
        const loaded = await fetchDeployment();

        if (active) {
          setDeployment(loaded);
          setDeploymentError(null);
        }
      } catch (caught) {
        if (active) {
          setDeployment(null);
          setDeploymentError(caught instanceof Error ? caught.message : "Deployment missing or stale.");
        }
      } finally {
        if (active) {
          setIsDeploymentLoading(false);
        }
      }
    }

    loadDeployment();

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    readSequence.current += 1;
    operationSequence.current += 1;
    activeOperationRef.current = null;
    setIsPlacingBid(false);
    setIsLoadingBidData(false);
    setMessage(null);
    setMinimumNextBid(null);
    setCurrentCap(null);
    setVerifiedChainTimestamp(null);
    setVerifiedAuctionState(null);
    setVerifiedAuctionEndTime(null);
    setLotVerificationError(null);
    setBidAmountEth("");
    setTxStatus(null);
    setResolvedReplacement(null);
    setStorageRecoveryError(null);
    setRecoveryIdentityError(null);
    setStorageCleanupSubmission(null);
    setRejectedCleanupPending(false);
    setPreDispatchCleanupPending(false);
    setIsReviewingBid(false);
  }, [address, chainId, connector?.uid, expectedAuctionHouse, expectedChainId, auction.auctionId,
    auction.seller, auction.nft, auction.tokenId, auction.startPrice, auction.startTime,
    auction.initialEndTime, isConnected]);

  useEffect(() => {
    if (!pendingBidKey) return;
    const read = readStoredBidRecovery(pendingBidKey);
    const stored = read.ok ? read.value : read.fallback ?? null;
    if (!read.ok) setStorageRecoveryError(recoveryStorageMessage(read.error));
    if (!stored) return;

    setIsReviewingBid(false);
    if (isStoredBidIntent(stored)) {
      setResolvedReplacement(null);
      setTxStatus(bidIntentRecoveryState());
      return;
    }
    if (isStoredRejectedBidCleanup(stored)) {
      setRejectedCleanupPending(true);
      setStorageRecoveryError(recoveryStorageMessage("A rejected wallet request marker still requires cleanup."));
      setResolvedReplacement(null);
      setTxStatus(rejectedBidCleanupState());
      return;
    }
    if (isStoredPreDispatchCleanup(stored)) {
      setPreDispatchCleanupPending(true);
      setStorageRecoveryError(recoveryStorageMessage("No wallet request was opened, but its recovery marker still requires verified cleanup."));
      setResolvedReplacement(null);
      setTxStatus({
        phase: "failed",
        message: "No wallet request was opened.",
        nextAction: "Retry recovery storage cleanup before reviewing the bid again."
      });
      return;
    }
    setResolvedReplacement(null);
    setStorageCleanupSubmission(null);
    setTxStatus(unknownConfirmationState(
      stored.hash,
      new Error("Restored submitted bid awaiting immutable lot identity and receipt verification.")
    ));
  }, [identity, pendingBidKey]);

  const isStepUp = currentCap !== null && currentCap > 0n;
  const bidActionState = getBidActionState({
    isConnected,
    wrongNetwork,
    targetChainLabel,
    deploymentLoaded: Boolean(deployment),
    deploymentError: targetBindingError ?? lotVerificationError ?? deploymentError,
    auctionIdValid: Boolean(auctionIdBigInt),
    loading: isLoadingBidData,
    pending: false,
    auctionState: verifiedAuctionState ?? auction.state,
    endTime: verifiedAuctionEndTime ?? auction.endTime,
    nowSeconds: verifiedChainTimestamp ?? auctionChainTimestamp,
    minimumNextBid,
    currentCap,
    bidAmountEth
  });
  const parsedEnteredAmount = parseBidAmount(bidAmountEth, isStepUp ? "step-up-delta" : "total-cap").value;
  const enteredValueToSend = parsedEnteredAmount !== null && parsedEnteredAmount > 0n
    ? parsedEnteredAmount
    : null;
  const displayedNewCap = enteredValueToSend === null || currentCap === null
    ? null
    : isStepUp ? currentCap + enteredValueToSend : enteredValueToSend;

  function beginBidOperation() {
    if (activeOperationRef.current?.identity === identity) return null;
    const operation = { identity, token: ++operationSequence.current };
    activeOperationRef.current = operation;
    setIsPlacingBid(true);
    return operation;
  }

  function isCurrentBidOperation(operation: BidOperation) {
    return identityRef.current === operation.identity &&
      activeOperationRef.current?.identity === operation.identity &&
      activeOperationRef.current.token === operation.token;
  }

  function finishBidOperation(operation: BidOperation) {
    if (!isCurrentBidOperation(operation)) return;
    activeOperationRef.current = null;
    setIsPlacingBid(false);
  }

  async function readVerifiedBidSnapshot(publicClient: BidPublicClient, account: `0x${string}`) {
    if (!deployment) throw new Error("Deployment missing or stale.");
    if (!auctionIdBigInt) throw new Error("Invalid auction ID.");
    if (targetBindingError) throw new Error(targetBindingError);

    const block = await publicClient.getBlock({ blockTag: "latest" });
    if (typeof block.number !== "bigint" || !isTransactionHash(block.hash)) {
      throw new Error("The latest block number or hash is unavailable.");
    }
    const blockNumber = block.number;
    const auctionHouse = deployment.contracts.auctionHouse;
    const [onchainAuction, modules, minimumRequired] = await Promise.all([
      publicClient.readContract({
        address: auctionHouse,
        abi: auctionHouseAbi,
        functionName: "getAuction",
        args: [auctionIdBigInt],
        blockNumber
      }),
      publicClient.readContract({
        address: auctionHouse,
        abi: auctionHouseAbi,
        functionName: "getAuctionModules",
        args: [auctionIdBigInt],
        blockNumber
      }),
      publicClient.readContract({
        address: auctionHouse,
        abi: auctionHouseAbi,
        functionName: "minimumNextBid",
        args: [auctionIdBigInt],
        blockNumber
      })
    ]);

    const mismatches = immutableAuctionMismatches(onchainAuction, auction);
    if (mismatches.length > 0) {
      throw new Error(
        `Displayed auction does not match the on-chain lot at block ${blockNumber.toString()} (${mismatches.join(", ")}). Bidding is locked. Refresh the auction before trying again.`
      );
    }
    const invalidModule = Object.entries(modules).find(([, value]) => !isUsableContractAddress(value));
    if (invalidModule) {
      throw new Error(`The auction module snapshot does not contain a valid ${invalidModule[0]}. Bidding is locked.`);
    }

    const walletCap = await publicClient.readContract({
      address: modules.escrowVault,
      abi: escrowVaultAbi,
      functionName: "capOf",
      args: [auctionIdBigInt, account],
      blockNumber
    });

    return {
      minimumRequired,
      walletCap,
      blockTimestamp: block.timestamp,
      blockNumber,
      escrowVault: modules.escrowVault,
      lotIdentity: storedBidLotIdentity({
        auctionHouse,
        auctionId: auctionIdBigInt,
        bidder: account,
        onchain: onchainAuction,
        modules,
        blockNumber,
        blockHash: block.hash
      }),
      liveState: onchainAuction.state,
      liveEndTime: onchainAuction.endTime
    };
  }

  async function verifyStoredBidLotIdentity(
    publicClient: BidPublicClient,
    stored: StoredBidSubmission,
    account: `0x${string}`
  ) {
    if (!deployment) throw new Error("Deployment missing or stale.");
    if (!auctionIdBigInt) throw new Error("Invalid auction ID.");

    const auctionHouse = deployment.contracts.auctionHouse;
    const contextMismatches: string[] = [];
    if (stored.lot.chainId !== targetChainId) contextMismatches.push("chain ID");
    if (!sameAddress(stored.lot.auctionHouse, auctionHouse)) contextMismatches.push("AuctionHouse");
    if (stored.lot.auctionId !== auctionIdBigInt.toString()) contextMismatches.push("auction ID");
    if (!sameAddress(stored.lot.bidder, account)) contextMismatches.push("bidder");
    if (contextMismatches.length > 0) {
      throw new Error(`Persisted bid context mismatch (${contextMismatches.join(", ")}).`);
    }
    const displayedMismatches = storedBidDisplayedLotMismatches(stored.lot, auction);
    if (displayedMismatches.length > 0) {
      throw new Error(`Displayed auction does not match the persisted bid lot (${displayedMismatches.join(", ")}).`);
    }

    const latestBlock = await publicClient.getBlock({ blockTag: "latest" });
    if (typeof latestBlock.number !== "bigint" || !isTransactionHash(latestBlock.hash)) {
      throw new Error("The latest canonical block number or hash is unavailable.");
    }
    const reviewBlockNumber = BigInt(stored.lot.reviewBlock.number);
    const [reviewBlock, onchainAuction, modules] = await Promise.all([
      publicClient.getBlock({ blockNumber: reviewBlockNumber }),
      publicClient.readContract({
        address: auctionHouse,
        abi: auctionHouseAbi,
        functionName: "getAuction",
        args: [auctionIdBigInt],
        blockNumber: latestBlock.number
      }),
      publicClient.readContract({
        address: auctionHouse,
        abi: auctionHouseAbi,
        functionName: "getAuctionModules",
        args: [auctionIdBigInt],
        blockNumber: latestBlock.number
      })
    ]);

    if (!isTransactionHash(reviewBlock.hash) ||
      reviewBlock.hash.toLowerCase() !== stored.lot.reviewBlock.hash.toLowerCase()) {
      throw new Error("The canonical review block changed or is unavailable.");
    }
    const mismatches = storedBidLotMismatches({
      stored: stored.lot,
      auctionHouse,
      auctionId: auctionIdBigInt,
      bidder: account,
      onchain: onchainAuction,
      modules
    });
    if (mismatches.length > 0) {
      throw new Error(`Persisted bid lot mismatch (${mismatches.join(", ")}).`);
    }
  }

  async function readWalletBidData(rethrow = false) {
    if (!address) throw new Error("Wallet not connected.");
    if (!deployment) throw new Error("Deployment missing or stale.");
    if (!auctionIdBigInt) throw new Error("Invalid auction ID.");
    if (!auctionOpen) throw new Error("Auction is not OPEN.");
    if (wrongNetwork) throw new Error(`Wallet connected, but not on the target chain (${targetChainLabel}).`);

    const request = ++readSequence.current;
    const isCurrent = () => identityRef.current === identity && request === readSequence.current;
    try {
      setIsReviewingBid(false);
      setIsLoadingBidData(true);
      setMessage(null);

      const { provider, publicClient } = await createConnectedWalletClients(config, connector, address);
      await verifyWalletChain(provider);

      const snapshot = await readVerifiedBidSnapshot(publicClient, address);
      const { minimumRequired, walletCap } = snapshot;

      if (!isCurrent()) return;

      const wasStepUp = currentCap !== null && currentCap > 0n;
      const isNextStepUp = walletCap > 0n;
      const defaultAmount = isNextStepUp
        ? minimumRequired > walletCap ? minimumRequired - walletCap : 0n
        : minimumRequired;

      setMinimumNextBid(minimumRequired);
      setCurrentCap(walletCap);
      setVerifiedChainTimestamp(snapshot.blockTimestamp);
      setVerifiedAuctionState(snapshot.liveState as SerializedAuction["state"]);
      setVerifiedAuctionEndTime(snapshot.liveEndTime);
      setLotVerificationError(null);
      setBidAmountEth((current) =>
        wasStepUp !== isNextStepUp || !current ? formatEther(defaultAmount) : current
      );
    } catch (caught) {
      if (!isCurrent()) return;
      setMinimumNextBid(null);
      setCurrentCap(null);
      setVerifiedChainTimestamp(null);
      setVerifiedAuctionState(null);
      setVerifiedAuctionEndTime(null);
      setLotVerificationError(lotVerificationMessage(caught));
      if (rethrow) throw caught;
      setMessage(walletErrorMessage(caught, "Unable to load wallet bid data."));
    } finally {
      if (isCurrent()) setIsLoadingBidData(false);
    }
  }

  useEffect(() => {
    if (!deployment || !address || !isConnected || wrongNetwork || !auctionOpen) return;

    readWalletBidData().catch((caught) => {
      setMessage(walletErrorMessage(caught, "Unable to load wallet bid data."));
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [address, connector?.uid, auction.auctionId, auction.seller, auction.nft, auction.tokenId,
    auction.startPrice, auction.startTime, auction.initialEndTime, auctionOpen, deployment,
    expectedAuctionHouse, expectedChainId, targetBindingError, wrongNetwork, isConnected]);

  async function refreshResolvedBidReplacement(
    operation: BidOperation,
    publicClient: BidPublicClient,
    storageKey: string,
    replacement: ResolvedBidReplacement
  ) {
    let refreshIncomplete = false;
    try { await onBidComplete(); } catch { refreshIncomplete = true; }
    if (!isCurrentBidOperation(operation)) return;
    try { await readWalletBidData(true); } catch { refreshIncomplete = true; }
    if (!isCurrentBidOperation(operation)) return;
    await verifyStoredTerminalCanonicalBlock(publicClient, replacement);
    if (!isCurrentBidOperation(operation)) return;

    setIsReviewingBid(false);
    setTxStatus(replacementTransactionState(replacement, refreshIncomplete));
    if (refreshIncomplete) {
      setResolvedReplacement(replacement);
      return;
    }

    const clear = clearStoredBidRecovery(storageKey);
    if (!clear.ok) {
      setStorageRecoveryError(recoveryStorageMessage(clear.error));
      setResolvedReplacement(replacement);
      return;
    }
    setStorageRecoveryError(null);
    setResolvedReplacement(null);
  }

  async function settleTrackedBidReceipt({
    operation,
    publicClient,
    storageKey,
    submittedHash,
    tracked,
    reviewedBid,
    confirmedMessage
  }: {
    operation: BidOperation;
    publicClient: BidPublicClient;
    storageKey: string;
    submittedHash: `0x${string}`;
    tracked: TrackedBidReceipt;
    reviewedBid: ReviewedBid;
    confirmedMessage: string;
  }) {
    const terminalReceipt = classifyTerminalReceipt(tracked);
    if (!terminalReceipt.ok) {
      if (isCurrentBidOperation(operation)) {
        setTxStatus(unknownConfirmationState(tracked.effectiveHash, new Error(terminalReceipt.error)));
      }
      return;
    }

    let terminalBlock: StoredTerminalBlockEvidence;
    try {
      await verifyStoredBidLotIdentity(publicClient, reviewedBid.submission, reviewedBid.bidder);
      terminalBlock = await verifyCanonicalReceiptBlock(publicClient, tracked);
    } catch (caught) {
      if (isCurrentBidOperation(operation)) {
        setTxStatus(unknownConfirmationState(tracked.effectiveHash, caught));
      }
      return;
    }
    if (!isCurrentBidOperation(operation)) return;

    if (tracked.replacement && tracked.replacement.reason !== "repriced") {
      const replacement: ResolvedBidReplacement = {
        reason: tracked.replacement.reason,
        hash: tracked.effectiveHash,
        originalHash: submittedHash,
        outcome: terminalReceipt.outcome,
        ...terminalBlock
      };
      const write = writeStoredBidRecovery(storageKey, {
        ...reviewedBid.submission,
        hash: submittedHash,
        resolvedReplacement: replacement
      });
      if (!isCurrentBidOperation(operation)) return;
      if (!write.ok) setStorageRecoveryError(recoveryStorageMessage(write.error));
      setResolvedReplacement(replacement);
      setIsReviewingBid(false);
      setTxStatus(replacementTransactionState(replacement, true));
      await refreshResolvedBidReplacement(operation, publicClient, storageKey, replacement);
      return;
    }

    const successful = terminalReceipt.outcome === "confirmed";
    if (successful && !successfulReceiptMatchesReviewedBid({ tracked, ...reviewedBid })) {
      if (isCurrentBidOperation(operation)) {
        setTxStatus(unknownConfirmationState(
          tracked.effectiveHash,
          new Error("The successful receipt could not be bound to the reviewed bid. Its transaction hash and BidPlaced event must match the reviewed auction, bidder, and new cap.")
        ));
      }
      return;
    }
    const resolvedOutcome: NonNullable<StoredBidSubmission["resolvedOutcome"]> = {
      kind: successful ? "confirmed" : "reverted",
      hash: tracked.effectiveHash,
      ...terminalBlock
    };
    const resolvedSubmission: StoredBidSubmission = {
      ...reviewedBid.submission,
      hash: tracked.effectiveHash,
      resolvedOutcome
    };
    const clear = clearStoredBidRecovery(storageKey, resolvedSubmission);
    if (!isCurrentBidOperation(operation)) return;
    if (!clear.ok) {
      setStorageRecoveryError(recoveryStorageMessage(clear.error));
      setStorageCleanupSubmission(resolvedSubmission);
    } else {
      setStorageRecoveryError(null);
      setStorageCleanupSubmission(null);
    }
    if (!successful) {
      setTxStatus(revertedTransactionState(tracked.effectiveHash));
      return;
    }

    setTxStatus(refreshingTransactionState(tracked.effectiveHash, "Bid confirmed on-chain. Refreshing the auction and wallet cap."));
    let refreshIncomplete = false;
    try { await onBidComplete(); } catch { refreshIncomplete = true; }
    if (!isCurrentBidOperation(operation)) return;
    try { await readWalletBidData(true); } catch { refreshIncomplete = true; }
    if (!isCurrentBidOperation(operation)) return;
    setIsReviewingBid(false);
    setTxStatus(confirmedTransactionState(
      tracked.effectiveHash,
      refreshIncomplete ? `${confirmedMessage}, but displayed data could not be fully refreshed.` : `${confirmedMessage}.`,
      refreshIncomplete
        ? "Refresh the auction and wallet bid data before your next action."
        : "Monitor the auction or review a later increase if you are outbid."
    ));
  }

  async function placeWalletBid() {
    if (activeOperationRef.current?.identity === identity ||
      txStatus?.phase === "confirmation-unknown" || resolvedReplacement ||
      storageRecoveryError || recoveryIdentityError || storageCleanupSubmission || preDispatchCleanupPending) return;

    if (!address) {
      setMessage("Wallet not connected.");
      return;
    }

    if (!deployment) {
      setMessage("Deployment missing or stale.");
      return;
    }

    if (!auctionIdBigInt) {
      setMessage("Invalid auction ID.");
      return;
    }

    const operation = beginBidOperation();
    if (!operation) return;
    const operationStorageKey = pendingBidStorageKey(deployment.contracts.auctionHouse, auction.auctionId, address);
    let submittedHash: `0x${string}` | null = null;
    let pendingHash: `0x${string}` | null = null;
    let durableIntentEstablished = false;

    try {
      setMessage(null);
      setTxStatus(null);

      const { provider, publicClient, walletClient } = await createConnectedWalletClients(config, connector, address);

      await verifyWalletChain(provider);

      let snapshot: Awaited<ReturnType<typeof readVerifiedBidSnapshot>>;
      try {
        snapshot = await readVerifiedBidSnapshot(publicClient, address);
      } catch (caught) {
        if (!isCurrentBidOperation(operation)) return;
        const verificationError = lotVerificationMessage(caught);
        setMinimumNextBid(null);
        setCurrentCap(null);
        setVerifiedChainTimestamp(null);
        setVerifiedAuctionState(null);
        setVerifiedAuctionEndTime(null);
        setLotVerificationError(verificationError);
        setIsReviewingBid(false);
        setTxStatus({
          phase: "failed",
          message: "Bid blocked before the wallet request.",
          nextAction: verificationError
        });
        return;
      }

      if (!isCurrentBidOperation(operation)) return;
      const { minimumRequired, walletCap } = snapshot;

      const liveActionState = getBidActionState({
        isConnected,
        wrongNetwork,
        targetChainLabel,
        deploymentLoaded: true,
        deploymentError: null,
        auctionIdValid: true,
        auctionState: snapshot.liveState as SerializedAuction["state"],
        endTime: snapshot.liveEndTime,
        nowSeconds: snapshot.blockTimestamp,
        minimumNextBid: minimumRequired,
        currentCap: walletCap,
        bidAmountEth
      });

      if (!isCurrentBidOperation(operation)) return;
      setMinimumNextBid(minimumRequired);
      setCurrentCap(walletCap);
      setVerifiedChainTimestamp(snapshot.blockTimestamp);
      setVerifiedAuctionState(snapshot.liveState as SerializedAuction["state"]);
      setVerifiedAuctionEndTime(snapshot.liveEndTime);
      setLotVerificationError(null);
      const depositedCapChanged = walletCap !== currentCap;
      const minimumBidChanged = minimumRequired !== minimumNextBid;
      if (depositedCapChanged || minimumBidChanged) {
        setIsReviewingBid(false);
        if (depositedCapChanged && (walletCap > 0n) !== isStepUp) {
          setBidAmountEth(formatEther(walletCap > 0n ? (minimumRequired > walletCap ? minimumRequired - walletCap : 0n) : minimumRequired));
        }
        setMessage(
          depositedCapChanged && minimumBidChanged
            ? "Your deposited cap and the minimum required bid changed. Review the updated amounts before continuing."
            : depositedCapChanged
              ? "Your deposited cap changed. Review the updated amounts before continuing."
              : "The minimum required bid changed. Review the updated amounts before continuing."
        );
        requestAnimationFrame(() => inputRef.current?.focus());
        return;
      }

      if (liveActionState.disabledReason || liveActionState.parsedBidCap === null) {
        throw new Error(liveActionState.disabledReason ?? "Bid amount must be a valid ETH amount.");
      }

      try {
        await publicClient.simulateContract({
          address: deployment.contracts.auctionHouse,
          abi: auctionHouseAbi,
          functionName: "placeBid",
          args: [auctionIdBigInt, liveActionState.parsedBidCap],
          account: address,
          value: liveActionState.valueToSend,
          blockNumber: snapshot.blockNumber
        });
      } catch (caught) {
        if (!isCurrentBidOperation(operation)) return;
        setIsReviewingBid(false);
        setTxStatus({
          phase: "failed",
          message: "Bid blocked by the contract simulation.",
          nextAction: "Refresh the auction and wallet bid data, then review the bid again. The contract remains authoritative when you submit.",
          technicalDetail: walletErrorMessage(caught, "The simulated bid was rejected by the contract.")
        });
        requestAnimationFrame(() => inputRef.current?.focus());
        return;
      }

      if (!isCurrentBidOperation(operation)) return;

      let reviewBlockIsCanonical = false;
      try {
        const reviewBlock = await publicClient.getBlock({ blockNumber: snapshot.blockNumber });
        reviewBlockIsCanonical = reviewBlock.number === snapshot.blockNumber &&
          isTransactionHash(reviewBlock.hash) &&
          reviewBlock.hash.toLowerCase() === snapshot.lotIdentity.reviewBlock.hash.toLowerCase();
      } catch {
        // An unavailable canonical block cannot safely back a durable bid intent.
      }
      if (!isCurrentBidOperation(operation)) return;
      if (!reviewBlockIsCanonical) {
        setIsReviewingBid(false);
        setTxStatus({
          phase: "failed",
          message: "Bid blocked before the wallet request.",
          nextAction: "The review block changed or could not be verified. Refresh the auction and wallet bid data, then review the bid again."
        });
        requestAnimationFrame(() => inputRef.current?.focus());
        return;
      }

      const intent = establishDurableBidIntent(operationStorageKey);
      if (!intent.ok) {
        let detail = `${intent.error} No wallet request was opened. Enable session storage and try again.`;
        if (intent.intentWritten) {
          const retained = retainPreDispatchCleanupMarker(operationStorageKey);
          setPreDispatchCleanupPending(true);
          setTxStatus({
            phase: "failed",
            message: "No wallet request was opened.",
            nextAction: "Retry recovery storage cleanup before reviewing the bid again."
          });
          if (!retained.ok) detail = `${detail} ${retained.error}`;
        }
        const storageMessage = recoveryStorageMessage(detail);
        setStorageRecoveryError(storageMessage);
        return;
      }
      durableIntentEstablished = true;

      setTxStatus(awaitingSignatureState("Confirm wallet-signed bid in your wallet."));

      const hash = await walletClient.writeContract({
        address: deployment.contracts.auctionHouse,
        abi: auctionHouseAbi,
        functionName: "placeBid",
        args: [auctionIdBigInt, liveActionState.parsedBidCap],
        value: liveActionState.valueToSend
      });
      if (!isTransactionHash(hash)) throw new Error("Wallet returned an invalid transaction hash.");
      submittedHash = hash;
      pendingHash = hash;
      const submission: StoredBidSubmission = {
        version: 2,
        kind: "submitted-wallet-bid",
        hash,
        expectedNewCap: liveActionState.parsedBidCap.toString(),
        lot: snapshot.lotIdentity
      };
      const reviewedBid: ReviewedBid = {
        auctionHouse: deployment.contracts.auctionHouse,
        auctionId: auctionIdBigInt,
        bidder: address,
        expectedNewCap: liveActionState.parsedBidCap,
        submission
      };
      const write = writeStoredBidRecovery(operationStorageKey, submission);
      if (!isCurrentBidOperation(operation)) return;
      if (!write.ok) setStorageRecoveryError(recoveryStorageMessage(write.error));

      setTxStatus(pendingTransactionState(hash, "Bid transaction submitted. Waiting for confirmation."));
      let tracked: TrackedBidReceipt;
      try {
        tracked = await waitForTrackedBidReceipt({
          publicClient,
          hash,
          submission,
          storageKey: operationStorageKey,
          onRepriced: (effectiveHash) => {
            pendingHash = effectiveHash;
            if (isCurrentBidOperation(operation)) {
              setTxStatus(pendingTransactionState(effectiveHash, "Bid transaction repriced. Waiting for confirmation."));
            }
          },
          onStorageFailure: (error) => {
            if (isCurrentBidOperation(operation)) setStorageRecoveryError(recoveryStorageMessage(error));
          }
        });
      } catch (caught) {
        if (isCurrentBidOperation(operation)) setTxStatus(unknownConfirmationState(pendingHash ?? hash, caught));
        return;
      }

      await settleTrackedBidReceipt({
        operation,
        publicClient,
        storageKey: operationStorageKey,
        submittedHash: hash,
        tracked,
        reviewedBid,
        confirmedMessage: `Bid placed with ${formatEth(liveActionState.valueToSend)} sent`
      });
    } catch (caught) {
      if (!isCurrentBidOperation(operation)) return;
      if (!submittedHash && durableIntentEstablished) {
        if (isCanonicalUserRejectedTransaction(caught)) {
          const clear = clearStoredBidRecovery(operationStorageKey);
          if (!clear.ok) {
            const retained = retainRejectedBidCleanupMarker(operationStorageKey, clear.error);
            setRejectedCleanupPending(true);
            setStorageRecoveryError(recoveryStorageMessage(retained.error));
          } else {
            setRejectedCleanupPending(false);
            setStorageRecoveryError(null);
          }
          setTxStatus(failedTransactionState(caught, "Bid transaction was rejected before submission."));
        } else {
          setTxStatus(bidIntentRecoveryState(caught));
        }
      } else {
        const failed = submittedHash
          ? unknownConfirmationState(pendingHash ?? submittedHash, caught)
          : failedTransactionState(caught, "Bid transaction failed before submission.");
        setTxStatus(failed);
      }
    } finally {
      finishBidOperation(operation);
    }
  }

  async function checkSubmittedBid() {
    const hash = txStatus?.txHash;
    if (!hash || !address || !deployment || !auctionIdBigInt || !pendingBidKey || resolvedReplacement ||
      activeOperationRef.current?.identity === identity) return;
    const recoveryRead = readStoredBidRecovery(pendingBidKey);
    const stored = recoveryRead.ok ? recoveryRead.value : recoveryRead.fallback ?? null;
    if (!recoveryRead.ok) setStorageRecoveryError(recoveryStorageMessage(recoveryRead.error));
    if (!stored || !isStoredBidSubmission(stored) || stored.hash.toLowerCase() !== hash.toLowerCase()) {
      setTxStatus(unknownConfirmationState(hash, new Error(
        "The persisted bid identity is unavailable or does not match this transaction hash. Recovery remains locked."
      )));
      return;
    }
    const operation = beginBidOperation();
    if (!operation) return;
    let pendingHash = hash;
    try {
      const { provider, publicClient } = await createConnectedWalletClients(config, connector, address);
      await verifyWalletChain(provider);
      try {
        await verifyStoredBidLotIdentity(publicClient, stored, address);
      } catch (caught) {
        if (isCurrentBidOperation(operation)) {
          const detail = walletErrorMessage(caught, "The persisted lot identity could not be verified.");
          setRecoveryIdentityError(
            `This historical transaction cannot be safely linked to the auction currently displayed. Bidding remains locked. ${detail}`
          );
          setTxStatus(unknownConfirmationState(hash, caught));
        }
        return;
      }
      if (!isCurrentBidOperation(operation)) return;
      setRecoveryIdentityError(null);

      if (stored.resolvedOutcome) {
        await verifyStoredTerminalCanonicalBlock(publicClient, stored.resolvedOutcome);
        if (!isCurrentBidOperation(operation)) return;
        setStorageCleanupSubmission(stored);
        setStorageRecoveryError(recoveryStorageMessage("A resolved transaction marker still requires cleanup."));
        setTxStatus(stored.resolvedOutcome.kind === "confirmed"
          ? confirmedTransactionState(
              stored.resolvedOutcome.hash,
              "This bid was confirmed on-chain, but recovery storage cleanup is incomplete.",
              "Retry recovery storage cleanup before another bid."
            )
          : revertedTransactionState(stored.resolvedOutcome.hash));
        return;
      }
      if (stored.resolvedReplacement) {
        await verifyStoredTerminalCanonicalBlock(publicClient, stored.resolvedReplacement);
        if (!isCurrentBidOperation(operation)) return;
        const replacement = stored.resolvedReplacement;
        setResolvedReplacement(replacement);
        setTxStatus(replacementTransactionState(replacement, true));
        return;
      }

      const reviewedBid: ReviewedBid = {
        auctionHouse: deployment.contracts.auctionHouse,
        auctionId: auctionIdBigInt,
        bidder: address,
        expectedNewCap: BigInt(stored.expectedNewCap),
        submission: stored
      };
      const tracked = await waitForTrackedBidReceipt({
        publicClient,
        hash,
        submission: stored,
        storageKey: pendingBidKey,
        onRepriced: (effectiveHash) => {
          pendingHash = effectiveHash;
          if (isCurrentBidOperation(operation)) {
            setTxStatus(pendingTransactionState(effectiveHash, "Bid transaction repriced. Waiting for confirmation."));
          }
        },
        onStorageFailure: (error) => {
          if (isCurrentBidOperation(operation)) setStorageRecoveryError(recoveryStorageMessage(error));
        }
      });
      await settleTrackedBidReceipt({
        operation,
        publicClient,
        storageKey: pendingBidKey,
        submittedHash: hash,
        tracked,
        reviewedBid,
        confirmedMessage: "Your submitted bid is confirmed on-chain"
      });
    } catch (caught) {
      if (isCurrentBidOperation(operation)) setTxStatus(unknownConfirmationState(pendingHash, caught));
    } finally {
      finishBidOperation(operation);
    }
  }

  async function retryResolvedReplacementRefresh() {
    if (!resolvedReplacement || !pendingBidKey || !address || activeOperationRef.current?.identity === identity) return;
    const operation = beginBidOperation();
    if (!operation) return;
    try {
      const { provider, publicClient } = await createConnectedWalletClients(config, connector, address);
      await verifyWalletChain(provider);
      if (!isCurrentBidOperation(operation)) return;
      await refreshResolvedBidReplacement(operation, publicClient, pendingBidKey, resolvedReplacement);
    } catch (caught) {
      if (isCurrentBidOperation(operation)) {
        setMessage(walletErrorMessage(caught, "Unable to refresh the resolved transaction state."));
        setTxStatus(unknownConfirmationState(resolvedReplacement.hash, caught));
      }
    } finally {
      finishBidOperation(operation);
    }
  }

  async function retryRecoveryStorageAccess() {
    if (!pendingBidKey) return;
    if (preDispatchCleanupPending) {
      const clear = clearPreDispatchRecoveryAndVerify(pendingBidKey);
      if (!clear.ok) {
        setStorageRecoveryError(recoveryStorageMessage(
          `${clear.error} No wallet request was opened, but cleanup is not yet verified.`
        ));
        return;
      }
      setPreDispatchCleanupPending(false);
      setStorageRecoveryError(null);
      setMessage(null);
      setIsReviewingBid(false);
      setTxStatus({
        phase: "failed",
        message: "No wallet request was opened.",
        nextAction: "Review the bid again when you are ready."
      });
      return;
    }
    if (rejectedCleanupPending) {
      const clear = clearStoredBidRecovery(pendingBidKey);
      if (!clear.ok) {
        const retained = retainRejectedBidCleanupMarker(pendingBidKey, clear.error);
        setStorageRecoveryError(recoveryStorageMessage(retained.error));
        return;
      }
      setRejectedCleanupPending(false);
      setStorageRecoveryError(null);
      setMessage(null);
      return;
    }
    if (storageCleanupSubmission) {
      if (!address || !storageCleanupSubmission.resolvedOutcome) return;
      const operation = beginBidOperation();
      if (!operation) return;
      try {
        const { provider, publicClient } = await createConnectedWalletClients(config, connector, address);
        await verifyWalletChain(provider);
        await verifyStoredTerminalCanonicalBlock(publicClient, storageCleanupSubmission.resolvedOutcome);
        if (!isCurrentBidOperation(operation)) return;
        const clear = clearStoredBidRecovery(pendingBidKey, storageCleanupSubmission);
        if (!clear.ok) {
          setStorageRecoveryError(recoveryStorageMessage(clear.error));
          return;
        }
        setStorageCleanupSubmission(null);
        setStorageRecoveryError(null);
        setMessage(null);
      } catch (caught) {
        if (isCurrentBidOperation(operation)) {
          setTxStatus(unknownConfirmationState(storageCleanupSubmission.resolvedOutcome.hash, caught));
          setMessage(walletErrorMessage(caught, "Unable to verify terminal transaction evidence."));
        }
      } finally {
        finishBidOperation(operation);
      }
      return;
    }

    const probe = probeSessionStorage(pendingBidKey);
    if (!probe.ok) {
      setStorageRecoveryError(recoveryStorageMessage(probe.error));
      return;
    }
    const memory = pendingBidMemoryRegistry.get(pendingBidKey);
    if (memory) {
      const write = writeStoredBidRecovery(pendingBidKey, memory.recovery);
      if (!write.ok) {
        setStorageRecoveryError(recoveryStorageMessage(write.error));
        return;
      }
    }
    const read = readStoredBidRecovery(pendingBidKey);
    if (!read.ok) {
      setStorageRecoveryError(recoveryStorageMessage(read.error));
      return;
    }
    if (read.value && isStoredBidIntent(read.value)) {
      setIsReviewingBid(false);
      setResolvedReplacement(null);
      setTxStatus(bidIntentRecoveryState());
    }
    setStorageRecoveryError(null);
    setMessage(null);
  }

  const highestBidderStatus = address && sameAddress(address, auction.highestBidder)
    ? "Your wallet is currently the highest bidder"
    : auction.highestBid === "0"
      ? "No bid is currently recorded"
      : "Another wallet is currently the highest bidder";

  const unavailable = !isConnected
    ? "Connect a wallet to see your cap and prepare a bid. Browsing stays available without a wallet."
    : wrongNetwork
      ? `Switch your wallet to ${targetChainLabel} to continue.`
      : deploymentError ?? bidActionState.disabledReason;
  const confirmationUnknown = txStatus?.phase === "confirmation-unknown";
  const bidResolutionLocked = confirmationUnknown || resolvedReplacement !== null || rejectedCleanupPending ||
    preDispatchCleanupPending || storageRecoveryError !== null || recoveryIdentityError !== null ||
    storageCleanupSubmission !== null;
  const hasRecoveryActions = Boolean(
    (confirmationUnknown && txStatus?.txHash && !resolvedReplacement) ||
    resolvedReplacement || (storageRecoveryError && !resolvedReplacement)
  );

  return (
    <section aria-label="Bid participation" aria-busy={isDeploymentLoading || isLoadingBidData || isPlacingBid} className="bid-participation">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="font-editorial text-2xl font-semibold text-white">{isStepUp ? "Increase bid" : "Place bid"}</h3>
        <span className="premium-eyebrow">{isReviewingBid ? "02 / Review" : "01 / Amount"}</span>
      </div>
      <p className="mt-2 text-sm leading-6 text-slate-400">
        {isStepUp ? "Add ETH to your deposited cap. Only the increase is sent." : "Choose your bid cap, then review before signing."}
      </p>
      {isConnected && !wrongNetwork ? <p className="mt-3 text-xs text-slate-400">{highestBidderStatus}</p> : null}

      {!isReviewingBid ? <div className="mt-5 grid min-w-0 gap-4">
        {isConnected && !wrongNetwork ? <>
          <div className="bid-context">
            <InfoItem label="Minimum required total cap" value={minimumNextBid === null ? (isLoadingBidData || isDeploymentLoading ? "Loading…" : "Unavailable") : formatEth(minimumNextBid)} />
            <InfoItem label="Current wallet cap" value={currentCap === null ? (isLoadingBidData || isDeploymentLoading ? "Loading…" : "Unavailable") : formatEth(currentCap)} />
          </div>
          <label className="grid min-w-0 gap-2" htmlFor="wallet-bid-cap">
            <span className="text-sm font-semibold text-slate-200">{isStepUp ? "Additional amount in ETH" : "Bid cap in ETH"}</span>
            <input ref={inputRef} id="wallet-bid-cap" value={bidAmountEth}
              disabled={isDeploymentLoading || isLoadingBidData || isPlacingBid || bidResolutionLocked}
              aria-describedby="wallet-bid-help wallet-bid-disabled-reason"
              onChange={(event) => setBidAmountEth(event.target.value)}
              className="bid-amount-input" placeholder="0.00" inputMode="decimal" />
          </label>
          <p id="wallet-bid-help" className="text-xs leading-5 text-slate-400">
            {isStepUp ? "Enter only the amount to add. Your existing cap stays deposited." : "Your first bid sends the full cap. Network gas is separate."}
          </p>
          <div className="bid-amount-ledger" aria-live="polite">
            <InfoItem
              label={isStepUp ? "Additional amount" : "ETH to send"}
              value={enteredValueToSend === null ? "—" : formatEth(enteredValueToSend)}
            />
            <InfoItem label="New total cap" value={displayedNewCap === null ? "—" : formatEth(displayedNewCap)} />
          </div>
        </> : null}
        <div id="wallet-bid-disabled-reason">
          {isDeploymentLoading || isLoadingBidData ? <StateNotice tone="loading" title="Preparing your bid">Checking the minimum and your deposited cap.</StateNotice>
            : unavailable ? <p className="text-sm leading-6 text-slate-400">{unavailable}</p> : null}
        </div>
        {!isConnected || wrongNetwork ? <WalletButton /> :
          <button type="button" disabled={Boolean(bidActionState.disabledReason) || bidResolutionLocked || isPlacingBid}
            onClick={() => { setMessage(null); setIsReviewingBid(true); }}
            aria-describedby="wallet-bid-disabled-reason" className="transaction-primary-action w-full">
            {isStepUp ? "Review increase" : "Review bid"}
          </button>}
      </div> : null}

      {isReviewingBid ? <div ref={reviewRef} tabIndex={-1} aria-label="Review your bid" className="bid-review-focus mt-4">
        <TransactionReview
          title={isStepUp ? "Review increase bid" : "Review place bid"}
          description="Check the amounts below. Live values are checked again before your wallet opens."
          items={[
            { label: "Auction", value: `#${auction.auctionId} · ${auction.nftMetadata?.metadataName ?? `Token #${auction.tokenId}`}` },
            { label: "AuctionHouse", value: expectedAuctionHouse, mono: true },
            { label: "NFT contract", value: auction.nft, mono: true },
            { label: "Token ID", value: auction.tokenId },
            { label: "Your current deposited cap", value: currentCap === null ? "Not loaded" : formatEth(currentCap) },
            { label: "ETH sent in this transaction", value: formatEth(bidActionState.valueToSend) },
            { label: "Your new total cap", value: bidActionState.parsedBidCap === null ? "Not available" : formatEth(bidActionState.parsedBidCap) },
            { label: "Network gas", value: "Separate; shown by your wallet. Not refundable." }
          ]}
          confirmations="1 wallet confirmation · no transaction until you sign"
          primaryLabel="Continue in wallet" busy={isPlacingBid}
          disabled={Boolean(bidActionState.disabledReason) || bidResolutionLocked || isPlacingBid}
          onBack={() => { setIsReviewingBid(false); requestAnimationFrame(() => inputRef.current?.focus()); }}
          onConfirm={placeWalletBid} />
      </div> : null}

      <p className="bid-economic-note">
        If you lose, 100% of your deposited cap is refundable after finalization. If you win, any surplus above the final price is refundable. Network gas is separate and is not refunded. Redistribution is conditional, funded only from net premium, and may be zero.
      </p>
      <WalletTransactionStatus title="Wallet bid" status={txStatus} />
      {storageRecoveryError ? <StateNotice tone="error" title="Recovery storage unavailable" className="mt-4">
        {storageRecoveryError}
      </StateNotice> : null}
      {recoveryIdentityError ? <StateNotice tone="error" title="Recovery identity not verified" className="mt-4">
        {recoveryIdentityError}
      </StateNotice> : null}
      {message ? <p role="status" aria-live="polite" className="mt-4 text-sm leading-6 text-slate-200">{message}</p> : null}
      {hasRecoveryActions ? <div role="group" aria-label="Bid recovery actions" className="bid-recovery-actions">
        <p className="bid-recovery-actions-copy">Resolve the retained transaction before preparing another bid.</p>
        {confirmationUnknown && txStatus?.txHash && !resolvedReplacement ? <button type="button"
          className="transaction-primary-action" disabled={isPlacingBid || wrongNetwork || !isConnected}
          onClick={checkSubmittedBid}>{isPlacingBid ? "Checking confirmation..." : "Check transaction confirmation"}</button> : null}
        {resolvedReplacement ? <button type="button" className="transaction-primary-action"
          disabled={isPlacingBid || wrongNetwork || !isConnected} onClick={retryResolvedReplacementRefresh}>
          {isPlacingBid ? "Refreshing resolved transaction..." : "Refresh resolved transaction state"}
        </button> : null}
        {storageRecoveryError && !resolvedReplacement ? <button type="button" className="transaction-secondary-action"
          disabled={isPlacingBid || wrongNetwork || !isConnected} onClick={retryRecoveryStorageAccess}>
          Retry recovery storage access
        </button> : null}
        {isConnected && !wrongNetwork ? <button type="button"
          disabled={!auctionOpen || !deployment || isLoadingBidData || isPlacingBid}
          onClick={() => readWalletBidData().catch((caught) => setMessage(walletErrorMessage(caught, "Unable to load wallet bid data.")))}
          className="transaction-secondary-action">
          {isLoadingBidData ? "Loading..." : "Refresh wallet bid data"}
        </button> : null}
      </div> : isConnected && !wrongNetwork ? <button type="button"
        disabled={!auctionOpen || !deployment || isLoadingBidData || isPlacingBid}
        onClick={() => readWalletBidData().catch((caught) => setMessage(walletErrorMessage(caught, "Unable to load wallet bid data.")))}
        className="bid-refresh">
        {isLoadingBidData ? "Loading..." : "Refresh wallet bid data"}
      </button> : null}
      <TechnicalDisclosure summary="Bid network and contract details" description="Verify the wallet and target used for this bid." className="mt-4">
        <div className="grid min-w-0 gap-3 text-sm">
          <InfoItem label="Wallet" value={address ? shortenAddress(address) : "Not connected"} mono />
          <InfoItem label="Target chain" value={`${targetChainLabel} (${targetChainId})`} />
          <InfoItem label="Wallet chain" value={chainId ? String(chainId) : "Not connected"} />
          <InfoItem label="AuctionHouse" value={deployment ? deployment.contracts.auctionHouse : "Not loaded"} mono />
        </div>
        <p className="mt-3 text-xs leading-5 text-slate-400">Your wallet must reach the configured RPC. A forwarded local Anvil RPC may be unavailable to browser wallets.</p>
      </TechnicalDisclosure>
    </section>
  );
}

function InfoItem({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="bid-info-item">
      <div className="text-xs text-slate-500">{label}</div>
      <div className={`mt-1 break-all text-sm text-slate-200 ${mono ? "font-mono" : ""}`}>{value}</div>
    </div>
  );
}
