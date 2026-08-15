"use client";

/**
 * Bodový graf s kvadranty.
 *
 * Dvě čísla na hráče najednou — třeba věk a rating. Dělicí čáry rozřežou plochu
 * na čtyři pole a každé dostane popisek, takže se z grafu čte rovnou závěr
 * („mladí a dobří"), ne jen shluk teček.
 */

import { GRID, NEUTRAL, PRIMARY } from "./palette";

export interface ScatterPoint {
  label: string;
  x: number;
  y: number;
  /** Volitelná třetí veličina — určuje velikost bodu (např. mzda). */
  size?: number;
  color?: string;
  href?: string;
}

const W = 320;
const H = 220;
const PAD_L = 34;
const PAD_R = 12;
const PAD_T = 14;
const PAD_B = 26;

export function ScatterChart({
  points,
  xLabel,
  yLabel,
  xRange,
  yRange,
  /** Hodnoty, kde se plocha dělí na kvadranty. Bez nich se použije střed rozsahu. */
  xDivider,
  yDivider,
  /** Popisky kvadrantů odshora zleva po směru hodinových ručiček. */
  quadrants,
  formatPoint,
}: {
  points: ScatterPoint[];
  xLabel: string;
  yLabel: string;
  xRange?: [number, number];
  yRange?: [number, number];
  xDivider?: number;
  yDivider?: number;
  quadrants?: { topLeft?: string; topRight?: string; bottomLeft?: string; bottomRight?: string };
  formatPoint?: (p: ScatterPoint) => string;
}) {
  if (points.length === 0) return null;

  const [x0, x1] = xRange ?? [Math.min(...points.map((p) => p.x)), Math.max(...points.map((p) => p.x))];
  const [y0, y1] = yRange ?? [Math.min(...points.map((p) => p.y)), Math.max(...points.map((p) => p.y))];
  const xSpan = Math.max(1e-6, x1 - x0);
  const ySpan = Math.max(1e-6, y1 - y0);

  const plotW = W - PAD_L - PAD_R;
  const plotH = H - PAD_T - PAD_B;
  const toX = (v: number) => PAD_L + ((v - x0) / xSpan) * plotW;
  const toY = (v: number) => PAD_T + (1 - (v - y0) / ySpan) * plotH;

  const xd = xDivider ?? (x0 + x1) / 2;
  const yd = yDivider ?? (y0 + y1) / 2;

  const sizes = points.map((p) => p.size ?? 0);
  const maxSize = Math.max(...sizes, 1);
  const radius = (p: ScatterPoint) => (p.size == null ? 4 : 3 + (p.size / maxSize) * 4);

  return (
    <div className="space-y-1">
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMid meet" className="w-full" role="img"
        aria-label={`${yLabel} podle ${xLabel}`}>
        {/* Rám a dělicí čáry kvadrantů */}
        <rect x={PAD_L} y={PAD_T} width={plotW} height={plotH} fill="none" stroke={GRID} strokeWidth="1" />
        <line x1={toX(xd)} y1={PAD_T} x2={toX(xd)} y2={H - PAD_B} stroke={GRID} strokeWidth="1" />
        <line x1={PAD_L} y1={toY(yd)} x2={W - PAD_R} y2={toY(yd)} stroke={GRID} strokeWidth="1" />

        {quadrants && (
          <>
            {quadrants.topLeft && <text x={PAD_L + 5} y={PAD_T + 11} fontSize="8" fill={NEUTRAL}>{quadrants.topLeft}</text>}
            {quadrants.topRight && <text x={W - PAD_R - 5} y={PAD_T + 11} fontSize="8" fill={NEUTRAL} textAnchor="end">{quadrants.topRight}</text>}
            {quadrants.bottomLeft && <text x={PAD_L + 5} y={H - PAD_B - 5} fontSize="8" fill={NEUTRAL}>{quadrants.bottomLeft}</text>}
            {quadrants.bottomRight && <text x={W - PAD_R - 5} y={H - PAD_B - 5} fontSize="8" fill={NEUTRAL} textAnchor="end">{quadrants.bottomRight}</text>}
          </>
        )}

        {/* Krajní hodnoty os — plná stupnice by se sem nevešla */}
        <text x={PAD_L} y={H - PAD_B + 12} fontSize="9" fill={NEUTRAL}>{Math.round(x0)}</text>
        <text x={W - PAD_R} y={H - PAD_B + 12} fontSize="9" fill={NEUTRAL} textAnchor="end">{Math.round(x1)}</text>
        <text x={PAD_L - 5} y={H - PAD_B} fontSize="9" fill={NEUTRAL} textAnchor="end">{Math.round(y0)}</text>
        <text x={PAD_L - 5} y={PAD_T + 8} fontSize="9" fill={NEUTRAL} textAnchor="end">{Math.round(y1)}</text>

        {points.map((p, i) => (
          <circle
            key={`${p.label}-${i}`}
            cx={toX(p.x)}
            cy={toY(p.y)}
            r={radius(p)}
            fill={p.color ?? PRIMARY}
            fillOpacity="0.75"
            stroke="#FFFFFF"
            strokeWidth="1.5"
          >
            <title>{formatPoint ? formatPoint(p) : `${p.label}: ${p.x} / ${p.y}`}</title>
          </circle>
        ))}
      </svg>

      <div className="flex justify-between text-micro text-muted px-1">
        <span>{yLabel} ↑</span>
        <span>{xLabel} →</span>
      </div>
    </div>
  );
}
