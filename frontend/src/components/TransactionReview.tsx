import React from "react";

export type TransactionReviewItem = {
  label: string;
  value: string;
  mono?: boolean;
};

export function TransactionReview({
  title,
  description,
  items,
  confirmations,
  note,
  primaryLabel,
  secondaryLabel = "Back",
  busy = false,
  disabled = false,
  onConfirm,
  onBack
}: {
  title: string;
  description: string;
  items: TransactionReviewItem[];
  confirmations: string;
  note?: string;
  primaryLabel: string;
  secondaryLabel?: string;
  busy?: boolean;
  disabled?: boolean;
  onConfirm: () => void;
  onBack: () => void;
}) {
  const titleId = `transaction-review-${title.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;

  return (
    <section className="transaction-review" aria-labelledby={titleId}>
      <div>
        <p className="premium-eyebrow">Review before signing</p>
        <h4 id={titleId} className="mt-1 text-lg font-semibold text-white">{title}</h4>
        <p className="mt-2 text-sm leading-6 text-slate-400">{description}</p>
      </div>

      <dl className="transaction-review-list">
        {items.map((item) => (
          <div key={item.label} className="transaction-review-row">
            <dt>{item.label}</dt>
            <dd className={item.mono ? "font-mono" : undefined}>{item.value}</dd>
          </div>
        ))}
      </dl>

      <div className="transaction-review-confirmations">{confirmations}</div>
      {note ? <p className="transaction-review-note">{note}</p> : null}

      <div className="transaction-review-actions">
        <button type="button" className="secondary-link" disabled={busy} onClick={onBack}>
          {secondaryLabel}
        </button>
        <button
          type="button"
          className="transaction-primary-action"
          disabled={busy || disabled}
          onClick={onConfirm}
        >
          {busy ? "Working..." : primaryLabel}
        </button>
      </div>
    </section>
  );
}
