"use client";

import React from "react";
import { ModeBadge } from "@/components/ModeBadge";
import type { AuctionParamsSnapshot } from "@/lib/auctionTypes";
import { formatDurationSeconds, formatEth } from "@/lib/format";

function formatBps(value?: string | null) {
  try {
    const bps = BigInt(value ?? "0");
    const whole = bps / 100n;
    const fraction = bps % 100n;

    if (fraction === 0n) {
      return `${whole.toString()}% (${bps.toString()} bps)`;
    }

    const fractionText = fraction.toString().padStart(2, "0").replace(/0+$/, "");
    return `${whole.toString()}.${fractionText}% (${bps.toString()} bps)`;
  } catch {
    return `${value ?? "0"} bps`;
  }
}

function formatScale(value?: string | null) {
  try {
    const raw = BigInt(value ?? "0");
    const scale = 10n ** 18n;
    const bps = (raw * 10_000n) / scale;

    return `${formatBps(bps.toString())} (${raw.toString()} scale)`;
  } catch {
    return `${value ?? "0"} scale`;
  }
}

export function AuctionRulesSnapshot({
  snapshot,
  error,
  feeRecipientSnapshot,
  feeRecipientSnapshotError
}: {
  snapshot?: AuctionParamsSnapshot;
  error?: string;
  feeRecipientSnapshot?: `0x${string}`;
  feeRecipientSnapshotError?: string;
}) {
  return (
    <section className="rounded-lg border border-slate-800 bg-slate-900 p-5">
      <div className="flex flex-wrap items-center gap-3">
        <h2 className="text-xl font-semibold text-white">Auction rules snapshot</h2>
        <ModeBadge variant="read-only" />
      </div>

      <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-400">
        These are the parameters and settlement fee recipient captured when this auction was created. They are specific
        to this auction and do not change when global ParamsController values or the global fee recipient are updated
        later.
      </p>

      {error ? (
        <div className="mt-5 rounded-md border border-amber-400/40 bg-amber-400/10 px-4 py-3 text-sm text-amber-100">
          {error}
        </div>
      ) : null}

      {feeRecipientSnapshotError ? (
        <div className="mt-5 rounded-md border border-amber-400/40 bg-amber-400/10 px-4 py-3 text-sm text-amber-100">
          {feeRecipientSnapshotError}
        </div>
      ) : null}

      {!snapshot && !error ? (
        <div className="mt-5 rounded-md bg-slate-950 px-4 py-3 text-sm text-slate-300">
          Auction parameter snapshot is not available.
        </div>
      ) : null}

      {snapshot ? (
        <div className="mt-5 grid gap-5">
          <SnapshotGroup
            title="Economic rules"
            items={[
              { label: "Protocol fee", value: formatBps(snapshot.bidbackFeeBps) },
              { label: "Redistribution fraction", value: formatBps(snapshot.redistributionBps) },
              { label: "Minimum premium net", value: formatEth(snapshot.minPremiumNet) },
              { label: "Per-user reward cap", value: formatBps(snapshot.perUserRewardCapBps) }
            ]}
          />

          <SnapshotGroup
            title="Settlement routing"
            items={[
              {
                label: "Fee recipient snapshot",
                value: feeRecipientSnapshot ?? "Unavailable"
              }
            ]}
          />

          <SnapshotGroup
            title="Auction constraints"
            items={[
              { label: "Minimum participants", value: snapshot.minParticipants },
              { label: "Maximum participants", value: snapshot.maxParticipants },
              { label: "Minimum bid increment", value: formatBps(snapshot.minBidIncrementBps) },
              { label: "Minimum auction duration", value: formatDurationSeconds(snapshot.minAuctionDuration) }
            ]}
          />

          <SnapshotGroup
            title="Anti-sniping"
            items={[
              { label: "Anti-snipe window", value: formatDurationSeconds(snapshot.antiSnipeWindow) },
              { label: "Anti-snipe extension", value: formatDurationSeconds(snapshot.antiSnipeExtension) },
              { label: "Maximum extensions", value: snapshot.maxAntiSnipeExtensions }
            ]}
          />

          <SnapshotGroup
            title="Redistribution scoring"
            items={[
              { label: "Alpha weight", value: formatBps(snapshot.alphaBps) },
              { label: "Beta weight", value: formatBps(snapshot.betaBps) },
              { label: "Gamma weight", value: formatBps(snapshot.gammaBps) },
              { label: "Minimum exposure", value: formatDurationSeconds(snapshot.minExposure) },
              { label: "Maximum interaction count", value: snapshot.maxInteractionCount },
              { label: "EF cap", value: formatScale(snapshot.efCap) },
              { label: "ET cap", value: formatScale(snapshot.etCap) },
              { label: "II cap", value: formatScale(snapshot.iiCap) }
            ]}
          />
        </div>
      ) : null}
    </section>
  );
}

function SnapshotGroup({ title, items }: { title: string; items: Array<{ label: string; value: string }> }) {
  return (
    <div>
      <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-300">{title}</h3>
      <div className="mt-3 grid gap-3 text-sm text-slate-300 md:grid-cols-2 lg:grid-cols-4">
        {items.map((item) => (
          <SnapshotItem key={item.label} label={item.label} value={item.value} />
        ))}
      </div>
    </div>
  );
}

function SnapshotItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-slate-800 bg-slate-950 px-4 py-3">
      <div className="text-xs text-slate-500">{label}</div>
      <div className="mt-1 break-all font-mono text-sm text-slate-200">{value}</div>
    </div>
  );
}