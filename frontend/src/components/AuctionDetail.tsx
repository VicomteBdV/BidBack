"use client";

import React, { useCallback, useEffect, useState } from "react";
import { AuctionDevActions } from "@/components/AuctionDevActions";
import { AuctionEconomicsPanel } from "@/components/AuctionEconomicsPanel";
import { AuctionHistoryPanel } from "@/components/AuctionHistoryPanel";
import { AuctionLifecyclePanel } from "@/components/AuctionLifecyclePanel";
import { AuctionRulesSnapshot } from "@/components/AuctionRulesSnapshot";
import { AuctionSummary } from "@/components/AuctionSummary";
import { ModeBadge } from "@/components/ModeBadge";
import { WalletBidPanel } from "@/components/WalletBidPanel";
import { WalletClaimPanel } from "@/components/WalletClaimPanel";
import { WalletFinalizePanel } from "@/components/WalletFinalizePanel";
import { InfoRow } from "@/components/ui/InfoRow";
import { EmptyState } from "@/components/ui/EmptyState";
import { SectionCard } from "@/components/ui/SectionCard";
import { StateNotice } from "@/components/ui/StateNotice";
import type { AuctionDetailApiResponse } from "@/lib/auctionTypes";
import { formatAddressOrNone, formatEth, formatTimestamp, shortenAddress } from "@/lib/format";
import { isLocalAnvilTarget } from "@/lib/chains";

export function AuctionDetail({
  auctionId,
  localDevActionsEnabled = isLocalAnvilTarget
}: {
  auctionId: string;
  localDevActionsEnabled?: boolean;
}) {
  const [data, setData] = useState<AuctionDetailApiResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const loadAuction = useCallback(async () => {
    try {
      setIsLoading(true);

      const response = await fetch(`/api/auctions/${auctionId}`, {
        cache: "no-store"
      });

      const payload = (await response.json().catch(() => null)) as AuctionDetailApiResponse | { error?: string } | null;

      if (!response.ok) {
        throw new Error(payload && "error" in payload && payload.error ? payload.error : "Unable to read auction");
      }

      setData(payload as AuctionDetailApiResponse);
      setError(null);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to read auction");
    } finally {
      setIsLoading(false);
    }
  }, [auctionId]);

  useEffect(() => {
    loadAuction();
  }, [loadAuction]);

  if (isLoading && !data) {
    return (
      <section aria-busy="true" className="rounded-lg border border-slate-800 bg-slate-900 p-4 sm:p-5">
        <StateNotice tone="loading" title="Loading auction">
          Reading auction details and settlement data from the configured RPC.
        </StateNotice>
      </section>
    );
  }

  if (error && !data) {
    return (
      <section className="rounded-lg border border-slate-800 bg-slate-900 p-4 sm:p-5">
        <StateNotice
          tone="error"
          title="Auction could not be loaded"
          action={
            <button
              type="button"
              onClick={loadAuction}
              className="inline-flex min-h-9 items-center justify-center rounded-md border border-rose-200/50 px-3 text-xs font-semibold text-white transition hover:border-white"
            >
              Try again
            </button>
          }
        >
          {error}
        </StateNotice>
      </section>
    );
  }

  if (!data) {
    return (
      <section className="rounded-lg border border-slate-800 bg-slate-900 p-4 sm:p-5">
        <EmptyState title="Auction not found">
          No read-only auction data is available for this identifier.
        </EmptyState>
      </section>
    );
  }

  const { auction } = data;
  const economics = auction.economics;

  return (
    <div aria-busy={isLoading} className="min-w-0 grid gap-5">
      <div className="flex flex-col gap-3 sm:items-end">
        <button
          type="button"
          onClick={loadAuction}
          disabled={isLoading}
          className="inline-flex min-h-10 w-full items-center justify-center rounded-md border border-slate-700 px-4 text-sm font-semibold text-slate-100 transition hover:border-slate-500 disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto"
        >
          {isLoading ? "Refreshing auction..." : "Refresh auction"}
        </button>
        {isLoading ? (
          <StateNotice tone="loading" title="Refreshing auction" className="w-full sm:max-w-md">
            Existing read-only data remains visible while the refresh completes.
          </StateNotice>
        ) : null}
        {error ? (
          <StateNotice tone="error" title="Auction refresh failed" className="w-full sm:max-w-md">
            {error} Existing read-only data remains available below.
          </StateNotice>
        ) : null}
      </div>

      <AuctionSummary auction={auction} />

      <SectionCard
        title="Wallet-signed actions"
        badges={<ModeBadge variant="wallet-signed" />}
        description="Primary production-target actions signed by the connected wallet. No server private key is used and no /api/dev route is called."
      >
        <div className="grid gap-5">
          <WalletBidPanel auction={auction} onBidComplete={loadAuction} />
          <WalletFinalizePanel auction={auction} onFinalizeComplete={loadAuction} />
          <WalletClaimPanel auction={auction} onActionComplete={loadAuction} />
        </div>
      </SectionCard>

      {localDevActionsEnabled ? (
        <AuctionDevActions
          auctionId={auction.auctionId}
          auctionState={auction.state}
          finalized={auction.finalized}
          economics={economics}
          onActionComplete={loadAuction}
        />
      ) : null}

      <AuctionLifecyclePanel auction={auction} />

      <AuctionEconomicsPanel auction={auction} />

      <AuctionHistoryPanel auction={auction} />

      <AuctionRulesSnapshot
        snapshot={auction.paramsSnapshot}
        error={auction.paramsSnapshotError}
        feeRecipientSnapshot={auction.auctionFeeRecipient}
        feeRecipientSnapshotError={auction.auctionFeeRecipientError}
      />

      <SectionCard
        title="Technical details"
        badges={<ModeBadge variant="read-only" />}
        description="Raw contract references, protocol flags, and debug-like values. These are kept below the user-facing lifecycle and settlement views."
      >
        <div className="grid gap-3 text-sm text-slate-300 md:grid-cols-2">
          <InfoRow label="AuctionHouse" value={data.auctionHouse} mono />
          <InfoRow label="Chain ID" value={String(data.chainId)} mono />
          <InfoRow label="Seller" value={auction.seller} mono />
          <InfoRow label="NFT contract" value={auction.nft} mono />
          <InfoRow label="Token ID" value={auction.tokenId} mono />
          <InfoRow label="Start price" value={formatEth(auction.startPrice)} mono />
          <InfoRow label="Highest bid" value={formatEth(auction.highestBid)} mono />
          <InfoRow label="Highest bidder" value={formatAddressOrNone(auction.highestBidder)} mono />
          <InfoRow label="Start time" value={formatTimestamp(auction.startTime)} />
          <InfoRow label="Initial end time" value={formatTimestamp(auction.initialEndTime)} />
          <InfoRow label="Current end time" value={formatTimestamp(auction.endTime)} />
          <InfoRow label="Extensions used" value={String(auction.extensionsUsed)} mono />
          <InfoRow label="Participants" value={auction.participantCount} mono />
          <InfoRow label="Bid count" value={auction.bidCount} mono />
          <InfoRow label="Finalized" value={auction.finalized ? "Yes" : "No"} />
          <InfoRow label="NFT claimed" value={auction.nftClaimed ? "Yes" : "No"} />
          {auction.nftMetadata?.tokenUri ? <InfoRow label="NFT tokenURI" value={auction.nftMetadata.tokenUri} /> : null}
          {auction.auctionFeeRecipient ? (
            <InfoRow label="Auction fee recipient snapshot" value={auction.auctionFeeRecipient} mono />
          ) : null}
          {auction.auctionFeeRecipientError ? (
            <InfoRow label="Auction fee recipient snapshot error" value={auction.auctionFeeRecipientError} />
          ) : null}
          {economics ? (
            <InfoRow label="Current global fee recipient" value={economics.feeRecipient.currentGlobalAddress} mono />
          ) : null}
          <InfoRow label="Seller short" value={shortenAddress(auction.seller)} mono />
          <InfoRow label="NFT short" value={shortenAddress(auction.nft)} mono />
        </div>
      </SectionCard>
    </div>
  );
}
