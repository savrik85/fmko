"use client";

import type { ReactNode } from "react";
import type { StavTiketu, StavTipu } from "./types";

/** Kurz s desetinnou ČÁRKOU. Tečka by prozradila, že je to přeložená appka. */
export function kurz(x100: number): string {
  return (x100 / 100).toFixed(2).replace(".", ",");
}

export function czk(n: number): string {
  return `${n.toLocaleString("cs")} Kč`;
}

export function signed(n: number): string {
  return `${n > 0 ? "+" : n < 0 ? "−" : ""}${Math.abs(n).toLocaleString("cs")} Kč`;
}

/** Názvy tiketů podle počtu tipů — lidové, jak se jim říká u přepážky. */
export const TYP_TIKETU: Record<number, string> = {
  1: "Sólo", 2: "Dvojka", 3: "Trojka", 4: "Čtyřka", 5: "Pětka", 6: "Šestka",
};

export const POPIS_TIPU: Record<StavTipu, string> = {
  pending: "čeká na zápas", won: "sedl", lost: "nesedl", void: "anulován",
};

/**
 * Stav tipu jako barevný odznak — zelená fajfka, červený křížek.
 *
 * Barva nese význam sama o sobě, ale nesmí ho nést jediná: symbol se liší
 * tvarem a `aria-label` popisem, takže to přečte i barvoslepý hráč a čtečka.
 */
export function IkonaTipu({ stav }: { stav: StavTipu }) {
  const styl: Record<StavTipu, { znak: string; trida: string }> = {
    won: { znak: "✓", trida: "bg-pitch-500 text-white" },
    lost: { znak: "✕", trida: "bg-card-red text-white" },
    void: { znak: "∅", trida: "bg-gold-100 text-gold-700" },
    pending: { znak: "•", trida: "bg-gray-200 text-muted" },
  };
  const s = styl[stav] ?? styl.pending;
  return (
    <span
      className={`w-5 h-5 rounded-full shrink-0 flex items-center justify-center
                  text-micro font-bold leading-none ${s.trida}`}
      title={POPIS_TIPU[stav]}
      aria-label={POPIS_TIPU[stav]}
    >
      {s.znak}
    </span>
  );
}

const STAV: Record<StavTiketu, { label: string; bg: string; fg: string }> = {
  open: { label: "Čeká na kolo", bg: "#F0EEE9", fg: "#5B5348" },
  won: { label: "Vyhraný", bg: "#E8F5E8", fg: "#1E4A1E" },
  lost: { label: "Prohraný", bg: "#FBEAE8", fg: "#A32B1F" },
  void: { label: "Vrácený vklad", bg: "#FBF6E6", fg: "#866D1E" },
  confiscated: { label: "Zabavená výhra", bg: "#FBEAE8", fg: "#A32B1F" },
};

export function StavPill({ stav }: { stav: StavTiketu }) {
  const s = STAV[stav] ?? STAV.open;
  return (
    <span
      className="text-micro font-heading font-bold uppercase tracking-wide px-2 py-0.5 rounded-full"
      style={{ background: s.bg, color: s.fg }}
    >
      {s.label}
    </span>
  );
}

export function Radek({ label, value, strong = false, className = "" }: {
  label: string; value: ReactNode; strong?: boolean; className?: string;
}) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <span className="text-sm text-muted">{label}</span>
      <span className={`tabular-nums font-heading ${strong ? "font-bold text-base" : "font-semibold text-sm"} ${className}`}>
        {value}
      </span>
    </div>
  );
}

export function Statek({ label, value, className = "" }: {
  label: string; value: ReactNode; className?: string;
}) {
  return (
    <div>
      <div className="text-micro font-heading font-bold uppercase tracking-wide text-muted">{label}</div>
      <div className={`text-base font-heading font-bold tabular-nums ${className}`}>{value}</div>
    </div>
  );
}

/**
 * Posledních pět výsledků jako barevné body. Nejnovější vlevo.
 *
 * Barvy jsou schválně tytéž jako v ligové tabulce (/dashboard/liga) — hráč
 * čte formu na dvou místech a nesmí ji na každém luštit znovu.
 */
export function Forma({ form }: { form: string[] }) {
  if (form.length === 0) return null;
  const barva: Record<string, string> = {
    V: "bg-pitch-400",
    R: "bg-gold-500",
    P: "bg-card-red",
  };
  const popis: Record<string, string> = { V: "výhra", R: "remíza", P: "prohra" };
  return (
    <span className="inline-flex gap-1 shrink-0"
          aria-label={`Forma: ${form.map((f) => popis[f]).join(", ")}`}>
      {form.map((f, i) => (
        <span key={i} aria-hidden
          className={`w-5 h-5 rounded text-micro font-heading font-bold text-white
                      flex items-center justify-center leading-none ${barva[f] ?? "bg-gray-200"}`}>
          {f}
        </span>
      ))}
    </span>
  );
}

export function Prazdno({ nadpis, children }: { nadpis: string; children: ReactNode }) {
  return (
    <div className="card p-8 text-center">
      <div className="text-3xl mb-2" aria-hidden>🎫</div>
      <div className="font-heading font-bold text-base mb-1">{nadpis}</div>
      <p className="text-sm text-muted leading-snug max-w-sm mx-auto">{children}</p>
    </div>
  );
}
