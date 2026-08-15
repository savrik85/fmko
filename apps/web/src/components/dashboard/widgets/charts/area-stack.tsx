"use client";

/**
 * Skládaná plocha — vývoj složení celku v čase (např. tvrdé jádro / stálí /
 * příležitostní fanoušci). Vrstvy se sčítají odspodu, každá nese barvu z
 * kategorické palety a je doprovozená legendou.
 */

import { GRID, seriesColor, compact } from "./palette";
import { ChartLegend, type LegendItem } from "./chart-shell";

export interface AreaLayer {
  label: string;
  color?: string;
  points: number[];
}

const W = 320;
const H = 130;
const PAD_L = 42;
const PAD_R = 10;
const PAD_T = 10;
const PAD_B = 16;

export function AreaStack({
  layers,
  labels,
  height = 150,
  formatValue = compact,
}: {
  layers: AreaLayer[];
  labels?: string[];
  height?: number;
  formatValue?: (v: number) => string;
}) {
  const len = Math.max(...layers.map((l) => l.points.length), 0);
  if (len === 0) return null;

  // Kumulativní horní hrany jednotlivých vrstev
  const cumulative: number[][] = [];
  for (let li = 0; li < layers.length; li++) {
    const prev = cumulative[li - 1];
    cumulative.push(
      Array.from({ length: len }, (_, i) => (prev?.[i] ?? 0) + (layers[li].points[i] ?? 0)),
    );
  }
  const maxV = Math.max(...cumulative[cumulative.length - 1], 1);

  const plotW = W - PAD_L - PAD_R;
  const plotH = H - PAD_T - PAD_B;
  const toX = (i: number) => PAD_L + (len > 1 ? (i / (len - 1)) * plotW : plotW / 2);
  const toY = (v: number) => PAD_T + (1 - v / maxV) * plotH;

  const legend: LegendItem[] = layers.map((l, i) => ({ label: l.label, color: l.color ?? seriesColor(i) }));

  return (
    <div className="space-y-2">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        preserveAspectRatio="xMidYMid meet"
        className="w-full"
        style={{ height }}
        role="img"
        aria-label={layers.map((l) => l.label).join(", ")}
      >
        <line x1={PAD_L} y1={toY(maxV)} x2={W - PAD_R} y2={toY(maxV)} stroke={GRID} strokeWidth="1" />
        <line x1={PAD_L} y1={toY(0)} x2={W - PAD_R} y2={toY(0)} stroke={GRID} strokeWidth="1" />
        <text x={PAD_L - 5} y={toY(maxV) + 3} textAnchor="end" fontSize="9" fill="#8B8578">{formatValue(maxV)}</text>
        <text x={PAD_L - 5} y={toY(0) + 3} textAnchor="end" fontSize="9" fill="#8B8578">0</text>

        {layers.map((l, li) => {
          const color = l.color ?? seriesColor(li);
          const upper = cumulative[li];
          const lower = li > 0 ? cumulative[li - 1] : Array.from({ length: len }, () => 0);
          const top = upper.map((v, i) => `${i === 0 ? "M" : "L"} ${toX(i).toFixed(2)} ${toY(v).toFixed(2)}`).join(" ");
          const bottom = [...lower].reverse().map((v, i) => `L ${toX(len - 1 - i).toFixed(2)} ${toY(v).toFixed(2)}`).join(" ");
          return (
            <path key={l.label} d={`${top} ${bottom} Z`} fill={color} fillOpacity="0.85">
              <title>{`${l.label}: ${formatValue(l.points[len - 1] ?? 0)}`}</title>
            </path>
          );
        })}
      </svg>

      {labels && labels.length > 1 && (
        <div className="flex justify-between text-micro text-muted" style={{ paddingLeft: `${(PAD_L / W) * 100}%` }}>
          <span>{labels[0]}</span>
          <span>{labels[labels.length - 1]}</span>
        </div>
      )}

      <ChartLegend items={legend} />
    </div>
  );
}
