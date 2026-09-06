import React, { useLayoutEffect, useMemo } from "react";
import { durationInputToSeconds, durationSecondsToInput } from "@/lib/auctionDurationInput";
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
  const durationInput = useMemo(() => durationSecondsToInput(durationSeconds), [durationSeconds]);
  const canonicalDurationSeconds = durationInput?.durationSeconds ?? null;
  const days = durationInput?.days ?? durationSeconds.trim();
  const hours = durationInput?.hours ?? "0";
  const durationDescriptionId = errors.durationSeconds ? `${fieldIds.durationSeconds}-error` : undefined;

  useLayoutEffect(() => {
    if (canonicalDurationSeconds !== null && canonicalDurationSeconds !== durationSeconds) {
      onDurationSecondsChange(canonicalDurationSeconds);
    }
  }, [canonicalDurationSeconds, durationSeconds, onDurationSecondsChange]);

  function updateDuration(nextDays: string, nextHours: string, invalidValue: string) {
    onDurationSecondsChange(durationInputToSeconds(nextDays, nextHours) ?? invalidValue);
  }

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

        <fieldset
          className="grid min-w-0 gap-2"
          aria-invalid={Boolean(errors.durationSeconds)}
          aria-describedby={durationDescriptionId}
        >
          <legend className="text-sm font-medium text-slate-200">Duration</legend>
          <div className="grid min-w-0 grid-cols-2 gap-3">
            <label className="grid min-w-0 gap-2" htmlFor={`${fieldIds.durationSeconds}-days`}>
              <span className="text-xs text-slate-400">Days</span>
              <input
                id={`${fieldIds.durationSeconds}-days`}
                type="number"
                min="0"
                step="1"
                value={days}
                disabled={disabled}
                aria-invalid={Boolean(errors.durationSeconds)}
                aria-describedby={durationDescriptionId}
                onChange={(event) => updateDuration(event.target.value, hours, event.target.value)}
                className="min-h-11 w-full min-w-0 rounded-md border border-slate-700 bg-slate-950 px-3 font-mono text-sm text-slate-100 outline-none transition placeholder:text-slate-600 focus:border-cyan-400 disabled:cursor-not-allowed disabled:opacity-60"
                placeholder="0"
                inputMode="numeric"
              />
            </label>
            <label className="grid min-w-0 gap-2" htmlFor={`${fieldIds.durationSeconds}-hours`}>
              <span className="text-xs text-slate-400">Hours</span>
              <select
                id={`${fieldIds.durationSeconds}-hours`}
                value={hours}
                disabled={disabled}
                aria-invalid={Boolean(errors.durationSeconds)}
                aria-describedby={durationDescriptionId}
                onChange={(event) => updateDuration(days, event.target.value, durationSeconds)}
                className="min-h-11 w-full min-w-0 rounded-md border border-slate-700 bg-slate-950 px-3 font-mono text-sm text-slate-100 outline-none transition focus:border-cyan-400 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {Array.from({ length: 24 }, (_, hour) => (
                  <option key={hour} value={hour}>{hour}</option>
                ))}
              </select>
            </label>
          </div>
          {errors.durationSeconds ? <span id={`${fieldIds.durationSeconds}-error`} className="text-xs text-rose-200">{errors.durationSeconds}</span> : null}
        </fieldset>
      </div>
    </>
  );
}
