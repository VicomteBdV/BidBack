type ModeBadgeVariant = "read-only" | "local-dev" | "wallet-signed";

const modeBadgeStyles: Record<ModeBadgeVariant, string> = {
  "read-only": "border-slate-500/40 bg-slate-500/10 text-slate-200",
  "local-dev": "border-amber-400/40 bg-amber-400/10 text-amber-100",
  "wallet-signed": "border-cyan-400/40 bg-cyan-400/10 text-cyan-100"
};

const modeBadgeLabels: Record<ModeBadgeVariant, string> = {
  "read-only": "Read-only",
  "local-dev": "Local dev only",
  "wallet-signed": "Wallet-signed"
};

export function ModeBadge({ variant, label }: { variant: ModeBadgeVariant; label?: string }) {
  return (
    <span
      className={`inline-flex min-h-7 items-center rounded-md border px-2.5 text-xs font-semibold uppercase tracking-wide ${modeBadgeStyles[variant]}`}
    >
      {label ?? modeBadgeLabels[variant]}
    </span>
  );
}