import React, { type ReactNode } from "react";

type EmptyStateTone = "default" | "warning" | "info";

const toneClasses: Record<EmptyStateTone, string> = {
  default: "border-slate-800 bg-slate-950 text-slate-300",
  warning: "border-amber-400/40 bg-amber-400/10 text-amber-100",
  info: "border-cyan-400/30 bg-cyan-400/10 text-cyan-100"
};

export function EmptyState({
  title,
  children,
  tone = "default",
  className = ""
}: {
  title?: string;
  children: ReactNode;
  tone?: EmptyStateTone;
  className?: string;
}) {
  return (
    <div className={`min-w-0 rounded-md border px-4 py-4 text-sm leading-6 ${toneClasses[tone]} ${className}`}>
      {title ? <p className="font-semibold text-white">{title}</p> : null}
      <div className={`${title ? "mt-1" : ""} break-words`}>{children}</div>
    </div>
  );
}
