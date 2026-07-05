"use client";

import Link from "next/link";
import React, { useCallback, useEffect, useState } from "react";
import { AuctionStateBadge } from "@/components/AuctionStateBadge";
import { NftPreview } from "@/components/NftPreview";
import { getAuctionLifecycle, type AuctionLifecycleTone } from "@/lib/auctionLifecycle";
import type { AuctionsApiResponse } from "@/lib/auctionTypes";
import { formatAddressOrNone, formatEth, formatTimestamp, shortenAddress } from "@/lib/format";

const AUCTION_LIST_LIMIT = 25;

const lifecycleToneClasses: Record<AuctionLifecycleTone, string> = {
  success: "border-emerald-400/40 bg-emerald-400/10 text-emerald-100",
  warning: "border-amber-400/40 bg-amber-400/10 text-amber-100",
  info: "border-cyan-400/40 bg-cyan-400/10 text-cyan-100",
  complete: "border-violet-400/40 bg-violet-400/10 text-violet-100",
  neutral: "border-slate-500/40 bg-slate-500/10 text-slate-200"
};

export function AuctionList() {
  const [data, setData] = useState<AuctionsApiResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const loadAuctions = useCallback(async () => {
    try {
      setIsLoading(true);

      const response = await fetch(`/api/auctions?limit=${AUCTION_LIST_LIMIT}`, {
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
  }, []);

  useEffect(() => {
    loadAuctions();
  }, [loadAuctions]);

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
            <div className="text-slate-500">Loaded auctions</div>
            <div className="mt-1 font-mono text-cyan-200">{data.count}</div>
          </div>
          <div className="rounded-md bg-slate-950 px-4 py-3">
            <div className="text-slate-500">Discovery</div>
            <div className="mt-1 font-mono text-cyan-200">
              {data.discovery.strategy === "events" ? "Events" : "Fallback"} / {data.discovery.limit}
            </div>
          </div>
        </div>
      ) : null}

      {!isLoading && data?.discovery.warning ? (
        <div className="mt-5 rounded-md border border-amber-400/40 bg-amber-400/10 px-4 py-3 text-sm text-amber-100">
          {data.discovery.warning}
        </div>
      ) : null}

      {!isLoading && data && data.auctions.length === 0 ? (
        <div className="mt-5 rounded-md border border-slate-800 bg-slate-950 px-4 py-5 text-sm text-slate-300">
          No auctions found yet. Create an auction from the UI or deploy a demo auction locally, then refresh this list.
        </div>
      ) : null}

      {!isLoading && data && data.auctions.length > 0 ? (
        <div className="mt-5 grid gap-4">
          {data.auctions.map((auction) => {
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
