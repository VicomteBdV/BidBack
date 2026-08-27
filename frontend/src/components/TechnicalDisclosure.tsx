import React from "react";

export function TechnicalDisclosure({
  summary,
  description,
  children,
  className = ""
}: {
  summary: string;
  description?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <details className={`technical-disclosure ${className}`}>
      <summary>{summary}</summary>
      <div className="technical-disclosure-body">
        {description ? <p className="mb-4 max-w-3xl text-sm leading-6 text-slate-400">{description}</p> : null}
        {children}
      </div>
    </details>
  );
}
