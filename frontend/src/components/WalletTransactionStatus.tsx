import React from "react";
import {
  buildExplorerTxUrl,
  shortenTxHash,
  type WalletTransactionPhase,
  type WalletTransactionState
} from "@/lib/walletTransaction";

const phaseLabels: Record<WalletTransactionPhase, string> = {
  idle: "Idle",
  "awaiting-signature": "Waiting for wallet signature",
  submitted: "Transaction submitted",
  pending: "Transaction pending",
  confirmed: "Transaction confirmed",
  failed: "Transaction failed",
  rejected: "Transaction rejected"
};

function toneClasses(phase: WalletTransactionPhase) {
  if (phase === "confirmed") {
    return "border-emerald-400/40 bg-emerald-400/10 text-emerald-50";
  }

  if (phase === "failed" || phase === "rejected") {
    return "border-rose-400/40 bg-rose-400/10 text-rose-50";
  }

  return "border-cyan-400/40 bg-cyan-400/10 text-cyan-50";
}

export function WalletTransactionStatus({
  status,
  title = "Wallet transaction",
  explorerUrl
}: {
  status: WalletTransactionState | null;
  title?: string;
  explorerUrl?: string;
}) {
  if (!status || status.phase === "idle") return null;

  const explorerTxUrl = buildExplorerTxUrl(status.txHash, explorerUrl);
  const shortHash = status.txHash ? shortenTxHash(status.txHash) : null;
  const isError = status.phase === "failed" || status.phase === "rejected";

  return (
    <div
      data-testid="wallet-transaction-status"
      role={isError ? "alert" : "status"}
      aria-live={isError ? "assertive" : "polite"}
      aria-atomic="true"
      className={`rounded-md border px-4 py-3 text-sm leading-6 ${toneClasses(status.phase)}`}
    >
      <div className="flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="text-xs font-semibold uppercase tracking-wide opacity-80">{title}</div>
          <div className="font-semibold">{phaseLabels[status.phase]}</div>
        </div>

        {shortHash ? (
          explorerTxUrl ? (
            <a
              href={explorerTxUrl}
              target="_blank"
              rel="noreferrer"
              className="break-all font-mono text-xs underline underline-offset-4"
              title={status.txHash ?? undefined}
              aria-label={`Open ${title.toLowerCase()} transaction ${shortHash} in the block explorer (opens in a new tab)`}
            >
              {shortHash}
            </a>
          ) : (
            <span className="break-all font-mono text-xs" title={status.txHash ?? undefined}>{shortHash}</span>
          )
        ) : null}
      </div>

      <p className="mt-2 opacity-90">{status.message}</p>
    </div>
  );
}
