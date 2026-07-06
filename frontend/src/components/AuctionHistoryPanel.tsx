"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { ModeBadge } from "@/components/ModeBadge";
import type { AuctionHistory, AuctionHistoryApiResponse, AuctionTransparencySummary, SerializedAuction } from "@/lib/auctionTypes";
import { formatAddressOrNone, formatEth, formatTimestamp, shortenAddress } from "@/lib/format";

function parseAmount(value?: string | null) {
  try {
    return BigInt(value ?? "0");
  } catch {
    return 0n;
  }
}

function sumAmounts(values: Array<string | undefined | null>) {
  return values.reduce((total, value) => total + parseAmount(value), 0n).toString();
}

function fallbackTransparency(auction: SerializedAuction): AuctionTransparencySummary {
  const economics = auction.economics;

  return {
    seller: auction.seller,
    highestBidder: auction.highestBidder,
    highestBid: auction.highestBid,
    finalPrice: economics?.settlement.finalPrice ?? (auction.finalized ? auction.highestBid : "0"),
    sellerProceeds: economics?.settlement.sellerProceeds ?? "0",
    protocolFees: economics?.settlement.feeAmount ?? "0",
    distributionReserve: economics?.settlement.distributionReserve ?? "0",
    totalAssignedRewards: economics?.distribution.totalAssigned ?? "0",
    totalClaimedRewards: economics?.distribution.totalClaimed ?? "0",
    visibleRefundableAmount: sumAmounts([
      economics?.primaryBidder.refundableAmount,
      economics?.secondBidder.refundableAmount
    ]),
    visibleRewardEntitlement: sumAmounts([
      economics?.primaryBidder.rewardEntitlement,
      economics?.secondBidder.rewardEntitlement
    ]),
    nftClaimed: auction.nftClaimed
  };
}

function explorerTxUrl(transactionHash?: string) {
  const baseUrl = process.env.NEXT_PUBLIC_BLOCK_EXPLORER_URL?.trim().replace(/\/$/, "");

  if (!baseUrl || !transactionHash) return null;

  return `${baseUrl}/tx/${transactionHash}`;
}

function formatMaybeTimestamp(value?: string) {
  if (!value || value === "0") return "Timestamp unavailable";
  return formatTimestamp(value);
}

export function AuctionHistoryPanel({ auction }: { auction: SerializedAuction }) {
  const [history, setHistory] = useState<AuctionHistory | null>(auction.history ?? null);
  const [error, setError] = useState<string | null>(auction.historyError ?? null);
  const [isLoading, setIsLoading] = useState(!auction.history && !auction.historyError);

  const loadHistory = useCallback(async () => {
    try {
      setIsLoading(true);

      const response = await fetch(`/api/auctions/${auction.auctionId}/history`, {
        cache: "no-store"
      });
      const payload = (await response.json().catch(() => null)) as AuctionHistoryApiResponse | { error?: string } | null;

      if (!response.ok || !payload || !("history" in payload)) {
        throw new Error(payload && "error" in payload && payload.error ? payload.error : "Unable to read auction history");
      }

      setHistory(payload.history);
      setError(null);
    } catch (caught) {
      setHistory(null);
      setError(caught instanceof Error ? caught.message : "Unable to read auction history");
    } finally {
      setIsLoading(false);
    }
  }, [auction.auctionId]);

  useEffect(() => {
    loadHistory();
  }, [loadHistory]);

  const transparency = useMemo(() => history?.transparency ?? fallbackTransparency(auction), [auction, history]);

  return (
    <section className="rounded-lg border border-slate-800 bg-slate-900 p-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-3">
            <h2 className="text-xl font-semibold text-white">Bid history / Auction transparency</h2>
            <ModeBadge variant="read-only" />
          </div>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-400">
            Bid records are read from the auction contract. Event logs enrich the view with transaction hashes,
            block numbers, timestamps, finalization, NFT claims, refunds, and reward claims when the RPC exposes them.
          </p>
        </div>

        <button
          type="button"
          onClick={loadHistory}
          disabled={isLoading}
          className="inline-flex min-h-10 items-center justify-center rounded-md border border-slate-700 px-4 text-sm font-semibold text-slate-100 transition hover:border-slate-500 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isLoading ? "Loading..." : "Refresh history"}
        </button>
      </div>

      <div className="mt-5 grid gap-3 text-sm text-slate-300 md:grid-cols-2 lg:grid-cols-3">
        <SummaryItem label="Seller" value={shortenAddress(transparency.seller)} mono />
        <SummaryItem label="Highest bidder / winner" value={formatAddressOrNone(transparency.highestBidder)} mono />
        <SummaryItem label="Highest bid" value={formatEth(transparency.highestBid)} mono />
        <SummaryItem label="Final price" value={formatEth(transparency.finalPrice)} mono />
        <SummaryItem label="Seller proceeds" value={formatEth(transparency.sellerProceeds)} mono />
        <SummaryItem label="Protocol fees" value={formatEth(transparency.protocolFees)} mono />
        <SummaryItem label="Distribution reserve" value={formatEth(transparency.distributionReserve)} mono />
        <SummaryItem label="Total assigned rewards" value={formatEth(transparency.totalAssignedRewards)} mono />
        <SummaryItem label="Total claimed rewards" value={formatEth(transparency.totalClaimedRewards)} mono />
        <SummaryItem label="Visible configured refunds" value={formatEth(transparency.visibleRefundableAmount)} mono />
        <SummaryItem label="Visible reward entitlements" value={formatEth(transparency.visibleRewardEntitlement)} mono />
        <SummaryItem label="NFT claimed" value={transparency.nftClaimed ? "Yes" : "No"} />
      </div>

      {error ? (
        <div className="mt-5 rounded-md border border-amber-400/40 bg-amber-400/10 px-4 py-3 text-sm leading-6 text-amber-100">
          {error}. The economic summary above still uses the already loaded auction detail.
        </div>
      ) : null}

      {history?.partial && history.warnings.length > 0 ? (
        <div className="mt-5 rounded-md border border-amber-400/40 bg-amber-400/10 px-4 py-3 text-sm leading-6 text-amber-100">
          {history.warnings.join(" ")}
        </div>
      ) : null}

      {history ? (
        <div className="mt-5 rounded-md border border-slate-800 bg-slate-950 px-4 py-3 text-xs leading-5 text-slate-500">
          History source: <span className="font-mono text-cyan-200">{history.source}</span>
          {history.partial ? " / partial" : " / complete within the available read model"}
        </div>
      ) : null}

      <div className="mt-5">
        <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Bid history</h3>
        {!history && isLoading ? (
          <div className="mt-3 rounded-md bg-slate-950 px-4 py-3 text-sm text-slate-300">Loading bid history...</div>
        ) : null}
        {history && history.bids.length === 0 ? (
          <div className="mt-3 rounded-md bg-slate-950 px-4 py-3 text-sm text-slate-300">No bids have been recorded for this auction yet.</div>
        ) : null}
        {history && history.bids.length > 0 ? (
          <div className="mt-3 overflow-x-auto rounded-md border border-slate-800">
            <table className="min-w-full divide-y divide-slate-800 text-sm">
              <thead className="bg-slate-950 text-left text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th scope="col" className="px-4 py-3 font-semibold">#</th>
                  <th scope="col" className="px-4 py-3 font-semibold">Bidder</th>
                  <th scope="col" className="px-4 py-3 font-semibold">Amount</th>
                  <th scope="col" className="px-4 py-3 font-semibold">Time / block</th>
                  <th scope="col" className="px-4 py-3 font-semibold">Transaction</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800 bg-slate-950/60 text-slate-200">
                {history.bids.map((bid) => (
                  <tr key={`${bid.index}:${bid.transactionHash ?? bid.amount}`}>
                    <td className="px-4 py-3 font-mono text-xs text-slate-400">{bid.index}</td>
                    <td className="px-4 py-3 font-mono text-xs">{shortenAddress(bid.bidder)}</td>
                    <td className="px-4 py-3 font-mono text-xs">{formatEth(bid.amount)}</td>
                    <td className="px-4 py-3 text-xs text-slate-300">
                      <div>{formatMaybeTimestamp(bid.timestamp)}</div>
                      {bid.blockNumber ? <div className="mt-1 font-mono text-slate-500">Block {bid.blockNumber}</div> : null}
                    </td>
                    <td className="px-4 py-3 font-mono text-xs">
                      <TransactionLink transactionHash={bid.transactionHash} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
      </div>

      <div className="mt-6">
        <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Event timeline</h3>
        {!history && isLoading ? (
          <div className="mt-3 rounded-md bg-slate-950 px-4 py-3 text-sm text-slate-300">Loading event timeline...</div>
        ) : null}
        {history && history.events.length === 0 ? (
          <div className="mt-3 rounded-md bg-slate-950 px-4 py-3 text-sm text-slate-300">
            No matching logs were returned by the RPC. Bid records and economic reads can still be available.
          </div>
        ) : null}
        {history && history.events.length > 0 ? (
          <div className="mt-3 grid gap-3">
            {history.events.map((event) => (
              <div key={event.id} className="rounded-md border border-slate-800 bg-slate-950 px-4 py-3">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <div className="text-sm font-semibold text-white">{event.label}</div>
                    <div className="mt-1 text-xs leading-5 text-slate-400">
                      {event.actor ? <span className="font-mono text-slate-300">{shortenAddress(event.actor)}</span> : "No actor"}
                      {event.amount ? <span> / {formatEth(event.amount)}</span> : null}
                    </div>
                    {event.details ? <div className="mt-1 text-xs leading-5 text-slate-500">{event.details}</div> : null}
                  </div>
                  <div className="text-left text-xs text-slate-500 sm:text-right">
                    <div>{formatMaybeTimestamp(event.timestamp)}</div>
                    {event.blockNumber ? <div className="mt-1 font-mono">Block {event.blockNumber}</div> : null}
                    <div className="mt-1 font-mono">
                      <TransactionLink transactionHash={event.transactionHash} />
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : null}
      </div>
    </section>
  );
}

function SummaryItem({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="rounded-md border border-slate-800 bg-slate-950 px-4 py-3">
      <div className="text-xs text-slate-500">{label}</div>
      <div className={`mt-1 break-all text-sm text-slate-200 ${mono ? "font-mono" : ""}`}>{value}</div>
    </div>
  );
}

function TransactionLink({ transactionHash }: { transactionHash?: string }) {
  if (!transactionHash) {
    return <span className="text-slate-500">Unavailable</span>;
  }

  const url = explorerTxUrl(transactionHash);
  const label = shortenAddress(transactionHash);

  if (!url) {
    return <span title={transactionHash}>{label}</span>;
  }

  return (
    <a href={url} target="_blank" rel="noreferrer" className="text-cyan-200 transition hover:text-cyan-100" title={transactionHash}>
      {label}
    </a>
  );
}
