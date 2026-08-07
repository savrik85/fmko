"use client";

/**
 * Jeden vodorovný pruh rozdělený na části — podíl na celku (např. výhry/remízy/prohry
 * nebo doma/venku). Segmenty odděluje 2px mezera v barvě podkladu, ne obrys.
 *
 * Popisek se do segmentu píše jen když se tam vejde; jinak ho nese legenda.
 */

import { SURFACE, inkOn } from "./palette";
import { ChartLegend, type LegendItem } from "./chart-shell";

export interface StackSegment {
  label: string;
  value: number;
  color: string;
}

export function StackedBar({
  segments,
  height = 28,
  showLegend = true,
  /** Minimální podíl (v %), při kterém se hodnota vypíše dovnitř segmentu. */
  inlineLabelThreshold = 12,
  formatValue = (v: number) => v.toLocaleString("cs"),
}: {
  segments: StackSegment[];
  height?: number;
  showLegend?: boolean;
  inlineLabelThreshold?: number;
  formatValue?: (v: number) => string;
}) {
  const total = segments.reduce((s, x) => s + x.value, 0);
  const visible = segments.filter((s) => s.value > 0);
  const legend: LegendItem[] = segments.map((s) => ({ label: s.label, color: s.color, value: formatValue(s.value) }));

  if (total <= 0) {
    return (
      <div className="rounded-md" style={{ height, background: "#EFEBE3" }} />
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex rounded-md overflow-hidden" style={{ height, gap: 2, background: SURFACE }}>
        {visible.map((s) => {
          const pct = (s.value / total) * 100;
          return (
            <div
              key={s.label}
              className="flex items-center justify-center first:rounded-l-md last:rounded-r-md"
              style={{ width: `${pct}%`, background: s.color }}
              title={`${s.label}: ${formatValue(s.value)}`}
            >
              {pct >= inlineLabelThreshold && (
                <span
                  className="font-heading font-bold text-sm tabular-nums px-1"
                  style={{ color: inkOn(s.color) }}
                >
                  {formatValue(s.value)}
                </span>
              )}
            </div>
          );
        })}
      </div>
      {showLegend && <ChartLegend items={legend} />}
    </div>
  );
}
