/**
 * Match runner — orchestruje plnou simulaci zápasu.
 * Volán z daily-tick nebo cron triggeru.
 */

import { simulateMatch } from "../engine/simulation";
import { generateMatchCommentary } from "../engine/commentary";
import { createRng } from "../generators/rng";
import type { MatchPlayer, TeamSetup, Weather } from "../engine/types";
import { calculatePlayerRatings, extractStatsFromEvents, updatePlayerStats, saveMatchPlayerStats, type MatchPlayerStatsEntry } from "../stats/update-stats";

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

      // Determine match type
      const homeTeam = await db.prepare("SELECT name, user_id FROM teams WHERE id = ?").bind(homeTeamId).first<Record<string, unknown>>();
      const awayTeam = await db.prepare("SELECT name, user_id FROM teams WHERE id = ?").bind(awayTeamId).first<Record<string, unknown>>();
      const homeIsHuman = homeTeam?.user_id !== "ai";
      const awayIsHuman = awayTeam?.user_id !== "ai";
      const matchType: MatchRunResult["matchType"] = homeIsHuman && awayIsHuman ? "pvp"
        : homeIsHuman ? "pve_home" : awayIsHuman ? "pve_away" : "ai_vs_ai";

      // Build match players from DB
      const homeBuild = await buildMatchPlayers(db, homeTeamId);
      const awayBuild = await buildMatchPlayers(db, awayTeamId);

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

      const homeSetup: TeamSetup = {
        teamId: 1,
        teamName: (homeTeam?.name as string) ?? "Domácí",
        lineup: homeLineup,
        subs: homeSubs,
        tactic: "balanced",
      };
      const awaySetup: TeamSetup = {
        teamId: 2,
        teamName: (awayTeam?.name as string) ?? "Hosté",
        lineup: awayLineup,
        subs: awaySubs,
        tactic: "balanced",
      };

      // Load stadium info for pitch condition + attendance
      const stadium = await db.prepare("SELECT pitch_condition FROM stadiums WHERE team_id = ?")
        .bind(homeTeamId).first<{ pitch_condition: number }>().catch(() => null);
      const pitchCondition = stadium?.pitch_condition ?? 50;
      const stadiumNameRow = await db.prepare("SELECT stadium_name FROM teams WHERE id = ?")
        .bind(homeTeamId).first<{ stadium_name: string }>().catch(() => null);
      const stadiumName = stadiumNameRow?.stadium_name ?? null;

      // Attendance: population + reputation + form
      const homeInfo = await db.prepare(
        "SELECT v.population, v.size, t.reputation FROM villages v JOIN teams t ON t.village_id = v.id WHERE t.id = ?"
      ).bind(homeTeamId).first<{ population: number; size: string; reputation: number }>().catch(() => null);
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
      ).bind(homeTeamId, homeTeamId, homeTeamId, homeTeamId).first<{ w: number }>().catch(() => ({ w: 0 }));
      const formBonus = Math.round((recentWins?.w ?? 0) * popBase * 0.08);
      const attendance = Math.max(8, popBase + repBonus + formBonus + Math.round(Math.random() * 10 - 5));

      // Simulate
      const rng = createRng(Date.now() + matchId.charCodeAt(0));
      const result = simulateMatch(rng, {
        home: homeSetup,
        away: awaySetup,
        weather,
        isHomeAdvantage: true,
        pitchCondition,
        stadiumName: stadiumName ?? undefined,
        attendance,
      });

      // Generate commentary
      const commentary = generateMatchCommentary(
        rng,
        result.events,
        homeSetup.teamName,
        awaySetup.teamName,
      );

      // Save results with events + commentary + match context
      await db.prepare(
        `UPDATE matches SET status = 'simulated', home_score = ?, away_score = ?,
         events = ?, commentary = ?, attendance = ?, stadium_name = ?, pitch_condition = ?, weather = ?,
         simulated_at = datetime('now') WHERE id = ?`
      ).bind(
        result.homeScore, result.awayScore,
        JSON.stringify(result.events), JSON.stringify(commentary),
        attendance, stadiumName, pitchCondition, weather,
        matchId,
      ).run();

      // Player stats update
      const season = await db.prepare(
        "SELECT id FROM seasons WHERE status = 'active' ORDER BY number DESC LIMIT 1"
      ).first<{ id: string }>().catch(() => null);

      if (season) {
        // Calculate per-player ratings
        const ratings = calculatePlayerRatings(result.events, fullIdMap, 1, result.homeScore, result.awayScore);

        // Home team stats
        const homeStarterIds = [...homeBuild.idMap.values()].slice(0, 11);
        const homeUpdates = extractStatsFromEvents(result.events, homeBuild.idMap, homeStarterIds, ratings);
        await updatePlayerStats(db, season.id, homeTeamId, homeUpdates, result.awayScore === 0).catch(() => {});

        // Away team stats
        const awayStarterIds = [...awayBuild.idMap.values()].slice(0, 11);
        const awayUpdates = extractStatsFromEvents(result.events, awayBuild.idMap, awayStarterIds, ratings);
        await updatePlayerStats(db, season.id, awayTeamId, awayUpdates, result.homeScore === 0).catch(() => {});

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
        await saveMatchPlayerStats(db, matchId, allEntries).catch(() => {});

        // Save player_ratings JSON to match record
        await db.prepare("UPDATE matches SET player_ratings = ? WHERE id = ?")
          .bind(JSON.stringify(ratings), matchId).run().catch(() => {});
      }

      results.push({
        matchId,
        homeScore: result.homeScore,
        awayScore: result.awayScore,
        eventsCount: result.events.length,
        matchType,
      });
    } catch (e) {
      console.error(`[MatchRunner] Failed to simulate match ${matchId}:`, e);
    }
  }

  return results;
}

interface BuildResult {
  players: MatchPlayer[];
  idMap: Map<number, string>;        // engine ID → DB player ID
  positionMap: Map<string, string>;   // DB player ID → position
}

async function buildMatchPlayers(db: D1Database, teamId: string): Promise<BuildResult> {
  const rows = await db.prepare(
    "SELECT * FROM players WHERE team_id = ? ORDER BY overall_rating DESC LIMIT 16"
  ).bind(teamId).all();

  let idCounter = 1;
  const idMap = new Map<number, string>();
  const positionMap = new Map<string, string>();

  const players = rows.results.map((row) => {
    const skills = JSON.parse(row.skills as string);
    const personality = JSON.parse(row.personality as string);
    const lifeContext = JSON.parse(row.life_context as string);
    const physical = row.physical ? JSON.parse(row.physical as string) : {};

    const engineId = idCounter++;
    const dbId = row.id as string;
    idMap.set(engineId, dbId);
    positionMap.set(dbId, row.position as string);

    return {
      id: engineId,
      firstName: row.first_name as string,
      lastName: row.last_name as string,
      nickname: (row.nickname as string) || null,
      position: row.position as "GK" | "DEF" | "MID" | "FWD",
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
