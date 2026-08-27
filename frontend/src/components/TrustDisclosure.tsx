import React from "react";

const trustItems = [
  {
    mark: "✓",
    title: "Losing caps stay refundable",
    description: "After finalization, a losing bidder can reclaim the locked cap in full."
  },
  {
    mark: "↗",
    title: "Gas is separate",
    description: "Network transaction fees are separate and non-refundable."
  },
  {
    mark: "≈",
    title: "Redistribution is conditional",
    description: "Any separate redistribution can be zero and is never guaranteed."
  }
];

export function TrustDisclosure({
  compact = false,
  variant = "strip"
}: {
  compact?: boolean;
  variant?: "strip" | "sidebar";
}) {
  const sidebar = variant === "sidebar";

  return (
    <section className={`trust-surface ${sidebar ? "trust-sidebar" : ""}`} aria-labelledby="trust-rules-title">
      <div className={`flex flex-col gap-2 ${sidebar ? "" : "sm:flex-row sm:items-end sm:justify-between"}`}>
        <div>
          <p className="premium-eyebrow">The BidBack promise</p>
          <h2 id="trust-rules-title" className="editorial-title mt-1 text-xl">
            Terms at a glance
          </h2>
        </div>
        <p className="text-xs font-semibold text-slate-500">Test assets only · Unaudited contracts</p>
      </div>

      <div className={`mt-3 grid gap-2.5 ${sidebar ? "" : compact ? "lg:grid-cols-3" : "md:grid-cols-3"}`}>
        {trustItems.map((item) => (
          <div key={item.title} className="trust-item">
            <span className="trust-item-mark" aria-hidden="true">{item.mark}</span>
            <div>
              <h3 className="font-editorial text-base font-semibold text-white">{item.title}</h3>
              <p className="mt-0.5 text-xs leading-5 text-slate-400">{item.description}</p>
            </div>
          </div>
        ))}
      </div>

      <details className="technical-disclosure mt-3">
        <summary>About the current controlled-testnet rules</summary>
        <div className="technical-disclosure-body text-sm leading-6 text-slate-400">
          The highest valid bidder wins the NFT. Refunds and conditional redistribution are separate claims. The current
          mechanism is exposed for controlled testnet evaluation and is not an approved final Economic Model V1. BidBack
          is not lending, derivatives, or gambling.
        </div>
      </details>
    </section>
  );
}
