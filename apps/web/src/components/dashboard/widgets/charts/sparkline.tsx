"use client";

/**
 * Mini spojnice bez os — doprovod čísla ve statistické dlaždici.
 * Nese tvar trendu, ne hodnoty; ty patří vedle ní jako text.
 */

import { PRIMARY, SURFACE } from "./palette";

const W = 100;
const H = 28;

export function Sparkline({
  points,
  color = PRIMARY,
  width = 100,
  height = 28,
}: {
  points: number[];
  color?: string;
  width?: number;
  height?: number;
}) {
  if (points.length < 2) return null;
  const min = Math.min(...points);
  const max = Math.max(...points);
  const range = Math.max(1e-6, max - min);
  const toX = (i: number) => (i / (points.length - 1)) * (W - 4) + 2;
  const toY = (v: number) => H - 4 - ((v - min) / range) * (H - 8);

  const d = points.map((v, i) => `${i === 0 ? "M" : "L"} ${toX(i).toFixed(2)} ${toY(v).toFixed(2)}`).join(" ");

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      preserveAspectRatio="none"
      style={{ width, height }}
      aria-hidden="true"
    >
      <path d={d} fill="none" stroke={color} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
      <circle cx={toX(points.length - 1)} cy={toY(points[points.length - 1])} r="2.5" fill={color} stroke={SURFACE} strokeWidth="1.5" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}
