import React, { useMemo } from "react";
import { ModeBadge } from "@/components/ModeBadge";
import { buildAuctionEconomicSummary } from "@/lib/auctionEconomics";
import type { AuctionEconomicAddress, AuctionEconomicAmount, AuctionEconomicsSummary, SerializedAuction } from "@/lib/auctionTypes";
import { formatAddressOrNone, formatEth } from "@/lib/format";

const statusClasses: Record<AuctionEconomicAmount["status"], string> = {
  known: "border-emerald-400/40 bg-emerald-400/10 text-emerald-100",
  pending: "border-cyan-400/40 bg-cyan-400/10 text-cyan-100",
  "not-applicable": "border-slate-500/40 bg-slate-500/10 text-slate-200",
  unavailable: "border-amber-400/40 bg-amber-400/10 text-amber-100"
};

const statusLabels: Record<AuctionEconomicAmount["status"], string> = {
  known: "Known",
  pending: "Pending",
  "not-applicable": "Not applicable",
  unavailable: "Unavailable"
};

export function AuctionEconomicsPanel({ auction }: { auction: SerializedAuction }) {
  const summary = useMemo(() => auction.economicSummary ?? buildAuctionEconomicSummary(auction), [auction]);

  return (
    <section className="rounded-lg border border-slate-800 bg-slate-900 p-5">
      <div className="flex flex-wrap items-center gap-3">
        <h2 className="text-xl font-semibold text-white">Economic transparency / Settlement breakdown</h2>
        <ModeBadge variant="read-only" />
      </div>
      <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-400">
        Read-only settlement view for this auction. Refunds are separate from redistribution. Rewards are conditional,
        can be zero, and are not guaranteed.
      </p>

      <div className="mt-5 grid gap-3 text-sm text-slate-300 md:grid-cols-2 xl:grid-cols-4">
        <AmountCard label="Current highest bid" amount={summary.settlement.currentHighestBid} />
        <AmountCard label="Final price" amount={summary.settlement.finalPrice} />
        <AmountCard label="Seller proceeds" amount={summary.settlement.sellerProceeds} />
        <AmountCard label="Protocol fees" amount={summary.settlement.protocolFees} />
        <AmountCard label="Seller withdrawable credit" amount={summary.settlement.sellerCredit} />
        <AmountCard label="Fee recipient withdrawable credit" amount={summary.settlement.protocolFeeCredit} />
        <AmountCard label="Visible refunds available" amount={summary.settlement.refundsAvailable} />
        <AmountCard label="Visible rewards available" amount={summary.settlement.rewardsAvailable} />
        <AmountCard label="Redistribution assigned" amount={summary.settlement.redistributionAvailable} />
        <AmountCard label="Distribution reserve" amount={summary.settlement.distributionReserve} />
        <AmountCard label="Total assigned rewards" amount={summary.settlement.totalAssignedRewards} />
        <AmountCard label="Total claimed rewards" amount={summary.settlement.totalClaimedRewards} />
      </div>

      <div className="mt-4 grid gap-3 text-sm text-slate-300 md:grid-cols-2 xl:grid-cols-4">
        <AddressCard label="Seller" address={summary.settlement.seller} />
        <AddressCard label="Winner / highest bidder" address={summary.settlement.winner} />
        <AddressCard label="NFT claimant" address={summary.settlement.nftClaimant} />
        <AddressCard label="Fee recipient snapshot" address={summary.settlement.feeRecipient} />
      </div>

      <div className="mt-4 grid gap-3 text-sm text-slate-300 md:grid-cols-2">
        <StatusCard label="Auction finalized" value={summary.settlement.isFinalized ? "Yes" : "No"} />
        <StatusCard label="Distribution opened" value={summary.settlement.isDistributionAvailable ? "Yes" : "No"} />
      </div>

      {summary.parameters ? (
        <div className="mt-5 rounded-md border border-slate-800 bg-slate-950 px-4 py-3">
          <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Auction economic parameter snapshot</div>
          <p className="mt-2 text-sm leading-6 text-slate-400">
            These are this auction&apos;s captured parameters, not the current global parameters.
          </p>
          <div className="mt-4 grid gap-3 text-sm text-slate-300 md:grid-cols-2 xl:grid-cols-3">
            <ParameterItem label="BidBack fee bps" value={summary.parameters.bidbackFeeBps} />
            <ParameterItem label="Redistribution bps" value={summary.parameters.redistributionBps} />
            <ParameterItem label="Minimum premium net" value={formatEth(summary.parameters.minPremiumNet)} />
            <ParameterItem label="Minimum participants" value={summary.parameters.minParticipants} />
            <ParameterItem label="Per-user reward cap bps" value={summary.parameters.perUserRewardCapBps} />
            <ParameterItem label="Minimum bid increment bps" value={summary.parameters.minBidIncrementBps} />
          </div>
        </div>
      ) : (
        <div className="mt-5 rounded-md border border-amber-400/40 bg-amber-400/10 px-4 py-3 text-sm text-amber-100">
          Auction economic parameter snapshot is unavailable.
        </div>
      )}

      {summary.warnings.length > 0 ? (
        <div className="mt-5 rounded-md border border-amber-400/40 bg-amber-400/10 px-4 py-3 text-sm leading-6 text-amber-100">
          {summary.warnings.join(" ")}
        </div>
      ) : null}

      {summary.unavailableFields.length > 0 ? (
        <div className="mt-5 rounded-md border border-slate-700 bg-slate-950 px-4 py-3 text-sm leading-6 text-slate-300">
          Unavailable fields: <span className="font-mono text-slate-100">{summary.unavailableFields.join(", ")}</span>
        </div>
      ) : null}

      <div className="mt-5 grid gap-2 text-sm leading-6 text-slate-400">
        {summary.notes.map((note) => (
          <div key={note} className="rounded-md border border-slate-800 bg-slate-950 px-4 py-3">
            {note}
          </div>
        ))}
      </div>
    </section>
  );
}

function AmountCard({ label, amount }: { label: string; amount: AuctionEconomicAmount }) {
  const value = amount.value !== undefined ? formatEth(amount.value) : statusLabels[amount.status];

  return (
    <div className="rounded-md border border-slate-800 bg-slate-950 px-4 py-3">
      <div className="flex items-start justify-between gap-3">
        <div className="text-xs text-slate-500">{label}</div>
        <StatusBadge status={amount.status} />
      </div>
      <div className="mt-2 break-all font-mono text-sm text-slate-200">{value}</div>
      {amount.note ? <div className="mt-2 text-xs leading-5 text-slate-500">{amount.note}</div> : null}
    </div>
  );
}

function AddressCard({ label, address }: { label: string; address: AuctionEconomicAddress }) {
  const value = address.value ? formatAddressOrNone(address.value) : statusLabels[address.status];

  return (
    <div className="rounded-md border border-slate-800 bg-slate-950 px-4 py-3">
      <div className="flex items-start justify-between gap-3">
        <div className="text-xs text-slate-500">{label}</div>
        <StatusBadge status={address.status} />
      </div>
      <div className="mt-2 break-all font-mono text-sm text-slate-200">{value}</div>
      {address.note ? <div className="mt-2 text-xs leading-5 text-slate-500">{address.note}</div> : null}
    </div>
  );
}

function StatusCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-slate-800 bg-slate-950 px-4 py-3">
      <div className="text-xs text-slate-500">{label}</div>
      <div className="mt-1 font-mono text-sm text-slate-200">{value}</div>
    </div>
  );
}

function ParameterItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md bg-slate-900 px-3 py-2">
      <div className="text-xs text-slate-500">{label}</div>
      <div className="mt-1 break-all font-mono text-sm text-slate-200">{value}</div>
    </div>
  );
}

function StatusBadge({ status }: { status: AuctionEconomicAmount["status"] }) {
  return (
    <span className={`inline-flex min-h-6 items-center rounded-md border px-2 text-[11px] font-semibold ${statusClasses[status]}`}>
      {statusLabels[status]}
    </span>
  );
}
