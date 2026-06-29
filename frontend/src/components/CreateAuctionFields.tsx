export function CreateAuctionFields({
  nftContract,
  tokenId,
  startPriceEth,
  durationSeconds,
  disabled = false,
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
  onNftContractChange: (value: string) => void;
  onTokenIdChange: (value: string) => void;
  onStartPriceEthChange: (value: string) => void;
  onDurationSecondsChange: (value: string) => void;
}) {
  return (
    <>
      <label className="grid gap-2">
        <span className="text-sm font-medium text-slate-200">NFT contract</span>
        <input
          value={nftContract}
          disabled={disabled}
          onChange={(event) => onNftContractChange(event.target.value)}
          className="min-h-11 rounded-md border border-slate-700 bg-slate-950 px-3 font-mono text-sm text-slate-100 outline-none transition placeholder:text-slate-600 focus:border-cyan-400 disabled:cursor-not-allowed disabled:opacity-60"
          placeholder="0x..."
        />
      </label>

      <div className="grid gap-5 md:grid-cols-3">
        <label className="grid gap-2">
          <span className="text-sm font-medium text-slate-200">Token ID</span>
          <input
            value={tokenId}
            disabled={disabled}
            onChange={(event) => onTokenIdChange(event.target.value)}
            className="min-h-11 rounded-md border border-slate-700 bg-slate-950 px-3 font-mono text-sm text-slate-100 outline-none transition placeholder:text-slate-600 focus:border-cyan-400 disabled:cursor-not-allowed disabled:opacity-60"
            placeholder="2"
            inputMode="numeric"
          />
        </label>

        <label className="grid gap-2">
          <span className="text-sm font-medium text-slate-200">Start price in ETH</span>
          <input
            value={startPriceEth}
            disabled={disabled}
            onChange={(event) => onStartPriceEthChange(event.target.value)}
            className="min-h-11 rounded-md border border-slate-700 bg-slate-950 px-3 font-mono text-sm text-slate-100 outline-none transition placeholder:text-slate-600 focus:border-cyan-400 disabled:cursor-not-allowed disabled:opacity-60"
            placeholder="1"
            inputMode="decimal"
          />
        </label>

        <label className="grid gap-2">
          <span className="text-sm font-medium text-slate-200">Duration in seconds</span>
          <input
            value={durationSeconds}
            disabled={disabled}
            onChange={(event) => onDurationSecondsChange(event.target.value)}
            className="min-h-11 rounded-md border border-slate-700 bg-slate-950 px-3 font-mono text-sm text-slate-100 outline-none transition placeholder:text-slate-600 focus:border-cyan-400 disabled:cursor-not-allowed disabled:opacity-60"
            placeholder="7200"
            inputMode="numeric"
          />
        </label>
      </div>
    </>
  );
}