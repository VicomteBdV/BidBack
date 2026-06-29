"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { CreateAuctionFields } from "@/components/CreateAuctionFields";
import { validateCreateAuctionFields } from "@/lib/createAuctionValidation";
import { formatDurationSeconds, formatEth, shortenAddress } from "@/lib/format";

type CreateContext = {
  chainId: number;
  auctionHouse: `0x${string}`;
  nftVault: `0x${string}`;
  localNft: `0x${string}`;
  paramsController: `0x${string}`;
  minAuctionDuration: string;
  paused: boolean;
  defaultTokenId: string;
  defaultDuration: string;
};

type CreateAuctionResponse = {
  status: "ok" | "error";
  action: string;
  localDevOnly: true;
  auctionId?: string;
  txHash?: `0x${string}`;
  approvalTxHash?: `0x${string}` | null;
  seller?: `0x${string}`;
  nft?: `0x${string}`;
  nftVault?: `0x${string}`;
  tokenId?: string;
  startPrice?: string;
  duration?: string;
  minAuctionDuration?: string;
  error?: string;
};

export function CreateAuctionForm() {
  const [context, setContext] = useState<CreateContext | null>(null);
  const [contextError, setContextError] = useState<string | null>(null);
  const [isContextLoading, setIsContextLoading] = useState(true);

  const [nftContract, setNftContract] = useState("");
  const [tokenId, setTokenId] = useState("");
  const [startPriceEth, setStartPriceEth] = useState("1");
  const [durationSeconds, setDurationSeconds] = useState("");

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formMessage, setFormMessage] = useState<string | null>(null);
  const [result, setResult] = useState<CreateAuctionResponse | null>(null);

  useEffect(() => {
    let active = true;

    async function loadContext() {
      try {
        setIsContextLoading(true);

        const response = await fetch("/api/local-create-context", {
          cache: "no-store"
        });

        const payload = (await response.json().catch(() => null)) as CreateContext | { error?: string } | null;

        if (!response.ok) {
          throw new Error(payload && "error" in payload && payload.error ? payload.error : "Unable to load create context");
        }

        const loaded = payload as CreateContext;

        if (active) {
          setContext(loaded);
          setContextError(null);
          setNftContract((current) => current || loaded.localNft);
          setTokenId((current) => current || loaded.defaultTokenId);
          setDurationSeconds((current) => current || loaded.defaultDuration);
        }
      } catch (caught) {
        if (active) {
          setContext(null);
          setContextError(caught instanceof Error ? caught.message : "Unable to load create context");
        }
      } finally {
        if (active) {
          setIsContextLoading(false);
        }
      }
    }

    loadContext();

    return () => {
      active = false;
    };
  }, []);

  const values = useMemo(
    () => ({ nftContract, tokenId, startPriceEth, durationSeconds }),
    [durationSeconds, nftContract, startPriceEth, tokenId]
  );

  const validationError = useMemo(
    () =>
      validateCreateAuctionFields(values, {
        minAuctionDuration: context?.minAuctionDuration,
        paused: context?.paused
      }),
    [context, values]
  );

  async function submitCreateAuction(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (validationError) {
      setFormMessage(validationError);
      return;
    }

    try {
      setIsSubmitting(true);
      setFormMessage(null);
      setResult(null);

      const response = await fetch("/api/dev/create-auction", {
        method: "POST",
        headers: {
          "content-type": "application/json"
        },
        body: JSON.stringify(values)
      });

      const payload = (await response.json().catch(() => null)) as CreateAuctionResponse | null;

      if (!response.ok || !payload || payload.status === "error") {
        throw new Error(payload?.error ?? "Local dev auction creation failed");
      }

      setResult(payload);
      setFormMessage(`Auction #${payload.auctionId} created.`);
      setTokenId((current) => (/^\d+$/.test(current.trim()) ? (BigInt(current.trim()) + 1n).toString() : current));
    } catch (caught) {
      setFormMessage(caught instanceof Error ? caught.message : "Local dev auction creation failed");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <section className="rounded-lg border border-slate-800 bg-slate-900 p-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="text-xl font-semibold text-white">Local dev create auction only</h2>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-400">
            This form uses the local Anvil seller key on the Next.js server. It approves NFTVault and calls
            AuctionHouse.createAuction for Codespaces MVP testing only.
          </p>
        </div>

        <Link
          href="/"
          className="inline-flex min-h-10 items-center justify-center rounded-md border border-slate-700 px-4 text-sm font-semibold text-slate-100 transition hover:border-slate-500"
        >
          Back to auctions
        </Link>
      </div>

      <div className="mt-5 rounded-lg border border-amber-400/30 bg-amber-400/10 p-4">
        <h3 className="text-sm font-semibold uppercase tracking-wide text-amber-100">Local dev actions only</h3>
        <p className="mt-1 text-sm leading-6 text-amber-100/80">
          This is not a production transaction flow. Production auction creation must be wallet-signed by the NFT owner.
        </p>
      </div>

      {isContextLoading ? (
        <div className="mt-5 rounded-md bg-slate-950 px-4 py-3 text-sm text-slate-300">
          Loading local deployment context...
        </div>
      ) : null}

      {!isContextLoading && contextError ? (
        <div className="mt-5 rounded-md border border-amber-400/40 bg-amber-400/10 px-4 py-3 text-sm text-amber-100">
          {contextError}
        </div>
      ) : null}

      {context ? (
        <div className="mt-5 grid gap-3 text-sm text-slate-300 md:grid-cols-2 lg:grid-cols-4">
          <InfoItem label="Chain ID" value={String(context.chainId)} />
          <InfoItem label="LocalERC721" value={shortenAddress(context.localNft)} mono />
          <InfoItem label="NFTVault approval target" value={shortenAddress(context.nftVault)} mono />
          <InfoItem label="Minimum duration" value={formatDurationSeconds(context.minAuctionDuration)} />
        </div>
      ) : null}

      <form onSubmit={submitCreateAuction} className="mt-6 grid gap-5">
        <CreateAuctionFields
          nftContract={nftContract}
          tokenId={tokenId}
          startPriceEth={startPriceEth}
          durationSeconds={durationSeconds}
          disabled={isSubmitting}
          onNftContractChange={setNftContract}
          onTokenIdChange={setTokenId}
          onStartPriceEthChange={setStartPriceEth}
          onDurationSecondsChange={setDurationSeconds}
        />

        <div className="rounded-md bg-slate-950 px-4 py-3 text-sm leading-6 text-slate-300">
          On a fresh local deployment, token #1 is locked by the demo auction. Use token #2 or higher for additional
          local auctions. DeployLocal currently mints 12 LocalERC721 tokens to the seller.
        </div>

        {validationError ? (
          <div className="rounded-md border border-amber-400/40 bg-amber-400/10 px-4 py-3 text-sm text-amber-100">
            {validationError}
          </div>
        ) : null}

        <button
          type="submit"
          disabled={Boolean(validationError) || isSubmitting}
          className="inline-flex min-h-11 w-full items-center justify-center rounded-md bg-cyan-400 px-4 text-sm font-semibold text-slate-950 transition hover:bg-cyan-300 disabled:cursor-not-allowed disabled:opacity-50 sm:w-fit"
        >
          {isSubmitting ? "Creating auction..." : "Create local dev auction"}
        </button>
      </form>

      {formMessage ? (
        <div className="mt-5 rounded-md bg-slate-950 px-4 py-3 text-sm text-slate-200">{formMessage}</div>
      ) : null}

      {result?.status === "ok" ? (
        <div className="mt-5 rounded-lg border border-emerald-400/30 bg-emerald-400/10 p-4">
          <h3 className="text-base font-semibold text-emerald-100">Auction created</h3>
          <div className="mt-4 grid gap-3 text-sm text-slate-200 md:grid-cols-2">
            <InfoItem label="Auction ID" value={`#${result.auctionId}`} />
            <InfoItem label="Seller" value={shortenAddress(result.seller)} mono />
            <InfoItem label="NFT" value={shortenAddress(result.nft)} mono />
            <InfoItem label="Token ID" value={result.tokenId ?? ""} mono />
            <InfoItem label="Start price" value={formatEth(result.startPrice)} />
            <InfoItem label="Duration" value={formatDurationSeconds(result.duration)} />
          </div>

          <div className="mt-4 grid gap-2 text-xs text-emerald-100/80">
            {result.approvalTxHash ? <div className="break-all font-mono">approval tx: {result.approvalTxHash}</div> : null}
            {result.txHash ? <div className="break-all font-mono">create tx: {result.txHash}</div> : null}
          </div>

          <div className="mt-4 flex flex-col gap-3 sm:flex-row">
            <Link
              href={`/auctions/${result.auctionId}`}
              className="inline-flex min-h-10 items-center justify-center rounded-md bg-emerald-300 px-4 text-sm font-semibold text-slate-950 transition hover:bg-emerald-200"
            >
              Open auction detail
            </Link>
            <Link
              href="/"
              className="inline-flex min-h-10 items-center justify-center rounded-md border border-emerald-300/50 px-4 text-sm font-semibold text-emerald-100 transition hover:border-emerald-200"
            >
              Back to auction list
            </Link>
          </div>
        </div>
      ) : null}
    </section>
  );
}

function InfoItem({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="rounded-md border border-slate-800 bg-slate-950 px-4 py-3">
      <div className="text-xs text-slate-500">{label}</div>
      <div className={`mt-1 break-all text-sm text-slate-200 ${mono ? "font-mono" : ""}`}>{value}</div>
    </div>
  );
}