import { AuctionStateBadge } from "@/components/AuctionStateBadge";
import { ModeBadge } from "@/components/ModeBadge";
import type { SerializedAuction } from "@/lib/auctionTypes";
import { formatAddressOrNone, formatEth, formatTimestamp, shortenAddress } from "@/lib/format";

export function AuctionSummary({ auction }: { auction: SerializedAuction }) {
  return (
    <section className="rounded-lg border border-slate-800 bg-slate-900 p-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-3">
            <h2 className="text-xl font-semibold text-white">Auction overview</h2>
            <ModeBadge variant="read-only" />
            <AuctionStateBadge state={auction.state} />
          </div>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-400">
            Snapshot loaded through Next.js server routes from the local Anvil deployment.
          </p>
        </div>

        <div className="rounded-md bg-slate-950 px-4 py-3 text-sm text-slate-300">
          <div className="text-xs text-slate-500">Auction</div>
          <div className="mt-1 font-mono text-cyan-200">#{auction.auctionId}</div>
        </div>
      </div>

      <div className="mt-5 grid gap-3 text-sm text-slate-300 md:grid-cols-2 lg:grid-cols-4">
        <SummaryItem label="Seller" value={shortenAddress(auction.seller)} mono />
        <SummaryItem label="NFT" value={shortenAddress(auction.nft)} mono />
        <SummaryItem label="Token ID" value={auction.tokenId} mono />
        <SummaryItem label="Start price" value={formatEth(auction.startPrice)} mono />
        <SummaryItem label="Highest bid" value={formatEth(auction.highestBid)} mono />
        <SummaryItem label="Highest bidder" value={formatAddressOrNone(auction.highestBidder)} mono />
        <SummaryItem label="Start time" value={formatTimestamp(auction.startTime)} />
        <SummaryItem label="Current end time" value={formatTimestamp(auction.endTime)} />
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