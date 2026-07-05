import React from "react";
import { ModeBadge } from "@/components/ModeBadge";
import type { AuctionLifecycleTone } from "@/lib/auctionLifecycle";
import { getAuctionLifecycle } from "@/lib/auctionLifecycle";
import type { SerializedAuction } from "@/lib/auctionTypes";
import { formatAddressOrNone, formatEth, shortenAddress } from "@/lib/format";

const toneClasses: Record<AuctionLifecycleTone, string> = {
  success: "border-emerald-400/40 bg-emerald-400/10 text-emerald-100",
  warning: "border-amber-400/40 bg-amber-400/10 text-amber-100",
  info: "border-cyan-400/40 bg-cyan-400/10 text-cyan-100",
  complete: "border-violet-400/40 bg-violet-400/10 text-violet-100",
  neutral: "border-slate-500/40 bg-slate-500/10 text-slate-200"
};

export function AuctionLifecyclePanel({ auction }: { auction: SerializedAuction }) {
  const lifecycle = getAuctionLifecycle(auction);
  const winnerLabel = lifecycle.winnerAddress ? shortenAddress(lifecycle.winnerAddress) : "None yet";
  const claimantLabel = lifecycle.nftClaimantAddress ? shortenAddress(lifecycle.nftClaimantAddress) : "Not available yet";

  return (
    <section className="rounded-lg border border-slate-800 bg-slate-900 p-5">
      <div className="flex flex-wrap items-center gap-3">
        <h2 className="text-xl font-semibold text-white">Auction lifecycle</h2>
        <ModeBadge variant="read-only" />
        <span className={`inline-flex min-h-7 items-center rounded-md border px-2.5 text-xs font-semibold ${toneClasses[lifecycle.statusTone]}`}>
          {lifecycle.statusLabel}
        </span>
      </div>

      <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-400">
        Compact read-only view of where this auction stands and what action is expected next.
      </p>

      <div className="mt-5 grid gap-3 text-sm text-slate-300 md:grid-cols-2 xl:grid-cols-4">
        <LifecycleItem label="Current phase" value={lifecycle.currentPhase} />
        <LifecycleItem label="Next action" value={lifecycle.nextActionLabel} />
        <LifecycleItem label="Time status" value={lifecycle.timeStatusLabel} />
        <LifecycleItem label="Highest bid" value={formatEth(auction.highestBid)} mono />
        <LifecycleItem label="Seller" value={shortenAddress(auction.seller)} mono />
        <LifecycleItem label="Highest bidder" value={formatAddressOrNone(auction.highestBidder)} mono />
        <LifecycleItem label="Winner" value={winnerLabel} mono />
        <LifecycleItem label="NFT claimant" value={claimantLabel} mono />
      </div>

      <div className="mt-4 rounded-md border border-slate-800 bg-slate-950 px-4 py-3">
        <div className="text-xs text-slate-500">Why this is next</div>
        <div className="mt-1 text-sm leading-6 text-slate-200">{lifecycle.nextActionReason}</div>
      </div>

      <div className="mt-4">
        <div className="text-xs text-slate-500">Visible claimable / withdrawable items</div>
        {lifecycle.claimableItems.length > 0 ? (
          <div className="mt-2 flex flex-wrap gap-2">
            {lifecycle.claimableItems.map((item) => (
              <span
                key={item}
                className="inline-flex min-h-7 items-center rounded-md border border-emerald-400/30 bg-emerald-400/10 px-2.5 text-xs font-semibold text-emerald-100"
              >
                {item}
              </span>
            ))}
          </div>
        ) : (
          <div className="mt-2 text-sm text-slate-300">No claimable or withdrawable amount is currently visible.</div>
        )}
      </div>
    </section>
  );
}

function LifecycleItem({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="rounded-md border border-slate-800 bg-slate-950 px-4 py-3">
      <div className="text-xs text-slate-500">{label}</div>
      <div className={`mt-1 break-all text-sm text-slate-200 ${mono ? "font-mono" : ""}`}>{value}</div>
    </div>
  );
}
