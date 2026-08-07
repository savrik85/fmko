"use client";

/**
 * Spojnicový graf — vývoj v čase, jedna až tři série.
 *
 * SVG se škáluje rovnoměrně (preserveAspectRatio meet), takže značky zůstávají
 * kulaté a tloušťky sedí. Volitelná nulová osa obarví plochu nad/pod nulou
 * divergentně — používá se u rozpočtu, kde je znaménko podstatné.
 */

import { useId } from "react";
import { PRIMARY, GRID, NEUTRAL, SURFACE, DIVERGING, compact, niceTicks } from "./palette";
import { ChartLegend, type LegendItem } from "./chart-shell";

export interface LineSeries {
  label: string;
  color?: string;
  points: number[];
}

const W = 320;
const H = 130;
const PAD_L = 42;
const PAD_R = 10;
const PAD_T = 10;
const PAD_B = 20;

export function LineChart({
  series,
  labels,
  formatValue = compact,
  /** Vykreslit nulovou osu a obarvit plochu podle znaménka. */
  zeroBaseline = false,
  /** Vyplnit plochu pod křivkou (jen pro jednu sérii). */
  fill = true,
  height = 150,
}: {
  series: LineSeries[];
  /** Popisky bodů — použijí se v tooltipu a pro krajní popisky osy X. */
  labels?: string[];
  formatValue?: (v: number) => string;
  zeroBaseline?: boolean;
  fill?: boolean;
  height?: number;
}) {
  const uid = useId().replace(/:/g, "");
  const all = series.flatMap((s) => s.points);
  if (all.length === 0) return null;

  const rawMin = Math.min(...all, zeroBaseline ? 0 : Infinity);
  const rawMax = Math.max(...all, zeroBaseline ? 0 : -Infinity);
  const ticks = niceTicks(rawMin, rawMax);
  const minV = Math.min(...ticks, rawMin);
  const maxV = Math.max(...ticks, rawMax);
  const range = Math.max(1e-6, maxV - minV);

  const plotW = W - PAD_L - PAD_R;
  const plotH = H - PAD_T - PAD_B;
  const toY = (v: number) => PAD_T + ((maxV - v) / range) * plotH;
  const toX = (i: number, len: number) => PAD_L + (len > 1 ? (i / (len - 1)) * plotW : plotW / 2);
  const zeroY = toY(0);

  const legend: LegendItem[] = series.map((s) => ({ label: s.label, color: s.color ?? PRIMARY }));
  const singleFill = fill && series.length === 1;

  return (
    <div className="space-y-2">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        preserveAspectRatio="xMidYMid meet"
        className="w-full"
        style={{ height }}
        role="img"
        aria-label={series.map((s) => s.label).join(", ")}
      >
        <defs>
          <linearGradient id={`ln-pos-${uid}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={DIVERGING.positive} stopOpacity="0.18" />
            <stop offset="100%" stopColor={DIVERGING.positive} stopOpacity="0" />
          </linearGradient>
          <linearGradient id={`ln-neg-${uid}`} x1="0" y1="1" x2="0" y2="0">
            <stop offset="0%" stopColor={DIVERGING.negative} stopOpacity="0.22" />
            <stop offset="100%" stopColor={DIVERGING.negative} stopOpacity="0" />
          </linearGradient>
          <clipPath id={`ln-above-${uid}`}>
            <rect x="0" y="0" width={W} height={Math.max(0, Math.min(H, zeroY))} />
          </clipPath>
          <clipPath id={`ln-below-${uid}`}>
            <rect x="0" y={Math.max(0, Math.min(H, zeroY))} width={W} height={Math.max(0, H - zeroY)} />
          </clipPath>
        </defs>

        {/* Mřížka — vlasová, plná, potlačená */}
        {ticks.map((t) => (
          <g key={t}>
            <line x1={PAD_L} y1={toY(t)} x2={W - PAD_R} y2={toY(t)} stroke={GRID} strokeWidth="1" />
            <text x={PAD_L - 5} y={toY(t) + 3} textAnchor="end" fontSize="9" fill="#8B8578" style={{ fontVariantNumeric: "tabular-nums" }}>
              {formatValue(t)}
            </text>
          </g>
        ))}

        {zeroBaseline && zeroY > PAD_T && zeroY < H - PAD_B && (
          <line x1={PAD_L} y1={zeroY} x2={W - PAD_R} y2={zeroY} stroke={NEUTRAL} strokeWidth="1" />
        )}

        {series.map((s) => {
          const color = s.color ?? PRIMARY;
          const len = s.points.length;
          const d = s.points.map((v, i) => `${i === 0 ? "M" : "L"} ${toX(i, len).toFixed(2)} ${toY(v).toFixed(2)}`).join(" ");
          const areaD = `${d} L ${toX(len - 1, len).toFixed(2)} ${(H - PAD_B).toFixed(2)} L ${PAD_L} ${(H - PAD_B).toFixed(2)} Z`;
          return (
            <g key={s.label}>
              {singleFill && (zeroBaseline ? (
                <>
                  <path d={areaD} fill={`url(#ln-pos-${uid})`} clipPath={`url(#ln-above-${uid})`} />
                  <path d={areaD} fill={`url(#ln-neg-${uid})`} clipPath={`url(#ln-below-${uid})`} />
                </>
              ) : (
                <path d={areaD} fill={color} fillOpacity="0.1" />
              ))}
              <path d={d} fill="none" stroke={color} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
              {/* Koncová značka — 8px včetně prstence v barvě podkladu */}
              {len > 0 && (
                <circle
                  cx={toX(len - 1, len)}
                  cy={toY(s.points[len - 1])}
                  r="4"
                  fill={color}
                  stroke={SURFACE}
                  strokeWidth="2"
                />
              )}
              {/* Průhledné terče pro tooltip — větší než značka */}
              {s.points.map((v, i) => (
                <circle key={i} cx={toX(i, len)} cy={toY(v)} r="7" fill="transparent">
                  <title>{`${labels?.[i] ?? `#${i + 1}`}${series.length > 1 ? ` · ${s.label}` : ""}: ${formatValue(v)}`}</title>
                </circle>
              ))}
            </g>
          );
        })}
      </svg>

      {labels && labels.length > 1 && (
        <div className="flex justify-between text-[11px] text-muted px-1" style={{ paddingLeft: `${(PAD_L / W) * 100}%` }}>
          <span>{labels[0]}</span>
          <span>{labels[labels.length - 1]}</span>
        </div>
      )}

      <ChartLegend items={legend} />
    </div>
  );
}
