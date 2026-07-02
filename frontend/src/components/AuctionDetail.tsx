"use client";

import React, { useCallback, useEffect, useState } from "react";
import { AuctionDevActions } from "@/components/AuctionDevActions";
import { AuctionRulesSnapshot } from "@/components/AuctionRulesSnapshot";
import { AuctionSummary } from "@/components/AuctionSummary";
import { ModeBadge } from "@/components/ModeBadge";
import { WalletBidPanel } from "@/components/WalletBidPanel";
import { WalletClaimPanel } from "@/components/WalletClaimPanel";
import type { AuctionDetailApiResponse, BidderEconomics } from "@/lib/auctionTypes";
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

      <AuctionRulesSnapshot
        snapshot={auction.paramsSnapshot}
        error={auction.paramsSnapshotError}
        feeRecipientSnapshot={auction.auctionFeeRecipient}
        feeRecipientSnapshotError={auction.auctionFeeRecipientError}
      />

      {economics ? (
        <section className="rounded-lg border border-slate-800 bg-slate-900 p-5">
          <div className="flex flex-wrap items-center gap-3">
            <h2 className="text-xl font-semibold text-white">Economic state</h2>
            <ModeBadge variant="read-only" />
          </div>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-400">
            Read-only accounting view for refunds, rewards, seller proceeds, fees, and distribution reserves.
          </p>

          <div className="mt-5 grid gap-3 md:grid-cols-2">
            <BidderPanel bidder={economics.primaryBidder} />
            <BidderPanel bidder={economics.secondBidder} />
          </div>

          <div className="mt-4 grid gap-3 text-sm text-slate-300 md:grid-cols-2 lg:grid-cols-3">
            <EconomicItem label="Seller proceeds credit" value={formatEth(economics.seller.credit)} />
            <EconomicItem label="Protocol fee credit" value={formatEth(economics.feeRecipient.credit)} />
            <EconomicItem label="Auction fee recipient" value={economics.feeRecipient.address} />
            <EconomicItem label="Distribution reserve" value={formatEth(economics.settlement.distributionReserve)} />
            <EconomicItem label="Total assigned" value={formatEth(economics.distribution.totalAssigned)} />
            <EconomicItem label="Total claimed" value={formatEth(economics.distribution.totalClaimed)} />
            <EconomicItem label="NFT claimed" value={auction.nftClaimed ? "Yes" : "No"} />
          </div>
        </section>
      ) : null}

      <AuctionDevActions
        auctionId={auction.auctionId}
        auctionState={auction.state}
        finalized={auction.finalized}
        economics={economics}
        onActionComplete={loadAuction}
      />

      <section className="rounded-lg border border-slate-800 bg-slate-900 p-5">
        <div className="flex flex-wrap items-center gap-3">
          <h2 className="text-xl font-semibold text-white">Wallet-signed actions</h2>
          <ModeBadge variant="wallet-signed" />
        </div>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-400">
          Production-target flows signed in MetaMask. No server private key is used and no /api/dev route is called.
          These actions require the wallet to reach the target RPC.
        </p>

        <div className="mt-5 grid gap-5">
          <WalletBidPanel auctionId={auction.auctionId} auctionState={auction.state} onBidComplete={loadAuction} />
          <WalletClaimPanel auction={auction} onActionComplete={loadAuction} />
        </div>
      </section>

      <section className="rounded-lg border border-slate-800 bg-slate-900 p-5">
        <div className="flex flex-wrap items-center gap-3">
          <h2 className="text-xl font-semibold text-white">Technical details</h2>
          <ModeBadge variant="read-only" />
        </div>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-400">
          Raw contract references and protocol flags for debugging the local MVP.
        </p>

        <div className="mt-5 grid gap-3 text-sm text-slate-300 md:grid-cols-2">
          <DetailItem label="AuctionHouse" value={data.auctionHouse} mono />
          <DetailItem label="Chain ID" value={String(data.chainId)} mono />
          <DetailItem label="Seller" value={auction.seller} mono />
          <DetailItem label="NFT contract" value={auction.nft} mono />
          <DetailItem label="Token ID" value={auction.tokenId} mono />
          <DetailItem label="Start price" value={formatEth(auction.startPrice)} mono />
          <DetailItem label="Highest bid" value={formatEth(auction.highestBid)} mono />
          <DetailItem label="Highest bidder" value={formatAddressOrNone(auction.highestBidder)} mono />
          <DetailItem label="Start time" value={formatTimestamp(auction.startTime)} />
          <DetailItem label="Initial end time" value={formatTimestamp(auction.initialEndTime)} />
          <DetailItem label="Current end time" value={formatTimestamp(auction.endTime)} />
          <DetailItem label="Extensions used" value={String(auction.extensionsUsed)} mono />
          <DetailItem label="Participants" value={auction.participantCount} mono />
          <DetailItem label="Bid count" value={auction.bidCount} mono />
          <DetailItem label="Finalized" value={auction.finalized ? "Yes" : "No"} />
          <DetailItem label="NFT claimed" value={auction.nftClaimed ? "Yes" : "No"} />
          {auction.auctionFeeRecipient ? (
            <DetailItem label="Auction fee recipient snapshot" value={auction.auctionFeeRecipient} mono />
          ) : null}
          {auction.auctionFeeRecipientError ? (
            <DetailItem label="Auction fee recipient snapshot error" value={auction.auctionFeeRecipientError} />
          ) : null}
          {economics ? (
            <DetailItem label="Current global fee recipient" value={economics.feeRecipient.currentGlobalAddress} mono />
          ) : null}
          <DetailItem label="Seller short" value={shortenAddress(auction.seller)} mono />
          <DetailItem label="NFT short" value={shortenAddress(auction.nft)} mono />
        </div>
      </section>
    </div>
  );
}

function BidderPanel({ bidder }: { bidder: BidderEconomics }) {
  return (
    <div className="rounded-md border border-slate-800 bg-slate-950 px-4 py-3">
      <div className="flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h3 className="text-sm font-semibold text-white">{bidder.label}</h3>
          <p className="mt-1 break-all font-mono text-xs text-slate-500">
            {bidder.address ?? "Not configured"}
          </p>
        </div>
      </div>

      <div className="mt-4 grid gap-3 text-sm text-slate-300 sm:grid-cols-2">
        <EconomicItem label="Cap" value={formatEth(bidder.cap)} />
        <EconomicItem label="Refundable amount" value={formatEth(bidder.refundableAmount)} />
        <EconomicItem label="Refund claimed" value={bidder.refundClaimed ? "Yes" : "No"} />
        <EconomicItem label="Reward entitlement" value={formatEth(bidder.rewardEntitlement)} />
        <EconomicItem label="Reward claimed" value={bidder.rewardClaimed ? "Yes" : "No"} />
        <EconomicItem label="Configured" value={bidder.configured ? "Yes" : "No"} />
      </div>
    </div>
  );
}

function EconomicItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md bg-slate-950 px-3 py-2">
      <div className="text-xs text-slate-500">{label}</div>
      <div className="mt-1 break-all font-mono text-sm text-slate-200">{value}</div>
    </div>
  );
}

function DetailItem({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="rounded-md border border-slate-800 bg-slate-950 px-4 py-3">
      <div className="text-xs text-slate-500">{label}</div>
      <div className={`mt-1 break-all text-sm text-slate-200 ${mono ? "font-mono" : ""}`}>{value}</div>
    </div>
  );
}