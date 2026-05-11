/**
 * Po odehraném U21 zápase vrátí hráče s `next_match_return=1` zpět do A-týmu.
 * Volá se z match-tick v src/index.ts po simulaci kola.
 */

import { logger } from "../lib/logger";

/**
 * Vrátí hráče s next_match_return=1, kteří patří do U21 týmů z daného calendar entry.
 * Vrací počet vrácených hráčů.
 */
export async function returnNextMatchPlayers(
  db: D1Database,
  u21CalendarId: string,
): Promise<number> {
  // Najdi hráče čekající na návrat ze všech U21 týmů hrajících v tomto kole
  const rows = await db.prepare(
    `SELECT p.id, p.parent_club_id
       FROM players p
       JOIN teams t ON t.id = p.team_id
      WHERE t.team_type = 'u21'
        AND t.league_id IN (SELECT league_id FROM season_calendar WHERE id = ?)
        AND p.next_match_return = 1
        AND p.parent_club_id IS NOT NULL`
  ).bind(u21CalendarId).all<{ id: string; parent_club_id: string }>();

  if (rows.results.length === 0) return 0;

  const stmts = rows.results.map((r) =>
    db.prepare(
      "UPDATE players SET team_id = ?, parent_club_id = NULL, next_match_return = 0 WHERE id = ?"
    ).bind(r.parent_club_id, r.id)
  );

  try {
    await db.batch(stmts);
  } catch (e) {
    logger.error({ module: "u21-return" }, `batch return players for cal ${u21CalendarId}`, e);
    return 0;
  }

  return rows.results.length;
}
