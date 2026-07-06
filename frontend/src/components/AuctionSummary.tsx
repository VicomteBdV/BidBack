import React from "react";
import { AuctionStateBadge } from "@/components/AuctionStateBadge";
import { ModeBadge } from "@/components/ModeBadge";
import { NftPreview } from "@/components/NftPreview";
import { InfoRow } from "@/components/ui/InfoRow";
import { SectionCard } from "@/components/ui/SectionCard";
import type { SerializedAuction } from "@/lib/auctionTypes";
import { formatAddressOrNone, formatEth, formatTimestamp, shortenAddress } from "@/lib/format";

export function AuctionSummary({ auction }: { auction: SerializedAuction }) {
  const headlinePrice = auction.finalized ? formatEth(auction.highestBid) : formatEth(auction.highestBid);
  const headlinePriceLabel = auction.finalized ? "Final price" : "Current price";

  return (
    <SectionCard
      title="Auction overview"
      badges={
        <>
          <ModeBadge variant="read-only" />
          <AuctionStateBadge state={auction.state} />
        </>
      }
      description="Fast read-only summary of the NFT, status, counterparties, and current auction price."
      actions={
        <div className="rounded-md bg-slate-950 px-4 py-3 text-sm text-slate-300">
          <div className="text-xs text-slate-500">Auction</div>
          <div className="mt-1 font-mono text-cyan-200">#{auction.auctionId}</div>
        </div>
      }
    >
      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(280px,360px)]">
        <div className="grid gap-3 text-sm text-slate-300 md:grid-cols-2 lg:grid-cols-3">
          <InfoRow label="Seller" value={shortenAddress(auction.seller)} mono />
          <InfoRow label="NFT" value={shortenAddress(auction.nft)} mono />
          <InfoRow label="Token ID" value={auction.tokenId} mono />
          <InfoRow label="Start price" value={formatEth(auction.startPrice)} mono />
          <InfoRow label={headlinePriceLabel} value={headlinePrice} mono tone="accent" />
          <InfoRow label="Highest bidder" value={formatAddressOrNone(auction.highestBidder)} mono />
          <InfoRow label="Start time" value={formatTimestamp(auction.startTime)} />
          <InfoRow label="Current end time" value={formatTimestamp(auction.endTime)} />
        </div>

        <div className="rounded-md border border-slate-800 bg-slate-950 p-3">
          <div className="mb-3 flex items-center justify-between gap-3">
            <div>
              <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">NFT preview</div>
              <div className="mt-1 text-sm text-slate-300">Metadata preview never affects auction settlement.</div>
            </div>
          </div>
          <NftPreview metadata={auction.nftMetadata} contractAddress={auction.nft} tokenId={auction.tokenId} compact showLinks={false} />
        </div>
      </div>
    </SectionCard>
  );
}
