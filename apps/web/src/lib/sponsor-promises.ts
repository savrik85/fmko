/** Sliby sponzorům na stránce Sponzoři: stav česky, barva štítku, termín, seskupení. */
import { formatGameDay } from "@/lib/sponsor-format";
import type { SponsorPromiseView } from "@/lib/sponsor-page-types";

const STATUS_LABELS = { fulfilled: "splněno", partial: "těsně vedle", broken: "porušeno" } as const;

export function promiseStatusLabel(p: SponsorPromiseView): string {
  if (p.status === "pending") return p.kind === "sector_exclusivity" ? "platí" : "čeká";
  return STATUS_LABELS[p.status];
}

export function promiseStatusClass(p: SponsorPromiseView): string {
  switch (p.status) {
    case "fulfilled": return "bg-pitch-50 text-pitch-600";
    case "partial": return "bg-gold-50 text-gold-700";
    case "broken": return "bg-red-50 text-card-red";
    default: return "bg-gray-100 text-muted";
  }
}

/** „sezóna 5", „termín do 12. 10. 2026", „po celou dobu smlouvy". */
export function promiseTermText(p: SponsorPromiseView): string {
  if (p.season != null) return `sezóna ${p.season}`;
  if (p.deadline) {
    const d = formatGameDay(p.deadline);
    return d ? `termín do ${d}` : "s termínem";
  }
  return "po celou dobu smlouvy";
}

export function groupPromisesByContract(list: readonly SponsorPromiseView[]): Map<string, SponsorPromiseView[]> {
  const out = new Map<string, SponsorPromiseView[]>();
  for (const p of list) {
    const arr = out.get(p.contractId) ?? [];
    arr.push(p);
    out.set(p.contractId, arr);
  }
  return out;
}
