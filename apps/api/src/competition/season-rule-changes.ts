/**
 * Co grémium změnilo v sazebníku — pro úvodní slide nové sezóny.
 *
 * Bere schválené návrhy minulé sezóny (a ty s účinností od téhle) a ke každému
 * pravidlu ukáže hodnotu PŘED prvním návrhem a hodnotu, kterou má nová sezóna
 * opravdu v `competition_rules`. Konečná hodnota tedy není opsaná z návrhu,
 * ale z řádku, který čtou sázky, přestupy i zápasové finance. Když se pravidlo
 * přes sezónu vrátilo na původní hodnotu, nezobrazí se.
 */

import { logger } from "../lib/logger";
import { PROPOSAL_KINDS } from "./defaults";
import { formatRuleValue } from "./proposals";
import { governingLeagueId, loadRules } from "./rules";

const M = "season-rule-changes";

export interface SeasonRuleChange {
  kind: string;
  label: string;
  /** Čitelná změna: „5 000 Kč → 10 000 Kč", u vypínače „nově platí". */
  change: string;
  note: string | null;
  /** true = platí až od téhle sezóny; false = schváleno už během minulé a platí dál. */
  fromThisSeason: boolean;
}

export async function seasonRuleChanges(
  db: D1Database, leagueId: string, seasonNumber: number,
): Promise<SeasonRuleChange[]> {
  const rules = await loadRules(db, leagueId, seasonNumber);
  if (!rules) return [];
  // Návrhy visí u grémia okresu, ať se ptá přebor, nebo III. třída.
  leagueId = await governingLeagueId(db, leagueId);

  const { results } = await db.prepare(
    `SELECT kind, payload, effective_from_season FROM competition_proposals
     WHERE league_id = ? AND status = 'passed' AND (season_number = ? OR effective_from_season = ?)
     ORDER BY closed_at, created_at`
  ).bind(leagueId, seasonNumber - 1, seasonNumber)
    .all<{ kind: string; payload: string; effective_from_season: number | null }>()
    .catch((e) => {
      logger.warn({ module: M }, `schválené návrhy ligy ${leagueId}/${seasonNumber - 1}`, e);
      return { results: [] as { kind: string; payload: string; effective_from_season: number | null }[] };
    });

  const firstFrom = new Map<string, number>();
  const nextSeason = new Map<string, boolean>();
  for (const p of results ?? []) {
    const spec = PROPOSAL_KINDS[p.kind];
    if (!spec?.rulesField) continue;
    let from: unknown;
    try { from = (JSON.parse(p.payload) as { from?: unknown }).from; } catch (e) {
      logger.warn({ module: M }, `payload návrhu ${p.kind}`, e);
    }
    if (!firstFrom.has(p.kind) && typeof from === "number") firstFrom.set(p.kind, from);
    if (p.effective_from_season === seasonNumber) nextSeason.set(p.kind, true);
  }

  const out: SeasonRuleChange[] = [];
  for (const [kind, from] of firstFrom) {
    const spec = PROPOSAL_KINDS[kind];
    const to = rules[spec.rulesField!];
    if (to === from) continue;
    const change = spec.unit === "switch"
      ? (to ? "nově platí" : "zrušeno")
      : `${formatRuleValue(kind, from)} → ${formatRuleValue(kind, to)}`;
    out.push({ kind, label: spec.label, change, note: spec.note ?? null, fromThisSeason: nextSeason.get(kind) ?? spec.nextSeason });
  }
  // Novinky sezóny nahoru, to, co už platí, pod ně.
  return out.sort((a, b) => Number(b.fromThisSeason) - Number(a.fromThisSeason));
}
