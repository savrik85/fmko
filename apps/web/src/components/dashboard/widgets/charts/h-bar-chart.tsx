"use client";

/**
 * Vodorovné pruhy — žebříčky a porovnání velikostí u položek s dlouhými názvy.
 *
 * Pruh roste od společné základny vlevo, konec je zaoblený (4px), základna
 * hranatá. Barva ve výchozím stavu nenese identitu (jeden odstín) — kategorickou
 * paletu použij jen tam, kde JSOU série předmětem sdělení.
 */

import type { ReactNode } from "react";
import { PRIMARY, GRID } from "./palette";

export interface HBarDatum {
  label: string;
  value: number;
  /** Text u špičky pruhu. Když chybí, vypíše se hodnota. */
  display?: string;
  color?: string;
  /** Odkaz na detail — jméno hráče/týmu má být klikatelné. */
  href?: string;
  /** Volitelný uzel před popiskem (pořadí, erb). */
  prefix?: ReactNode;
}

export function HBarChart({
  data,
  max,
  showTrack = true,
}: {
  data: HBarDatum[];
  /** Horní mez škály. Bez ní se bere největší hodnota. */
  max?: number;
  showTrack?: boolean;
}) {
  const top = max ?? Math.max(...data.map((d) => d.value), 1);

  return (
    <ul className="space-y-2">
      {data.map((d) => {
        const pct = top > 0 ? Math.max(0, Math.min(100, (d.value / top) * 100)) : 0;
        const color = d.color ?? PRIMARY;
        const label = (
          <span className="text-sm truncate">{d.label}</span>
        );
        return (
          <li key={d.label}>
            <div className="flex items-baseline gap-2 mb-1">
              {d.prefix}
              {d.href ? (
                <a href={d.href} className="min-w-0 flex-1 hover:text-pitch-500 transition-colors hover:underline">{label}</a>
              ) : (
                <span className="min-w-0 flex-1">{label}</span>
              )}
              <span className="text-sm font-heading font-bold tabular-nums shrink-0">
                {d.display ?? d.value.toLocaleString("cs")}
              </span>
            </div>
            <div
              className="h-2 rounded-r-[4px] overflow-hidden"
              style={{ background: showTrack ? GRID : "transparent" }}
            >
              <div
                className="h-full rounded-r-[4px] transition-[width] duration-300"
                style={{ width: `${pct}%`, background: color }}
              />
            </div>
          </li>
        );
      })}
    </ul>
  );
}
