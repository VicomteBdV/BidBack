import React from "react";
import { formatAuctionState } from "@/lib/format";

const stateStyles: Record<string, string> = {
  OPEN: "border-emerald-400/40 bg-emerald-400/10 text-emerald-100",
  ENDED: "border-amber-400/40 bg-amber-400/10 text-amber-100",
  FINALIZED: "border-cyan-400/40 bg-cyan-400/10 text-cyan-100",
  UNKNOWN: "border-slate-500/40 bg-slate-500/10 text-slate-200"
};

export function AuctionStateBadge({ state }: { state: number | string }) {
  const label = formatAuctionState(state);
  const className = stateStyles[label] ?? stateStyles.UNKNOWN;

  return (
    <span className={`inline-flex min-h-7 items-center rounded-md border px-2.5 text-xs font-semibold ${className}`}>
      {label}
    </span>
  );
}