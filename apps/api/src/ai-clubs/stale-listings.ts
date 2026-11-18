/**
 * Zastaralé inzeráty AI klubů: cena pod pevnou pojistkou (60 % tržní ceny podle dnešního
 * hodnocení hráče). AI nabídku ve výši takového inzerátu vždycky odmítne, takže inzerát
 * jen láká lidi na nákup, který neprojde. Vzniká, když hráči po vystavení stoupne hodnocení,
 * typicky narovnáním AI klubů (Strakonice 2026-11-17: inzeráty z 14.–16. 11. za 7–36 % trhu).
 * Narovnání od 2026-11-18 inzeráty zvednutých hráčů stahuje samo, tohle uklidí starší.
 */

import { marketValue } from "@okresni-masina/shared";
import { isBelowHardFloor } from "../ai-coach/valuation";
import { logger } from "../lib/logger";

const M = "stale-listings";

export interface StaleListing {
  listingId: string;
  team: string;
  player: string;
  age: number;
  position: string;
  rating: number;
  askingPrice: number;
  marketValue: number;
}

export interface WithdrawStaleListingsResult {
  ok: boolean;
  reason?: string;
  dryRun: boolean;
  leagueIds: string[];
  /** Aktivní přestupové inzeráty AI klubů ligy celkem. */
  checked: number;
  withdrawn: StaleListing[];
}

/** Stáhne inzeráty AI klubů ligy (a její U21), jejichž cena je pod pojistkou vůči dnešní tržní ceně. */
export async function withdrawStaleAiListings(
  db: D1Database, leagueId: string, opts: { dryRun: boolean },
): Promise<WithdrawStaleListingsResult> {
  const { dryRun } = opts;
  const league = await db.prepare("SELECT id, COALESCE(league_type, 'senior') AS league_type FROM leagues WHERE id = ?")
    .bind(leagueId).first<{ id: string; league_type: string }>();
  if (!league) return { ok: false, reason: "Soutěž nenalezena.", dryRun, leagueIds: [], checked: 0, withdrawn: [] };
  const u21 = league.league_type === "senior"
    ? await db.prepare("SELECT id FROM leagues WHERE parent_league_id = ? AND league_type = 'u21' LIMIT 1").bind(leagueId).first<{ id: string }>()
    : null;
  const leagueIds = u21 ? [leagueId, u21.id] : [leagueId];
  const marks = leagueIds.map(() => "?").join(",");

  const rows = await db.prepare(
    `SELECT tl.id, tl.asking_price, t.name AS team, p.first_name || ' ' || p.last_name AS player,
            p.age, p.position, p.overall_rating
       FROM transfer_listings tl
       JOIN teams t ON t.id = tl.team_id
       JOIN players p ON p.id = tl.player_id
      WHERE tl.status = 'active' AND tl.deal_type = 'transfer' AND t.user_id = 'ai' AND t.league_id IN (${marks})`,
  ).bind(...leagueIds).all<{ id: string; asking_price: number; team: string; player: string; age: number; position: string; overall_rating: number }>();

  const withdrawn: StaleListing[] = [];
  for (const r of rows.results) {
    const value = marketValue(r.overall_rating, r.age, r.position);
    if (!isBelowHardFloor(r.asking_price, value)) continue;
    withdrawn.push({
      listingId: r.id, team: r.team, player: r.player, age: r.age, position: r.position,
      rating: r.overall_rating, askingPrice: r.asking_price, marketValue: value,
    });
  }
  const result: WithdrawStaleListingsResult = { ok: true, dryRun, leagueIds, checked: rows.results.length, withdrawn };
  if (dryRun || withdrawn.length === 0) return result;

  await db.batch(withdrawn.map((w) =>
    db.prepare("UPDATE transfer_listings SET status = 'withdrawn' WHERE id = ? AND status = 'active'").bind(w.listingId)));
  logger.info({ module: M }, `liga ${leagueId}: staženo ${withdrawn.length} zastaralých inzerátů AI klubů z ${rows.results.length}`);
  return result;
}
