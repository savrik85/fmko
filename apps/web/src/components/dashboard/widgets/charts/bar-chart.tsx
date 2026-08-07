"use client";

/**
 * Svislé sloupce — jedna nebo dvě série vedle sebe (např. vstřelené vs. inkasované).
 *
 * Sloupec roste ze společné základny, cap zaoblený 4px, základna hranatá.
 * Šířka je omezená (max 24px), zbytek pásma zůstává vzduchem. Sousední sloupce
 * odděluje 2px mezera v barvě podkladu — ne obrys.
 */

import { PRIMARY, GRID, compact } from "./palette";

export interface BarSeries {
  label: string;
  color: string;
  values: number[];
}

export function BarChart({
  categories,
  series,
  height = 120,
  formatValue = compact,
  /** Popisky pod sloupci. Když je kategorií moc, vypíše se jen každá n-tá. */
  labelEvery,
}: {
  categories: string[];
  series: BarSeries[];
  height?: number;
  formatValue?: (v: number) => string;
  labelEvery?: number;
}) {
  const all = series.flatMap((s) => s.values);
  const max = Math.max(...all, 1);
  const step = labelEvery ?? (categories.length > 12 ? Math.ceil(categories.length / 6) : 1);

  return (
    <div>
      <div className="flex items-end gap-[2px]" style={{ height }}>
        {categories.map((cat, i) => (
          <div key={`${cat}-${i}`} className="flex-1 min-w-0 h-full flex items-end justify-center gap-[2px]">
            {series.map((s) => {
              const v = s.values[i] ?? 0;
              const pct = (v / max) * 100;
              return (
                <div
                  key={s.label}
                  className="relative h-full flex items-end"
                  style={{ width: `${100 / series.length}%`, maxWidth: 24 }}
                >
                  <div
                    className="w-full rounded-t-[4px] transition-[height] duration-300"
                    style={{ height: `${Math.max(pct, v > 0 ? 2 : 0)}%`, background: s.color, minHeight: v > 0 ? 2 : 0 }}
                    title={`${cat} · ${s.label}: ${formatValue(v)}`}
                  />
                </div>
              );
            })}
          </div>
        ))}
      </div>
      <div className="h-px w-full" style={{ background: GRID }} />
      <div className="flex gap-[2px] mt-1">
        {categories.map((cat, i) => (
          <div key={`${cat}-lbl-${i}`} className="flex-1 min-w-0 text-center text-[11px] text-muted tabular-nums truncate">
            {i % step === 0 ? cat : ""}
          </div>
        ))}
      </div>
    </div>
  );
}

/** Jednoduchá varianta pro jednu sérii v hlavním odstínu. */
export function SimpleBarChart(props: {
  categories: string[];
  values: number[];
  label: string;
  height?: number;
  color?: string;
  formatValue?: (v: number) => string;
}) {
  const { categories, values, label, height, color, formatValue } = props;
  return (
    <BarChart
      categories={categories}
      series={[{ label, color: color ?? PRIMARY, values }]}
      height={height}
      formatValue={formatValue}
    />
  );
}
