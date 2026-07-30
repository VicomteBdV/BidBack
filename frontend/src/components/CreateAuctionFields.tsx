import React from "react";
import type { CreateAuctionFieldName } from "@/lib/createAuctionValidation";

export function CreateAuctionFields({
  nftContract,
  tokenId,
  startPriceEth,
  durationSeconds,
  disabled = false,
  errors = {},
  idPrefix = "create-auction",
  onNftContractChange,
  onTokenIdChange,
  onStartPriceEthChange,
  onDurationSecondsChange
}: {
  nftContract: string;
  tokenId: string;
  startPriceEth: string;
  durationSeconds: string;
  disabled?: boolean;
  errors?: Partial<Record<CreateAuctionFieldName, string>>;
  idPrefix?: string;
  onNftContractChange: (value: string) => void;
  onTokenIdChange: (value: string) => void;
  onStartPriceEthChange: (value: string) => void;
  onDurationSecondsChange: (value: string) => void;
}) {
  const fieldIds: Record<CreateAuctionFieldName, string> = {
    nftContract: `${idPrefix}-nft-contract`,
    tokenId: `${idPrefix}-token-id`,
    startPriceEth: `${idPrefix}-start-price`,
    durationSeconds: `${idPrefix}-duration`
  };

  return (
    <>
      <label className="grid gap-2" htmlFor={fieldIds.nftContract}>
        <span className="text-sm font-medium text-slate-200">NFT contract</span>
        <input
          id={fieldIds.nftContract}
          value={nftContract}
          disabled={disabled}
          aria-invalid={Boolean(errors.nftContract)}
          aria-describedby={errors.nftContract ? `${fieldIds.nftContract}-error` : undefined}
          onChange={(event) => onNftContractChange(event.target.value)}
          className="min-h-11 rounded-md border border-slate-700 bg-slate-950 px-3 font-mono text-sm text-slate-100 outline-none transition placeholder:text-slate-600 focus:border-cyan-400 disabled:cursor-not-allowed disabled:opacity-60"
          placeholder="0x..."
        />
        {errors.nftContract ? <span id={`${fieldIds.nftContract}-error`} className="text-xs text-rose-200">{errors.nftContract}</span> : null}
      </label>

      <div className="grid gap-5 md:grid-cols-3">
        <label className="grid gap-2" htmlFor={fieldIds.tokenId}>
          <span className="text-sm font-medium text-slate-200">Token ID</span>
          <input
            id={fieldIds.tokenId}
            value={tokenId}
            disabled={disabled}
            aria-invalid={Boolean(errors.tokenId)}
            aria-describedby={errors.tokenId ? `${fieldIds.tokenId}-error` : undefined}
            onChange={(event) => onTokenIdChange(event.target.value)}
            className="min-h-11 rounded-md border border-slate-700 bg-slate-950 px-3 font-mono text-sm text-slate-100 outline-none transition placeholder:text-slate-600 focus:border-cyan-400 disabled:cursor-not-allowed disabled:opacity-60"
            placeholder="0"
            inputMode="numeric"
          />
          {errors.tokenId ? <span id={`${fieldIds.tokenId}-error`} className="text-xs text-rose-200">{errors.tokenId}</span> : null}
        </label>

        <label className="grid gap-2" htmlFor={fieldIds.startPriceEth}>
          <span className="text-sm font-medium text-slate-200">Start price in ETH</span>
          <input
            id={fieldIds.startPriceEth}
            value={startPriceEth}
            disabled={disabled}
            aria-invalid={Boolean(errors.startPriceEth)}
            aria-describedby={errors.startPriceEth ? `${fieldIds.startPriceEth}-error` : undefined}
            onChange={(event) => onStartPriceEthChange(event.target.value)}
            className="min-h-11 rounded-md border border-slate-700 bg-slate-950 px-3 font-mono text-sm text-slate-100 outline-none transition placeholder:text-slate-600 focus:border-cyan-400 disabled:cursor-not-allowed disabled:opacity-60"
            placeholder="1"
            inputMode="decimal"
          />
          {errors.startPriceEth ? <span id={`${fieldIds.startPriceEth}-error`} className="text-xs text-rose-200">{errors.startPriceEth}</span> : null}
        </label>

        <label className="grid gap-2" htmlFor={fieldIds.durationSeconds}>
          <span className="text-sm font-medium text-slate-200">Duration in seconds</span>
          <input
            id={fieldIds.durationSeconds}
            value={durationSeconds}
            disabled={disabled}
            aria-invalid={Boolean(errors.durationSeconds)}
            aria-describedby={errors.durationSeconds ? `${fieldIds.durationSeconds}-error` : undefined}
            onChange={(event) => onDurationSecondsChange(event.target.value)}
            className="min-h-11 rounded-md border border-slate-700 bg-slate-950 px-3 font-mono text-sm text-slate-100 outline-none transition placeholder:text-slate-600 focus:border-cyan-400 disabled:cursor-not-allowed disabled:opacity-60"
            placeholder="7200"
            inputMode="numeric"
          />
          {errors.durationSeconds ? <span id={`${fieldIds.durationSeconds}-error`} className="text-xs text-rose-200">{errors.durationSeconds}</span> : null}
        </label>
      </div>
    </>
  );
}
