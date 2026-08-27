import React from "react";
import { NftPreview } from "@/components/NftPreview";
import { getAuctionLifecycle } from "@/lib/auctionLifecycle";
import type { SerializedAuction } from "@/lib/auctionTypes";
import { formatAddressOrNone, formatEth, formatTimestamp, shortenAddress } from "@/lib/format";

export function AuctionSummary({ auction }: { auction: SerializedAuction }) {
  const lifecycle = getAuctionLifecycle(auction);
  const hasBid = auction.highestBid !== "0";
  const headlinePriceLabel = auction.finalized ? "Final price" : hasBid ? "Current price" : "Opening price";
  const headlinePrice = hasBid ? auction.highestBid : auction.startPrice;
  const nftIdentity = auction.nftMetadata?.metadataName ?? `Token #${auction.tokenId}`;

  return (
    <section className="premium-surface overflow-hidden p-3 sm:p-5 lg:p-6" aria-labelledby="auction-overview-title">
      <div className="grid gap-5 lg:grid-cols-[minmax(360px,1.18fr)_minmax(320px,0.82fr)] lg:items-center lg:gap-7">
        <div>
          <NftPreview
            metadata={auction.nftMetadata}
            contractAddress={auction.nft}
            tokenId={auction.tokenId}
            marketplace
            showLinks={false}
          />
        </div>

        <div className="flex min-w-0 flex-col">
          <div className="flex flex-wrap items-center gap-2">
            <span className="auction-summary-status">{lifecycle.statusLabel}</span>
          </div>

          <p className="premium-eyebrow mt-5">Lot {auction.auctionId}</p>
          <h1 id="auction-overview-title" className="editorial-title mt-2 text-4xl leading-none sm:text-5xl">
            {nftIdentity}
          </h1>
          <p className="mt-2 text-sm text-slate-400">Auction #{auction.auctionId}</p>

          <div className="mt-7 grid gap-5 border-y border-slate-800 py-5 sm:grid-cols-2">
            <div>
              <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">{headlinePriceLabel}</div>
              <div className="auction-price mt-2">{formatEth(headlinePrice)}</div>
              <div className="mt-2 text-xs text-slate-500">Start price {formatEth(auction.startPrice)}</div>
            </div>
            <div>
              <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Time status</div>
              <div className="mt-2 text-lg font-bold text-white">{lifecycle.timeStatusLabel}</div>
              <div className="mt-2 text-xs text-slate-500">Ends {formatTimestamp(auction.endTime)}</div>
            </div>
          </div>

          <div className="auction-summary-parties mt-5 grid gap-3 text-sm sm:grid-cols-2">
            <div>
              <div className="text-xs text-slate-500">Seller</div>
              <div className="mt-1 break-all font-mono text-slate-300" title={auction.seller}>{shortenAddress(auction.seller)}</div>
            </div>
            <div>
              <div className="text-xs text-slate-500">Highest bidder</div>
              <div className="mt-1 break-all font-mono text-slate-300" title={auction.highestBidder}>
                {formatAddressOrNone(auction.highestBidder)}
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
