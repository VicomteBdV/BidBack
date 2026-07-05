import { targetBlockExplorerUrl } from "@/lib/chains";

export type WalletTransactionPhase =
  | "idle"
  | "awaiting-signature"
  | "submitted"
  | "pending"
  | "confirmed"
  | "failed"
  | "rejected";

export type WalletTransactionState = {
  phase: WalletTransactionPhase;
  message: string;
  txHash?: `0x${string}` | null;
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
    return detail || "Transaction reverted by the contract.";
  }

  return detail || fallback;
}

export function failedTransactionState(error: unknown, fallback = "Transaction failed."): WalletTransactionState {
  return {
    phase: isUserRejectedTransaction(error) ? "rejected" : "failed",
    message: walletTransactionErrorMessage(error, fallback)
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

export function confirmedTransactionState(
  txHash: `0x${string}`,
  message = "Transaction confirmed. Data refreshed."
): WalletTransactionState {
  return {
    phase: "confirmed",
    message,
    txHash
  };
}
