"use client";

/**
 * Radar — profil na 5–8 osách se společnou škálou (typicky 0–100).
 * Pro dvě série (porovnání) nese identitu legenda, ne jen barva výplně.
 */

import { GRID, seriesColor } from "./palette";
import { ChartLegend, type LegendItem } from "./chart-shell";

export interface RadarSeries {
  label: string;
  color?: string;
  /** Hodnoty ve stejném pořadí jako osy. */
  values: number[];
}

// Plátno je širší než vysoké schválně — popisky os po stranách jsou nejdelší
// a při čtvercovém viewBoxu se ořezávaly.
const W = 260;
const H = 190;
const R = 58;

export function RadarChart({
  axes,
  series,
  max = 100,
}: {
  axes: string[];
  series: RadarSeries[];
  max?: number;
}) {
  const cx = W / 2;
  const cy = H / 2;
  const n = axes.length;
  if (n < 3) return null;

  const point = (i: number, ratio: number) => {
    const angle = (Math.PI * 2 * i) / n - Math.PI / 2;
    return [cx + Math.cos(angle) * R * ratio, cy + Math.sin(angle) * R * ratio] as const;
  };

  const rings = [0.25, 0.5, 0.75, 1];
  const legend: LegendItem[] = series.map((s, i) => ({ label: s.label, color: s.color ?? seriesColor(i) }));

  return (
    <div className="space-y-2">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        preserveAspectRatio="xMidYMid meet"
        className="w-full max-w-[280px] mx-auto block"
        role="img"
        aria-label={axes.join(", ")}
      >
        {/* Pavučina — vlasová, potlačená */}
        {rings.map((r) => (
          <polygon
            key={r}
            points={axes.map((_, i) => point(i, r).join(",")).join(" ")}
            fill="none"
            stroke={GRID}
            strokeWidth="1"
          />
        ))}
        {axes.map((_, i) => {
          const [x, y] = point(i, 1);
          return <line key={i} x1={cx} y1={cy} x2={x} y2={y} stroke={GRID} strokeWidth="1" />;
        })}

        {series.map((s, si) => {
          const color = s.color ?? seriesColor(si);
          const pts = s.values.map((v, i) => point(i, Math.max(0, Math.min(1, v / max))).join(",")).join(" ");
          return (
            <g key={s.label}>
              <polygon points={pts} fill={color} fillOpacity="0.12" stroke={color} strokeWidth="2" strokeLinejoin="round" />
              {s.values.map((v, i) => {
                const [x, y] = point(i, Math.max(0, Math.min(1, v / max)));
                return (
                  <circle key={i} cx={x} cy={y} r="3" fill={color} stroke="#FFFFFF" strokeWidth="2">
                    <title>{`${axes[i]}${series.length > 1 ? ` · ${s.label}` : ""}: ${Math.round(v)}`}</title>
                  </circle>
                );
              })}
            </g>
          );
        })}

        {/* Popisky os — textovým tokenem, nikdy barvou série */}
        {axes.map((a, i) => {
          const [x, y] = point(i, 1.24);
          return (
            <text
              key={a}
              x={x}
              y={y + 3}
              textAnchor={x > cx + 4 ? "start" : x < cx - 4 ? "end" : "middle"}
              fontSize="10"
              fill="#8B8578"
            >
              {a}
            </text>
          );
        })}
      </svg>

      <ChartLegend items={legend} className="justify-center" />
    </div>
  );
}
