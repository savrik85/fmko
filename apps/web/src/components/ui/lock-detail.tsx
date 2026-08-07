import Link from "next/link";

export interface LockDetailData {
  reputation?: { need: number; have: number };
  matchesPlayed?: { need: number; have: number };
  season?: { need: number; have: number };
  prerequisite?: string;
}

/**
 * Vysvětlení zamčeného upgradu — všechny nesplněné podmínky a co s tím.
 *
 * Dřív tu byla jedna věta typu „Potřeba reputace 70+ (máš 51)" a nic víc:
 * hráč nevěděl, co dalšího mu chybí ani jak reputaci zvednout.
 */
export function LockDetail({
  detail,
  hint,
  fallback,
}: {
  detail?: LockDetailData;
  hint?: string;
  /** Text ze staršího API, když detail ještě nedorazil. */
  fallback?: string;
}) {
  const rows: Array<{ label: string; need: number; have: number }> = [];
  if (detail?.reputation) rows.push({ label: "Reputace klubu", ...detail.reputation });
  if (detail?.matchesPlayed) rows.push({ label: "Odehrané zápasy", ...detail.matchesPlayed });
  if (detail?.season) rows.push({ label: "Sezóna", ...detail.season });

  if (rows.length === 0 && !detail?.prerequisite) {
    return fallback ? <div className="text-sm text-muted mt-2">🔒 {fallback}</div> : null;
  }

  return (
    <div className="mt-2 space-y-1">
      {rows.map((r) => (
        <div key={r.label} className="text-sm text-muted flex items-baseline gap-2">
          <span>🔒</span>
          <span>
            {r.label}: <span className="tabular-nums font-heading font-bold text-ink">{r.need}</span>
            <span className="text-muted"> · máš </span>
            <span className="tabular-nums text-card-red">{r.have}</span>
            <span className="text-muted"> (chybí {r.need - r.have})</span>
          </span>
        </div>
      ))}
      {detail?.prerequisite && (
        <div className="text-sm text-muted flex items-baseline gap-2">
          <span>🔒</span>
          <span>{detail.prerequisite}</span>
        </div>
      )}
      {hint && (
        <div className="text-sm text-ink-light pt-1">
          {hint}{" "}
          <Link href="/dashboard/reputace" className="text-pitch-600 underline whitespace-nowrap">
            Reputace →
          </Link>
        </div>
      )}
    </div>
  );
}
