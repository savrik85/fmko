import type { ReactNode } from "react";

/**
 * Malé rozbalení uvnitř karty („Podrobnosti“, „Co která volba znamená“). Stojí na
 * `<details>`, takže funguje i bez JavaScriptu. Šipka ▾ je stejná jako u `CollapsibleCard`.
 * Celou kartu, která jde sbalit, dělá `CollapsibleCard`, ne tohle.
 */
export function Disclosure({ summary, children, defaultOpen = false, className = "" }: {
  summary: ReactNode;
  children: ReactNode;
  defaultOpen?: boolean;
  className?: string;
}) {
  return (
    <details className={`group ${className}`} open={defaultOpen || undefined}>
      <summary className="flex items-center justify-between gap-2 py-1.5 cursor-pointer list-none text-meta font-bold text-ink-light [&::-webkit-details-marker]:hidden">
        <span className="min-w-0">{summary}</span>
        <span className="text-muted shrink-0 transition-transform group-open:rotate-180" aria-hidden="true">▾</span>
      </summary>
      <div className="pb-1.5 text-meta text-ink-light">{children}</div>
    </details>
  );
}
