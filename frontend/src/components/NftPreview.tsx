"use client";

import React, { useEffect, useMemo, useState } from "react";
import type { NftMetadata } from "@/lib/auctionTypes";
import { shortenAddress } from "@/lib/format";

type NftPreviewProps = {
  metadata?: NftMetadata;
  contractAddress: `0x${string}`;
  tokenId: string;
  compact?: boolean;
  marketplace?: boolean;
  showLinks?: boolean;
};

const statusLabels: Record<NftMetadata["status"], string> = {
  loaded: "Metadata loaded",
  unavailable: "Metadata unavailable",
  "fetch-failed": "Metadata fetch failed",
  "unsupported-token-uri": "Unsupported tokenURI",
  "no-image": "Metadata loaded, no image"
};

function isHttpUrl(value?: string) {
  return Boolean(value && /^https?:\/\//i.test(value));
}

export function NftPreview({
  metadata,
  contractAddress,
  tokenId,
  compact = false,
  marketplace = false,
  showLinks = true
}: NftPreviewProps) {
  const [imageFailed, setImageFailed] = useState(false);
  const imageUrl = metadata?.imageUrl;

  useEffect(() => {
    setImageFailed(false);
  }, [imageUrl]);

  const title = metadata?.metadataName || `Token #${tokenId}`;
  const collectionLabel = useMemo(() => {
    if (metadata?.collectionName && metadata.collectionSymbol) {
      return `${metadata.collectionName} (${metadata.collectionSymbol})`;
    }

    return metadata?.collectionName ?? metadata?.collectionSymbol ?? "Unknown collection";
  }, [metadata?.collectionName, metadata?.collectionSymbol]);

  const canShowImage = Boolean(imageUrl && !imageFailed);
  const imageFallbackLabel = imageFailed ? "Image unavailable" : metadata?.status === "loaded" ? "No image" : "NFT preview";
  const tokenUriLink = isHttpUrl(metadata?.tokenUriGatewayUrl) ? metadata?.tokenUriGatewayUrl : undefined;
  const externalLink = isHttpUrl(metadata?.externalUrl) ? metadata?.externalUrl : undefined;
  const showMetadataStatus = !marketplace || metadata?.status !== "loaded";

  return (
    <div className={`min-w-0 ${marketplace ? "marketplace-preview" : `rounded-lg border border-slate-800 bg-slate-950 ${compact ? "p-3" : "p-4"}`}`}>
      <div
        className={`grid min-w-0 gap-4 ${
          marketplace
            ? ""
            : compact
              ? "grid-cols-[64px_minmax(0,1fr)] sm:grid-cols-[72px_minmax(0,1fr)]"
              : "sm:grid-cols-[160px_minmax(0,1fr)]"
        }`}
      >
        <div
          className={`flex items-center justify-center overflow-hidden border border-slate-800 bg-slate-900 ${
            marketplace
              ? "marketplace-media aspect-[4/3] w-full"
              : compact
                ? "aspect-square h-16 w-16 rounded-md sm:h-[72px] sm:w-[72px]"
                : "aspect-square w-full rounded-md"
          }`}
        >
          {canShowImage ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={imageUrl}
              alt={`NFT preview: ${title}`}
              className="h-full w-full object-cover"
              loading="lazy"
              referrerPolicy="no-referrer"
              onError={() => setImageFailed(true)}
            />
          ) : (
            <div className="px-2 text-center text-[11px] font-semibold uppercase tracking-wide text-slate-500">
              {imageFallbackLabel}
            </div>
          )}
        </div>

        <div className={marketplace ? "marketplace-identity min-w-0" : "min-w-0"}>
          <div className="flex flex-wrap items-center gap-2">
            <h3 className={`${compact ? "text-sm font-bold" : marketplace ? "font-editorial text-xl font-semibold" : "text-base font-bold"} break-words text-white`}>{title}</h3>
            {metadata && showMetadataStatus ? (
              <span className="inline-flex min-h-6 items-center rounded-md border border-slate-700 px-2 text-[11px] font-semibold text-slate-300">
                {statusLabels[metadata.status]}
              </span>
            ) : !metadata ? (
              <span className="inline-flex min-h-6 items-center rounded-md border border-slate-700 px-2 text-[11px] font-semibold text-slate-300">
                Metadata not loaded
              </span>
            ) : null}
          </div>

          <div className="mt-1 break-words text-sm text-slate-400">{collectionLabel}</div>

          {!compact && metadata?.description ? (
            <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-400">{metadata.description}</p>
          ) : null}

          {marketplace ? (
            <div className="mt-2 text-xs font-semibold text-slate-500">Token #{tokenId}</div>
          ) : (
            <div className={`grid gap-2 text-xs text-slate-500 ${compact ? "mt-2" : "mt-4 sm:grid-cols-2"}`}>
              <div>
                <div>Contract</div>
                <div className="mt-1 break-all font-mono text-slate-300" title={contractAddress}>{shortenAddress(contractAddress)}</div>
              </div>
              <div>
                <div>Token ID</div>
                <div className="mt-1 break-all font-mono text-slate-300">#{tokenId}</div>
              </div>
            </div>
          )}

          {metadata?.errorMessage ? (
            <div className="mt-3 rounded-md border border-amber-400/30 bg-amber-400/10 px-3 py-2 text-xs leading-5 text-amber-100">
              {metadata.errorMessage}
            </div>
          ) : null}

          {showLinks && (tokenUriLink || externalLink) ? (
            <div className="mt-4 flex flex-wrap gap-2 text-xs">
              {tokenUriLink ? (
                <a
                  href={tokenUriLink}
                  target="_blank"
                  rel="noreferrer noopener"
                  className="inline-flex min-h-8 items-center rounded-md border border-slate-700 px-3 font-semibold text-cyan-100 transition hover:border-cyan-400/60"
                  aria-label={`Open token metadata for ${title} in a new tab`}
                >
                  Open tokenURI
                </a>
              ) : null}
              {externalLink ? (
                <a
                  href={externalLink}
                  target="_blank"
                  rel="noreferrer noopener"
                  className="inline-flex min-h-8 items-center rounded-md border border-slate-700 px-3 font-semibold text-cyan-100 transition hover:border-cyan-400/60"
                  aria-label={`Open the external NFT page for ${title} in a new tab`}
                >
                  External link
                </a>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
