"use client";

/**
 * Rozbíhavé pruhy kolem nuly — polarita (přibylo vs. ubylo), ne identita.
 * Obě poloviny sdílejí jednu škálu, aby se daly porovnat napříč řádky.
 *
 * Sloupce mají pevnou šířku (hodnota — dráha — popisek — dráha — hodnota),
 * takže hlavička sedí přesně nad svou polovinou i když některé řádky nulu nemají.
 */

import { DIVERGING, GRID } from "./palette";

export interface DivergingDatum {
  label: string;
  positive: number;
  negative: number;
}

const VALUE_COL = "w-6";
const LABEL_COL = "w-[84px]";

export function DivergingBar({
  data,
  positiveLabel,
  negativeLabel,
}: {
  data: DivergingDatum[];
  positiveLabel: string;
  negativeLabel: string;
}) {
  const max = Math.max(...data.flatMap((d) => [d.positive, d.negative]), 1);

  return (
    <div className="space-y-2">
      <div className="flex items-center text-[11px] text-muted uppercase tracking-wide">
        <span className={`${VALUE_COL} shrink-0`} />
        <span className="flex-1 text-right pr-1">{negativeLabel}</span>
        <span className={`${LABEL_COL} shrink-0`} />
        <span className="flex-1 pl-1">{positiveLabel}</span>
        <span className={`${VALUE_COL} shrink-0`} />
      </div>

      <ul className="space-y-1.5">
        {data.map((d) => (
          <li key={d.label} className="flex items-center">
            <span className={`${VALUE_COL} shrink-0 text-right text-sm tabular-nums text-muted pr-1`}>
              {d.negative > 0 ? d.negative : ""}
            </span>
            <span className="flex-1 flex justify-end">
              <span
                className="h-2 rounded-l-[4px] block"
                style={{ width: `${(d.negative / max) * 100}%`, background: DIVERGING.negative }}
                title={`${d.label} — ${negativeLabel}: ${d.negative}`}
              />
            </span>

            <span
              className={`${LABEL_COL} shrink-0 text-center text-sm truncate px-1.5`}
              style={{ borderLeft: `1px solid ${GRID}`, borderRight: `1px solid ${GRID}` }}
            >
              {d.label}
            </span>

            <span className="flex-1">
              <span
                className="h-2 rounded-r-[4px] block"
                style={{ width: `${(d.positive / max) * 100}%`, background: DIVERGING.positive }}
                title={`${d.label} — ${positiveLabel}: ${d.positive}`}
              />
            </span>
            <span className={`${VALUE_COL} shrink-0 text-sm tabular-nums text-muted pl-1`}>
              {d.positive > 0 ? d.positive : ""}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
