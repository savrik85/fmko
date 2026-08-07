"use client";

/**
 * Půlkruhový ciferník — jedna hodnota proti pevné škále (spokojenost, reputace).
 *
 * Nevyplněná dráha je světlejší krok téhož odstínu, ne šedá — stav se pak čte
 * po celé délce oblouku. Hodnota stojí uvnitř číslem, barva sama nic nenese.
 */

import { STATUS } from "./palette";

const SIZE = 140;
const H = 84;
const R = 56;
const THICKNESS = 12;

/** Odstín podle pásma hodnoty — pro ukazatele, kde nízké číslo znamená problém. */
export function gaugeColor(value: number): string {
  if (value >= 66) return STATUS.good;
  if (value >= 33) return STATUS.warning;
  return STATUS.critical;
}

export function Gauge({
  value,
  max = 100,
  label,
  display,
  color,
  track = "#EFEBE3",
  size = 150,
}: {
  value: number;
  max?: number;
  label?: string;
  /** Text uvnitř. Bez něj se vypíše zaokrouhlená hodnota. */
  display?: string;
  color?: string;
  track?: string;
  size?: number;
}) {
  const ratio = Math.max(0, Math.min(1, value / max));
  const c = SIZE / 2;
  const cy = H - 8;
  const arcLength = Math.PI * R;
  const stroke = color ?? gaugeColor((value / max) * 100);

  const arc = (x1: number, y1: number, x2: number, y2: number) =>
    `M ${x1} ${y1} A ${R} ${R} 0 0 1 ${x2} ${y2}`;
  const left = [c - R, cy] as const;
  const right = [c + R, cy] as const;

  return (
    <div className="text-center">
      <svg
        viewBox={`0 0 ${SIZE} ${H}`}
        preserveAspectRatio="xMidYMid meet"
        style={{ width: size }}
        className="mx-auto"
        role="img"
        aria-label={`${label ?? "hodnota"}: ${Math.round(value)} z ${max}`}
      >
        <path
          d={arc(left[0], left[1], right[0], right[1])}
          fill="none"
          stroke={track}
          strokeWidth={THICKNESS}
          strokeLinecap="round"
        />
        <path
          d={arc(left[0], left[1], right[0], right[1])}
          fill="none"
          stroke={stroke}
          strokeWidth={THICKNESS}
          strokeLinecap="round"
          strokeDasharray={`${arcLength * ratio} ${arcLength}`}
        />
        <text
          x={c}
          y={cy - 6}
          textAnchor="middle"
          fontSize="26"
          fontWeight="800"
          fill="#1A1714"
          style={{ fontFamily: "var(--font-heading)" }}
        >
          {display ?? Math.round(value)}
        </text>
      </svg>
      {label && <div className="text-sm text-muted -mt-1">{label}</div>}
    </div>
  );
}
