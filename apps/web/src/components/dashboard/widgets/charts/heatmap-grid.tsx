"use client";

/**
 * Mřížka barevných políček — celá sezóna na ploše jedné nízké karty.
 *
 * Políčka jsou čtvercová a oddělená mezerou v barvě podkladu; hodnotu nese
 * barva, popisek visí v tooltipu. Legenda je povinná, protože samotné barvy
 * bez ní neřeknou nic.
 */

import type { ReactNode } from "react";
import { ChartLegend, type LegendItem } from "./chart-shell";

export interface HeatCell {
  key: string;
  color: string;
  /** Krátký text do políčka; vejde se jeden až dva znaky. */
  text?: string;
  textColor?: string;
  tooltip: string;
  href?: string;
  /**
   * Obrysová varianta — barva jde do rámečku a textu místo do výplně.
   * Slouží k zakódování druhé, nezávislé vlastnosti tvarem, aby políčko
   * neneslo dvě informace jen barvou. Červenozelený rozdíl je pro zhruba
   * 6 % mužů nerozeznatelný a samotná barva by tam pak nenesla nic.
   */
  outline?: boolean;
}

export function HeatmapGrid({
  cells,
  columns = 10,
  legend,
  note,
}: {
  cells: HeatCell[];
  columns?: number;
  legend?: LegendItem[];
  note?: ReactNode;
}) {
  return (
    <div className="space-y-2">
      <div className="grid gap-1" style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}>
        {cells.map((c) => {
          const obsah = (
            <span
              className="aspect-square rounded-[4px] flex items-center justify-center text-micro font-heading font-bold"
              style={c.outline
                ? { background: "transparent", color: c.color, boxShadow: `inset 0 0 0 2px ${c.color}` }
                : { background: c.color, color: c.textColor ?? "#FFFFFF" }}
              title={c.tooltip}
            >
              {c.text}
            </span>
          );
          return c.href
            ? <a key={c.key} href={c.href} className="block hover:opacity-80 transition-opacity">{obsah}</a>
            : <span key={c.key} className="block">{obsah}</span>;
        })}
      </div>
      {legend && <ChartLegend items={legend} />}
      {note && <div className="text-sm text-muted text-center">{note}</div>}
    </div>
  );
}
