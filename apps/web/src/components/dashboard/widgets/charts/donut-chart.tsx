"use client";

/**
 * Prstencový graf — podíl na celku u 2–6 částí s vlastní identitou.
 * Nad šest částí to přestává jít číst; volající má zbytek složit do „Ostatní".
 *
 * Segmenty odděluje 2px mezera v barvě podkladu (ne obrys), uprostřed stojí
 * hlavní číslo. Identitu vždy nese legenda, nikdy jen barva.
 */

import { seriesColor } from "./palette";
import { ChartLegend, type LegendItem } from "./chart-shell";

export interface DonutSlice {
  label: string;
  value: number;
  color?: string;
}

const SIZE = 120;
const R = 48;
const THICKNESS = 18;
const CIRCUMFERENCE = 2 * Math.PI * R;

export function DonutChart({
  slices,
  centerValue,
  centerLabel,
  size = 130,
  formatValue = (v: number) => v.toLocaleString("cs"),
}: {
  slices: DonutSlice[];
  centerValue?: string;
  centerLabel?: string;
  size?: number;
  formatValue?: (v: number) => string;
}) {
  const colored = slices.map((s, i) => ({ ...s, color: s.color ?? seriesColor(i) }));
  const visible = colored.filter((s) => s.value > 0);
  const total = visible.reduce((s, x) => s + x.value, 0);
  const legend: LegendItem[] = colored.map((s) => ({ label: s.label, color: s.color, value: formatValue(s.value) }));

  const c = SIZE / 2;
  const gap = visible.length > 1 ? 2 : 0;

  let offset = 0;
  const arcs = visible.map((s) => {
    const arc = (s.value / total) * CIRCUMFERENCE;
    const dash = Math.max(0.5, arc - gap);
    const node = { slice: s, dash, offset, share: Math.round((s.value / total) * 100) };
    offset += arc;
    return node;
  });

  return (
    <div className="flex items-center gap-4 flex-wrap">
      <svg
        viewBox={`0 0 ${SIZE} ${SIZE}`}
        preserveAspectRatio="xMidYMid meet"
        style={{ width: size, height: size }}
        className="shrink-0"
        role="img"
        aria-label={slices.map((s) => `${s.label}: ${s.value}`).join(", ")}
      >
        <circle cx={c} cy={c} r={R} fill="none" stroke="#EFEBE3" strokeWidth={THICKNESS} />
        {total > 0 && arcs.map(({ slice, dash, offset: off, share }) => (
          <circle
            key={slice.label}
            cx={c}
            cy={c}
            r={R}
            fill="none"
            stroke={slice.color}
            strokeWidth={THICKNESS}
            strokeDasharray={`${dash} ${CIRCUMFERENCE - dash}`}
            strokeDashoffset={-off}
            transform={`rotate(-90 ${c} ${c})`}
          >
            <title>{`${slice.label}: ${formatValue(slice.value)} (${share} %)`}</title>
          </circle>
        ))}
        {centerValue && (
          <text
            x={c}
            y={centerLabel ? c + 1 : c + 5}
            textAnchor="middle"
            fontSize="19"
            fontWeight="800"
            fill="#1A1714"
            style={{ fontFamily: "var(--font-heading)" }}
          >
            {centerValue}
          </text>
        )}
        {centerLabel && (
          <text x={c} y={c + 15} textAnchor="middle" fontSize="9" fill="#8B8578">{centerLabel}</text>
        )}
      </svg>

      <div className="min-w-0 flex-1">
        <ChartLegend items={legend} className="flex-col !gap-y-1.5" />
      </div>
    </div>
  );
}
