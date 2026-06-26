"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import type { AuctionsApiResponse } from "@/lib/auctionTypes";
import { formatAddressOrNone, formatEth, formatTimestamp, shortenAddress } from "@/lib/format";
import { AuctionStateBadge } from "@/components/AuctionStateBadge";

export function AuctionList() {
  const [data, setData] = useState<AuctionsApiResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const loadAuctions = useCallback(async () => {
    try {
      setIsLoading(true);

      const response = await fetch("/api/auctions", {
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
            Read by Next.js server routes from Anvil at http://127.0.0.1:8545.
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

      {!isLoading && data && data.auctions.length === 0 ? (
        <div className="mt-5 rounded-md border border-slate-800 bg-slate-950 px-4 py-5 text-sm text-slate-300">
          No auctions found yet. Once a local auction is created, it will appear here.
        </div>
      ) : null}

      {!isLoading && data && data.auctions.length > 0 ? (
        <div className="mt-5 grid gap-4">
          <div className="grid gap-3 text-sm text-slate-300 sm:grid-cols-3">
            <div className="rounded-md bg-slate-950 px-4 py-3">
              <div className="text-slate-500">Chain ID</div>
              <div className="mt-1 font-mono text-cyan-200">{data.chainId}</div>
            </div>
            <div className="rounded-md bg-slate-950 px-4 py-3">
              <div className="text-slate-500">AuctionHouse</div>
              <div className="mt-1 font-mono text-cyan-200">{shortenAddress(data.auctionHouse)}</div>
            </div>
            <div className="rounded-md bg-slate-950 px-4 py-3">
              <div className="text-slate-500">Auction count</div>
              <div className="mt-1 font-mono text-cyan-200">{data.count}</div>
            </div>
          </div>

          {data.auctions.map((auction) => (
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
                  </div>
                  <div className="mt-2 text-xs text-slate-500">
                    NFT <span className="font-mono text-slate-300">{shortenAddress(auction.nft)}</span> token{" "}
                    <span className="font-mono text-slate-300">#{auction.tokenId}</span>
                  </div>
                </div>

                <div className="text-left text-sm sm:text-right">
                  <div className="text-slate-500">Highest bid</div>
                  <div className="font-mono text-cyan-200">{formatEth(auction.highestBid)}</div>
                </div>
              </div>

              <div className="mt-4 grid gap-3 text-sm text-slate-300 md:grid-cols-2 lg:grid-cols-4">
                <div>
                  <div className="text-slate-500">Seller</div>
                  <div className="font-mono">{shortenAddress(auction.seller)}</div>
                </div>
                <div>
                  <div className="text-slate-500">Start price</div>
                  <div className="font-mono">{formatEth(auction.startPrice)}</div>
                </div>
                <div>
                  <div className="text-slate-500">Highest bidder</div>
                  <div className="font-mono">{formatAddressOrNone(auction.highestBidder)}</div>
                </div>
                <div>
                  <div className="text-slate-500">End time</div>
                  <div>{formatTimestamp(auction.endTime)}</div>
                </div>
              </div>
            </Link>
          ))}
        </div>
      ) : null}
    </section>
  );
}