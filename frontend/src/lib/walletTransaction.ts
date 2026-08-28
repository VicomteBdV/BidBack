import { targetBlockExplorerUrl } from "@/lib/chains";

export type WalletTransactionPhase =
  | "idle"
  | "awaiting-signature"
  | "pending"
  | "refreshing"
  | "confirmed"
  | "confirmation-unknown"
  | "failed"
  | "rejected";

export type WalletTransactionState = {
  phase: WalletTransactionPhase;
  message: string;
  txHash?: `0x${string}` | null;
  nextAction?: string;
  technicalDetail?: string;
  refreshIncomplete?: boolean;
};

function errorCode(error: unknown) {
  if (!error || typeof error !== "object") return undefined;

  const candidate = error as { code?: unknown; cause?: unknown };

  if (typeof candidate.code === "number") return candidate.code;

  if (typeof candidate.code === "string") {
    const parsed = Number(candidate.code);
    if (Number.isFinite(parsed)) return parsed;
  }

  return errorCode(candidate.cause);
}

function errorDetail(error: unknown) {
  if (!error || typeof error !== "object") {
    return error instanceof Error ? error.message : "";
  }

  const candidate = error as {
    shortMessage?: unknown;
    details?: unknown;
    message?: unknown;
    cause?: unknown;
  };

  if (typeof candidate.shortMessage === "string") return candidate.shortMessage;
  if (typeof candidate.details === "string") return candidate.details;
  if (typeof candidate.message === "string") return candidate.message;

  return errorDetail(candidate.cause);
}

export function shortenTxHash(txHash: string) {
  return txHash.length <= 21 ? txHash : `${txHash.slice(0, 10)}...${txHash.slice(-8)}`;
}

export function buildExplorerTxUrl(txHash?: string | null, explorerUrl = targetBlockExplorerUrl) {
  const normalizedExplorerUrl = explorerUrl?.trim().replace(/\/+$/, "");

  if (!txHash || !normalizedExplorerUrl) return null;

  return `${normalizedExplorerUrl}/tx/${txHash}`;
}

export function isUserRejectedTransaction(error: unknown) {
  const code = errorCode(error);
  if (code === 4001) return true;

  const detail = errorDetail(error).toLowerCase();

  return (
    detail.includes("user rejected") ||
    detail.includes("user denied") ||
    detail.includes("request rejected") ||
    detail.includes("rejected the request")
  );
}

export function walletTransactionErrorMessage(error: unknown, fallback = "Transaction failed.") {
  if (isUserRejectedTransaction(error)) {
    return "Transaction rejected in wallet.";
  }

  const detail = errorDetail(error);
  const normalized = detail.toLowerCase();

  if (normalized.includes("insufficient funds")) {
    return "Insufficient funds for transaction value or gas.";
  }

  if (normalized.includes("wrong network") || normalized.includes("chain")) {
    return detail || "Wallet is not connected to the target chain.";
  }

  if (normalized.includes("replacement") || normalized.includes("replaced")) {
    return "Transaction was replaced. Refresh the auction data before continuing.";
  }

  if (normalized.includes("dropped")) {
    return "Transaction was dropped by the network. Retry or refresh before continuing.";
  }

  if (normalized.includes("revert") || normalized.includes("execution reverted")) {
    return "The transaction was rejected by the contract.";
  }

  return detail || fallback;
}

export function failedTransactionState(error: unknown, fallback = "Transaction failed."): WalletTransactionState {
  const message = walletTransactionErrorMessage(error, fallback);
  const detail = errorDetail(error);

  return {
    phase: isUserRejectedTransaction(error) ? "rejected" : "failed",
    message,
    nextAction: isUserRejectedTransaction(error)
      ? "Review the transaction details and try again when you are ready."
      : "Refresh the action state, then retry only if the action is still available.",
    technicalDetail: detail && detail !== message ? detail : undefined
  };
}

export function awaitingSignatureState(message = "Confirm the transaction in your wallet."): WalletTransactionState {
  return {
    phase: "awaiting-signature",
    message
  };
}

export function pendingTransactionState(
  txHash: `0x${string}`,
  message = "Transaction submitted. Waiting for confirmation."
): WalletTransactionState {
  return {
    phase: "pending",
    message,
    txHash
  };
}

export function refreshingTransactionState(
  txHash: `0x${string}`,
  message = "Transaction confirmed on-chain. Refreshing the displayed action state."
): WalletTransactionState {
  return {
    phase: "refreshing",
    message,
    txHash
  };
}

export function revertedTransactionState(txHash: `0x${string}`): WalletTransactionState {
  return {
    phase: "failed",
    message: "The transaction was included on-chain but reverted.",
    txHash,
    nextAction: "Refresh the action state before deciding whether to retry."
  };
}

export function unknownConfirmationState(txHash: `0x${string}`, error?: unknown): WalletTransactionState {
  const detail = errorDetail(error);

  return {
    phase: "confirmation-unknown",
    message: "The transaction was submitted, but its on-chain result could not be verified.",
    txHash,
    nextAction: "Check the explorer or refresh the displayed state before deciding whether to retry.",
    technicalDetail: detail || undefined
  };
}

export function receiptWasSuccessful(receipt: { status?: string }) {
  return receipt.status === "success";
}

export function confirmedTransactionState(
  txHash: `0x${string}`,
  message = "Transaction confirmed. Data refreshed.",
  nextAction?: string,
  refreshIncomplete = false
): WalletTransactionState {
  return {
    phase: "confirmed",
    message,
    txHash,
    nextAction,
    refreshIncomplete
  };
}
