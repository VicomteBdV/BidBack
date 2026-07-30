import React, { type ReactNode } from "react";

type StateNoticeTone = "loading" | "info" | "warning" | "error";

const toneClasses: Record<StateNoticeTone, string> = {
  loading: "border-cyan-400/30 bg-cyan-400/10 text-cyan-50",
  info: "border-slate-700 bg-slate-950 text-slate-200",
  warning: "border-amber-400/40 bg-amber-400/10 text-amber-50",
  error: "border-rose-400/40 bg-rose-400/10 text-rose-50"
};

const toneLabels: Record<StateNoticeTone, string> = {
  loading: "Loading",
  info: "Information",
  warning: "Notice",
  error: "Error"
};

export function StateNotice({
  tone = "info",
  title,
  children,
  action,
  id,
  className = ""
}: {
  tone?: StateNoticeTone;
  title?: string;
  children: ReactNode;
  action?: ReactNode;
  id?: string;
  className?: string;
}) {
  const isError = tone === "error";

  return (
    <div
      role={isError ? "alert" : "status"}
      id={id}
      aria-live={isError ? "assertive" : "polite"}
      aria-atomic="true"
      className={`min-w-0 rounded-md border px-4 py-3 text-sm leading-6 ${toneClasses[tone]} ${className}`}
    >
      <div className="text-xs font-semibold uppercase tracking-wide opacity-80">{toneLabels[tone]}</div>
      {title ? <div className="mt-1 font-semibold text-white">{title}</div> : null}
      <div className="mt-1 break-words">{children}</div>
      {action ? <div className="mt-3 flex flex-wrap gap-2">{action}</div> : null}
    </div>
  );
}
