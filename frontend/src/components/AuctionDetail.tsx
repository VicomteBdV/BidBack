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
import { SectionCard } from "@/components/ui/SectionCard";
import type { AuctionDetailApiResponse } from "@/lib/auctionTypes";
import { formatAddressOrNone, formatEth, formatTimestamp, shortenAddress } from "@/lib/format";

export function AuctionDetail({ auctionId }: { auctionId: string }) {
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
      setData(null);
      setError(caught instanceof Error ? caught.message : "Unable to read auction");
    } finally {
      setIsLoading(false);
    }
  }, [auctionId]);

  useEffect(() => {
    loadAuction();
  }, [loadAuction]);

  if (isLoading) {
    return (
      <section className="rounded-lg border border-slate-800 bg-slate-900 p-5">
        <div className="rounded-md bg-slate-950 px-4 py-3 text-sm text-slate-300">Loading auction...</div>
      </section>
    );
  }

  if (error) {
    return (
      <section className="rounded-lg border border-slate-800 bg-slate-900 p-5">
        <div className="rounded-md border border-amber-400/40 bg-amber-400/10 px-4 py-3 text-sm text-amber-100">
          {error}
        </div>
      </section>
    );
  }

  if (!data) {
    return (
      <section className="rounded-lg border border-slate-800 bg-slate-900 p-5">
        <div className="rounded-md bg-slate-950 px-4 py-3 text-sm text-slate-300">Auction not found.</div>
      </section>
    );
  }

  const { auction } = data;
  const economics = auction.economics;

  return (
    <div className="grid gap-5">
      <div className="flex justify-end">
        <button
          type="button"
          onClick={loadAuction}
          disabled={isLoading}
          className="inline-flex min-h-10 items-center justify-center rounded-md border border-slate-700 px-4 text-sm font-semibold text-slate-100 transition hover:border-slate-500 disabled:cursor-not-allowed disabled:opacity-60"
        >
          Refresh auction
        </button>
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

      <AuctionDevActions
        auctionId={auction.auctionId}
        auctionState={auction.state}
        finalized={auction.finalized}
        economics={economics}
        onActionComplete={loadAuction}
      />

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
