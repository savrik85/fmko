"use client";

/**
 * Vodopád — jak se z příjmů postupným odečítáním stane výsledek.
 *
 * Prstenec ukáže poměr, vodopád ukáže skládání: každý krok začíná tam, kde
 * skončil předchozí, takže je vidět, který výdaj bilanci srazil nejvíc.
 */

import { DIVERGING, GRID, NEUTRAL } from "./palette";

export interface WaterfallStep {
  label: string;
  /** Kladné přičítá, záporné ubírá. */
  delta: number;
}

export function Waterfall({
  steps,
  totalLabel = "Zbývá",
  formatValue,
}: {
  steps: WaterfallStep[];
  totalLabel?: string;
  formatValue: (v: number) => string;
}) {
  // Průběžný součet určuje, kde který sloupec začíná a končí
  let running = 0;
  const rows = steps.map((s) => {
    const from = running;
    running += s.delta;
    return { ...s, from, to: running };
  });
  const total = running;

  const hranice = rows.flatMap((r) => [r.from, r.to]).concat(0, total);
  const min = Math.min(...hranice);
  const max = Math.max(...hranice);
  const span = Math.max(1e-6, max - min);
  const pct = (v: number) => ((v - min) / span) * 100;

  return (
    <div className="space-y-1.5">
      {rows.map((r) => {
        const zacatek = Math.min(r.from, r.to);
        const konec = Math.max(r.from, r.to);
        const kladny = r.delta >= 0;
        return (
          <div key={r.label}>
            <div className="flex items-baseline justify-between mb-0.5">
              <span className="text-sm text-muted truncate">{r.label}</span>
              <span
                className="text-sm font-heading font-bold tabular-nums shrink-0"
                style={{ color: kladny ? DIVERGING.positive : DIVERGING.negative }}
              >
                {kladny ? "+" : "−"}{formatValue(Math.abs(r.delta))}
              </span>
            </div>
            <div className="h-2.5 rounded-sm relative" style={{ background: GRID }}>
              <div
                className="absolute h-full rounded-sm"
                style={{
                  left: `${pct(zacatek)}%`,
                  width: `${Math.max(1, pct(konec) - pct(zacatek))}%`,
                  background: kladny ? DIVERGING.positive : DIVERGING.negative,
                }}
                title={`${r.label}: ${kladny ? "+" : "−"}${formatValue(Math.abs(r.delta))}`}
              />
            </div>
          </div>
        );
      })}

      <div className="pt-1.5 mt-1 border-t" style={{ borderColor: GRID }}>
        <div className="flex items-baseline justify-between">
          <span className="text-sm font-heading font-bold">{totalLabel}</span>
          <span
            className="font-heading font-bold tabular-nums"
            style={{ color: total >= 0 ? DIVERGING.positive : DIVERGING.negative }}
          >
            {total >= 0 ? "+" : "−"}{formatValue(Math.abs(total))}
          </span>
        </div>
        <div className="h-2.5 rounded-sm relative mt-0.5" style={{ background: GRID }}>
          <div
            className="absolute h-full rounded-sm"
            style={{
              left: `${pct(Math.min(0, total))}%`,
              width: `${Math.max(1, pct(Math.max(0, total)) - pct(Math.min(0, total)))}%`,
              background: total >= 0 ? DIVERGING.positive : NEUTRAL,
            }}
          />
        </div>
      </div>
    </div>
  );
}
