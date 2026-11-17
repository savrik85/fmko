import { ListCard, ListRow, StatusChip } from "@/components/ui";

export interface PlayerPromiseView {
  id: string;
  text: string;
  status: "active" | "kept" | "broken" | "expired";
  statusLabel: string;
  madeAt: string;
  resolvedAt: string | null;
}

const STATUS_TONE: Record<PlayerPromiseView["status"], "ok" | "warn" | "danger" | "neutral"> = {
  active: "warn",
  kept: "ok",
  broken: "danger",
  expired: "neutral",
};

const dateCz = (iso: string) => new Date(iso).toLocaleDateString("cs-CZ", { day: "numeric", month: "numeric" });

/**
 * Sliby hráči na jeho profilu (2026-10-19): co jsi mu slíbil a jak to dopadlo. Bez herních
 * čísel, jen podmínky slibu a datum.
 */
export function PromiseCard({ promises }: { promises: PlayerPromiseView[] }) {
  if (promises.length === 0) return null;
  return (
    <ListCard title="Sliby" className="mb-5">
      {/* Slib bývá celá věta (i s klubem a lhůtou), proto bez názvu a celý v odstavci. */}
      {promises.map((p) => (
        <ListRow key={p.id} dense
          leading={<span aria-hidden className="text-base">🤞</span>}
          detail={
            <>
              <span className="block font-bold">{p.text}</span>
              <span className="block text-muted">
                Slíbeno {dateCz(p.madeAt)}{p.resolvedAt ? `, vyřešeno ${dateCz(p.resolvedAt)}` : ""}
              </span>
            </>
          }
          trailing={<StatusChip tone={STATUS_TONE[p.status]}>{p.statusLabel}</StatusChip>} />
      ))}
    </ListCard>
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
