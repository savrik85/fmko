"use client";

/**
 * Číselné formy — statistická dlaždice a ukazatel naplnění.
 * Jedna hodnota nepotřebuje graf; sloupec o jednom sloupci nic nesděluje.
 */

import type { ReactNode } from "react";
import { PRIMARY, STATUS } from "./palette";

/**
 * Dlaždice: popisek, hodnota, volitelná změna a mini trend.
 * Hodnota má proporcionální číslice — tabular-nums patří do sloupců tabulek.
 */
export function StatTile({
  label,
  value,
  delta,
  deltaGood,
  trend,
  color,
}: {
  label: string;
  value: string;
  /** Změna proti minulému období, i se znaménkem. */
  delta?: string;
  /** Je změna dobrá zpráva? Řídí barvu, ne směr šipky. */
  deltaGood?: boolean;
  trend?: ReactNode;
  color?: string;
}) {
  return (
    <div className="bg-gray-50 rounded-lg p-3">
      <div className="text-sm text-muted">{label}</div>
      <div className="flex items-end justify-between gap-2 mt-0.5">
        <span className="font-heading font-bold text-2xl leading-none" style={color ? { color } : undefined}>
          {value}
        </span>
        {trend}
      </div>
      {delta && (
        <div
          className="text-sm mt-1 font-heading font-bold"
          style={{ color: deltaGood === undefined ? "#8B8578" : deltaGood ? STATUS.good : STATUS.critical }}
        >
          {delta}
        </div>
      )}
    </div>
  );
}

/**
 * Ukazatel naplnění — jedna hodnota proti stropu (obsazenost stadionu apod.).
 * Nevyplněná dráha je světlejší krok téhož odstínu, ne šedá.
 */
export function Meter({
  value,
  max,
  label,
  display,
  color = PRIMARY,
  track = "#E8F0E8",
}: {
  value: number;
  max: number;
  label?: string;
  display?: string;
  color?: string;
  track?: string;
}) {
  const pct = max > 0 ? Math.max(0, Math.min(100, (value / max) * 100)) : 0;
  return (
    <div>
      {(label || display) && (
        <div className="flex items-baseline justify-between mb-1">
          {label && <span className="text-sm text-muted">{label}</span>}
          {display && <span className="text-sm font-heading font-bold tabular-nums">{display}</span>}
        </div>
      )}
      <div className="h-2.5 rounded-full overflow-hidden" style={{ background: track }}>
        <div className="h-full rounded-full transition-[width] duration-300" style={{ width: `${pct}%`, background: color }} />
      </div>
    </div>
  );
}
