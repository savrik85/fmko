/**
 * Backfill script: dopočítá assists v existujících match_player_stats rows.
 *
 * Důvod: backfill-match-stats.ts dříve ukládal assists: 0. Nové zápasy
 * již assists plní správně přes update-stats.ts:213, ale staré řádky mají 0.
 *
 * Tento skript projede všechny 'simulated' zápasy, vytáhne assist eventy
 * a nastaví match_player_stats.assists podle počtu assistů daného hráče.
 *
 * Spouští se z admin endpoint:
 *   curl -X POST http://localhost:8787/api/admin/backfill-assists
 */

import type { MatchEvent } from "@okresni-masina/shared";
import { logger } from "../src/lib/logger";

export async function backfillAssists(db: D1Database): Promise<{
  processed: number; updated: number; skipped: number;
}> {
  let updated = 0;
  let skipped = 0;

  // All matches with events that already have match_player_stats rows
  const matches = await db.prepare(
    `SELECT m.id, m.home_team_id, m.away_team_id, m.events
     FROM matches m
     WHERE m.status = 'simulated'
       AND m.events IS NOT NULL
       AND LENGTH(m.events) > 10
     ORDER BY m.simulated_at ASC`
  ).all<{ id: string; home_team_id: string; away_team_id: string; events: string }>();

  for (const match of matches.results) {
    let events: MatchEvent[];
    try {
      events = JSON.parse(match.events);
    } catch (e) {
      logger.warn({ module: "backfill-assists" }, `parse events for match ${match.id}`, e);
      skipped++;
      continue;
    }

    // Map engine teamId (1=home, 2=away) to DB team_id
    const teamMap: Record<number, string> = { 1: match.home_team_id, 2: match.away_team_id };

    // Pull existing rows so we can match assist eventů → DB rows.
    // We have engineId (event.playerId) and teamId (1/2). We need to identify
    // which DB row corresponds. The match_player_stats table doesn't store
    // engineId, so we rely on the same ordering match-runner used:
    // overall_rating DESC, sequential 1..16 per team.
    const homeRows = await db.prepare(
      "SELECT player_id FROM match_player_stats WHERE match_id = ? AND team_id = ? ORDER BY rowid"
    ).bind(match.id, match.home_team_id).all<{ player_id: string }>();
    const awayRows = await db.prepare(
      "SELECT player_id FROM match_player_stats WHERE match_id = ? AND team_id = ? ORDER BY rowid"
    ).bind(match.id, match.away_team_id).all<{ player_id: string }>();

    if (homeRows.results.length === 0 && awayRows.results.length === 0) {
      skipped++;
      continue;
    }

    // The original backfill iterated homeIdMap (1..16) by overall_rating DESC.
    // We need the same ordering to match engineId → DB row.
    // But the existing rows might be only starters (engineId 1..11).
    // For each assist event, find DB row by engineId via fresh ordering.
    const homePlayersByRank = await db.prepare(
      "SELECT id FROM players WHERE team_id = ? ORDER BY overall_rating DESC LIMIT 16"
    ).bind(match.home_team_id).all<{ id: string }>();
    const awayPlayersByRank = await db.prepare(
      "SELECT id FROM players WHERE team_id = ? ORDER BY overall_rating DESC LIMIT 16"
    ).bind(match.away_team_id).all<{ id: string }>();

    const homeEngineToDb = new Map<number, string>();
    homePlayersByRank.results.forEach((p, idx) => homeEngineToDb.set(idx + 1, p.id));
    const awayEngineToDb = new Map<number, string>();
    awayPlayersByRank.results.forEach((p, idx) => awayEngineToDb.set(idx + 1, p.id));

    // Count assists per DB player ID
    const assistCount = new Map<string, number>();
    for (const e of events) {
      if (e.type !== "assist") continue;
      const map = e.teamId === 1 ? homeEngineToDb : awayEngineToDb;
      const dbId = map.get(e.playerId);
      if (!dbId) continue;
      assistCount.set(dbId, (assistCount.get(dbId) ?? 0) + 1);
    }

    // Update rows where assist count differs
    for (const [playerId, count] of assistCount) {
      if (count === 0) continue;
      await db.prepare(
        "UPDATE match_player_stats SET assists = ? WHERE match_id = ? AND player_id = ? AND assists = 0"
      ).bind(count, match.id, playerId).run().catch((err) =>
        logger.warn({ module: "backfill-assists" }, `update assists ${match.id}/${playerId}`, err)
      );
      updated++;
    }
  }

  return { processed: matches.results.length, updated, skipped };
}
