"use client";

import { SCOUT_WILLINGNESS_LABELS } from "@okresni-masina/shared";

const STYLES: Record<number, { chip: string; dot: string }> = {
  0: { chip: "bg-red-50 text-red-700 border border-red-200", dot: "bg-red-500" },
  1: { chip: "bg-orange-50 text-orange-700 border border-orange-200", dot: "bg-orange-500" },
  2: { chip: "bg-yellow-50 text-yellow-700 border border-yellow-200", dot: "bg-yellow-400" },
  3: { chip: "bg-pitch-50 text-pitch-600 border border-pitch-200", dot: "bg-pitch-500" },
};

/** Jak moc by hráč k nám přešel (0–3). Zelená = přijde rád, červená = nechce se mu. */
export function WillingnessBadge({ level }: { level: number }) {
  const s = STYLES[level] ?? STYLES[1];
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full font-heading font-bold text-sm px-2.5 py-1 ${s.chip}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${s.dot}`} />
      {SCOUT_WILLINGNESS_LABELS[level] ?? SCOUT_WILLINGNESS_LABELS[1]}
    </span>
  );
}

/** Hodnocení jako rozmezí („46–58"), u přesně známého hráče jedno číslo. */
export function ratingText(lo: number | null | undefined, hi: number | null | undefined): string {
  if (lo == null && hi == null) return "?";
  if (lo == null || hi == null || lo === hi) return String(lo ?? hi);
  return `${lo}–${hi}`;
}
