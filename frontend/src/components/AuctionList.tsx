"use client";

import Link from "next/link";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useAccount } from "wagmi";
import { AuctionStateBadge } from "@/components/AuctionStateBadge";
import { NftPreview } from "@/components/NftPreview";
import { EmptyState } from "@/components/ui/EmptyState";
import { getAuctionLifecycle, type AuctionLifecycleTone } from "@/lib/auctionLifecycle";
import type { AuctionsApiResponse } from "@/lib/auctionTypes";
import {
  auctionSortLabels,
  auctionStatusFilterLabels,
  filterAndSortAuctions,
  type AuctionSortOption,
  type AuctionStatusFilter
} from "@/lib/auctionFilters";
import { formatAddressOrNone, formatEth, formatTimestamp, shortenAddress } from "@/lib/format";

const DEFAULT_AUCTION_LIST_LIMIT = 25;
const AUCTION_LIST_LIMIT_OPTIONS = [10, 25, 50, 100] as const;

const lifecycleToneClasses: Record<AuctionLifecycleTone, string> = {
  success: "border-emerald-400/40 bg-emerald-400/10 text-emerald-100",
  warning: "border-amber-400/40 bg-amber-400/10 text-amber-100",
  info: "border-cyan-400/40 bg-cyan-400/10 text-cyan-100",
  complete: "border-violet-400/40 bg-violet-400/10 text-violet-100",
  neutral: "border-slate-500/40 bg-slate-500/10 text-slate-200"
};

const statusOptions: AuctionStatusFilter[] = [
  "all",
  "open",
  "readyToFinalize",
  "finalized",
  "claimable",
  "settled",
  "createdByWallet",
  "involvingWallet"
];

const sortOptions: AuctionSortOption[] = ["newest", "oldest", "endingSoon", "highestBid"];

function hasActiveBrowsing(status: AuctionStatusFilter, query: string) {
  return status !== "all" || query.trim().length > 0;
}

export function AuctionList() {
  const { address, isConnected } = useAccount();
  const [data, setData] = useState<AuctionsApiResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<AuctionStatusFilter>("all");
  const [sortOption, setSortOption] = useState<AuctionSortOption>("newest");
  const [limit, setLimit] = useState(DEFAULT_AUCTION_LIST_LIMIT);

  const loadAuctions = useCallback(async () => {
    try {
      setIsLoading(true);

      const response = await fetch(`/api/auctions?limit=${limit}`, {
        cache: "no-store"
      });

      const payload = (await response.json().catch(() => null)) as AuctionsApiResponse | { error?: string } | null;

      if (!response.ok) {
        throw new Error(payload && "error" in payload && payload.error ? payload.error : "Unable to read auctions");
      }

      setData(payload as AuctionsApiResponse);
      setError(null);
    } catch (caught) {
      setData(null);
      setError(caught instanceof Error ? caught.message : "Unable to read auctions");
    } finally {
      setIsLoading(false);
    }
  }, [limit]);

  useEffect(() => {
    loadAuctions();
  }, [loadAuctions]);

  useEffect(() => {
    if (!isConnected && (statusFilter === "createdByWallet" || statusFilter === "involvingWallet")) {
      setStatusFilter("all");
    }
  }, [isConnected, statusFilter]);

  const filteredAuctions = useMemo(() => {
    if (!data) return [];

    return filterAndSortAuctions(data.auctions, {
      status: statusFilter,
      query,
      sort: sortOption,
      connectedWallet: address
    });
  }, [address, data, query, sortOption, statusFilter]);

  const browsingActive = hasActiveBrowsing(statusFilter, query);
  const metadataUnavailableCount = data?.auctions.filter((auction) => auction.nftMetadata?.status !== "loaded").length ?? 0;

  return (
    <section className="rounded-lg border border-slate-800 bg-slate-900 p-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="text-lg font-semibold text-white">Auctions</h2>
          <p className="mt-1 text-sm text-slate-400">
            Read by Next.js server routes from the configured target RPC. Auction discovery uses on-chain
            AuctionCreated events with a bounded fallback.
          </p>
        </div>

        <button
          type="button"
          onClick={loadAuctions}
          disabled={isLoading}
          className="inline-flex min-h-10 items-center justify-center rounded-md border border-slate-700 px-4 text-sm font-semibold text-slate-100 transition hover:border-slate-500 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isLoading ? "Loading..." : "Refresh"}
        </button>
      </div>

      {isLoading ? (
        <div className="mt-5 rounded-md bg-slate-950 px-4 py-3 text-sm text-slate-300">Loading auctions...</div>
      ) : null}

      {!isLoading && error ? (
        <div className="mt-5 rounded-md border border-amber-400/40 bg-amber-400/10 px-4 py-3 text-sm text-amber-100">
          {error}
        </div>
      ) : null}

      {!isLoading && data ? (
        <div className="mt-5 grid gap-3 text-sm text-slate-300 sm:grid-cols-4">
          <div className="rounded-md bg-slate-950 px-4 py-3">
            <div className="text-slate-500">Chain ID</div>
            <div className="mt-1 font-mono text-cyan-200">{data.chainId}</div>
          </div>
          <div className="rounded-md bg-slate-950 px-4 py-3">
            <div className="text-slate-500">AuctionHouse</div>
            <div className="mt-1 font-mono text-cyan-200">{shortenAddress(data.auctionHouse)}</div>
          </div>
          <div className="rounded-md bg-slate-950 px-4 py-3">
            <div className="text-slate-500">Loaded / shown auctions</div>
            <div className="mt-1 font-mono text-cyan-200">
              {filteredAuctions.length} / {data.count}
            </div>
          </div>
          <div className="rounded-md bg-slate-950 px-4 py-3">
            <div className="text-slate-500">Discovery</div>
            <div className="mt-1 font-mono text-cyan-200">
              {data.discovery.strategy === "events" ? "Events" : "Fallback"} / {data.discovery.limit}
            </div>
          </div>
        </div>
      ) : null}

      {!isLoading && data ? (
        <div className="mt-5 rounded-lg border border-slate-800 bg-slate-950 p-4">
          <div className="grid gap-3 lg:grid-cols-[minmax(0,1.5fr)_minmax(180px,0.8fr)_minmax(180px,0.8fr)_120px]">
            <label className="grid gap-2 text-sm">
              <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Search</span>
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Auction ID, NFT, token, seller, bidder, metadata..."
                className="min-h-11 rounded-md border border-slate-700 bg-slate-900 px-3 text-sm text-slate-100 outline-none transition placeholder:text-slate-600 focus:border-cyan-400"
              />
            </label>

            <label className="grid gap-2 text-sm">
              <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Status</span>
              <select
                value={statusFilter}
                onChange={(event) => setStatusFilter(event.target.value as AuctionStatusFilter)}
                className="min-h-11 rounded-md border border-slate-700 bg-slate-900 px-3 text-sm text-slate-100 outline-none transition focus:border-cyan-400"
              >
                {statusOptions.map((option) => (
                  <option
                    key={option}
                    value={option}
                    disabled={!isConnected && (option === "createdByWallet" || option === "involvingWallet")}
                  >
                    {auctionStatusFilterLabels[option]}
                  </option>
                ))}
              </select>
            </label>

            <label className="grid gap-2 text-sm">
              <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Sort</span>
              <select
                value={sortOption}
                onChange={(event) => setSortOption(event.target.value as AuctionSortOption)}
                className="min-h-11 rounded-md border border-slate-700 bg-slate-900 px-3 text-sm text-slate-100 outline-none transition focus:border-cyan-400"
              >
                {sortOptions.map((option) => (
                  <option key={option} value={option}>
                    {auctionSortLabels[option]}
                  </option>
                ))}
              </select>
            </label>

            <label className="grid gap-2 text-sm">
              <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Limit</span>
              <select
                value={limit}
                onChange={(event) => setLimit(Number(event.target.value))}
                className="min-h-11 rounded-md border border-slate-700 bg-slate-900 px-3 text-sm text-slate-100 outline-none transition focus:border-cyan-400"
              >
                {AUCTION_LIST_LIMIT_OPTIONS.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div className="mt-4 flex flex-col gap-2 text-xs leading-5 text-slate-500 sm:flex-row sm:items-center sm:justify-between">
            <div>
              Showing {filteredAuctions.length} of {data.count} loaded auctions. Filters apply only to the currently loaded read-only window.
            </div>
            {browsingActive ? (
              <button
                type="button"
                onClick={() => {
                  setQuery("");
                  setStatusFilter("all");
                  setSortOption("newest");
                }}
                className="text-left font-semibold text-cyan-200 transition hover:text-cyan-100 sm:text-right"
              >
                Clear filters
              </button>
            ) : null}
          </div>
        </div>
      ) : null}

      {!isLoading && data?.discovery.warning ? (
        <div className="mt-5 rounded-md border border-amber-400/40 bg-amber-400/10 px-4 py-3 text-sm text-amber-100">
          {data.discovery.warning}
        </div>
      ) : null}

      {!isLoading && data && data.count > 0 && data.count >= data.discovery.limit ? (
        <div className="mt-5 rounded-md border border-cyan-400/30 bg-cyan-400/10 px-4 py-3 text-sm leading-6 text-cyan-100">
          This list is bounded to {data.discovery.limit} loaded auctions. Increase the limit for a wider MVP window; production browsing will need an indexer.
        </div>
      ) : null}

      {!isLoading && data && metadataUnavailableCount > 0 ? (
        <div className="mt-5 rounded-md border border-slate-700 bg-slate-950 px-4 py-3 text-sm leading-6 text-slate-300">
          {metadataUnavailableCount} loaded auction{metadataUnavailableCount === 1 ? " has" : "s have"} missing or unavailable NFT metadata. The auction remains available.
        </div>
      ) : null}

      {!isLoading && data && data.auctions.length === 0 ? (
        <EmptyState className="mt-5">
          No auctions found yet. Create an auction with a test ERC-721 NFT, or run the local demo deployment and refresh this list.
        </EmptyState>
      ) : null}

      {!isLoading && data && data.auctions.length > 0 && filteredAuctions.length === 0 ? (
        <EmptyState className="mt-5">
          No auctions match the current search, status, and sort controls. Clear filters or increase the loaded limit.
        </EmptyState>
      ) : null}

      {!isLoading && data && filteredAuctions.length > 0 ? (
        <div className="mt-5 grid gap-4">
          {filteredAuctions.map((auction) => {
            const lifecycle = getAuctionLifecycle(auction);

            return (
              <Link
                key={auction.auctionId}
                href={`/auctions/${auction.auctionId}`}
                className="block rounded-lg border border-slate-800 bg-slate-950 p-4 transition hover:border-cyan-500/60"
              >
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <div className="flex flex-wrap items-center gap-3">
                      <h3 className="text-base font-semibold text-white">Auction #{auction.auctionId}</h3>
                      <AuctionStateBadge state={auction.state} />
                      <span
                        className={`inline-flex min-h-7 items-center rounded-md border px-2.5 text-xs font-semibold ${lifecycleToneClasses[lifecycle.statusTone]}`}
                      >
                        {lifecycle.statusLabel}
                      </span>
                    </div>
                  </div>

                  <div className="text-left text-sm sm:text-right">
                    <div className="text-slate-500">Next action</div>
                    <div className="font-semibold text-cyan-100">{lifecycle.nextActionLabel}</div>
                  </div>
                </div>

                <div className="mt-4">
                  <NftPreview
                    metadata={auction.nftMetadata}
                    contractAddress={auction.nft}
                    tokenId={auction.tokenId}
                    compact
                    showLinks={false}
                  />
                </div>

                <div className="mt-4 grid gap-3 text-sm text-slate-300 md:grid-cols-2 lg:grid-cols-5">
                  <div>
                    <div className="text-slate-500">Seller</div>
                    <div className="font-mono">{shortenAddress(auction.seller)}</div>
                  </div>
                  <div>
                    <div className="text-slate-500">Start price</div>
                    <div className="font-mono">{formatEth(auction.startPrice)}</div>
                  </div>
                  <div>
                    <div className="text-slate-500">Highest bid</div>
                    <div className="font-mono">{formatEth(auction.highestBid)}</div>
                  </div>
                  <div>
                    <div className="text-slate-500">Highest bidder</div>
                    <div className="font-mono">{formatAddressOrNone(auction.highestBidder)}</div>
                  </div>
                  <div>
                    <div className="text-slate-500">Time</div>
                    <div>{lifecycle.timeStatusLabel}</div>
                  </div>
                </div>

                <div className="mt-3 text-xs leading-5 text-slate-500">{lifecycle.nextActionReason}</div>
                <div className="mt-1 text-xs text-slate-600">End time: {formatTimestamp(auction.endTime)}</div>
              </Link>
            );
          })}
        </div>
      ) : null}
    </section>
  );
}
