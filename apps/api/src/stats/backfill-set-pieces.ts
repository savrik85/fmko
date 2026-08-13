import { logger } from "../lib/logger";
import { setPieceDelta } from "./update-stats";
import type { MatchEvent } from "@okresni-masina/shared";

const M = "backfill-set-pieces";

interface LineupPlayer { id: string; name: string }
interface LineupData { starters?: LineupPlayer[]; subs?: LineupPlayer[] }

/** Kolik zápasů se načte jedním dotazem — events jsou velké JSONy, celá sezóna najednou by se nevešla. */
const PAGE = 40;

/**
 * Zpětný dopočet standardkových statistik z uložených záznamů zápasů.
 *
 * Události nesou engine ID (číslo v rámci zápasu), ne ID hráče v databázi — jediná cesta zpět
 * vede přes jméno v uložené sestavě (home_lineup_data/away_lineup_data), kde je ID i jméno.
 * Jmenovce v jedné sestavě proto přeskakujeme: nejde určit, komu gól patří, a špatně přiřazená
 * penalta je horší než chybějící.
 *
 * Zápasy se čtou po stránkách, ale agregace běží přes celou ligu a zapisuje se až nakonec —
 * zápis je ABSOLUTNÍ (SET, ne +=), takže opakované spuštění nic nezdvojí a po každém běhu čísla
 * sedí na kompletní historii sezóny včetně zápasů odehraných už s novým zápisem.
 */
export async function backfillSetPieces(
  db: D1Database,
  opts: { leagueId?: string } = {},
): Promise<{ leagues: number; matches: number; players: number; skippedNames: number }> {
  const season = await db.prepare("SELECT id, number FROM seasons WHERE status = 'active' ORDER BY number DESC LIMIT 1")
    .first<{ id: string; number: number }>()
    .catch((e) => { logger.warn({ module: M }, "load active season", e); return null; });
  if (!season?.id) return { leagues: 0, matches: 0, players: 0, skippedNames: 0 };

  const leagues = opts.leagueId
    ? [{ id: opts.leagueId }]
    : (await db.prepare("SELECT DISTINCT league_id AS id FROM season_calendar WHERE season_number = ? AND league_id IS NOT NULL")
        .bind(season.number).all<{ id: string }>()
        .catch((e) => { logger.error({ module: M }, "load leagues", e); return { results: [] as { id: string }[] }; })).results;

  let matches = 0, players = 0, skippedNames = 0;
  for (const league of leagues) {
    const r = await backfillLeague(db, season.id, season.number, league.id);
    matches += r.matches; players += r.players; skippedNames += r.skippedNames;
  }
  logger.info({ module: M }, `backfill hotov: ${leagues.length} lig, ${matches} zápasů, ${players} záznamů, ${skippedNames} nepřiřazených jmen`);
  return { leagues: leagues.length, matches, players, skippedNames };
}

async function backfillLeague(
  db: D1Database, seasonId: string, seasonNumber: number, leagueId: string,
): Promise<{ matches: number; players: number; skippedNames: number }> {
  // (playerId, teamId) → součty za celou ligu
  const acc = new Map<string, { playerId: string; teamId: string; pg: number; pm: number; sp: number }>();
  let matches = 0, skippedNames = 0;

  for (let offset = 0; ; offset += PAGE) {
    // Jen ligové zápasy — pohár do sezónních statistik nepřispívá (zapisuje jen per-zápas stats).
    const rows = await db.prepare(
      `SELECT m.id, m.home_team_id, m.away_team_id, m.events, m.home_lineup_data, m.away_lineup_data
       FROM matches m
       JOIN season_calendar sc ON sc.id = m.calendar_id
       WHERE sc.league_id = ? AND sc.season_number = ?
         AND m.status = 'simulated' AND m.events IS NOT NULL
       ORDER BY m.id
       LIMIT ? OFFSET ?`
    ).bind(leagueId, seasonNumber, PAGE, offset).all<Record<string, unknown>>()
      .catch((e) => { logger.error({ module: M }, "load matches page", e); return { results: [] as Record<string, unknown>[] }; });

    for (const row of rows.results) {
      matches++;
      const events = parseJson<MatchEvent[]>(row.events, []);
      const homeIdx = nameIndex(parseJson<LineupData | null>(row.home_lineup_data, null));
      const awayIdx = nameIndex(parseJson<LineupData | null>(row.away_lineup_data, null));

      for (const event of events) {
        const d = setPieceDelta(event);
        if (!d.penaltyGoals && !d.penaltyMisses && !d.setPieceGoals) continue;

        // teamId v události je engine číslo: 1 = domácí, 2 = hosté.
        const isHome = event.teamId === 1;
        const playerId = (isHome ? homeIdx : awayIdx).get(event.playerName);
        if (!playerId) { skippedNames++; continue; }

        const teamId = (isHome ? row.home_team_id : row.away_team_id) as string;
        const key = `${playerId}|${teamId}`;
        const cur = acc.get(key) ?? { playerId, teamId, pg: 0, pm: 0, sp: 0 };
        cur.pg += d.penaltyGoals;
        cur.pm += d.penaltyMisses;
        cur.sp += d.setPieceGoals;
        acc.set(key, cur);
      }
    }
    if (rows.results.length < PAGE) break;
  }

  const stmts = [...acc.values()].map((a) => db.prepare(
    `UPDATE player_stats SET penalty_goals = ?, penalty_misses = ?, setpiece_goals = ?
     WHERE player_id = ? AND team_id = ? AND season_id = ?`
  ).bind(a.pg, a.pm, a.sp, a.playerId, a.teamId, seasonId));
  for (let i = 0; i < stmts.length; i += 40) {
    await db.batch(stmts.slice(i, i + 40)).catch((e) => logger.error({ module: M }, "batch update", e));
  }

  return { matches, players: acc.size, skippedNames };
}

function parseJson<T>(v: unknown, fallback: T): T {
  if (v == null) return fallback;
  if (typeof v !== "string") return v as T;
  try { return JSON.parse(v) as T; } catch (e) { logger.warn({ module: M }, "parse json", e); return fallback; }
}

/** Jméno → ID hráče; jmenovci se z mapy vyřadí, nejde je rozlišit. */
function nameIndex(ld: LineupData | null): Map<string, string | null> {
  const idx = new Map<string, string | null>();
  for (const p of [...(ld?.starters ?? []), ...(ld?.subs ?? [])]) {
    if (!p?.name || !p?.id) continue;
    idx.set(p.name, idx.has(p.name) ? null : p.id);
  }
  return idx;
}
