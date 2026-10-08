import { targetBlockExplorerUrl } from "@/lib/chains";
import { decodeEventLog, type Abi, type Address, type Hex, type PublicClient, type TransactionReceipt } from "viem";

export type WalletConfirmationClient = Pick<PublicClient, "getChainId" | "getTransaction" | "waitForTransactionReceipt" | "getBlock">;
export type WalletTransactionIntent = Readonly<{
  chainId: number;
  account: Address;
  to: Address;
  data: Hex;
  value: bigint;
}>;
export type WalletActionEvidence = { auctionId?: string };
export type WalletTransactionSubmission = {
  readonly originalHash: Hex;
  readonly intent: WalletTransactionIntent;
  readonly proveAction: (receipt: TransactionReceipt, client: WalletConfirmationClient) => Promise<WalletActionEvidence | null> | WalletActionEvidence | null;
  effectiveHash: Hex;
  replacementNonce?: number;
  observedReplacement?: { from: Address; to: Address | null; input: Hex; value: bigint; nonce: number; chainId?: number;
    blockHash: Hex; blockNumber: bigint; transactionIndex: number };
  observedReceipt?: TransactionReceipt;
};
export type WalletConfirmationResult = {
  outcome: "confirmed" | "reverted" | "cancelled" | "incompatible" | "unknown";
  submission: WalletTransactionSubmission;
  receipt?: TransactionReceipt;
  evidence?: WalletActionEvidence;
};

function sameHex(a?: string | null, b?: string | null) {
  return Boolean(a && b && a.toLowerCase() === b.toLowerCase());
}

function sameTarget(a: Address | null, b: Address | null) {
  return a === null && b === null || sameHex(a, b);
}

function validHash(value: unknown): value is Hex {
  return typeof value === "string" && /^0x[\da-f]{64}$/i.test(value);
}

function validAddress(value: unknown): value is Address {
  return typeof value === "string" && /^0x[\da-f]{40}$/i.test(value);
}

function validData(value: unknown): value is Hex {
  return typeof value === "string" && /^0x(?:[\da-f]{2})*$/i.test(value);
}

function validMinedReceipt(receipt: TransactionReceipt) {
  return validHash(receipt.transactionHash) && validHash(receipt.blockHash) &&
    typeof receipt.blockNumber === "bigint" && receipt.blockNumber >= 0n &&
    Number.isSafeInteger(receipt.transactionIndex) && receipt.transactionIndex >= 0;
}

function completeObservedReceipt(receipt: TransactionReceipt) {
  return validMinedReceipt(receipt) && (receipt.status === "success" || receipt.status === "reverted") &&
    validAddress(receipt.from) && (receipt.to === null || validAddress(receipt.to)) && Array.isArray(receipt.logs) &&
    receipt.logs.every((log) => validAddress(log.address) && validData(log.data) && Array.isArray(log.topics) &&
      log.topics.every(validHash) && validHash(log.transactionHash) && validHash(log.blockHash) &&
      typeof log.blockNumber === "bigint" && log.blockNumber >= 0n &&
      Number.isSafeInteger(log.transactionIndex) && log.transactionIndex! >= 0 &&
      Number.isSafeInteger(log.logIndex) && log.logIndex! >= 0 && typeof log.removed === "boolean");
}

function completeObservedTransaction(transaction: {
  from: Address; to: Address | null; input: Hex; value: bigint; nonce: number; chainId?: number;
  blockHash: Hex | null; blockNumber: bigint | null; transactionIndex: number | null;
}): transaction is typeof transaction & { blockHash: Hex; blockNumber: bigint; transactionIndex: number } {
  return validAddress(transaction.from) && (transaction.to === null || validAddress(transaction.to)) &&
    validData(transaction.input) && typeof transaction.value === "bigint" && transaction.value >= 0n &&
    Number.isSafeInteger(transaction.nonce) && transaction.nonce >= 0 &&
    validHash(transaction.blockHash) && typeof transaction.blockNumber === "bigint" && transaction.blockNumber >= 0n &&
    Number.isSafeInteger(transaction.transactionIndex) && transaction.transactionIndex! >= 0 &&
    (transaction.chainId === undefined || Number.isSafeInteger(transaction.chainId) && transaction.chainId > 0);
}

function observedReceiptMatches(a: TransactionReceipt, b: TransactionReceipt) {
  return validMinedReceipt(a) && a.status === b.status && sameHex(a.transactionHash, b.transactionHash) &&
    sameHex(a.blockHash, b.blockHash) && a.blockNumber === b.blockNumber && a.transactionIndex === b.transactionIndex &&
    sameHex(a.from, b.from) && sameTarget(a.to, b.to) && a.logs.length === b.logs.length &&
    a.logs.every((log, index) => { const other = b.logs[index]; return sameHex(log.address, other.address) &&
      sameHex(log.data, other.data) && log.topics.length === other.topics.length &&
      log.topics.every((topic, i) => sameHex(topic, other.topics[i])) &&
      sameHex(log.transactionHash, other.transactionHash) && sameHex(log.blockHash, other.blockHash) &&
      log.blockNumber === other.blockNumber && log.transactionIndex === other.transactionIndex &&
      log.logIndex === other.logIndex && log.removed === other.removed; });
}

/** Capture scalar values before asking the wallet; recovery never rebuilds intent from UI state. */
export function walletTransactionSubmission(
  hash: Hex,
  intent: WalletTransactionIntent,
  proveAction: WalletTransactionSubmission["proveAction"]
): WalletTransactionSubmission {
  return { originalHash: hash, effectiveHash: hash, intent: Object.freeze({ ...intent }), proveAction };
}

/** Decode only logs belonging to this mined receipt, the intended emitter and the exact action. */
export function matchingWalletActionEvents(receipt: TransactionReceipt, proof: {
  abi: Abi;
  eventName: string;
  address: Address;
  expected: Readonly<Record<string, bigint | string>>;
  positiveAmount?: boolean;
}): Record<string, unknown>[] {
  return receipt.logs.flatMap((log) => {
    if (!sameHex(log.address, proof.address) || log.removed || !Number.isSafeInteger(log.logIndex) || log.logIndex! < 0 ||
      !sameHex(log.transactionHash, receipt.transactionHash) || !sameHex(log.blockHash, receipt.blockHash) ||
      log.blockNumber !== receipt.blockNumber || log.transactionIndex !== receipt.transactionIndex) return [];
    try {
      const event = decodeEventLog({ abi: proof.abi, eventName: proof.eventName, data: log.data, topics: log.topics, strict: true });
      if (event.eventName !== proof.eventName || !event.args || Array.isArray(event.args)) return [];
      const args = event.args as unknown as Record<string, unknown>;
      if (!Object.entries(proof.expected).every(([key, expected]) =>
        typeof expected === "bigint" ? args[key] === expected : typeof args[key] === "string" && sameHex(args[key] as string, expected))) return [];
      if (proof.positiveAmount && (typeof args.amount !== "bigint" || args.amount <= 0n)) return [];
      return [args];
    } catch {
      return [];
    }
  });
}

function transactionMatchesIntent(transaction: {
  from: Address; to: Address | null; input: Hex; value: bigint; chainId?: number;
}, intent: WalletTransactionIntent) {
  return sameHex(transaction.from, intent.account) && sameHex(transaction.to, intent.to) &&
    sameHex(transaction.input, intent.data) && transaction.value === intent.value &&
    (transaction.chainId === undefined || transaction.chainId === intent.chainId);
}

/** One receipt wait plus bounded verification reads. A manual recheck cannot submit or sign. */
export async function confirmWalletTransaction(
  client: WalletConfirmationClient,
  submission: WalletTransactionSubmission,
  { recheck = false }: { recheck?: boolean } = {}
): Promise<WalletConfirmationResult> {
  const result = (outcome: WalletConfirmationResult["outcome"], receipt?: TransactionReceipt,
    evidence?: WalletActionEvidence): WalletConfirmationResult => ({ outcome, submission, receipt, evidence });
  try {
    let invalidReplacementObservation = false;
    if (!validHash(submission.originalHash) || !validHash(submission.effectiveHash)) return result("unknown");
    if (await client.getChainId() !== submission.intent.chainId) return result("unknown");
    const receipt = await client.waitForTransactionReceipt({
      hash: submission.effectiveHash,
      ...(recheck ? { timeout: 15_000, retryCount: 1 } : {}),
      onReplaced: ({ transaction, replacedTransaction, transactionReceipt }) => {
        // A callback is only a lead. Bind it to the previous hash, sender and nonce before trusting its hash.
        const valid = validHash(transaction.hash) && sameHex(replacedTransaction.hash, submission.effectiveHash) &&
          sameHex(replacedTransaction.from, submission.intent.account) &&
          sameHex(transaction.from, submission.intent.account) &&
          Number.isSafeInteger(replacedTransaction.nonce) && replacedTransaction.nonce >= 0 &&
          transaction.nonce === replacedTransaction.nonce &&
          (submission.replacementNonce === undefined ? transactionMatchesIntent(replacedTransaction, submission.intent)
            : replacedTransaction.nonce === submission.replacementNonce) &&
          sameHex(transactionReceipt.transactionHash, transaction.hash);
        if (!valid) { invalidReplacementObservation = true; return; }
        submission.replacementNonce = replacedTransaction.nonce;
        submission.effectiveHash = transaction.hash;
        // Keep the linked hash/nonce for recovery, but do not persist incomplete RPC snapshots as contradictions.
        submission.observedReplacement = undefined;
        submission.observedReceipt = undefined;
        if (!completeObservedTransaction(transaction) || !completeObservedReceipt(transactionReceipt)) {
          invalidReplacementObservation = true;
          return;
        }
        submission.observedReplacement = { from: transaction.from, to: transaction.to, input: transaction.input,
          value: transaction.value, nonce: transaction.nonce, chainId: transaction.chainId,
          blockHash: transaction.blockHash, blockNumber: transaction.blockNumber, transactionIndex: transaction.transactionIndex };
        submission.observedReceipt = { ...transactionReceipt,
          logs: transactionReceipt.logs.map((log) => ({ ...log, topics: [...log.topics] })) };
      }
    });
    if (invalidReplacementObservation || !validMinedReceipt(receipt) ||
      !sameHex(receipt.transactionHash, submission.effectiveHash) ||
      (submission.observedReceipt && !observedReceiptMatches(submission.observedReceipt, receipt))) return result("unknown");
    const transaction = await client.getTransaction({ hash: submission.effectiveHash });
    if (!completeObservedTransaction(transaction)) return result("unknown");
    const observed = submission.observedReplacement;
    if (observed && (!sameHex(transaction.from, observed.from) || !sameTarget(transaction.to, observed.to) ||
      !sameHex(transaction.input, observed.input) || transaction.value !== observed.value ||
      transaction.nonce !== observed.nonce || !sameHex(transaction.blockHash, observed.blockHash) ||
      transaction.blockNumber !== observed.blockNumber || transaction.transactionIndex !== observed.transactionIndex ||
      (observed.chainId !== undefined && transaction.chainId !== observed.chainId))) return result("unknown");
    if (!validHash(transaction.hash) || !validHash(transaction.blockHash) ||
      !sameHex(transaction.hash, submission.effectiveHash) || !sameHex(transaction.blockHash, receipt.blockHash) ||
      transaction.blockNumber === null || transaction.blockNumber !== receipt.blockNumber ||
      transaction.transactionIndex !== receipt.transactionIndex ||
      !Number.isSafeInteger(transaction.nonce) || transaction.nonce < 0 ||
      !sameHex(receipt.from, transaction.from) || !sameTarget(receipt.to, transaction.to) ||
      !sameHex(transaction.from, submission.intent.account) ||
      (transaction.chainId !== undefined && transaction.chainId !== submission.intent.chainId) ||
      (submission.replacementNonce !== undefined && transaction.nonce !== submission.replacementNonce) ||
      await client.getChainId() !== submission.intent.chainId) return result("unknown");
    if (receipt.status === "reverted") return result("reverted", receipt);
    if (receipt.status !== "success") return result("unknown");
    if (!transactionMatchesIntent(transaction, submission.intent)) {
      const cancelled = submission.effectiveHash !== submission.originalHash &&
        sameHex(transaction.to, submission.intent.account) && transaction.input === "0x" && transaction.value === 0n;
      return result(cancelled ? "cancelled" : "incompatible", receipt);
    }
    const evidence = await submission.proveAction(receipt, client);
    return evidence ? result("confirmed", receipt, evidence) : result("unknown", receipt);
  } catch {
    return result("unknown");
  }
}

export function walletConfirmationState(result: WalletConfirmationResult): WalletTransactionState {
  const hash = result.submission.effectiveHash;
  const original = hash !== result.submission.originalHash ? `Originally submitted as ${result.submission.originalHash}.` : undefined;
  if (result.outcome === "reverted") return { ...revertedTransactionState(hash), technicalDetail: original };
  if (result.outcome === "cancelled" || result.outcome === "incompatible") return {
    phase: "failed", txHash: hash,
    message: result.outcome === "cancelled" ? "The transaction was cancelled on-chain. The requested action was not completed."
      : "A different transaction was confirmed on-chain. The requested action was not completed.",
    nextAction: "Refresh the action state and review it again before submitting a new transaction.",
    technicalDetail: original
  };
  return { ...unknownConfirmationState(hash),
    nextAction: "Verify this transaction before submitting again. Verification does not request a signature.", technicalDetail: original };
}

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
