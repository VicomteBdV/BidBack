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
  pending: "Pending confirmation",
  refreshing: "Refreshing action state",
  confirmed: "Transaction confirmed",
  "confirmation-unknown": "Confirmation not verified",
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

  if (phase === "confirmation-unknown") {
    return "border-amber-400/40 bg-amber-400/10 text-amber-50";
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
  const isError = status.phase === "failed" || status.phase === "rejected";

  return (
    <div
      data-testid="wallet-transaction-status"
      role={isError ? "alert" : "status"}
      aria-live={isError ? "assertive" : "polite"}
      aria-atomic="true"
      className={`rounded-md border px-4 py-3 text-sm leading-6 ${toneClasses(status.phase)}`}
    >
      <div>
        <div className="text-xs font-semibold uppercase tracking-wide opacity-80">{title}</div>
        <div className="font-semibold">{phaseLabels[status.phase]}</div>
      </div>

      <p className="mt-2 opacity-90">{status.message}</p>
      {status.nextAction ? <p className="mt-2 font-medium">Next: {status.nextAction}</p> : null}

      {status.txHash || status.technicalDetail ? (
        <details className="transaction-evidence mt-3">
          <summary>Transaction evidence and technical details</summary>
          {status.txHash ? (
            <div className="mt-2">
              <span className="mr-2 text-xs opacity-80">Transaction hash</span>
              {explorerTxUrl ? (
                <a
                  href={explorerTxUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="break-all font-mono text-xs underline underline-offset-4"
                  title={status.txHash}
                  aria-label={`Open ${title.toLowerCase()} transaction ${shortenTxHash(status.txHash)} in the block explorer (opens in a new tab)`}
                >
                  {shortenTxHash(status.txHash)}
                </a>
              ) : (
                <span className="break-all font-mono text-xs" title={status.txHash}>{shortenTxHash(status.txHash)}</span>
              )}
            </div>
          ) : null}
          {status.technicalDetail ? (
            <p className="mt-2 break-words font-mono text-xs opacity-80">{status.technicalDetail}</p>
          ) : null}
        </details>
      ) : null}
    </div>
  );
}
