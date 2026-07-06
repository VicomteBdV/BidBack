"use client";

import Link from "next/link";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useAccount } from "wagmi";
import { ModeBadge } from "@/components/ModeBadge";
import { EmptyState } from "@/components/ui/EmptyState";
import { targetChainId, targetChainLabel } from "@/lib/chains";
import { formatEth, shortenAddress } from "@/lib/format";
import type { WalletActivityApiResponse, WalletActivityDiscoveryStrategy, WalletActivitySummary } from "@/lib/walletActivity";

const WALLET_ACTIVITY_LIMIT = 100;

const discoveryLabels: Record<WalletActivityDiscoveryStrategy, string> = {
  "event-scoped": "Wallet events",
  "general-event-window": "General event window",
  "bounded-fallback": "Bounded fallback",
  unavailable: "Unavailable"
};

type ActivityCard = {
  label: string;
  value: string | number;
  detail?: string;
};

function cardItems(activity: WalletActivitySummary): ActivityCard[] {
  return [
    {
      label: "Auctions created",
      value: activity.createdAuctions
    },
    {
      label: "Active bids",
      value: activity.activeBids
    },
    {
      label: "Won",
      value: activity.wonAuctions
    },
    {
      label: "Lost / refund available",
      value: activity.claimableRefunds || activity.lostAuctions,
      detail: activity.claimableRefunds > 0 ? formatEth(activity.totalRefundableAmount) : undefined
    },
    {
      label: "Rewards available",
      value: activity.claimableRewards,
      detail: activity.claimableRewards > 0 ? formatEth(activity.totalRewardEntitlement) : undefined
    },
    {
      label: "Seller proceeds available",
      value: activity.withdrawableSellerProceeds,
      detail: activity.withdrawableSellerProceeds > 0 ? formatEth(activity.sellerProceedsAvailable) : undefined
    },
    {
      label: "Protocol fees available",
      value: activity.withdrawableProtocolFees,
      detail: activity.withdrawableProtocolFees > 0 ? formatEth(activity.protocolFeesAvailable) : undefined
    }
  ];
}

export function WalletActivityDashboard() {
  const { address, chainId, isConnected } = useAccount();

  const [data, setData] = useState<WalletActivityApiResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const wrongNetwork = isConnected && chainId !== targetChainId;

  const loadActivity = useCallback(async () => {
    if (!address) {
      setData(null);
      setError(null);
      setIsLoading(false);
      return;
    }

    try {
      setIsLoading(true);

      const response = await fetch(
        `/api/wallet-activity?wallet=${encodeURIComponent(address)}&limit=${WALLET_ACTIVITY_LIMIT}`,
        {
          cache: "no-store"
        }
      );

      const payload = (await response.json().catch(() => null)) as WalletActivityApiResponse | { error?: string } | null;

      if (!response.ok) {
        throw new Error(payload && "error" in payload && payload.error ? payload.error : "Unable to read wallet activity");
      }

      setData(payload as WalletActivityApiResponse);
      setError(null);
    } catch (caught) {
      setData(null);
      setError(caught instanceof Error ? caught.message : "Unable to read wallet activity");
    } finally {
      setIsLoading(false);
    }
  }, [address]);

  useEffect(() => {
    if (isConnected) {
      loadActivity();
    } else {
      setData(null);
      setError(null);
      setIsLoading(false);
    }
  }, [isConnected, loadActivity]);

  const cards = useMemo(() => (data ? cardItems(data.activity) : []), [data]);

  return (
    <section className="rounded-lg border border-slate-800 bg-slate-900 p-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-3">
            <h2 className="text-lg font-semibold text-white">My activity / My actions</h2>
            <ModeBadge variant="read-only" />
          </div>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-400">
            Wallet-specific read-only summary of immediate actions first, then auctions and historical context.
          </p>
        </div>

        <button
          type="button"
          onClick={loadActivity}
          disabled={!isConnected || isLoading}
          className="inline-flex min-h-10 items-center justify-center rounded-md border border-slate-700 px-4 text-sm font-semibold text-slate-100 transition hover:border-slate-500 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isLoading ? "Loading..." : "Refresh activity"}
        </button>
      </div>

      {!isConnected ? (
        <EmptyState className="mt-5">
          Connect a wallet to see auctions and actions related to your address. The read-only deployment and auction list remain available without a wallet.
        </EmptyState>
      ) : null}

      {isConnected ? (
        <div className="mt-5 grid gap-3 text-sm text-slate-300 md:grid-cols-4">
          <div className="rounded-md border border-slate-800 bg-slate-950 px-4 py-3">
            <div className="text-xs text-slate-500">Connected wallet</div>
            <div className="mt-1 font-mono text-cyan-200">{shortenAddress(address)}</div>
          </div>
          <div className="rounded-md border border-slate-800 bg-slate-950 px-4 py-3">
            <div className="text-xs text-slate-500">Target chain</div>
            <div className="mt-1 font-mono text-cyan-200">{targetChainLabel}</div>
          </div>
          <div className="rounded-md border border-slate-800 bg-slate-950 px-4 py-3">
            <div className="text-xs text-slate-500">Discovery</div>
            <div className="mt-1 font-mono text-cyan-200">
              {data ? discoveryLabels[data.discovery.strategy] : "Not loaded"}
            </div>
          </div>
          <div className="rounded-md border border-slate-800 bg-slate-950 px-4 py-3">
            <div className="text-xs text-slate-500">Auction IDs scanned</div>
            <div className="mt-1 font-mono text-cyan-200">{data?.discovery.returnedIds ?? 0} / {data?.discovery.limit ?? WALLET_ACTIVITY_LIMIT}</div>
          </div>
        </div>
      ) : null}

      {wrongNetwork ? (
        <div className="mt-5 rounded-md border border-amber-400/40 bg-amber-400/10 px-4 py-3 text-sm text-amber-100">
          Wallet connected, but not on the target chain ({targetChainLabel}). This panel remains read-only; switch network before signing wallet actions.
        </div>
      ) : null}

      {data?.discovery.warning ? (
        <div className="mt-5 rounded-md border border-amber-400/40 bg-amber-400/10 px-4 py-3 text-sm text-amber-100">
          {data.discovery.warning}
        </div>
      ) : null}

      {data ? (
        <div className="mt-5 rounded-md border border-slate-800 bg-slate-950 px-4 py-3 text-xs leading-5 text-slate-400">
          This read model uses bounded on-chain event reads and direct contract reads. It is not a production indexer yet.
        </div>
      ) : null}

      {error ? (
        <div className="mt-5 rounded-md border border-amber-400/40 bg-amber-400/10 px-4 py-3 text-sm text-amber-100">
          {error}
        </div>
      ) : null}

      {isConnected && isLoading ? (
        <div className="mt-5 rounded-md bg-slate-950 px-4 py-3 text-sm text-slate-300">Loading wallet activity...</div>
      ) : null}

      {data ? (
        <>
          {data.activity.nextActions.length > 0 ? (
            <div className="mt-5 rounded-md border border-cyan-400/30 bg-cyan-400/10 px-4 py-4">
              <h3 className="text-sm font-semibold text-white">Actions available now</h3>
              <div className="mt-3 grid gap-3">
                {data.activity.nextActions.map((action) => (
                  <Link
                    key={`${action.kind}-${action.auctionId}`}
                    href={action.href}
                    className="rounded-md border border-slate-800 bg-slate-900 px-4 py-3 transition hover:border-cyan-500/60"
                  >
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                      <div>
                        <div className="font-semibold text-cyan-100">{action.label}</div>
                        <div className="mt-1 text-sm leading-6 text-slate-400">{action.description}</div>
                      </div>
                      {action.amount ? <div className="font-mono text-sm text-slate-200">{formatEth(action.amount)}</div> : null}
                    </div>
                  </Link>
                ))}
              </div>
            </div>
          ) : data.activity.hasActivity ? (
            <EmptyState className="mt-5" title="No immediate action">
              Activity found, but no immediate wallet action is currently available.
            </EmptyState>
          ) : (
            <EmptyState className="mt-5">
              No activity found for this wallet in the currently scanned auctions. Create an auction with a test ERC-721 NFT or place a bid, then refresh this panel.
            </EmptyState>
          )}

          <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7">
            {cards.map((card) => (
              <div key={card.label} className="rounded-md border border-slate-800 bg-slate-950 px-4 py-3">
                <div className="text-xs text-slate-500">{card.label}</div>
                <div className="mt-1 font-mono text-xl font-semibold text-cyan-100">{card.value}</div>
                {card.detail ? <div className="mt-1 font-mono text-xs text-slate-300">{card.detail}</div> : null}
              </div>
            ))}
          </div>

          {data.activity.warnings.length > 0 ? (
            <div className="mt-5 rounded-md border border-amber-400/40 bg-amber-400/10 px-4 py-3 text-sm text-amber-100">
              <div className="font-semibold">Activity warnings</div>
              <ul className="mt-2 list-disc space-y-1 pl-5">
                {data.activity.warnings.map((warning) => (
                  <li key={warning}>{warning}</li>
                ))}
              </ul>
            </div>
          ) : null}
        </>
      ) : null}
    </section>
  );
}
