import { SectionLabel } from "@/components/ui";

export interface PlayerPromiseView {
  id: string;
  text: string;
  status: "active" | "kept" | "broken" | "expired";
  statusLabel: string;
  madeAt: string;
  resolvedAt: string | null;
}

const STATUS_CLASS: Record<PlayerPromiseView["status"], string> = {
  active: "bg-amber-50 text-amber-800 border-amber-200",
  kept: "bg-pitch-50 text-pitch-700 border-pitch-200",
  broken: "bg-red-50 text-card-red border-red-200",
  expired: "bg-gray-50 text-muted border-gray-200",
};

const dateCz = (iso: string) => new Date(iso).toLocaleDateString("cs-CZ", { day: "numeric", month: "numeric" });

/**
 * Sliby hráči na jeho profilu (2026-10-19): co jsi mu slíbil a jak to dopadlo. Bez herních
 * čísel, jen podmínky slibu a datum.
 */
export function PromiseCard({ promises }: { promises: PlayerPromiseView[] }) {
  if (promises.length === 0) return null;
  return (
    <div className="card p-4 sm:p-5 mb-5">
      <SectionLabel>Sliby</SectionLabel>
      <div className="mt-2">
        {promises.map((p) => (
          <div key={p.id} className="flex items-start gap-2 py-2 border-b border-gray-50 last:border-b-0">
            <span aria-hidden className="text-base leading-6">🤞</span>
            <div className="flex-1 min-w-0">
              <div className="text-sm font-heading font-bold text-ink">{p.text}</div>
              <div className="text-sm text-muted">
                Slíbeno {dateCz(p.madeAt)}{p.resolvedAt ? `, vyřešeno ${dateCz(p.resolvedAt)}` : ""}
              </div>
            </div>
            <span className={`shrink-0 text-sm font-heading font-bold border rounded-full px-2 py-0.5 ${STATUS_CLASS[p.status]}`}>
              {p.statusLabel}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

/** Značka u jména v kádru: hráč má od tebe slib, který běží. */
export function PromiseBadge({ text }: { text: string }) {
  const tip = `Slíbil jsi: ${text}`;
  return (
    <span className="ml-1.5 text-micro bg-amber-100 text-amber-800 font-heading font-bold px-1.5 py-0.5 rounded-full cursor-help" title={tip} aria-label={tip}>
      🤞
    </span>
  );
}
