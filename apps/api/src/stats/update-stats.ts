/**
 * Aktualizace hráčských statistik po odehraném zápase.
 * Projde match events a inkrementuje goals/assists/cards v player_stats.
 */

import type { MatchEvent } from "@okresni-masina/shared";

interface StatsUpdate {
  playerId: string;
  goals: number;
  assists: number;
  yellowCards: number;
  redCards: number;
  appeared: boolean;
  minutesPlayed: number;
  rating: number;
}

export interface MatchPlayerStatsEntry {
  playerId: string;
  teamId: string;
  started: boolean;
  position: string;
  minutesPlayed: number;
  goals: number;
  assists: number;
  yellowCards: number;
  redCards: number;
  rating: number;
}

/**
 * Vypočítá individuální hodnocení hráčů (1.0–10.0) na základě match eventů.
 * Základ 6.0, góly/asistence přidávají, karty/fauly odečítají.
 */
export function calculatePlayerRatings(
  events: MatchEvent[],
  playerIdMap: Map<number, string>,
  homeTeamEngineId: number,
  homeScore: number,
  awayScore: number,
): Record<string, number> {
  const ratings: Record<string, number> = {};
  const goals: Record<string, number> = {};
  const cards: Record<string, number> = {};
  const fouls: Record<string, number> = {};
  const chances: Record<string, number> = {};
  const teamMap: Record<string, number> = {};

  // Init all known players
  for (const [engineId, dbId] of playerIdMap) {
    ratings[dbId] = 6.0;
    goals[dbId] = 0;
    cards[dbId] = 0;
    fouls[dbId] = 0;
    chances[dbId] = 0;
  }

  for (const event of events) {
    const dbId = playerIdMap.get(event.playerId);
    if (!dbId) continue;

    teamMap[dbId] = event.teamId;

    switch (event.type) {
      case "goal":
        goals[dbId] = (goals[dbId] ?? 0) + 1;
        ratings[dbId] += 1.0; // +1.0 per gól
        break;
      case "chance":
        chances[dbId] = (chances[dbId] ?? 0) + 1;
        ratings[dbId] += 0.1; // malý bonus za šanci
        break;
      case "card":
        if (event.detail === "red") {
          ratings[dbId] -= 1.5;
          cards[dbId] = (cards[dbId] ?? 0) + 2;
        } else {
          ratings[dbId] -= 0.5;
          cards[dbId] = (cards[dbId] ?? 0) + 1;
        }
        break;
      case "foul":
        fouls[dbId] = (fouls[dbId] ?? 0) + 1;
        ratings[dbId] -= 0.15;
        break;
      case "injury":
        ratings[dbId] -= 0.3;
        break;
    }
  }

  // Bonus/malus za výsledek týmu
  for (const [dbId, teamEngineId] of Object.entries(teamMap)) {
    const isHome = teamEngineId === homeTeamEngineId;
    const myScore = isHome ? homeScore : awayScore;
    const oppScore = isHome ? awayScore : homeScore;

    if (myScore > oppScore) {
      ratings[dbId] += 0.5; // výhra
    } else if (myScore < oppScore) {
      ratings[dbId] -= 0.3; // prohra
    }
  }

  // Clamp 1.0–10.0 a zaokrouhli na 1 desetinné místo
  for (const dbId of Object.keys(ratings)) {
    ratings[dbId] = Math.round(Math.max(1.0, Math.min(10.0, ratings[dbId])) * 10) / 10;
  }

  return ratings;
}

/**
 * Uloží per-match statistiky hráčů do match_player_stats.
 */
export async function saveMatchPlayerStats(
  db: D1Database,
  matchId: string,
  entries: MatchPlayerStatsEntry[],
): Promise<void> {
  for (const e of entries) {
    await db.prepare(
      `INSERT INTO match_player_stats (id, match_id, player_id, team_id, started, position, minutes_played, goals, assists, yellow_cards, red_cards, rating)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(match_id, player_id) DO NOTHING`
    ).bind(
      crypto.randomUUID(), matchId, e.playerId, e.teamId,
      e.started ? 1 : 0, e.position, e.minutesPlayed,
      e.goals, e.assists, e.yellowCards, e.redCards, e.rating,
    ).run().catch(() => {});
  }
}

/**
 * Zpracuje match eventy a vrátí stats updaty per hráč.
 * playerIdMap mapuje match engine ID (number) → DB player ID (string).
 */
export function extractStatsFromEvents(
  events: MatchEvent[],
  playerIdMap: Map<number, string>,
  allPlayerIds: string[],
  playerRatings: Record<string, number>,
): StatsUpdate[] {
  const stats = new Map<string, StatsUpdate>();

  // Init all players who appeared
  for (const pid of allPlayerIds) {
    stats.set(pid, {
      playerId: pid,
      goals: 0,
      assists: 0,
      yellowCards: 0,
      redCards: 0,
      appeared: true,
      minutesPlayed: 90,
      rating: playerRatings[pid] ?? 6.0,
    });
  }

  for (const event of events) {
    const pid = playerIdMap.get(event.playerId);
    if (!pid) continue;
    const s = stats.get(pid);
    if (!s) continue;

    switch (event.type) {
      case "goal":
        s.goals++;
        break;
      case "card":
        if (event.detail === "red") {
          s.redCards++;
        } else {
          s.yellowCards++;
        }
        break;
      case "substitution":
        // Player subbed off — reduce minutes
        s.minutesPlayed = event.minute;
        break;
    }
  }

  return [...stats.values()];
}

/**
 * Upsert player stats do DB.
 */
export async function updatePlayerStats(
  db: D1Database,
  seasonId: string,
  teamId: string,
  updates: StatsUpdate[],
  isCleanSheet: boolean,
): Promise<void> {
  for (const u of updates) {
    // Try insert, on conflict update
    await db.prepare(
      `INSERT INTO player_stats (id, player_id, team_id, season_id, appearances, goals, assists, yellow_cards, red_cards, minutes_played, avg_rating, clean_sheets)
       VALUES (?, ?, ?, ?, 1, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(player_id, season_id) DO UPDATE SET
         appearances = appearances + 1,
         goals = goals + ?,
         assists = assists + ?,
         yellow_cards = yellow_cards + ?,
         red_cards = red_cards + ?,
         minutes_played = minutes_played + ?,
         avg_rating = (avg_rating * appearances + ?) / (appearances + 1),
         clean_sheets = clean_sheets + ?`
    ).bind(
      crypto.randomUUID(), u.playerId, teamId, seasonId,
      u.goals, u.assists, u.yellowCards, u.redCards, u.minutesPlayed, u.rating, isCleanSheet ? 1 : 0,
      // ON CONFLICT values:
      u.goals, u.assists, u.yellowCards, u.redCards, u.minutesPlayed, u.rating, isCleanSheet ? 1 : 0,
    ).run().catch(() => {});
  }
}