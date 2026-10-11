"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ModeBadge } from "@/components/ModeBadge";
import { EmptyState } from "@/components/ui/EmptyState";
import { StateNotice } from "@/components/ui/StateNotice";
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
  // A keyed boundary clears the previous auction synchronously, before effects
  // run, while each instance also guards and aborts its pending reads.
  return <AuctionHistoryContent key={auction.auctionId} auction={auction} />;
}

function AuctionHistoryContent({ auction }: { auction: SerializedAuction }) {
  const [history, setHistory] = useState<AuctionHistory | null>(auction.history?.auctionId === auction.auctionId ? auction.history : null);
  const [error, setError] = useState<string | null>(auction.historyError ?? null);
  const [isLoading, setIsLoading] = useState(!auction.history && !auction.historyError);
  const [isLoadingEarlier, setIsLoadingEarlier] = useState(false);
  const [earlierError, setEarlierError] = useState<string | null>(null);
  const requestGeneration = useRef(0);
  const activeRequest = useRef<AbortController | null>(null);

  const loadHistory = useCallback(async () => {
    const generation = ++requestGeneration.current;
    activeRequest.current?.abort();
    const controller = new AbortController();
    activeRequest.current = controller;
    const isCurrent = () => generation === requestGeneration.current && !controller.signal.aborted;
    try {
      setIsLoading(true);
      setIsLoadingEarlier(false);
      setEarlierError(null);

      const response = await fetch(`/api/auctions/${auction.auctionId}/history`, {
        cache: "no-store",
        signal: controller.signal
      });
      const payload = (await response.json().catch(() => null)) as AuctionHistoryApiResponse | { error?: string } | null;

      if (!response.ok || !payload || !("history" in payload)) {
        throw new Error(payload && "error" in payload && payload.error ? payload.error : "Unable to read auction history");
      }
      if ((payload.auctionId !== undefined && payload.auctionId !== auction.auctionId) || payload.history.auctionId !== auction.auctionId) {
        throw new Error("Unable to read auction history");
      }
      if (!isCurrent()) return;
      // Replace accumulated pages and their cursor together after a refresh.
      setHistory(payload.history);
      setError(null);
    } catch (caught) {
      if (!isCurrent()) return;
      setError(caught instanceof Error ? caught.message : "Unable to read auction history");
    } finally {
      if (isCurrent()) {
        setIsLoading(false);
        activeRequest.current = null;
      }
    }
  }, [auction.auctionId]);

  useEffect(() => {
    loadHistory();
    return () => {
      ++requestGeneration.current;
      activeRequest.current?.abort();
    };
  }, [loadHistory]);

  const loadEarlier = async () => {
    if (!history?.hasMoreBids || !history.nextBefore || activeRequest.current) return;
    const cursor = history.nextBefore;
    const generation = ++requestGeneration.current;
    const controller = new AbortController();
    activeRequest.current = controller;
    const isCurrent = () => generation === requestGeneration.current && !controller.signal.aborted;
    setIsLoadingEarlier(true);
    setEarlierError(null);
    try {
      const response = await fetch(`/api/auctions/${auction.auctionId}/history?before=${encodeURIComponent(cursor)}`, {
        cache: "no-store",
        signal: controller.signal
      });
      const payload = (await response.json().catch(() => null)) as AuctionHistoryApiResponse | { error?: string } | null;
      if (!response.ok || !payload || !("history" in payload) || (payload.auctionId !== undefined && payload.auctionId !== auction.auctionId) ||
        payload.history.auctionId !== auction.auctionId || payload.history.bidsAvailable === false) {
        throw new Error("Unable to read earlier bids");
      }
      if (!isCurrent()) return;
      setHistory((current) => {
        if (!current || current.auctionId !== auction.auctionId) return current;
        const byIndex = new Map([...payload.history.bids, ...current.bids].map((bid) => [bid.index, bid]));
        const warnings = Array.from(new Set([...current.warnings, ...payload.history.warnings]));
        return {
          ...current,
          bids: Array.from(byIndex.values()).sort((a, b) => BigInt(a.index) < BigInt(b.index) ? -1 : BigInt(a.index) > BigInt(b.index) ? 1 : 0),
          // The counter describes the initial view; appended new bids appear
          // after refresh, while the exclusive cursor keeps older pages stable.
          totalBidCount: current.totalBidCount ?? payload.history.totalBidCount,
          hasMoreBids: payload.history.hasMoreBids,
          nextBefore: payload.history.nextBefore,
          // returnedBidCount describes a server page, not the accumulated view.
          returnedBidCount: payload.history.returnedBidCount,
          warnings,
          partial: current.partial || payload.history.partial || warnings.length > 0
        };
      });
    } catch {
      if (isCurrent()) setEarlierError("Earlier bids could not be loaded. Your loaded bids are preserved. Retry to continue.");
    } finally {
      if (isCurrent()) {
        setIsLoadingEarlier(false);
        activeRequest.current = null;
      }
    }
  };

  const transparency = useMemo(() => history?.transparency ?? fallbackTransparency(auction), [auction, history]);

  return (
    <section aria-busy={isLoading || isLoadingEarlier} className="premium-surface min-w-0 rounded-xl p-4 sm:p-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-3">
            <h2 className="text-xl font-semibold text-white">Bid history / Auction transparency</h2>
            <ModeBadge variant="read-only" />
          </div>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-400">
            Bid records are read from the auction contract. Bid transaction links appear only when the complete
            event sequence is verified. The bounded event timeline separately shows available finalization,
            NFT claim, refund, and reward claim logs.
          </p>
        </div>

        <button
          type="button"
          onClick={loadHistory}
          disabled={isLoading}
          className="inline-flex min-h-10 w-full items-center justify-center rounded-md border border-slate-700 px-4 text-sm font-semibold text-slate-100 transition hover:border-slate-500 disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto"
        >
          {isLoading ? "Loading..." : "Refresh history"}
        </button>
      </div>

      <div className="mt-5 grid gap-3 text-sm text-slate-300 md:grid-cols-2 lg:grid-cols-3">
        <SummaryItem label="Seller" value={shortenAddress(transparency.seller)} fullValue={transparency.seller} mono />
        <SummaryItem label="Highest bidder / winner" value={formatAddressOrNone(transparency.highestBidder)} fullValue={transparency.highestBidder} mono />
        <SummaryItem label="Highest bid" value={formatEth(transparency.highestBid)} mono />
        <SummaryItem label="Final price" value={formatEth(transparency.finalPrice)} mono />
        <SummaryItem label="Seller proceeds" value={formatEth(transparency.sellerProceeds)} mono />
        <SummaryItem label="Protocol fees" value={formatEth(transparency.protocolFees)} mono />
        <SummaryItem label="Distribution reserve" value={formatEth(transparency.distributionReserve)} mono />
        <SummaryItem label="Total assigned rewards" value={formatEth(transparency.totalAssignedRewards)} mono />
        <SummaryItem label="Total claimed rewards" value={formatEth(transparency.totalClaimedRewards)} mono />
        <SummaryItem label="Recorded configured refunds" value={formatEth(transparency.visibleRefundableAmount)} mono />
        <SummaryItem label="Recorded reward entitlements" value={formatEth(transparency.visibleRewardEntitlement)} mono />
        <SummaryItem label="NFT claimed" value={transparency.nftClaimed ? "Yes" : "No"} />
      </div>

      {error ? (
        <StateNotice tone="error" title="Auction history could not be refreshed" className="mt-5">
          {error}. The economic summary above still uses the already loaded auction detail.
        </StateNotice>
      ) : null}

      {history?.partial && history.warnings.length > 0 ? (
        <StateNotice tone="warning" title="History is partial" className="mt-5">
          {history.warnings.join(" ")}
        </StateNotice>
      ) : null}

      {history ? (
        <div className="mt-5 rounded-md border border-slate-800 bg-slate-950 px-4 py-3 text-xs leading-5 text-slate-500">
          History source: <span className="font-mono text-cyan-200">{history.source}</span>
          {history.partial ? " / partial" : " / complete within the available read model"}
        </div>
      ) : null}

      <div className="mt-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Bid history</h3>
            {history ? <p className="mt-1 text-sm text-slate-400" role="status" aria-live="polite">
              {history.totalBidCount != null ? `${history.bids.length} of ${history.totalBidCount} bids loaded` : `${history.bids.length} bids loaded; total unavailable`}
            </p> : null}
            <p className="mt-1 text-xs text-slate-500">New bids appear after refresh.</p>
          </div>
          {history?.hasMoreBids && history.nextBefore ? (
            <button
              type="button"
              onClick={loadEarlier}
              disabled={isLoading || isLoadingEarlier}
              aria-busy={isLoadingEarlier}
              className="inline-flex min-h-10 w-full items-center justify-center rounded-md border border-cyan-900 bg-cyan-950/30 px-4 text-sm font-semibold text-cyan-100 transition hover:border-cyan-700 disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto"
            >
              {isLoadingEarlier ? "Loading earlier bids..." : "Load earlier bids"}
            </button>
          ) : null}
        </div>
        {earlierError ? <StateNotice tone="error" title="Earlier bid history unavailable" className="mt-3">{earlierError}</StateNotice> : null}
        {!history && isLoading ? (
          <StateNotice tone="loading" title="Loading bid history" className="mt-3">
            Reading bid records and available transaction logs.
          </StateNotice>
        ) : null}
        {history?.bidsAvailable === false ? (
          <StateNotice tone="warning" title="Bid records unavailable" className="mt-3">
            Canonical bid records could not be read. Refresh history to retry; available event logs do not establish canonical bid indices.
          </StateNotice>
        ) : null}
        {history && history.bidsAvailable !== false && history.source !== "events-only" && history.source !== "unavailable" &&
          history.bids.length === 0 && !history.hasMoreBids && (history.totalBidCount == null || history.totalBidCount === "0") ? (
          <EmptyState title="No bids yet" className="mt-3">
            No bids have been recorded for this auction yet. Bid history will appear after the first valid bid.
          </EmptyState>
        ) : null}
        {history && history.bids.length > 0 ? (
          <div className="mt-3 max-w-full overflow-x-auto rounded-md border border-slate-800" tabIndex={0} aria-label="Scrollable bid history table">
            <table className="min-w-[720px] divide-y divide-slate-800 text-sm">
              <caption className="sr-only">Bid records for Auction #{auction.auctionId}</caption>
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
                  <tr key={bid.index}>
                    <td className="px-4 py-3 font-mono text-xs text-slate-400">{bid.index}</td>
                    <td className="px-4 py-3 font-mono text-xs" title={bid.bidder}>{shortenAddress(bid.bidder)}</td>
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
        <p className="mt-1 text-xs leading-5 text-slate-500">Up to 250 events. Loading earlier bids does not extend this timeline.</p>
        {!history && isLoading ? (
          <StateNotice tone="loading" title="Loading event timeline" className="mt-3">
            Reading the event window exposed by the configured RPC.
          </StateNotice>
        ) : null}
        {history && history.events.length === 0 ? (
          <EmptyState title="No matching event logs" className="mt-3">
            No matching logs were returned by the RPC. Bid records and economic reads can still be available.
          </EmptyState>
        ) : null}
        {history && history.events.length > 0 ? (
          <div className="mt-3 grid gap-3">
            {history.events.map((event) => (
              <div key={event.id} className="rounded-md border border-slate-800 bg-slate-950 px-4 py-3">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <div className="text-sm font-semibold text-white">{event.label}</div>
                    <div className="mt-1 text-xs leading-5 text-slate-400">
                      {event.actor ? <span className="font-mono text-slate-300" title={event.actor}>{shortenAddress(event.actor)}</span> : "No actor"}
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

function SummaryItem({ label, value, fullValue, mono = false }: { label: string; value: string; fullValue?: string; mono?: boolean }) {
  return (
    <div className="min-w-0 rounded-md border border-slate-800 bg-slate-950 px-4 py-3">
      <div className="text-xs text-slate-500">{label}</div>
      <div className={`mt-1 break-all text-sm text-slate-200 ${mono ? "font-mono" : ""}`} title={fullValue}>{value}</div>
    </div>
  );
}

function TransactionLink({ transactionHash }: { transactionHash?: string }) {
  if (!transactionHash) {
    return <span className="text-slate-500">Transaction unavailable</span>;
  }

  const url = explorerTxUrl(transactionHash);
  const label = shortenAddress(transactionHash);

  if (!url) {
    return <span title={transactionHash}>{label}</span>;
  }

  return (
    <a
      href={url}
      target="_blank"
      rel="noreferrer noopener"
      className="text-cyan-200 transition hover:text-cyan-100"
      title={transactionHash}
      aria-label={`Open transaction ${label} in the block explorer (opens in a new tab)`}
    >
      {label}
    </a>
  );
}
