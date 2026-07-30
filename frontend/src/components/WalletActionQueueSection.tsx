"use client";

import Link from "next/link";
import React, { useState } from "react";
import { EmptyState } from "@/components/ui/EmptyState";
import { SectionCard } from "@/components/ui/SectionCard";
import { StateNotice } from "@/components/ui/StateNotice";
import { formatEth, formatTimestamp } from "@/lib/format";
import type {
  WalletAuctionQueueItem,
  WalletAuctionRole,
  WalletGlobalActionItem
} from "@/lib/walletActionQueue";

const roleLabels: Record<WalletAuctionRole, string> = {
  seller: "Seller",
  bidder: "Bidder",
  "highest-bidder": "Highest bidder",
  winner: "Winner",
  "nft-claimant": "NFT claimant",
  "fee-recipient": "Fee recipient"
};

export function WalletActionQueueSection({
  title,
  description,
  items,
  globalActions = [],
  emptyTitle,
  emptyMessage,
  initialLimit
}: {
  title: string;
  description: string;
  items: WalletAuctionQueueItem[];
  globalActions?: WalletGlobalActionItem[];
  emptyTitle: string;
  emptyMessage: string;
  initialLimit?: number;
}) {
  const [expanded, setExpanded] = useState(false);
  const visibleItems = initialLimit && !expanded ? items.slice(0, initialLimit) : items;
  const canToggle = Boolean(initialLimit && items.length > initialLimit);
  const itemCount = items.length + globalActions.length;

  return (
    <SectionCard
      title={title}
      description={description}
      headingLevel={3}
      badges={
        <span className="rounded-full border border-slate-700 px-2 py-1 text-xs text-slate-300">
          {itemCount} item{itemCount === 1 ? "" : "s"}
        </span>
      }
    >
      {items.length === 0 && globalActions.length === 0 ? (
        <EmptyState title={emptyTitle}>{emptyMessage}</EmptyState>
      ) : (
        <div className="grid min-w-0 gap-3">
          {globalActions.map((action) => (
            <article
              key={action.kind}
              className="min-w-0 rounded-md border border-violet-400/30 bg-violet-400/10 px-4 py-4"
            >
              <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0">
                  <div className="text-xs font-semibold uppercase tracking-wide text-violet-200">
                    Global wallet credit
                  </div>
                  <h4 className="mt-1 break-words font-semibold text-white">{action.label}</h4>
                  <p className="mt-1 break-words text-sm leading-6 text-slate-300">{action.description}</p>
                  {action.targetAuctionId ? (
                    <p className="mt-2 text-xs text-slate-400">
                      Auction #{action.targetAuctionId} is provided only as a navigation target.
                    </p>
                  ) : null}
                </div>
                <div className="shrink-0 break-all font-mono text-sm text-violet-100">
                  {formatEth(action.amount)}
                </div>
              </div>
              {action.href ? (
                <Link
                  href={action.href}
                  className="mt-3 inline-flex min-h-10 w-full items-center justify-center rounded-md border border-violet-300/40 px-4 text-sm font-semibold text-violet-50 transition hover:border-violet-200 sm:w-auto"
                >
                  Open withdrawal panel
                </Link>
              ) : (
                <p className="mt-3 text-sm text-slate-400">No eligible auction detail target is currently available.</p>
              )}
            </article>
          ))}

          {visibleItems.map((item) => (
            <article key={item.auctionId} className="min-w-0 rounded-md border border-slate-800 bg-slate-950 px-4 py-4">
              <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0">
                  <h4 className="break-words font-semibold text-white">Auction #{item.auctionId}</h4>
                  <div className="mt-2 flex flex-wrap gap-2 text-xs">
                    <span className="rounded-full border border-cyan-400/30 bg-cyan-400/10 px-2 py-1 text-cyan-100">
                      {item.lifecycleLabel}
                    </span>
                    <span className="rounded-full border border-slate-700 px-2 py-1 text-slate-400">
                      Contract state: {item.stateLabel}
                    </span>
                    {item.roles.map((role) => (
                      <span key={role} className="rounded-full border border-slate-700 px-2 py-1 text-slate-300">
                        {roleLabels[role]}
                      </span>
                    ))}
                  </div>
                  <p className="mt-3 break-words text-sm leading-6 text-slate-400">{item.reason}</p>
                  <p className="mt-2 text-xs text-slate-500">End time: {formatTimestamp(item.endTime)}</p>
                </div>
                {item.actions.length === 0 ? (
                  <Link
                    href={item.href}
                    className="inline-flex min-h-10 w-full shrink-0 items-center justify-center rounded-md border border-slate-700 px-4 text-sm font-semibold text-slate-100 transition hover:border-cyan-500/60 sm:w-auto"
                  >
                    View auction
                  </Link>
                ) : null}
              </div>

              {item.partial ? (
                <StateNotice tone="warning" title="Partial wallet data" className="mt-3">
                  {item.partialReason ?? "Some wallet position reads were unavailable. Confirm the live state on the auction detail page."}
                </StateNotice>
              ) : null}

              {item.actions.length > 0 ? (
                <ul className="mt-3 grid gap-2">
                  {item.actions.map((action) => (
                    <li
                      key={action.kind}
                      className="flex min-w-0 flex-col gap-3 rounded-md border border-slate-800 bg-slate-900 px-3 py-3 sm:flex-row sm:items-center sm:justify-between"
                    >
                      <div className="min-w-0">
                        <div className="font-semibold text-cyan-100">{action.label}</div>
                        <div className="mt-1 break-words text-sm leading-6 text-slate-400">{action.description}</div>
                        {action.amount ? (
                          <div className="mt-1 break-all font-mono text-xs text-slate-200">{formatEth(action.amount)}</div>
                        ) : null}
                      </div>
                      <Link
                        href={item.href}
                        className="inline-flex min-h-10 w-full shrink-0 items-center justify-center rounded-md border border-cyan-400/40 px-4 text-sm font-semibold text-cyan-100 transition hover:border-cyan-300 sm:w-auto"
                      >
                        {action.label}
                      </Link>
                    </li>
                  ))}
                </ul>
              ) : null}
            </article>
          ))}

          {canToggle ? (
            <button
              type="button"
              onClick={() => setExpanded((current) => !current)}
              className="min-h-10 w-full rounded-md border border-slate-700 px-4 text-sm font-semibold text-slate-100 transition hover:border-slate-500"
            >
              {expanded ? "Show less" : `Show ${items.length - visibleItems.length} more`}
            </button>
          ) : null}
        </div>
      )}
    </SectionCard>
  );
}
