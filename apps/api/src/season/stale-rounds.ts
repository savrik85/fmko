/**
 * Neodehraná kola starších sezón (pozůstatky v `season_calendar` se stavem `scheduled`).
 *
 * Liga má jeden řádek pro všechny sezóny, takže dotaz „nejbližší neodehrané kolo ligy“
 * bez filtru sezóny vrátí kolo z loňska. Dotazy filtr mají (`currentSeasonSql`
 * v lib/season.ts); tahle služba staré řádky uklidí, aby na ně nikdo nenarazil znovu.
 *
 * Stav `cancelled` zapsat nejde: `season_calendar.status` i `matches.status` mají CHECK
 * bez něj a jeho rozšíření by znamenalo přestavbu tabulek. Kola a jejich zápasy se proto
 * mažou. Nic se na nich neodehrálo (zápasy bez výsledku), a kdyby na ně odkazovalo cokoli
 * jiného než sestavy, úklid se zastaví a nic nesmaže.
 */

import { logger } from "../lib/logger";

const M = "stale-rounds";

/** Kolo ze sezóny starší než aktivní a zároveň starší než nejnovější sezóna své ligy. */
const STALE_ROUNDS_SQL = `SELECT sc.id FROM season_calendar sc
  WHERE sc.status = 'scheduled'
    AND sc.season_number < (SELECT MAX(s.number) FROM seasons s WHERE s.status = 'active')
    AND sc.season_number < (SELECT MAX(x.season_number) FROM season_calendar x WHERE x.league_id = sc.league_id)`;
const STALE_MATCHES_SQL = `SELECT m.id FROM matches m WHERE m.calendar_id IN (${STALE_ROUNDS_SQL})`;

/** Tabulky, které na zápas nebo kolo odkazují. Řádky v nich úklid blokují. */
const BLOCKING_REFERENCES: ReadonlyArray<{ table: string; sql: string; optionalColumn?: { table: string; column: string } }> = [
  { table: "matches (odehrané nebo rozehrané)", sql: `SELECT COUNT(*) AS n FROM matches m WHERE m.calendar_id IN (${STALE_ROUNDS_SQL}) AND (m.status <> 'scheduled' OR m.home_score IS NOT NULL)` },
  { table: "matches.parent_match_id (zápas mimo úklid)", sql: `SELECT COUNT(*) AS n FROM matches c WHERE c.parent_match_id IN (${STALE_MATCHES_SQL}) AND c.id NOT IN (${STALE_MATCHES_SQL})` },
  { table: "season_calendar.parent_calendar_id (kolo mimo úklid)", sql: `SELECT COUNT(*) AS n FROM season_calendar c WHERE c.parent_calendar_id IN (${STALE_ROUNDS_SQL}) AND c.id NOT IN (${STALE_ROUNDS_SQL})` },
  { table: "challenges", sql: `SELECT COUNT(*) AS n FROM challenges WHERE match_id IN (${STALE_MATCHES_SQL})` },
  { table: "injuries", sql: `SELECT COUNT(*) AS n FROM injuries WHERE match_id IN (${STALE_MATCHES_SQL})` },
  { table: "bus_subsidies", sql: `SELECT COUNT(*) AS n FROM bus_subsidies WHERE match_id IN (${STALE_MATCHES_SQL})` },
  { table: "match_player_stats", sql: `SELECT COUNT(*) AS n FROM match_player_stats WHERE match_id IN (${STALE_MATCHES_SQL})` },
  { table: "bet_odds", sql: `SELECT COUNT(*) AS n FROM bet_odds WHERE match_id IN (${STALE_MATCHES_SQL})` },
  { table: "bet_selections", sql: `SELECT COUNT(*) AS n FROM bet_selections WHERE match_id IN (${STALE_MATCHES_SQL})` },
  // news.match_id je na produkci, v migracích ale chybí (čistá databáze ho nemá).
  { table: "news", sql: `SELECT COUNT(*) AS n FROM news WHERE match_id IN (${STALE_MATCHES_SQL})`, optionalColumn: { table: "news", column: "match_id" } },
];

export interface StaleRoundsLeague {
  leagueId: string;
  name: string;
  seasonNumber: number;
  rounds: number;
  matches: number;
  firstAt: string;
  lastAt: string;
}

export interface StaleRoundsResult {
  dryRun: boolean;
  rounds: number;
  matches: number;
  lineups: number;
  leagues: StaleRoundsLeague[];
  /** Odkazy, kvůli kterým se nic nesmaže (tabulka a počet řádků). */
  blockedBy: Array<{ table: string; rows: number }>;
  deleted: { matches: number; lineups: number; rounds: number } | null;
}

async function countOf(db: D1Database, sql: string): Promise<number> {
  return (await db.prepare(sql).first<{ n: number }>())?.n ?? 0;
}

/** Přehled starých neodehraných kol a (bez dryRun) jejich smazání v jedné transakci. */
export async function cleanupStaleRounds(db: D1Database, opts: { dryRun: boolean }): Promise<StaleRoundsResult> {
  const leagues = await db.prepare(
    `SELECT sc.league_id AS leagueId, COALESCE(l.name, sc.league_id) AS name, sc.season_number AS seasonNumber,
            COUNT(DISTINCT sc.id) AS rounds, COUNT(m.id) AS matches, MIN(sc.scheduled_at) AS firstAt, MAX(sc.scheduled_at) AS lastAt
       FROM season_calendar sc
       LEFT JOIN leagues l ON l.id = sc.league_id
       LEFT JOIN matches m ON m.calendar_id = sc.id
      WHERE sc.id IN (${STALE_ROUNDS_SQL})
      GROUP BY sc.league_id, sc.season_number ORDER BY name, sc.season_number`,
  ).all<StaleRoundsLeague>();
  const rounds = leagues.results.reduce((sum, l) => sum + l.rounds, 0);
  const matches = leagues.results.reduce((sum, l) => sum + l.matches, 0);
  const lineups = await countOf(db, `SELECT COUNT(*) AS n FROM lineups WHERE calendar_id IN (${STALE_ROUNDS_SQL})`);

  const blockedBy: StaleRoundsResult["blockedBy"] = [];
  for (const ref of BLOCKING_REFERENCES) {
    if (ref.optionalColumn) {
      // Jména jsou konstanty z tohoto souboru; stejný tvar dotazu už na D1 používá owner-activity.ts.
      const exists = await db.prepare(`SELECT 1 AS x FROM pragma_table_info('${ref.optionalColumn.table}') WHERE name = '${ref.optionalColumn.column}'`)
        .first<{ x: number }>();
      if (!exists) continue;
    }
    const rows = await countOf(db, ref.sql);
    if (rows > 0) blockedBy.push({ table: ref.table, rows });
  }

  const result: StaleRoundsResult = { dryRun: opts.dryRun, rounds, matches, lineups, leagues: leagues.results, blockedBy, deleted: null };
  if (opts.dryRun || rounds === 0 || blockedBy.length > 0) return result;

  // Pořadí kvůli cizím klíčům: zápasy drží sestavy i kola, kola drží navázaná kola U21.
  // Množina starých kol se počítá jen z kalendáře, takže se během dávky nemění, dokud
  // se nesmažou sama kola (poslední příkaz).
  const done = await db.batch([
    db.prepare(`UPDATE matches SET parent_match_id = NULL WHERE parent_match_id IN (${STALE_MATCHES_SQL})`),
    db.prepare(`DELETE FROM matches WHERE calendar_id IN (${STALE_ROUNDS_SQL})`),
    db.prepare(`DELETE FROM lineups WHERE calendar_id IN (${STALE_ROUNDS_SQL})`),
    db.prepare(`UPDATE season_calendar SET parent_calendar_id = NULL WHERE parent_calendar_id IN (${STALE_ROUNDS_SQL})`),
    db.prepare(`DELETE FROM season_calendar WHERE id IN (${STALE_ROUNDS_SQL})`),
  ]);
  result.deleted = { matches: done[1].meta?.changes ?? 0, lineups: done[2].meta?.changes ?? 0, rounds: done[4].meta?.changes ?? 0 };
  logger.info({ module: M }, `úklid starých neodehraných kol: ${result.deleted.rounds} kol, ${result.deleted.matches} zápasů, ${result.deleted.lineups} sestav`);
  return result;
}
