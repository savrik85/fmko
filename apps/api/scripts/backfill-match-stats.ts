/**
 * Backfill script: naplní match_player_stats z existujících zápasů.
 * Spouští se přes wrangler d1 execute nebo jako jednorázový worker.
 *
 * Použití: curl -X POST http://localhost:8787/api/admin/backfill-match-stats
 */

import type { MatchEvent } from "@okresni-masina/shared";

interface BackfillEntry {
  matchId: string;
  playerId: string;
  teamId: string;
  position: string;
  started: boolean;
  minutesPlayed: number;
  goals: number;
  assists: number;
  yellowCards: number;
  redCards: number;
  rating: number;
}

function calculateRating(
  events: MatchEvent[],
  engineId: number,
  teamEngineId: number,
  homeTeamEngineId: number,
  homeScore: number,
  awayScore: number,
): number {
  let rating = 6.0;
  const isHome = teamEngineId === homeTeamEngineId;
  const myScore = isHome ? homeScore : awayScore;
  const oppScore = isHome ? awayScore : homeScore;

  for (const e of events) {
    if (e.playerId !== engineId) continue;
    switch (e.type) {
      case "goal": rating += 1.0; break;
      case "chance": rating += 0.1; break;
      case "card": rating -= e.detail === "red" ? 1.5 : 0.5; break;
      case "foul": rating -= 0.15; break;
      case "injury": rating -= 0.3; break;
    }
  }

  if (myScore > oppScore) rating += 0.5;
  else if (myScore < oppScore) rating -= 0.3;

  return Math.round(Math.max(1.0, Math.min(10.0, rating)) * 10) / 10;
}

export async function backfillMatchStats(db: D1Database): Promise<{ processed: number; entries: number }> {
  // Get all simulated matches with events
  const matches = await db.prepare(
    `SELECT m.id, m.home_team_id, m.away_team_id, m.home_score, m.away_score, m.events
     FROM matches m
     WHERE m.status = 'simulated' AND m.events IS NOT NULL AND LENGTH(m.events) > 10
     ORDER BY m.simulated_at ASC`
  ).all();

  let totalEntries = 0;

  for (const match of matches.results) {
    const matchId = match.id as string;
    const homeTeamId = match.home_team_id as string;
    const awayTeamId = match.away_team_id as string;
    const homeScore = match.home_score as number;
    const awayScore = match.away_score as number;

    // Skip if already backfilled
    const existing = await db.prepare(
      "SELECT COUNT(*) as cnt FROM match_player_stats WHERE match_id = ?"
    ).bind(matchId).first<{ cnt: number }>();
    if (existing && existing.cnt > 0) continue;

    const events: MatchEvent[] = JSON.parse(match.events as string);

    // Get players for both teams (same order as match-runner: overall_rating DESC)
    const homePlayers = await db.prepare(
      "SELECT id, position FROM players WHERE team_id = ? ORDER BY overall_rating DESC LIMIT 16"
    ).bind(homeTeamId).all();
    const awayPlayers = await db.prepare(
      "SELECT id, position FROM players WHERE team_id = ? ORDER BY overall_rating DESC LIMIT 16"
    ).bind(awayTeamId).all();

    // Build engine ID → DB ID maps (same as match-runner: sequential starting from 1)
    const homeIdMap = new Map<number, { dbId: string; position: string }>();
    const awayIdMap = new Map<number, { dbId: string; position: string }>();

    let counter = 1;
    for (const p of homePlayers.results) {
      homeIdMap.set(counter++, { dbId: p.id as string, position: p.position as string });
    }
    counter = 1;
    for (const p of awayPlayers.results) {
      awayIdMap.set(counter++, { dbId: p.id as string, position: p.position as string });
    }

    // Determine which engine IDs belong to which team from events
    const engineTeamMap = new Map<string, number>(); // "engineId-teamEngineId" → teamEngineId
    for (const e of events) {
      engineTeamMap.set(`${e.playerId}-${e.teamId}`, e.teamId);
    }

    // Process home team starters (first 11)
    const entries: BackfillEntry[] = [];

    for (const [engineId, info] of homeIdMap) {
      if (engineId > 11) continue; // Only starters

      let goals = 0, yellows = 0, reds = 0, minutes = 90;
      for (const e of events) {
        if (e.playerId === engineId && e.teamId === 1) {
          if (e.type === "goal") goals++;
          else if (e.type === "card") {
            if (e.detail === "red") reds++;
            else yellows++;
          } else if (e.type === "substitution") {
            minutes = e.minute;
          }
        }
      }

      const rating = calculateRating(events, engineId, 1, 1, homeScore, awayScore);

      entries.push({
        matchId, playerId: info.dbId, teamId: homeTeamId,
        position: info.position, started: true,
        minutesPlayed: minutes, goals, assists: 0,
        yellowCards: yellows, redCards: reds, rating,
      });
    }

    // Process away team starters
    for (const [engineId, info] of awayIdMap) {
      if (engineId > 11) continue;

      let goals = 0, yellows = 0, reds = 0, minutes = 90;
      for (const e of events) {
        if (e.playerId === engineId && e.teamId === 2) {
          if (e.type === "goal") goals++;
          else if (e.type === "card") {
            if (e.detail === "red") reds++;
            else yellows++;
          } else if (e.type === "substitution") {
            minutes = e.minute;
          }
        }
      }

      const rating = calculateRating(events, engineId, 2, 1, homeScore, awayScore);

      entries.push({
        matchId, playerId: info.dbId, teamId: awayTeamId,
        position: info.position, started: true,
        minutesPlayed: minutes, goals, assists: 0,
        yellowCards: yellows, redCards: reds, rating,
      });
    }

    // Insert all entries
    for (const e of entries) {
      await db.prepare(
        `INSERT INTO match_player_stats (id, match_id, player_id, team_id, started, position, minutes_played, goals, assists, yellow_cards, red_cards, rating)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(match_id, player_id) DO NOTHING`
      ).bind(
        crypto.randomUUID(), e.matchId, e.playerId, e.teamId,
        e.started ? 1 : 0, e.position, e.minutesPlayed,
        e.goals, e.assists, e.yellowCards, e.redCards, e.rating,
      ).run().catch(() => {});
    }

    totalEntries += entries.length;
  }

  return { processed: matches.results.length, entries: totalEntries };
}
