import React, { type ReactNode } from "react";

type SectionTone = "default" | "warning" | "info";

const toneClasses: Record<SectionTone, string> = {
  default: "border-slate-800 bg-slate-900",
  warning: "border-amber-400/30 bg-amber-400/10",
  info: "border-cyan-400/30 bg-cyan-400/10"
};

export function SectionCard({
  title,
  description,
  badges,
  actions,
  children,
  tone = "default",
  className = "",
  bodyClassName = "mt-5",
  headingLevel = 2
}: {
  title: string;
  description?: ReactNode;
  badges?: ReactNode;
  actions?: ReactNode;
  children?: ReactNode;
  tone?: SectionTone;
  className?: string;
  bodyClassName?: string;
  headingLevel?: 2 | 3;
}) {
  const Heading = headingLevel === 3 ? "h3" : "h2";

  return (
    <section className={`min-w-0 rounded-lg border p-4 sm:p-5 ${toneClasses[tone]} ${className}`}>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-3">
            <Heading className={`${headingLevel === 3 ? "text-base" : "text-xl"} break-words font-semibold text-white`}>
              {title}
            </Heading>
            {badges}
          </div>
          {description ? <div className="mt-2 max-w-3xl text-sm leading-6 text-slate-400">{description}</div> : null}
        </div>
        {actions ? <div className="w-full min-w-0 sm:w-auto sm:shrink-0">{actions}</div> : null}
      </div>

      {children ? <div className={bodyClassName}>{children}</div> : null}
    </section>
  );
}
