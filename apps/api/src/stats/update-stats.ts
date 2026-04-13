import { logger } from "../lib/logger";
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
  playerPositions?: Map<number, string>,
): Record<string, number> {
  const ratings: Record<string, number> = {};
  const goals: Record<string, number> = {};
  const cards: Record<string, number> = {};
  const fouls: Record<string, number> = {};
  const chances: Record<string, number> = {};
  const teamMap: Record<string, number> = {};

  // Init all known players with position-based baseline
  for (const [engineId, dbId] of playerIdMap) {
    const pos = playerPositions?.get(engineId);
    // DEF/GK get +0.2 baseline since they rarely get positive events
    ratings[dbId] = 6.0 + ((pos === "DEF" || pos === "GK") ? 0.2 : 0);
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
        ratings[dbId] += 1.0;
        break;
      case "assist":
        ratings[dbId] += 0.5;
        break;
      case "chance":
        chances[dbId] = (chances[dbId] ?? 0) + 1;
        ratings[dbId] += 0.1;
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
      case "special":
        if (event.detail === "save") ratings[dbId] += 0.4;
        else if (event.detail === "block") ratings[dbId] += 0.25;
        break;
    }
  }

  // Bonus/malus za výsledek týmu + clean sheet
  for (const [dbId, teamEngineId] of Object.entries(teamMap)) {
    const isHome = teamEngineId === homeTeamEngineId;
    const myScore = isHome ? homeScore : awayScore;
    const oppScore = isHome ? awayScore : homeScore;

    if (myScore > oppScore) {
      ratings[dbId] += 0.5;
    } else if (myScore < oppScore) {
      ratings[dbId] -= 0.3;
    }

    // Clean sheet bonus for DEF and GK
    if (oppScore === 0 && playerPositions) {
      for (const [engineId, pid] of playerIdMap) {
        if (pid !== dbId) continue;
        const pos = playerPositions.get(engineId);
        if ((pos === "DEF" || pos === "GK") && teamMap[pid] === teamEngineId) {
          ratings[dbId] += 0.8;
        }
      }
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
  if (entries.length === 0) return;
  const stmts = entries.map((e) =>
    db.prepare(
      `INSERT INTO match_player_stats (id, match_id, player_id, team_id, started, position, minutes_played, goals, assists, yellow_cards, red_cards, rating)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(match_id, player_id) DO NOTHING`
    ).bind(
      crypto.randomUUID(), matchId, e.playerId, e.teamId,
      e.started ? 1 : 0, e.position, e.minutesPlayed,
      e.goals, e.assists, e.yellowCards, e.redCards, e.rating,
    )
  );
  await db.batch(stmts).catch((e) => logger.warn({ module: "stats" }, "batch save match player stats", e));
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
  playerMinutes?: Record<number, { entered: number; left: number | null }>,
): StatsUpdate[] {
  const stats = new Map<string, StatsUpdate>();

  // Build reverse map: dbId → engineId
  const reverseMap = new Map<string, number>();
  for (const [engineId, dbId] of playerIdMap) reverseMap.set(dbId, engineId);

  // Init all players who appeared (starters + substitutes)
  for (const pid of allPlayerIds) {
    const engineId = reverseMap.get(pid);
    let minutes = 90;
    if (playerMinutes && engineId != null && playerMinutes[engineId]) {
      const pm = playerMinutes[engineId];
      minutes = (pm.left ?? 90) - pm.entered;
    }
    stats.set(pid, {
      playerId: pid, goals: 0, assists: 0, yellowCards: 0, redCards: 0,
      appeared: true, minutesPlayed: Math.max(0, minutes),
      rating: playerRatings[pid] ?? 6.0,
    });
  }

  // Also add substitutes who entered (they might not be in allPlayerIds/starterIds)
  if (playerMinutes) {
    for (const [engineId, pm] of Object.entries(playerMinutes)) {
      const dbId = playerIdMap.get(Number(engineId));
      if (dbId && !stats.has(dbId) && pm.entered > 0) {
        stats.set(dbId, {
          playerId: dbId, goals: 0, assists: 0, yellowCards: 0, redCards: 0,
          appeared: true, minutesPlayed: Math.max(0, ((pm as any).left ?? 90) - (pm as any).entered),
          rating: playerRatings[dbId] ?? 6.0,
        });
      }
    }
  }

  for (const event of events) {
    const pid = playerIdMap.get(event.playerId);
    if (!pid) continue;
    const s = stats.get(pid);
    if (!s) continue;

    switch (event.type) {
      case "goal": s.goals++; break;
      case "assist": s.assists++; break;
      case "card":
        if (event.detail === "red") s.redCards++;
        else s.yellowCards++;
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
  if (updates.length === 0) return;
  const stmts = updates.map((u) =>
    db.prepare(
      `INSERT INTO player_stats (id, player_id, team_id, season_id, appearances, goals, assists, yellow_cards, red_cards, minutes_played, avg_rating, clean_sheets)
       VALUES (?, ?, ?, ?, 1, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(player_id, team_id, season_id) DO UPDATE SET
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
      u.goals, u.assists, u.yellowCards, u.redCards, u.minutesPlayed, u.rating, isCleanSheet ? 1 : 0,
    )
  );
  await db.batch(stmts).catch((e) => logger.warn({ module: "stats" }, "batch upsert stats", e));
}