import React from "react";
import { ModeBadge } from "@/components/ModeBadge";
import type { AuctionLifecycleTone } from "@/lib/auctionLifecycle";
import { getAuctionLifecycle } from "@/lib/auctionLifecycle";
import type { SerializedAuction } from "@/lib/auctionTypes";
import { formatTimestamp } from "@/lib/format";

const toneClasses: Record<AuctionLifecycleTone, string> = {
  success: "border-emerald-400/40 bg-emerald-400/10 text-emerald-100",
  warning: "border-amber-400/40 bg-amber-400/10 text-amber-100",
  info: "border-cyan-400/40 bg-cyan-400/10 text-cyan-100",
  complete: "border-violet-400/40 bg-violet-400/10 text-violet-100",
  neutral: "border-slate-500/40 bg-slate-500/10 text-slate-200"
};

type TimelineState = "completed" | "current" | "upcoming";

type TimelineStep = {
  label: string;
  detail: string;
  state: TimelineState;
};

const stateLabels: Record<TimelineState, string> = {
  completed: "Completed",
  current: "Current",
  upcoming: "Upcoming"
};

export function AuctionLifecyclePanel({ auction }: { auction: SerializedAuction }) {
  const lifecycle = getAuctionLifecycle(auction);
  const isSettled = lifecycle.statusLabel === "Settled";

  const steps: TimelineStep[] = [
    {
      label: "Listed",
      detail: `Created ${formatTimestamp(auction.startTime)}`,
      state: "completed"
    },
    {
      label: "Bidding",
      detail: lifecycle.canBid ? lifecycle.timeStatusLabel : "Bid window closed",
      state: lifecycle.canBid ? "current" : lifecycle.isExpired || lifecycle.isFinalized ? "completed" : "upcoming"
    },
    {
      label: "Auction ended",
      detail: `Current end ${formatTimestamp(auction.endTime)}`,
      state: lifecycle.isExpired || lifecycle.isFinalized ? "completed" : "upcoming"
    },
    {
      label: "Finalization",
      detail: lifecycle.isFinalized
        ? "Finalized on-chain"
        : lifecycle.canFinalize
          ? lifecycle.nextActionLabel
          : "Available after the end time",
      state: lifecycle.canFinalize ? "current" : lifecycle.isFinalized ? "completed" : "upcoming"
    },
    {
      label: "Claims",
      detail: isSettled
        ? "No pending claim is visible"
        : lifecycle.isFinalized
          ? lifecycle.nextActionLabel
          : "Available after finalization",
      state: isSettled ? "completed" : lifecycle.isFinalized ? "current" : "upcoming"
    },
    {
      label: "Settlement",
      detail: isSettled ? "Settlement complete" : "Terminal state after visible claims",
      state: isSettled ? "current" : "upcoming"
    }
  ];

  return (
    <section className="lifecycle-ledger" aria-labelledby="auction-lifecycle-title">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="premium-eyebrow">Sale progression</p>
          <div className="mt-1 flex flex-wrap items-center gap-3">
            <h2 id="auction-lifecycle-title" className="editorial-title text-3xl">Auction lifecycle</h2>
            <ModeBadge variant="read-only" />
          </div>
        </div>

        <span className={`inline-flex min-h-7 w-fit items-center border px-2.5 text-xs font-semibold ${toneClasses[lifecycle.statusTone]}`}>
          {lifecycle.statusLabel}
        </span>
      </div>

      <ol className="auction-timeline" aria-label="Auction lifecycle progression">
        {steps.map((step, index) => (
          <li
            key={step.label}
            className={`auction-timeline-step auction-timeline-${step.state}`}
            aria-current={step.state === "current" ? "step" : undefined}
            aria-label={`${step.label}: ${stateLabels[step.state]}`}
          >
            <div className="auction-timeline-marker" aria-hidden="true">
              <span>{step.state === "completed" ? "✓" : index + 1}</span>
            </div>
            <div className="auction-timeline-copy">
              <span className="auction-timeline-state">{stateLabels[step.state]}</span>
              <h3>{step.label}</h3>
              <p>{step.detail}</p>
            </div>
          </li>
        ))}
      </ol>

      <div className="lifecycle-next-action">
        <div>
          <span className="premium-eyebrow">Meaningful next action</span>
          <strong>{lifecycle.nextActionLabel}</strong>
          <p>{lifecycle.nextActionReason}</p>
        </div>

        {lifecycle.claimableItems.length > 0 ? (
          <div className="lifecycle-claims" aria-label="Visible claimable or withdrawable items">
            {lifecycle.claimableItems.map((item) => (
              <span key={item}>{item}</span>
            ))}
          </div>
        ) : (
          <p className="lifecycle-no-claims">No claimable or withdrawable amount is currently visible.</p>
        )}
      </div>
    </section>
  );
}
