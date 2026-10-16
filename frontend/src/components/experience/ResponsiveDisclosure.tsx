"use client";

import React, { useEffect, useState, type ReactNode } from "react";

/** One native disclosure and one control set, expanded for the desktop composition. */
export function ResponsiveDisclosure({
  summary,
  summaryLabel,
  className = "",
  children
}: {
  summary: ReactNode;
  summaryLabel?: string;
  className?: string;
  children: ReactNode;
}) {
  const [wide, setWide] = useState(false);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    if (typeof window.matchMedia !== "function") {
      setWide(true);
      return;
    }
    const media = window.matchMedia("(min-width: 1024px)");
    const update = () => setWide(media.matches);
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);

  return (
    <details
      className={`responsive-disclosure ${className}`}
      open={wide || expanded}
      onToggle={(event) => {
        if (!wide) setExpanded(event.currentTarget.open);
      }}
    >
      <summary aria-label={summaryLabel}>
        {summary}
        <span className="responsive-disclosure-marker" aria-hidden="true">+</span>
      </summary>
      <div className="responsive-disclosure-body">{children}</div>
    </details>
  );
}
