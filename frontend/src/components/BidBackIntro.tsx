import Link from "next/link";
import React from "react";
import { targetChainLabel } from "@/lib/chains";

const steps = [
  "Seller lists an existing ERC-721 NFT.",
  "Bidders place wallet-signed bids.",
  "The highest valid bidder wins the NFT.",
  "Outbid bidders can claim refunds separately from rewards.",
  "Eligible losing bidders may claim rewards only if redistribution conditions are met.",
  "Seller and protocol fee recipient withdraw their credits."
];

const disclaimers = [
  "Controlled MVP / testnet interface",
  "Unaudited contracts",
  "Use test assets only",
  "No guaranteed reward",
  "Not lending, derivatives, or gambling",
  "Local-dev actions are Anvil-only"
];

export function BidBackIntro() {
  return (
    <section className="rounded-lg border border-cyan-400/30 bg-cyan-400/10 p-5">
      <div className="grid gap-5 lg:grid-cols-[1fr_1.1fr]">
        <div>
          <p className="text-sm font-semibold uppercase tracking-wide text-cyan-200">MVP onboarding</p>
          <h2 className="mt-2 text-2xl font-semibold text-white">NFT auctions with conditional redistribution</h2>
          <p className="mt-3 max-w-3xl text-sm leading-6 text-cyan-50/90">
            BidBack is an ERC-721 auction MVP. The highest bidder wins the NFT. Losing bidders can always reclaim their refundable caps, and eligible losing bidders may claim conditional rewards only when the auction creates enough net premium.
          </p>
          <p className="mt-3 max-w-3xl text-sm leading-6 text-cyan-50/80">
            Rewards are separate from refunds, can be zero, and are never guaranteed. This interface is for local and controlled testnet validation on {targetChainLabel}.
          </p>
        </div>

        <div className="rounded-md border border-slate-800 bg-slate-950/80 p-4">
          <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-300">How it works</h3>
          <ol className="mt-3 grid gap-2 text-sm leading-6 text-slate-300">
            {steps.map((step, index) => (
              <li key={step} className="grid grid-cols-[28px_minmax(0,1fr)] gap-2">
                <span className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-cyan-400/40 bg-cyan-400/10 font-mono text-xs font-semibold text-cyan-100">
                  {index + 1}
                </span>
                <span>{step}</span>
              </li>
            ))}
          </ol>
        </div>
      </div>

      <div className="mt-5 grid gap-3 lg:grid-cols-[1fr_auto] lg:items-end">
        <div>
          <h3 className="text-sm font-semibold uppercase tracking-wide text-cyan-100">Before testing</h3>
          <div className="mt-3 flex flex-wrap gap-2">
            {disclaimers.map((item) => (
              <span key={item} className="inline-flex min-h-7 items-center rounded-md border border-cyan-400/30 bg-slate-950/70 px-2.5 text-xs font-semibold text-cyan-50">
                {item}
              </span>
            ))}
          </div>
        </div>

        <Link
          href="https://github.com/VicomteBdV/BidBack/blob/main/docs/BASE_SEPOLIA_SMOKE_TEST.md"
          target="_blank"
          rel="noreferrer"
          className="inline-flex min-h-10 items-center justify-center rounded-md border border-cyan-300/50 px-4 text-sm font-semibold text-cyan-50 transition hover:border-cyan-100"
        >
          Smoke test checklist
        </Link>
      </div>
    </section>
  );
}
