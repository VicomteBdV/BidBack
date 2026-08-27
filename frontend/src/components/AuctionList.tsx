"use client";

import Link from "next/link";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useAccount } from "wagmi";
import { NftPreview } from "@/components/NftPreview";
import { TechnicalDisclosure } from "@/components/TechnicalDisclosure";
import { EmptyState } from "@/components/ui/EmptyState";
import { StateNotice } from "@/components/ui/StateNotice";
import { getAuctionLifecycle, type AuctionLifecycleTone } from "@/lib/auctionLifecycle";
import type { AuctionsApiResponse } from "@/lib/auctionTypes";
import {
  auctionSortLabels,
  auctionStatusFilterLabels,
  filterAndSortAuctions,
  type AuctionSortOption,
  type AuctionStatusFilter
} from "@/lib/auctionFilters";
import { formatEth, shortenAddress } from "@/lib/format";

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
    <section aria-busy={isLoading} className="min-w-0">
      <div className="catalog-heading flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="premium-eyebrow">Marketplace</p>
          <h2 className="editorial-title mt-1 text-3xl sm:text-4xl">Live auctions</h2>
          <p className="mt-1 max-w-2xl text-sm leading-5 text-slate-400">
            Browse real auctions from the configured controlled-testnet catalogue.
          </p>
        </div>

        <button
          type="button"
          onClick={loadAuctions}
          disabled={isLoading}
          className="secondary-link w-full disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto"
        >
          {isLoading ? "Loading..." : "Refresh"}
        </button>
      </div>

      {isLoading ? (
        <div className="catalog-unavailable mt-4">
          <div className="w-full max-w-xl">
            <StateNotice tone="loading" title="Loading auctions" className="text-left">
              Opening the currently configured on-chain catalogue.
            </StateNotice>
          </div>
        </div>
      ) : null}

      {!isLoading && error ? (
        <div className="catalog-unavailable mt-4">
          <div className="w-full max-w-xl text-left">
            <p className="premium-eyebrow">Temporary catalogue notice</p>
            <h3 className="editorial-title mt-1 text-2xl">The live catalogue is temporarily unavailable</h3>
            <p className="mt-2 text-sm leading-6 text-slate-400">
              The marketplace remains available while the configured environment is restored. No auction data is being simulated.
            </p>
            <StateNotice
              tone="error"
              title="Auctions could not be loaded"
              className="mt-4 text-left"
              action={
                <button
                  type="button"
                  onClick={loadAuctions}
                  className="secondary-link min-h-9"
                >
                  Try again
                </button>
              }
            >
              <details>
                <summary className="cursor-pointer font-semibold">View infrastructure error</summary>
                <p className="mt-2 break-all font-mono text-xs">{error}</p>
              </details>
            </StateNotice>
          </div>
        </div>
      ) : null}

      {!isLoading && data ? (
        <div className="catalog-toolbar mt-4 p-3">
          <div className="grid gap-3 lg:grid-cols-[minmax(0,1.5fr)_minmax(180px,0.8fr)_minmax(180px,0.8fr)_120px]">
            <label className="grid gap-2 text-sm">
              <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Search</span>
              <input
                type="search"
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
        <StateNotice tone="warning" title="Auction discovery is limited" className="mt-5">
          {data.discovery.warning}
        </StateNotice>
      ) : null}

      {!isLoading && data && data.count > 0 && data.count >= data.discovery.limit ? (
        <StateNotice tone="info" title="Bounded auction window" className="mt-5">
          This list is bounded to {data.discovery.limit} loaded auctions. Increase the limit for a wider MVP window; production browsing will need an indexer.
        </StateNotice>
      ) : null}

      {!isLoading && data && metadataUnavailableCount > 0 ? (
        <StateNotice tone="info" title="Some NFT metadata is unavailable" className="mt-5">
          {metadataUnavailableCount} loaded auction{metadataUnavailableCount === 1 ? " has" : "s have"} missing or unavailable NFT metadata. The auction remains available.
        </StateNotice>
      ) : null}

      {!isLoading && data && data.auctions.length === 0 ? (
        <div className="catalog-unavailable mt-4">
          <div className="w-full max-w-xl text-left">
            <p className="premium-eyebrow">Catalogue notice</p>
            <EmptyState title="The catalogue is ready for its first lot" className="mt-2 text-left">
              No auctions found yet. Create an auction with a test ERC-721 NFT, or run the local demo deployment and refresh this list.
            </EmptyState>
          </div>
        </div>
      ) : null}

      {!isLoading && data && data.auctions.length > 0 && filteredAuctions.length === 0 ? (
        <EmptyState className="mt-5">
          No auctions match the current search, status, and sort controls. Clear filters or increase the loaded limit.
        </EmptyState>
      ) : null}

      {!isLoading && data && filteredAuctions.length > 0 ? (
        <div className="auction-catalog-grid mt-4">
          {filteredAuctions.map((auction) => {
            const lifecycle = getAuctionLifecycle(auction);
            const hasBid = auction.highestBid !== "0";
            const priceLabel = auction.finalized ? "Final price" : hasBid ? "Current price" : "Opening price";
            const displayPrice = hasBid ? auction.highestBid : auction.startPrice;

            return (
              <Link
                key={auction.auctionId}
                href={`/auctions/${auction.auctionId}`}
                className="auction-market-card group"
              >
                <div className="auction-card-art relative">
                  <NftPreview
                    metadata={auction.nftMetadata}
                    contractAddress={auction.nft}
                    tokenId={auction.tokenId}
                    marketplace
                    showLinks={false}
                  />
                  <div className="absolute left-3 top-3 flex flex-wrap items-center gap-2">
                    <span
                      className={`inline-flex min-h-7 items-center rounded-md border px-2.5 text-xs font-semibold ${lifecycleToneClasses[lifecycle.statusTone]}`}
                    >
                      {lifecycle.statusLabel}
                    </span>
                  </div>
                </div>

                <div className="flex flex-1 flex-col p-3.5 pt-3">
                  <div className="mb-2 text-[10px] font-bold uppercase tracking-[0.14em] text-slate-500">
                    Auction #{auction.auctionId}
                  </div>
                  <div className="grid grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)] gap-3">
                    <div>
                      <div className="text-xs font-semibold text-slate-500">
                        {priceLabel}
                      </div>
                      <div className="auction-price mt-1">{formatEth(displayPrice)}</div>
                    </div>
                    <div className="text-right">
                      <div className="text-xs font-semibold text-slate-500">Time</div>
                      <div className="mt-1 text-sm font-bold leading-5 text-white">{lifecycle.timeStatusLabel}</div>
                    </div>
                  </div>

                  <div className="auction-card-next mt-3 border-t border-slate-800 pt-2.5">
                    <div className="text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-500">Next action</div>
                    <div className="mt-1 font-editorial text-base font-semibold text-cyan-100">{lifecycle.nextActionLabel}</div>
                  </div>

                  <span className="brush-link mt-3 w-full">View lot →</span>
                </div>
              </Link>
            );
          })}
        </div>
      ) : null}

      {!isLoading && data ? (
        <TechnicalDisclosure
          summary="Marketplace data source"
          description="Technical discovery details for this bounded read-only marketplace window."
          className="mt-6"
        >
          <div className="grid gap-3 text-sm text-slate-300 sm:grid-cols-2 lg:grid-cols-4">
            <div className="rounded-md bg-slate-950 px-4 py-3">
              <div className="text-slate-500">Chain ID</div>
              <div className="mt-1 font-mono text-cyan-200">{data.chainId}</div>
            </div>
            <div className="rounded-md bg-slate-950 px-4 py-3">
              <div className="text-slate-500">AuctionHouse</div>
              <div className="mt-1 font-mono text-cyan-200" title={data.auctionHouse}>{shortenAddress(data.auctionHouse)}</div>
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
        </TechnicalDisclosure>
      ) : null}
    </section>
  );
}
