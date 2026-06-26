"use client";

import { useState } from "react";
import { formatEth, shortenAddress } from "@/lib/format";

type DevActionResponse = {
  status: "ok" | "error";
  action: string;
  localDevOnly: true;
  auctionId?: string;
  txHash?: `0x${string}`;
  bidder?: `0x${string}`;
  finalizedBy?: `0x${string}`;
  bidAmount?: string;
  valueSent?: string;
  timeIncreasedBy?: string;
  error?: string;
};

export function AuctionDevActions({
  auctionId,
  auctionState,
  finalized,
  onActionComplete
}: {
  auctionId: string;
  auctionState: number;
  finalized: boolean;
  onActionComplete: () => Promise<void>;
}) {
  const [pendingAction, setPendingAction] = useState<"bid" | "finalize" | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [lastTxHash, setLastTxHash] = useState<`0x${string}` | null>(null);

  const canBid = auctionState === 0 && !finalized;
  const canFinalize = !finalized;

  async function runDevAction(action: "bid" | "finalize") {
    const endpoint = action === "bid" ? "/api/dev/place-bid" : "/api/dev/finalize";

    try {
      setPendingAction(action);
      setMessage(null);
      setLastTxHash(null);

      const response = await fetch(endpoint, {
        method: "POST",
        headers: {
          "content-type": "application/json"
        },
        body: JSON.stringify({ auctionId })
      });

      const payload = (await response.json().catch(() => null)) as DevActionResponse | null;

      if (!response.ok || !payload || payload.status === "error") {
        throw new Error(payload?.error ?? "Local dev action failed");
      }

      setLastTxHash(payload.txHash ?? null);

      if (action === "bid") {
        setMessage(
          `Demo bid placed by ${shortenAddress(payload.bidder)} at ${formatEth(payload.bidAmount)}. Value sent: ${formatEth(
            payload.valueSent
          )}.`
        );
      } else {
        setMessage(`Auction finalized. Time increased by ${payload.timeIncreasedBy ?? "0"} seconds before finalization.`);
      }

      await onActionComplete();
    } catch (caught) {
      setMessage(caught instanceof Error ? caught.message : "Local dev action failed");
    } finally {
      setPendingAction(null);
    }
  }

  return (
    <section className="mt-5 rounded-lg border border-amber-400/30 bg-amber-400/10 p-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h3 className="text-sm font-semibold uppercase tracking-wide text-amber-100">Local dev actions only</h3>
          <p className="mt-1 max-w-2xl text-sm leading-6 text-amber-100/80">
            These buttons use a local Anvil dev private key on the Next.js server. They are for Codespaces MVP testing
            only and are not a production transaction flow.
          </p>
        </div>
      </div>

      <div className="mt-4 flex flex-col gap-3 sm:flex-row">
        <button
          type="button"
          disabled={!canBid || pendingAction !== null}
          onClick={() => runDevAction("bid")}
          className="inline-flex min-h-10 items-center justify-center rounded-md bg-cyan-400 px-4 text-sm font-semibold text-slate-950 transition hover:bg-cyan-300 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {pendingAction === "bid" ? "Placing bid..." : "Place demo bid"}
        </button>

        <button
          type="button"
          disabled={!canFinalize || pendingAction !== null}
          onClick={() => runDevAction("finalize")}
          className="inline-flex min-h-10 items-center justify-center rounded-md bg-emerald-400 px-4 text-sm font-semibold text-slate-950 transition hover:bg-emerald-300 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {pendingAction === "finalize" ? "Finalizing..." : "Finalize auction"}
        </button>
      </div>

      {!canBid && !finalized ? (
        <p className="mt-3 text-xs text-amber-100/70">Demo bid is available only while the auction is OPEN.</p>
      ) : null}

      {message ? <div className="mt-4 rounded-md bg-slate-950 px-4 py-3 text-sm text-slate-200">{message}</div> : null}

      {lastTxHash ? (
        <div className="mt-3 break-all font-mono text-xs text-amber-100/70">tx: {lastTxHash}</div>
      ) : null}
    </section>
  );
}