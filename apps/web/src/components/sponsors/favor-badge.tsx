import { favorLabel } from "@/lib/sponsor-owners";

/** Náklonnost majitele ke klubu vpravo na kartě: číslo a pásmo. */
export function FavorBadge({ favor }: { favor: number }) {
  return (
    <div className="text-right shrink-0">
      <div className="font-heading font-bold tabular-nums text-base">{favor}</div>
      <div className="text-sm text-muted whitespace-nowrap">{favorLabel(favor)}</div>
    </div>
  );
}

/** Náklonnost majitele jako řádek textu (karty smluv). */
export function FavorLine({ favor }: { favor: number }) {
  return (
    <div className="text-sm">
      <span className="text-muted">Náklonnost majitele: </span>
      <span className="font-heading font-bold">{favorLabel(favor)} ({favor})</span>
    </div>
  );
}
