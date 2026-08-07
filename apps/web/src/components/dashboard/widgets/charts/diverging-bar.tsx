"use client";

/**
 * Rozbíhavé pruhy kolem nuly — polarita (přibylo vs. ubylo), ne identita.
 * Obě poloviny sdílejí jednu škálu, aby se daly porovnat napříč řádky.
 */

import { DIVERGING, GRID } from "./palette";

export interface DivergingDatum {
  label: string;
  positive: number;
  negative: number;
}

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
      <div className="flex text-[11px] text-muted uppercase tracking-wide">
        <span className="flex-1 text-right pr-1">{negativeLabel}</span>
        <span className="w-[76px] shrink-0" />
        <span className="flex-1 pl-1">{positiveLabel}</span>
      </div>

      <ul className="space-y-1.5">
        {data.map((d) => (
          <li key={d.label} className="flex items-center">
            {/* Záporná polovina — roste doleva od středové osy */}
            <div className="flex-1 flex items-center justify-end gap-1.5">
              {d.negative > 0 && <span className="text-sm tabular-nums text-muted shrink-0">{d.negative}</span>}
              <div className="flex-1 flex justify-end">
                <div
                  className="h-2 rounded-l-[4px]"
                  style={{ width: `${(d.negative / max) * 100}%`, background: DIVERGING.negative }}
                  title={`${d.label} — ${negativeLabel}: ${d.negative}`}
                />
              </div>
            </div>

            <span className="w-[76px] shrink-0 text-center text-sm truncate px-1" style={{ borderLeft: `1px solid ${GRID}`, borderRight: `1px solid ${GRID}` }}>
              {d.label}
            </span>

            {/* Kladná polovina — roste doprava */}
            <div className="flex-1 flex items-center gap-1.5">
              <div className="flex-1">
                <div
                  className="h-2 rounded-r-[4px]"
                  style={{ width: `${(d.positive / max) * 100}%`, background: DIVERGING.positive }}
                  title={`${d.label} — ${positiveLabel}: ${d.positive}`}
                />
              </div>
              {d.positive > 0 && <span className="text-sm tabular-nums text-muted shrink-0">{d.positive}</span>}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
