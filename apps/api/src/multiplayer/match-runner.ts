/**
 * Match runner — orchestruje plnou simulaci zápasu.
 * Volán z daily-tick nebo cron triggeru.
 */

import { simulateMatch } from "../engine/simulation";
import { generateMatchCommentary, loadCommentaryFromDB } from "../engine/commentary";
import { createRng } from "../generators/rng";
import type { MatchPlayer, TeamSetup, Weather } from "../engine/types";
import { calculatePlayerRatings, extractStatsFromEvents, updatePlayerStats, saveMatchPlayerStats, type MatchPlayerStatsEntry } from "../stats/update-stats";
import { logger } from "../lib/logger";

export interface MatchRunResult {
  matchId: string;
  homeScore: number;
  awayScore: number;
  eventsCount: number;
  matchType: "pvp" | "pve_home" | "pve_away" | "ai_vs_ai";
}

export async function runScheduledMatches(
  db: D1Database,
  calendarId: string,
): Promise<MatchRunResult[]> {
  const results: MatchRunResult[] = [];

  const matches = await db.prepare(
    "SELECT * FROM matches WHERE calendar_id = ? AND status = 'lineups_open'"
  ).bind(calendarId).all();

  // Pick weather for the whole round
  const weathers: Weather[] = ["sunny", "cloudy", "rain", "wind", "snow"];
  const weatherWeights = [30, 30, 20, 15, 5];
  const weatherRoll = Math.random() * 100;
  let cumulative = 0;
  let weather: Weather = "cloudy";
  for (let i = 0; i < weathers.length; i++) {
    cumulative += weatherWeights[i];
    if (weatherRoll < cumulative) { weather = weathers[i]; break; }
  }

  for (const match of matches.results) {
    const matchId = match.id as string;
    const homeTeamId = match.home_team_id as string;
    const awayTeamId = match.away_team_id as string;

    try {
      // Ensure lineups exist
      const hasHomeLineup = await db.prepare(
        "SELECT id FROM lineups WHERE team_id = ? AND calendar_id = ?"
      ).bind(homeTeamId, calendarId).first();
      if (!hasHomeLineup) await createAutoLineup(db, homeTeamId, calendarId);

      const hasAwayLineup = await db.prepare(
        "SELECT id FROM lineups WHERE team_id = ? AND calendar_id = ?"
      ).bind(awayTeamId, calendarId).first();
      if (!hasAwayLineup) await createAutoLineup(db, awayTeamId, calendarId);

      // Create RNG for this match
      const rng = createRng(Date.now() + matchId.charCodeAt(0));

      // Determine match type
      const homeTeam = await db.prepare("SELECT name, user_id FROM teams WHERE id = ?").bind(homeTeamId).first<Record<string, unknown>>();
      const awayTeam = await db.prepare("SELECT name, user_id FROM teams WHERE id = ?").bind(awayTeamId).first<Record<string, unknown>>();
      const homeIsHuman = homeTeam?.user_id !== "ai";
      const awayIsHuman = awayTeam?.user_id !== "ai";
      const matchType: MatchRunResult["matchType"] = homeIsHuman && awayIsHuman ? "pvp"
        : homeIsHuman ? "pve_home" : awayIsHuman ? "pve_away" : "ai_vs_ai";

      // Read user lineups from DB
      const homeLineupRow = await db.prepare("SELECT tactic, players_data, is_auto FROM lineups WHERE team_id = ? AND calendar_id = ?")
        .bind(homeTeamId, calendarId).first<{ tactic: string; players_data: string; is_auto: number }>().catch((e) => { logger.warn({ module: "match-runner" }, "Failed to load home lineup", e); return null; });
      const awayLineupRow = await db.prepare("SELECT tactic, players_data, is_auto FROM lineups WHERE team_id = ? AND calendar_id = ?")
        .bind(awayTeamId, calendarId).first<{ tactic: string; players_data: string; is_auto: number }>().catch((e) => { logger.warn({ module: "match-runner" }, "Failed to load away lineup", e); return null; });

      // Build match players — respect user lineup order if set
      const homeBuild = await buildMatchPlayers(db, homeTeamId, rng,
        homeLineupRow && homeLineupRow.is_auto === 0 ? homeLineupRow.players_data : null);
      const awayBuild = await buildMatchPlayers(db, awayTeamId, rng,
        awayLineupRow && awayLineupRow.is_auto === 0 ? awayLineupRow.players_data : null);

      const homeLineup = homeBuild.players;
      const awayLineup = awayBuild.players;

      const homeSubs = homeLineup.splice(11);
      const awaySubs = awayLineup.splice(11);

      // Merge ID maps (engine ID → DB player ID)
      const fullIdMap = new Map<number, string>();
      for (const [k, v] of homeBuild.idMap) fullIdMap.set(k, v);
      for (const [k, v] of awayBuild.idMap) fullIdMap.set(k, v);

      // Merge position maps
      const fullPosMap = new Map<string, string>();
      for (const [k, v] of homeBuild.positionMap) fullPosMap.set(k, v);
      for (const [k, v] of awayBuild.positionMap) fullPosMap.set(k, v);

      const homeTactic = (homeLineupRow?.tactic as any) ?? "balanced";
      const awayTactic = (awayLineupRow?.tactic as any) ?? "balanced";

      const homeSetup: TeamSetup = {
        teamId: 1,
        teamName: (homeTeam?.name as string) ?? "Domácí",
        lineup: homeLineup,
        subs: homeSubs,
        tactic: homeTactic,
      };
      const awaySetup: TeamSetup = {
        teamId: 2,
        teamName: (awayTeam?.name as string) ?? "Hosté",
        lineup: awayLineup,
        subs: awaySubs,
        tactic: awayTactic,
      };

      // Load stadium info for pitch condition + facilities
      const stadiumRow = await db.prepare("SELECT * FROM stadiums WHERE team_id = ?")
        .bind(homeTeamId).first<Record<string, unknown>>().catch((e) => { logger.warn({ module: "match-runner" }, "Failed to load stadium", e); return null; });
      const pitchCondition = (stadiumRow?.pitch_condition as number) ?? 50;
      const stadiumNameRow = await db.prepare("SELECT stadium_name FROM teams WHERE id = ?")
        .bind(homeTeamId).first<{ stadium_name: string }>().catch((e) => { logger.warn({ module: "match-runner" }, "Failed to load stadium name", e); return null; });
      const stadiumName = stadiumNameRow?.stadium_name ?? null;

      // Calculate facility effects
      const { calculateFacilityEffects } = await import("../stadium/stadium-generator");
      const facilities: Record<string, number> = {};
      if (stadiumRow) {
        for (const key of ["changing_rooms", "showers", "refreshments", "lighting", "stands", "parking", "fence"]) {
          facilities[key] = (stadiumRow[key] as number) ?? 0;
        }
      }
      const facilityEffects = calculateFacilityEffects(facilities);
      const stadiumCapacity = ((stadiumRow?.capacity as number) ?? 200) + facilityEffects.capacityBonus;

      // Attendance: population + reputation + form + facility bonuses
      const homeInfo = await db.prepare(
        "SELECT v.population, v.size, t.reputation FROM villages v JOIN teams t ON t.village_id = v.id WHERE t.id = ?"
      ).bind(homeTeamId).first<{ population: number; size: string; reputation: number }>().catch((e) => { logger.warn({ module: "match-runner" }, "Failed to load home village info", e); return null; });
      const pop = homeInfo?.population ?? 500;
      const rep = homeInfo?.reputation ?? 50;
      // Base from population (2-5% of village comes)
      const popBase = Math.round(pop * (0.02 + Math.random() * 0.03));
      // Reputation bonus (higher rep = more fans)
      const repBonus = Math.round(popBase * (rep / 100) * 0.5);
      // Recent form — count wins in last 5 matches
      const recentWins = await db.prepare(
        `SELECT COUNT(*) as w FROM (
          SELECT CASE WHEN (home_team_id = ? AND home_score > away_score) OR (away_team_id = ? AND away_score > home_score) THEN 1 ELSE 0 END as win
          FROM matches WHERE (home_team_id = ? OR away_team_id = ?) AND status = 'simulated' ORDER BY simulated_at DESC LIMIT 5
        ) WHERE win = 1`
      ).bind(homeTeamId, homeTeamId, homeTeamId, homeTeamId).first<{ w: number }>().catch((e) => { logger.warn({ module: "match-runner" }, "Failed to load recent wins", e); return { w: 0 }; });
      const formBonus = Math.round((recentWins?.w ?? 0) * popBase * 0.08);
      const rawAttendance = Math.max(8, popBase + repBonus + formBonus + Math.round(Math.random() * 10 - 5));
      // Apply facility attendance bonus (lighting + parking) and cap at stadium capacity
      const attendance = Math.min(
        Math.round(rawAttendance * (1 + facilityEffects.attendanceBonus)),
        stadiumCapacity,
      );

      // Apply changing room morale bonus to home lineup
      if (facilityEffects.homeMoraleBonus > 0) {
        for (const p of homeLineup) {
          p.morale = Math.min(100, p.morale + facilityEffects.homeMoraleBonus);
        }
        for (const p of homeSubs) {
          p.morale = Math.min(100, p.morale + facilityEffects.homeMoraleBonus);
        }
      }

      // Load equipment effects for both teams
      const { calculateEffects } = await import("../equipment/equipment-generator");
      const loadEquipMods = async (tid: string) => {
        const eq = await db.prepare("SELECT * FROM equipment WHERE team_id = ?").bind(tid).first<Record<string, unknown>>().catch((e) => { logger.warn({ module: "match-runner" }, "Failed to load equipment", e); return null; });
        if (!eq) return undefined;
        const levels: Record<string, number> = {};
        const conditions: Record<string, number> = {};
        for (const [k, v] of Object.entries(eq)) {
          if (k === "id" || k === "team_id") continue;
          if (k.endsWith("_condition")) conditions[k] = v as number;
          else if (typeof v === "number") levels[k] = v;
        }
        const eff = calculateEffects(levels, conditions);
        return {
          techniqueMod: eff.matchTechniqueMod,
          gkBonus: eff.gkBonus,
          injurySeverityMod: eff.injurySeverityMod,
          conditionDrainMod: eff.conditionDrainMod,
          moraleMod: eff.moraleMod,
        };
      };
      const [homeEquipment, awayEquipment] = await Promise.all([
        loadEquipMods(homeTeamId), loadEquipMods(awayTeamId),
      ]);

      // Add changing room injury reduction to home equipment
      if (facilityEffects.homeInjuryReduction > 0 && homeEquipment) {
        homeEquipment.injurySeverityMod += facilityEffects.homeInjuryReduction;
      }

      // Simulate
      const result = simulateMatch(rng, {
        home: homeSetup,
        away: awaySetup,
        weather,
        isHomeAdvantage: true,
        pitchCondition,
        stadiumName: stadiumName ?? undefined,
        attendance,
        homeEquipment,
        awayEquipment,
      });

      // Load commentary templates from DB + generate
      await loadCommentaryFromDB(db);
      const commentary = generateMatchCommentary(
        rng,
        result.events,
        homeSetup.teamName,
        awaySetup.teamName,
      );

      // Build lineup data for storage (name, position, number, rating)
      const buildLineupData = (lineup: typeof homeLineup, subs: typeof homeSubs, idMap: Map<number, string>) => {
        const mapPlayer = (p: typeof homeLineup[0]) => ({
          id: idMap.get(p.id) ?? "", name: `${p.firstName} ${p.lastName}`,
          position: p.matchPosition ?? p.position, naturalPosition: p.position,
          rating: Math.round((p.speed + p.technique + p.shooting + p.passing + p.defense) / 5),
        });
        return { starters: lineup.map(mapPlayer), subs: subs.map(mapPlayer) };
      };

      // Save results with events + commentary + match context + lineups
      await db.prepare(
        `UPDATE matches SET status = 'simulated', home_score = ?, away_score = ?,
         events = ?, commentary = ?, attendance = ?, stadium_name = ?, pitch_condition = ?, weather = ?,
         home_lineup_data = ?, away_lineup_data = ?,
         simulated_at = datetime('now') WHERE id = ?`
      ).bind(
        result.homeScore, result.awayScore,
        JSON.stringify(result.events), JSON.stringify(commentary),
        attendance, stadiumName, pitchCondition, weather,
        JSON.stringify(buildLineupData(homeLineup, homeSubs, homeBuild.idMap)),
        JSON.stringify(buildLineupData(awayLineup, awaySubs, awayBuild.idMap)),
        matchId,
      ).run();

      // Player stats update
      const season = await db.prepare(
        "SELECT id FROM seasons WHERE status = 'active' ORDER BY number DESC LIMIT 1"
      ).first<{ id: string }>().catch((e) => { logger.warn({ module: "match-runner" }, "Failed to load active season", e); return null; });

      if (season) {
        // Calculate per-player ratings
        const ratings = calculatePlayerRatings(result.events, fullIdMap, 1, result.homeScore, result.awayScore);

        // Home team stats
        const homeStarterIds = [...homeBuild.idMap.values()].slice(0, 11);
        const homeUpdates = extractStatsFromEvents(result.events, homeBuild.idMap, homeStarterIds, ratings, result.playerMinutes);
        await updatePlayerStats(db, season.id, homeTeamId, homeUpdates, result.awayScore === 0).catch((e) => logger.warn({ module: "match-runner" }, "Failed to update home player stats", e));

        // Away team stats
        const awayStarterIds = [...awayBuild.idMap.values()].slice(0, 11);
        const awayUpdates = extractStatsFromEvents(result.events, awayBuild.idMap, awayStarterIds, ratings, result.playerMinutes);
        await updatePlayerStats(db, season.id, awayTeamId, awayUpdates, result.homeScore === 0).catch((e) => logger.warn({ module: "match-runner" }, "Failed to update away player stats", e));

        // Save per-match player stats for both teams
        const allEntries: MatchPlayerStatsEntry[] = [
          ...homeUpdates.map((u) => ({
            playerId: u.playerId,
            teamId: homeTeamId,
            started: homeStarterIds.includes(u.playerId),
            position: fullPosMap.get(u.playerId) ?? "MID",
            minutesPlayed: u.minutesPlayed,
            goals: u.goals,
            assists: u.assists,
            yellowCards: u.yellowCards,
            redCards: u.redCards,
            rating: u.rating,
          })),
          ...awayUpdates.map((u) => ({
            playerId: u.playerId,
            teamId: awayTeamId,
            started: awayStarterIds.includes(u.playerId),
            position: fullPosMap.get(u.playerId) ?? "MID",
            minutesPlayed: u.minutesPlayed,
            goals: u.goals,
            assists: u.assists,
            yellowCards: u.yellowCards,
            redCards: u.redCards,
            rating: u.rating,
          })),
        ];
        await saveMatchPlayerStats(db, matchId, allEntries).catch((e) => logger.warn({ module: "match-runner" }, "Failed to save match player stats", e));

        // Save player_ratings JSON to match record
        await db.prepare("UPDATE matches SET player_ratings = ? WHERE id = ?")
          .bind(JSON.stringify(ratings), matchId).run().catch((e) => logger.warn({ module: "match-runner" }, "Failed to save player ratings", e));
      }

      // Match-day finances for both teams
      try {
        const { processMatchDayFinances } = await import("../season/finance-processor");
        const homeResult = result.homeScore > result.awayScore ? "win" : result.homeScore < result.awayScore ? "loss" : "draw";
        const awayResult = result.awayScore > result.homeScore ? "win" : result.awayScore < result.homeScore ? "loss" : "draw";
        const gameDate = new Date().toISOString();
        await processMatchDayFinances(db, homeTeamId, matchId, true, homeResult, attendance, gameDate);
        await processMatchDayFinances(db, awayTeamId, matchId, false, awayResult, attendance, gameDate);
      } catch (e) {
        logger.error({ module: "match-runner" }, `Match finances failed for ${matchId}`, e);
      }

      // Persist condition + morale changes back to DB
      try {
        for (const player of [...result.homeLineup, ...result.awayLineup]) {
          const dbId = fullIdMap.get(player.id);
          if (!dbId) continue;
          await db.prepare(
            `UPDATE players SET life_context = json_set(life_context, '$.condition', ?, '$.morale', ?) WHERE id = ?`
          ).bind(Math.round(player.condition), Math.round(player.morale), dbId).run();
        }
      } catch (e) {
        logger.error({ module: "match-runner" }, "Condition persist failed", e);
      }

      // Match experience: small chance to improve skills from playing
      // More minutes = more chance. Young players benefit more.
      try {
        const matchRng = createRng(Date.now() + matchId.charCodeAt(2));
        for (const [engineId, pm] of Object.entries(result.playerMinutes)) {
          const dbId = fullIdMap.get(Number(engineId));
          if (!dbId) continue;
          const minutes = ((pm as any).left ?? 90) - (pm as any).entered;
          if (minutes < 15) continue; // too few minutes to learn anything

          const playerRow = await db.prepare("SELECT age, skills, position FROM players WHERE id = ?")
            .bind(dbId).first<{ age: number; skills: string; position: string }>().catch((e) => { logger.warn({ module: "match-runner" }, "Failed to load player for match experience", e); return null; });
          if (!playerRow) continue;

          const age = playerRow.age;
          const ageMod = age < 22 ? 0.08 : age < 26 ? 0.05 : age < 30 ? 0.03 : 0.01;
          const minutesMod = minutes / 90; // full match = 1.0
          const improveChance = ageMod * minutesMod;

          if (matchRng.random() < improveChance) {
            const skills = JSON.parse(playerRow.skills);
            // Pick a position-relevant skill to improve
            const posSkills: Record<string, string[]> = {
              GK: ["goalkeeping"], DEF: ["defense", "heading", "strength"],
              MID: ["passing", "vision", "technique"], FWD: ["shooting", "speed", "technique"],
            };
            const candidates = posSkills[playerRow.position] ?? ["technique"];
            const attr = matchRng.pick(candidates);
            const current = skills[attr] ?? 50;
            if (current < 85) { // cap at 85 from match experience alone
              skills[attr] = current + 1;
              await db.prepare("UPDATE players SET skills = ? WHERE id = ?")
                .bind(JSON.stringify(skills), dbId).run();
              // Log it
              await db.prepare(
                "INSERT INTO training_log (player_id, team_id, attribute, old_value, new_value, change, training_type, game_date) VALUES (?, ?, ?, ?, ?, 1, 'match', ?)"
              ).bind(dbId, fullPosMap.get(dbId) ? (homeBuild.idMap.has(Number(engineId)) ? homeTeamId : awayTeamId) : homeTeamId,
                attr, current, current + 1, new Date().toISOString()).run().catch((e) => logger.warn({ module: "match-runner" }, "Failed to save training log", e));
            }
          }
        }
      } catch (e) {
        logger.error({ module: "match-runner" }, "Match experience failed", e);
      }

      results.push({
        matchId,
        homeScore: result.homeScore,
        awayScore: result.awayScore,
        eventsCount: result.events.length,
        matchType,
      });
    } catch (e) {
      logger.error({ module: "match-runner" }, `Failed to simulate match ${matchId}`, e);
    }
  }

  return results;
}

interface BuildResult {
  players: MatchPlayer[];
  idMap: Map<number, string>;        // engine ID → DB player ID
  positionMap: Map<string, string>;   // DB player ID → position
}

async function buildMatchPlayers(
  db: D1Database, teamId: string,
  rng?: { random: () => number; pick: <T>(a: T[]) => T; int: (min: number, max: number) => number },
  userLineupJson?: string | null,
): Promise<BuildResult> {
  const rows = await db.prepare(
    "SELECT * FROM players WHERE team_id = ? AND (status IS NULL OR status = 'active') ORDER BY overall_rating DESC LIMIT 22"
  ).bind(teamId).all();

  // Generate absences if rng provided (for automatic matches)
  let absentIds = new Set<string>();
  if (rng) {
    try {
      const { generateAbsences } = await import("../events/absence");
      const squadForAbsence = rows.results.map((row) => {
        const personality = JSON.parse(row.personality as string);
        const lifeContext = JSON.parse(row.life_context as string);
        const physical = row.physical ? JSON.parse(row.physical as string) : {};
        return {
          firstName: row.first_name as string, lastName: row.last_name as string,
          age: row.age as number, occupation: lifeContext.occupation ?? "",
          discipline: personality.discipline ?? 50, patriotism: personality.patriotism ?? 50,
          alcohol: personality.alcohol ?? 30, temper: personality.temper ?? 40,
          morale: lifeContext.morale ?? 50, stamina: physical.stamina ?? 50,
          injuryProneness: personality.injuryProneness ?? 50,
        };
      });
      const absences = generateAbsences(rng as any, squadForAbsence);
      absentIds = new Set(absences.map((a) => rows.results[a.playerIndex]?.id as string).filter(Boolean));
    } catch { /* ignore absence errors */ }
  }

  const allAvailable = rows.results.filter((r) => !absentIds.has(r.id as string));

  // If user set a lineup, order players: selected 11 first, then rest as subs
  let ordered = allAvailable;
  if (userLineupJson) {
    try {
      const userPicks = JSON.parse(userLineupJson) as Array<{ playerId: string; matchPosition?: string }>;
      const pickedIds = userPicks.map((p) => p.playerId);
      const starters = pickedIds
        .map((id) => allAvailable.find((r) => r.id === id))
        .filter(Boolean) as typeof allAvailable;
      const rest = allAvailable.filter((r) => !pickedIds.includes(r.id as string));
      ordered = [...starters, ...rest].slice(0, 16);
    } catch { ordered = allAvailable.slice(0, 16); }
  } else {
    ordered = allAvailable.slice(0, 16);
  }

  // Parse user lineup for matchPosition mapping
  const matchPositionMap = new Map<string, string>();
  if (userLineupJson) {
    try {
      const picks = JSON.parse(userLineupJson) as Array<{ playerId: string; matchPosition?: string }>;
      for (const p of picks) { if (p.matchPosition) matchPositionMap.set(p.playerId, p.matchPosition); }
    } catch { /* ignore */ }
  }

  let idCounter = 1;
  const idMap = new Map<number, string>();
  const positionMap = new Map<string, string>();

  const players = ordered.map((row) => {
    const skills = JSON.parse(row.skills as string);
    const personality = JSON.parse(row.personality as string);
    const lifeContext = JSON.parse(row.life_context as string);
    const physical = row.physical ? JSON.parse(row.physical as string) : {};

    const engineId = idCounter++;
    const dbId = row.id as string;
    idMap.set(engineId, dbId);
    positionMap.set(dbId, row.position as string);

    const mp = matchPositionMap.get(dbId);
    return {
      id: engineId,
      firstName: row.first_name as string,
      lastName: row.last_name as string,
      nickname: (row.nickname as string) || null,
      position: row.position as "GK" | "DEF" | "MID" | "FWD",
      matchPosition: mp ? mp as "GK" | "DEF" | "MID" | "FWD" : undefined,
      speed: skills.speed ?? 50,
      technique: skills.technique ?? 50,
      shooting: skills.shooting ?? 50,
      passing: skills.passing ?? 50,
      heading: skills.heading ?? 50,
      defense: skills.defense ?? 50,
      goalkeeping: skills.goalkeeping ?? 50,
      stamina: physical.stamina ?? skills.stamina ?? 50,
      strength: physical.strength ?? skills.strength ?? 50,
      vision: skills.vision ?? 50,
      creativity: skills.creativity ?? 50,
      setPieces: skills.setPieces ?? 50,
      discipline: personality.discipline ?? 50,
      alcohol: personality.alcohol ?? 30,
      temper: personality.temper ?? 40,
      leadership: personality.leadership ?? 30,
      workRate: personality.workRate ?? 50,
      aggression: personality.aggression ?? 40,
      consistency: personality.consistency ?? 50,
      clutch: personality.clutch ?? 50,
      preferredFoot: physical.preferredFoot ?? "right",
      preferredSide: physical.preferredSide ?? "center",
      condition: lifeContext.condition ?? 100,
      morale: lifeContext.morale ?? 50,
    };
  });

  return { players, idMap, positionMap };
}

async function createAutoLineup(
  db: D1Database,
  teamId: string,
  calendarId: string,
): Promise<void> {
  const players = await db.prepare(
    "SELECT id, position FROM players WHERE team_id = ? ORDER BY overall_rating DESC LIMIT 11"
  ).bind(teamId).all();

  const lineupData = players.results.map((p) => ({
    playerId: p.id, position: p.position,
  }));

  const lineupId = crypto.randomUUID();
  await db.prepare(
    "INSERT INTO lineups (id, team_id, calendar_id, formation, tactic, players_data, is_auto) VALUES (?, ?, ?, '4-4-2', 'balanced', ?, 1)"
  ).bind(lineupId, teamId, calendarId, JSON.stringify(lineupData)).run();
}
