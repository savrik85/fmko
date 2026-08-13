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
  /** Góly z penalty (podmnožina goals) — pro žebříček exekutorů. */
  penaltyGoals: number;
  /** Nedaná penalta: vedle nebo chycená brankářem. */
  penaltyMisses: number;
  /** Góly ze standardky — přímý kop nebo po rohu (podmnožina goals). */
  setPieceGoals: number;
  /** Brankářské zákroky (bez chycených penalt, ty mají vlastní počítadlo). */
  saves: number;
  /** Chycené penalty. */
  penaltySaves: number;
  /** Obdržené góly — připisují se gólmanovi, který zápas odchytal. */
  goalsConceded: number;
  /** Odchytané zápasy (jen gólman) — jmenovatel gólmanského průměru. */
  keeperMatches: number;
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
        // Gól z penalty je zásluha menší než trefa ze hry
        ratings[dbId] += event.source === "penalty" ? 0.8 : 1.0;
        break;
      case "assist":
        ratings[dbId] += 0.5;
        break;
      case "chance":
        chances[dbId] = (chances[dbId] ?? 0) + 1;
        // Zahozená penalta je nejdražší chyba zápasu, ne "šance navíc"
        if (event.detail === "penalty_missed") ratings[dbId] -= 0.8;
        else if (event.detail === "penalty_saved") ratings[dbId] -= 0.6;
        else ratings[dbId] += 0.1;
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
        if (event.detail === "penalty_save") ratings[dbId] += 1.0;
        else if (event.detail === "save") ratings[dbId] += 0.4;
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
  /** Obdržené góly týmu + pozice hráčů — bez nich se gólmanovi nepřipíše nic. */
  keeperCtx?: { concededGoals: number; positions: Map<string, string> },
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
      penaltyGoals: 0, penaltyMisses: 0, setPieceGoals: 0,
      saves: 0, penaltySaves: 0, goalsConceded: 0, keeperMatches: 0,
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
          penaltyGoals: 0, penaltyMisses: 0, setPieceGoals: 0,
          saves: 0, penaltySaves: 0, goalsConceded: 0, keeperMatches: 0,
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

    const sp = setPieceDelta(event);
    s.penaltyGoals += sp.penaltyGoals;
    s.penaltyMisses += sp.penaltyMisses;
    s.setPieceGoals += sp.setPieceGoals;

    const k = keeperDelta(event);
    s.saves += k.saves;
    s.penaltySaves += k.penaltySaves;
  }

  // Obdržené góly patří gólmanovi, který zápas odchytal — při střídání tomu s víc minutami.
  // Zápas se mu započítá i při čistém kontu, jinak by průměr měl špatný jmenovatel.
  if (keeperCtx) {
    let keeper: StatsUpdate | null = null;
    for (const s of stats.values()) {
      if (keeperCtx.positions.get(s.playerId) !== "GK") continue;
      if (!keeper || s.minutesPlayed > keeper.minutesPlayed) keeper = s;
    }
    if (keeper) {
      keeper.goalsConceded += keeperCtx.concededGoals;
      keeper.keeperMatches += 1;
    }
  }

  return [...stats.values()];
}

/**
 * Brankářský příspěvek jedné události. Chycená penalta se počítá zvlášť od běžného zákroku,
 * aby šlo mít oba žebříčky.
 */
export function keeperDelta(event: MatchEvent): { saves: number; penaltySaves: number } {
  if (event.type !== "special") return { saves: 0, penaltySaves: 0 };
  if (event.detail === "penalty_save") return { saves: 0, penaltySaves: 1 };
  if (event.detail === "save") return { saves: 1, penaltySaves: 0 };
  return { saves: 0, penaltySaves: 0 };
}

/**
 * Standardkový příspěvek jedné události. Sdílí ho živý zápis statistik i zpětný dopočet
 * z uložených záznamů zápasů, aby obě cesty počítaly stejně.
 * Gól bez `source` je starší záznam z doby před standardkami → bere se jako gól ze hry.
 */
export function setPieceDelta(event: MatchEvent): { penaltyGoals: number; penaltyMisses: number; setPieceGoals: number } {
  const none = { penaltyGoals: 0, penaltyMisses: 0, setPieceGoals: 0 };
  if (event.type === "goal") {
    if (event.source === "penalty") return { ...none, penaltyGoals: 1 };
    if (event.source === "freekick" || event.source === "corner") return { ...none, setPieceGoals: 1 };
    return none;
  }
  // Nedaná penalta je v enginu zahozená šance s příznakem — vedle i chycená brankářem.
  if (event.type === "chance" && (event.detail === "penalty_missed" || event.detail === "penalty_saved")) {
    return { ...none, penaltyMisses: 1 };
  }
  return none;
}

/**
 * Určí hráče zápasu (MVP) — hráč s nejvyšším ratingem napříč oběma týmy.
 * Vrací null pokud žádný hráč nemá rating ≥ MOM_MIN_RATING (zápas bez výrazného výkonu).
 */
const MOM_MIN_RATING = 7.0;
export function determineManOfMatch(playerRatings: Record<string, number>): string | null {
  let bestId: string | null = null;
  let bestRating = MOM_MIN_RATING - 0.0001;
  for (const [pid, rating] of Object.entries(playerRatings)) {
    if (rating > bestRating) {
      bestRating = rating;
      bestId = pid;
    }
  }
  return bestId;
}

/**
 * Uloží mom_player_id do matches.
 */
export async function saveMatchMom(db: D1Database, matchId: string, momPlayerId: string | null): Promise<void> {
  if (!momPlayerId) return;
  await db.prepare("UPDATE matches SET mom_player_id = ? WHERE id = ?")
    .bind(momPlayerId, matchId).run()
    .catch((e) => logger.warn({ module: "stats" }, "save match MoM", e));
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
  momPlayerId?: string | null,
): Promise<void> {
  if (updates.length === 0) return;
  const stmts = updates.map((u) => {
    const isMom = momPlayerId != null && u.playerId === momPlayerId;
    return db.prepare(
      `INSERT INTO player_stats (id, player_id, team_id, season_id, appearances, goals, assists, yellow_cards, red_cards, minutes_played, avg_rating, clean_sheets, man_of_match, penalty_goals, penalty_misses, setpiece_goals, saves, penalty_saves, goals_conceded, keeper_matches)
       VALUES (?, ?, ?, ?, 1, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(player_id, team_id, season_id) DO UPDATE SET
         appearances = appearances + 1,
         goals = goals + ?,
         assists = assists + ?,
         yellow_cards = yellow_cards + ?,
         red_cards = red_cards + ?,
         minutes_played = minutes_played + ?,
         avg_rating = (avg_rating * appearances + ?) / (appearances + 1),
         clean_sheets = clean_sheets + ?,
         man_of_match = man_of_match + ?,
         penalty_goals = penalty_goals + ?,
         penalty_misses = penalty_misses + ?,
         setpiece_goals = setpiece_goals + ?,
         saves = saves + ?,
         penalty_saves = penalty_saves + ?,
         goals_conceded = goals_conceded + ?,
         keeper_matches = keeper_matches + ?`
    ).bind(
      crypto.randomUUID(), u.playerId, teamId, seasonId,
      u.goals, u.assists, u.yellowCards, u.redCards, u.minutesPlayed, u.rating, isCleanSheet ? 1 : 0, isMom ? 1 : 0,
      u.penaltyGoals, u.penaltyMisses, u.setPieceGoals, u.saves, u.penaltySaves, u.goalsConceded, u.keeperMatches,
      u.goals, u.assists, u.yellowCards, u.redCards, u.minutesPlayed, u.rating, isCleanSheet ? 1 : 0, isMom ? 1 : 0,
      u.penaltyGoals, u.penaltyMisses, u.setPieceGoals, u.saves, u.penaltySaves, u.goalsConceded, u.keeperMatches,
    );
  });
  await db.batch(stmts).catch((e) => logger.warn({ module: "stats" }, "batch upsert stats", e));
}