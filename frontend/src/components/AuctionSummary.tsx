import React from "react";
import { NftPreview } from "@/components/NftPreview";
import { getAuctionLifecycle } from "@/lib/auctionLifecycle";
import type { SerializedAuction } from "@/lib/auctionTypes";
import { formatAddressOrNone, formatEth, formatTimestamp, shortenAddress } from "@/lib/format";

export function AuctionSummary({ auction, participation }: { auction: SerializedAuction; participation?: React.ReactNode }) {
  const lifecycle = getAuctionLifecycle(auction);
  const hasBid = auction.highestBid !== "0";
  const headlinePriceLabel = auction.finalized ? "Final price" : hasBid ? "Current price" : "Opening price";
  const headlinePrice = hasBid ? auction.highestBid : auction.startPrice;
  const nftIdentity = auction.nftMetadata?.metadataName ?? `Token #${auction.tokenId}`;

  const metadata = auction.nftMetadata;
  const collectionLabel = metadata?.collectionName && metadata.collectionSymbol
    ? `${metadata.collectionName} (${metadata.collectionSymbol})`
    : metadata?.collectionName ?? metadata?.collectionSymbol ?? "Unknown collection";

  return (
    <section className="auction-overview" aria-labelledby="auction-overview-title">
      <div className="auction-participation-layout">
        <header className="auction-participation-overview">
          <div className="auction-overview-kicker">
            <p className="premium-eyebrow">Auction #{auction.auctionId}</p>
            <span className="auction-summary-status">{lifecycle.statusLabel}</span>
          </div>
          <h1 id="auction-overview-title" className="editorial-title auction-overview-title">
            {nftIdentity}
          </h1>
          <p className="auction-overview-collection">{collectionLabel}</p>
        </header>

        <div className="auction-participation-art">
          <NftPreview
            metadata={auction.nftMetadata}
            contractAddress={auction.nft}
            tokenId={auction.tokenId}
            marketplace
            hideIdentity
          />
        </div>

        <div className="auction-participation-market">
          <dl className="auction-headline-facts">
            <div>
              <dt>{headlinePriceLabel}</dt>
              <dd className="auction-headline-price">{formatEth(headlinePrice)}</dd>
              <dd className="auction-headline-support">Start price {formatEth(auction.startPrice)}</dd>
            </div>
            <div>
              <dt>Time status</dt>
              <dd className="auction-headline-time">{lifecycle.timeStatusLabel}</dd>
              <dd className="auction-headline-support">Ends {formatTimestamp(auction.endTime)}</dd>
            </div>
          </dl>

          <div className="auction-summary-next">
            <p className="premium-eyebrow">Next action</p>
            <p className="auction-summary-next-label">{lifecycle.nextActionLabel}</p>
            <p className="auction-summary-next-reason">{lifecycle.nextActionReason}</p>
          </div>

          <div className="auction-summary-parties grid gap-3 text-sm sm:grid-cols-2">
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

        {participation ? <div className="auction-participation-action">{participation}</div> : null}

        {metadata?.description ? (
          <section className="auction-summary-about" aria-labelledby="auction-artwork-description">
            <h2 id="auction-artwork-description" className="premium-eyebrow">About the artwork</h2>
            <p>{metadata.description}</p>
          </section>
        ) : null}
      </div>
    </section>
  );
}
