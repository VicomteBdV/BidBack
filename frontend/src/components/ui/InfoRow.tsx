import React, { type ReactNode } from "react";

type InfoRowTone = "default" | "accent" | "warning";

const toneClasses: Record<InfoRowTone, string> = {
  default: "border-slate-800 bg-slate-950 text-slate-200",
  accent: "border-cyan-400/30 bg-cyan-400/10 text-cyan-100",
  warning: "border-amber-400/30 bg-amber-400/10 text-amber-100"
};

export function InfoRow({
  label,
  value,
  detail,
  mono = false,
  tone = "default",
  className = ""
}: {
  label: string;
  value: ReactNode;
  detail?: ReactNode;
  mono?: boolean;
  tone?: InfoRowTone;
  className?: string;
}) {
  return (
    <div className={`rounded-md border px-4 py-3 ${toneClasses[tone]} ${className}`}>
      <div className="text-xs text-slate-500">{label}</div>
      <div className={`mt-1 break-all text-sm ${mono ? "font-mono" : ""}`}>{value}</div>
      {detail ? <div className="mt-2 text-xs leading-5 text-slate-500">{detail}</div> : null}
    </div>
  );
}
