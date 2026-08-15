"use client";

/**
 * Společné kusy, ze kterých jsou grafy poskládané — legenda, prázdný stav,
 * popiskový řádek. Drží jednotný vzhled napříč všemi widgety.
 */

import type { ReactNode } from "react";

export interface LegendItem {
  label: string;
  color: string;
  /** Volitelná hodnota vpravo za popiskem. */
  value?: string;
}

/**
 * Legenda. Renderuje se od DVOU sérií výš — u jedné série by jen zopakovala
 * nadpis widgetu a sebrala místo.
 */
export function ChartLegend({ items, className = "" }: { items: LegendItem[]; className?: string }) {
  if (items.length < 2) return null;
  return (
    <ul className={`flex flex-wrap gap-x-4 gap-y-1 ${className}`}>
      {items.map((it) => (
        <li key={it.label} className="flex items-center gap-1.5 text-sm text-muted">
          <span className="w-2.5 h-2.5 rounded-tight shrink-0" style={{ background: it.color }} aria-hidden="true" />
          <span>{it.label}</span>
          {it.value != null && <span className="font-heading font-bold text-ink tabular-nums">{it.value}</span>}
        </li>
      ))}
    </ul>
  );
}

/** Hláška, když widget nemá co ukázat. Text vždy říká proč, ne jen „žádná data". */
export function ChartEmpty({ children }: { children: ReactNode }) {
  return <div className="text-sm text-muted text-center py-6">{children}</div>;
}

/** Velké číslo, kterým widget vede. Proporcionální číslice — tabular-nums patří do sloupců. */
export function ChartHero({ value, note, color }: { value: string; note?: string; color?: string }) {
  return (
    <div className="text-center">
      <div className="font-heading font-[800] text-4xl leading-none" style={color ? { color } : undefined}>{value}</div>
      {note && <div className="text-sm text-muted mt-1">{note}</div>}
    </div>
  );
}
