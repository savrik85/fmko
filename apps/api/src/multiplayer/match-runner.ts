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
      // Ensure lineups exist — copy last saved lineup or auto-generate
      const hasHomeLineup = await db.prepare(
        "SELECT id FROM lineups WHERE team_id = ? AND calendar_id = ?"
      ).bind(homeTeamId, calendarId).first();
      if (!hasHomeLineup) await copyOrCreateLineup(db, homeTeamId, calendarId);

      const hasAwayLineup = await db.prepare(
        "SELECT id FROM lineups WHERE team_id = ? AND calendar_id = ?"
      ).bind(awayTeamId, calendarId).first();
      if (!hasAwayLineup) await copyOrCreateLineup(db, awayTeamId, calendarId);

      // Deterministic RNG for absences — MUST match next-match endpoint seed
      const { seedFromString } = await import("../lib/seed");
      const absenceRng = createRng(seedFromString(calendarId));
      // Separate RNG for match simulation — includes Date.now() so results vary
      const rng = createRng(seedFromString(calendarId) + Date.now());

      // Determine match type
      const homeTeam = await db.prepare("SELECT name, user_id FROM teams WHERE id = ?").bind(homeTeamId).first<Record<string, unknown>>();
      const awayTeam = await db.prepare("SELECT name, user_id FROM teams WHERE id = ?").bind(awayTeamId).first<Record<string, unknown>>();
      const homeIsHuman = !!homeTeam && homeTeam.user_id !== "ai";
      const awayIsHuman = !!awayTeam && awayTeam.user_id !== "ai";
      const matchType: MatchRunResult["matchType"] = homeIsHuman && awayIsHuman ? "pvp"
        : homeIsHuman ? "pve_home" : awayIsHuman ? "pve_away" : "ai_vs_ai";

      // Read user lineups from DB — prefer user-saved (is_auto=0) over auto-generated
      const homeLineupRow = await db.prepare("SELECT tactic, players_data, is_auto, captain_id FROM lineups WHERE team_id = ? AND calendar_id = ? ORDER BY is_auto ASC LIMIT 1")
        .bind(homeTeamId, calendarId).first<{ tactic: string; players_data: string; is_auto: number; captain_id: string | null }>().catch((e) => { logger.warn({ module: "match-runner" }, "Failed to load home lineup", e); return null; });
      const awayLineupRow = await db.prepare("SELECT tactic, players_data, is_auto, captain_id FROM lineups WHERE team_id = ? AND calendar_id = ? ORDER BY is_auto ASC LIMIT 1")
        .bind(awayTeamId, calendarId).first<{ tactic: string; players_data: string; is_auto: number; captain_id: string | null }>().catch((e) => { logger.warn({ module: "match-runner" }, "Failed to load away lineup", e); return null; });

      // Build match players — use absenceRng for deterministic absences (must match next-match endpoint)
      const homeBuild = await buildMatchPlayers(db, homeTeamId, absenceRng,
        homeLineupRow?.players_data ?? null);
      const awayBuild = await buildMatchPlayers(db, awayTeamId, absenceRng,
        awayLineupRow?.players_data ?? null, 100);

      const homeLineup = homeBuild.players;
      const awayLineup = awayBuild.players;

      const homeSubs = homeLineup.splice(11);
      const awaySubs = awayLineup.splice(11);

      // Save pre-simulation lineup for buildLineupData (simulation mutates arrays via substitutions)
      const homeLineupPreSim = homeLineup.map(p => ({ ...p }));
      const awayLineupPreSim = awayLineup.map(p => ({ ...p }));
      const homeSubsPreSim = homeSubs.map(p => ({ ...p }));
      const awaySubsPreSim = awaySubs.map(p => ({ ...p }));

      // Merge ID maps (engine ID → DB player ID)
      const fullIdMap = new Map<number, string>();
      for (const [k, v] of homeBuild.idMap) fullIdMap.set(k, v);
      for (const [k, v] of awayBuild.idMap) fullIdMap.set(k, v);

      // Merge position maps
      const fullPosMap = new Map<string, string>();
      for (const [k, v] of homeBuild.positionMap) fullPosMap.set(k, v);
      for (const [k, v] of awayBuild.positionMap) fullPosMap.set(k, v);

      // ── Inject relationships into lineup players ──
      try {
        for (const [teamDbId, lineup, idMap] of [
          [homeTeamId, homeLineup, homeBuild.idMap],
          [awayTeamId, awayLineup, awayBuild.idMap],
        ] as Array<[string, typeof homeLineup, Map<number, string>]>) {
          const dbPlayerIds = [...idMap.entries()].filter(([engineId]) => lineup.some((p) => p.id === engineId)).map(([, dbId]) => dbId);
          if (dbPlayerIds.length < 2) continue;
          const placeholders = dbPlayerIds.map(() => "?").join(",");
          const relRows = await db.prepare(
            `SELECT player_a_id, player_b_id, type FROM relationships
             WHERE player_a_id IN (${placeholders}) OR player_b_id IN (${placeholders})`
          ).bind(...dbPlayerIds, ...dbPlayerIds).all().catch((e) => { logger.warn({ module: "match-runner" }, "relationships query", e); return { results: [] }; });

          // Reverse map: DB ID → engine ID
          const dbToEngine = new Map<string, number>();
          for (const [engineId, dbId] of idMap) dbToEngine.set(dbId, engineId);

          for (const p of lineup) {
            const pDbId = idMap.get(p.id);
            if (!pDbId) continue;
            const rels: Array<{ withId: number; type: string }> = [];
            for (const r of relRows.results as Array<{ player_a_id: string; player_b_id: string; type: string }>) {
              const otherId = r.player_a_id === pDbId ? r.player_b_id : r.player_b_id === pDbId ? r.player_a_id : null;
              if (!otherId) continue;
              const otherEngineId = dbToEngine.get(otherId);
              if (otherEngineId != null && lineup.some((lp) => lp.id === otherEngineId)) {
                rels.push({ withId: otherEngineId, type: r.type });
              }
            }
            if (rels.length > 0) p.relationshipsInLineup = rels as any;
          }
        }
      } catch (e) {
        logger.warn({ module: "match-runner" }, "relationship injection failed", e);
      }

      const homeTactic = (homeLineupRow?.tactic as any) ?? "balanced";
      const awayTactic = (awayLineupRow?.tactic as any) ?? "balanced";

      // Map captain DB IDs to engine IDs
      const homeCaptainEngineId = homeLineupRow?.captain_id ? [...homeBuild.idMap.entries()].find(([, dbId]) => dbId === homeLineupRow.captain_id)?.[0] : undefined;
      const awayCaptainEngineId = awayLineupRow?.captain_id ? [...awayBuild.idMap.entries()].find(([, dbId]) => dbId === awayLineupRow.captain_id)?.[0] : undefined;

      const homeSetup: TeamSetup = {
        teamId: 1,
        teamName: (homeTeam?.name as string) ?? "Domácí",
        lineup: homeLineup,
        subs: homeSubs,
        tactic: homeTactic,
        captainId: homeCaptainEngineId,
      };
      const awaySetup: TeamSetup = {
        teamId: 2,
        teamName: (awayTeam?.name as string) ?? "Hosté",
        lineup: awayLineup,
        subs: awaySubs,
        tactic: awayTactic,
        captainId: awayCaptainEngineId,
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
        for (const key of ["changing_rooms", "showers", "refreshments", "stands", "parking", "fence"]) {
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
      // Base from population — okresní fotbal: 2-4.5% obyvatel
      const popBase = Math.round(pop * (0.02 + Math.random() * 0.025));
      // Reputation bonus (higher rep = more fans)
      const repBonus = Math.round(popBase * (rep / 100) * 0.3);
      // Recent form — count wins in last 5 matches
      const recentWins = await db.prepare(
        `SELECT COUNT(*) as w FROM (
          SELECT CASE WHEN (home_team_id = ? AND home_score > away_score) OR (away_team_id = ? AND away_score > home_score) THEN 1 ELSE 0 END as win
          FROM matches WHERE (home_team_id = ? OR away_team_id = ?) AND status = 'simulated' ORDER BY simulated_at DESC LIMIT 5
        ) WHERE win = 1`
      ).bind(homeTeamId, homeTeamId, homeTeamId, homeTeamId).first<{ w: number }>().catch((e) => { logger.warn({ module: "match-runner" }, "Failed to load recent wins", e); return { w: 0 }; });
      const formBonus = Math.round((recentWins?.w ?? 0) * popBase * 0.08);
      const rawAttendance = Math.max(15, popBase + repBonus + formBonus + Math.round(Math.random() * 10 - 5));
      // Celebrity attendance bonus — check if any celebrity is in either lineup
      let celebAttendanceMultiplier = 1.0;
      const allLineupIds = [...homeLineup, ...awayLineup].map(lp => fullIdMap.get(lp.id)).filter(Boolean) as string[];
      if (allLineupIds.length > 0) {
        const celebRows = await db.prepare(
          `SELECT is_celebrity, personality FROM players WHERE id IN (${allLineupIds.map(() => "?").join(",")}) AND is_celebrity = 1`
        ).bind(...allLineupIds).all().catch((e) => { logger.warn({ module: "match-runner" }, "celeb attendance check", e); return { results: [] }; });
        for (const celebRow of celebRows.results) {
          const pers = JSON.parse(celebRow.personality as string);
          const bonusMap: Record<string, number> = { S: 3.0, A: 2.0, B: 1.5, C: 1.25 };
          const typeBonus: Record<string, number> = { legend: bonusMap[pers.celebrityTier] ?? 1.5, fallen_star: 1.3, glass_man: 1.4 };
          const bonus = typeBonus[pers.celebrityType] ?? 1.25;
          celebAttendanceMultiplier = Math.max(celebAttendanceMultiplier, bonus);
        }
      }
      // Fan satisfaction multiplier — happy fans = víc lidí chodí, nespokojení zůstanou doma.
      // 0.75 (nespokojení) -> 1.25 (nadšení), default 1.0 pokud fans row neexistuje
      const fansSatRow = await db.prepare("SELECT satisfaction FROM fans WHERE team_id = ?")
        .bind(homeTeamId).first<{ satisfaction: number }>().catch((e) => { logger.warn({ module: "match-runner" }, "load fans satisfaction", e); return null; });
      const fansSat = fansSatRow?.satisfaction ?? 50;
      const satisfactionAttendanceMul = 0.75 + (Math.max(0, Math.min(100, fansSat)) / 100) * 0.5;

      // Promotion boost — tým zaplatil propagaci, přitáhne víc diváků
      const promoRow = await db.prepare("SELECT promotion_boost FROM matches WHERE id = ?")
        .bind(matchId).first<{ promotion_boost: number }>().catch((e) => { logger.warn({ module: "match-runner" }, "load promotion", e); return null; });
      const promoBoost = promoRow?.promotion_boost ?? 1.0;

      // Apply facility attendance bonus (parking) + celebrity bonus + satisfaction + promo, cap at stadium capacity
      const attendance = Math.min(
        Math.round(rawAttendance * promoBoost * (1 + facilityEffects.attendanceBonus) * celebAttendanceMultiplier * satisfactionAttendanceMul),
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

      // Apply manager tactics bonus to team skills
      const applyManagerBonus = async (teamId: string, lineup: typeof homeLineup, subs: typeof homeSubs) => {
        const mgr = await db.prepare("SELECT tactics, motivation FROM managers WHERE team_id = ?")
          .bind(teamId).first<{ tactics: number; motivation: number }>().catch((e) => { logger.warn({ module: "match-runner" }, "mgr query", e); return null; });
        if (!mgr) return;
        // Tactics: 40=0, 60=+1, 80=+2, 100=+3 to passing/defense for all players
        const tacticsBonus = Math.floor((mgr.tactics - 40) / 20);
        if (tacticsBonus > 0) {
          for (const p of [...lineup, ...subs]) {
            p.passing = Math.min(100, p.passing + tacticsBonus);
            p.defense = Math.min(100, p.defense + tacticsBonus);
          }
        }
        // Motivation: 40=0, 60=+2, 80=+4, 100=+6 morale
        const moraleBonus = Math.floor((mgr.motivation - 30) / 10);
        if (moraleBonus > 0) {
          for (const p of [...lineup, ...subs]) {
            p.morale = Math.min(100, p.morale + moraleBonus);
          }
        }
      };
      await applyManagerBonus(homeTeamId, homeLineup, homeSubs);
      await applyManagerBonus(awayTeamId, awayLineup, awaySubs);

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

      // Collect absence data for both teams
      const matchAbsences = [
        ...Array.from(homeBuild.absentNames ?? []),
        ...Array.from(awayBuild.absentNames ?? []),
      ];

      // Save results with events + commentary + match context + lineups + absences
      await db.prepare(
        `UPDATE matches SET status = 'simulated', home_score = ?, away_score = ?,
         events = ?, commentary = ?, attendance = ?, stadium_name = ?, pitch_condition = ?, weather = ?,
         home_lineup_data = ?, away_lineup_data = ?, absences = ?,
         simulated_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now') WHERE id = ?`
      ).bind(
        result.homeScore, result.awayScore,
        JSON.stringify(result.events), JSON.stringify(commentary),
        attendance, stadiumName, pitchCondition, weather,
        JSON.stringify(buildLineupData(homeLineupPreSim, homeSubsPreSim, homeBuild.idMap)),
        JSON.stringify(buildLineupData(awayLineupPreSim, awaySubsPreSim, awayBuild.idMap)),
        matchAbsences.length > 0 ? JSON.stringify(matchAbsences) : null,
        matchId,
      ).run();

      // Player stats update
      const season = await db.prepare(
        "SELECT id FROM seasons WHERE status = 'active' ORDER BY number DESC LIMIT 1"
      ).first<{ id: string }>().catch((e) => { logger.warn({ module: "match-runner" }, "Failed to load active season", e); return null; });

      if (season) {
        // Build position map for rating calculation
        const playerPositions = new Map<number, string>();
        for (const p of [...homeLineup, ...homeSubs, ...awayLineup, ...awaySubs]) {
          playerPositions.set(p.id, p.matchPosition ?? p.position);
        }

        // Calculate per-player ratings
        const ratings = calculatePlayerRatings(result.events, fullIdMap, 1, result.homeScore, result.awayScore, playerPositions);

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

        // ── Suspensions: red card = 1 match ban, 4 yellows in season = 1 match ban ──
        const allUpdates = [...homeUpdates, ...awayUpdates];
        const suspensionStmts: D1PreparedStatement[] = [];
        for (const u of allUpdates) {
          if (u.redCards > 0) {
            suspensionStmts.push(db.prepare("UPDATE players SET suspended_matches = suspended_matches + 1 WHERE id = ?").bind(u.playerId));
          }
        }
        if (suspensionStmts.length > 0) await db.batch(suspensionStmts).catch((e) => logger.warn({ module: "match-runner" }, "batch suspensions", e));

        // Yellow card accumulation check (needs reads, do sequentially but only for players with yellows)
        for (const u of allUpdates) {
          if (u.yellowCards > 0) {
            const stats = await db.prepare("SELECT COALESCE(SUM(yellow_cards), 0) as yellow_cards FROM player_stats WHERE player_id = ? AND season_id = ?")
              .bind(u.playerId, season.id).first<{ yellow_cards: number }>().catch((e) => { logger.warn({ module: "match-runner" }, "query failed", e); return null; });
            if (stats && stats.yellow_cards > 0 && stats.yellow_cards % 4 === 0) {
              await db.prepare("UPDATE players SET suspended_matches = suspended_matches + 1 WHERE id = ?")
                .bind(u.playerId).run().catch((e) => { logger.warn({ module: "match-runner" }, "op failed", e); });
            }
          }
        }

        // Decrement suspensions for players who SAT OUT this match (served their ban)
        await db.prepare("UPDATE players SET suspended_matches = MAX(0, suspended_matches - 1) WHERE team_id IN (?, ?) AND suspended_matches > 0 AND id NOT IN (SELECT player_id FROM match_player_stats WHERE match_id = ?)")
          .bind(homeTeamId, awayTeamId, matchId).run().catch((e) => logger.warn({ module: "match-runner" }, "decrement suspensions", e));

        // ── Persist injuries from match events ──
        const injuryTypeMap: Record<string, string> = {
          "natažený sval": "sval", "naražené žebro": "zebra", "podvrtnutý kotník": "kotnik",
          "bolest kolene": "koleno", "bolavá záda": "zada", "naražená hlava": "hlava",
          "pohmožděný palec": "obecne", "přetržený achilov": "achilovka",
        };
        const injuryStmts: D1PreparedStatement[] = [];
        for (const event of result.events) {
          if (event.type === "injury") {
            const evTeamId = event.teamId === 1 ? homeTeamId : awayTeamId;
            const idMap = event.teamId === 1 ? homeBuild.idMap : awayBuild.idMap;
            const realPlayerId = idMap.get(event.playerId);
            if (realPlayerId) {
              const days = 3 + Math.floor(Math.random() * 18);
              const injType = injuryTypeMap[event.detail ?? ""] ?? "obecne";
              const severity = days <= 7 ? "lehke" : days <= 14 ? "stredni" : "tezke";
              injuryStmts.push(db.prepare(
                "INSERT INTO injuries (id, player_id, team_id, type, description, severity, days_remaining, days_total, match_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)"
              ).bind(crypto.randomUUID(), realPlayerId, evTeamId, injType, event.detail ?? "zranění", severity, days, days, matchId));
            }
          }
        }
        if (injuryStmts.length > 0) await db.batch(injuryStmts).catch((e) => logger.warn({ module: "match-runner" }, "batch persist injuries", e));
      }

      // Match-day finances for both teams
      try {
        const { processMatchDayFinances } = await import("../season/finance-processor");
        const homeResult = result.homeScore > result.awayScore ? "win" : result.homeScore < result.awayScore ? "loss" : "draw";
        const awayResult = result.awayScore > result.homeScore ? "win" : result.awayScore < result.homeScore ? "loss" : "draw";
        const gameDate = new Date().toISOString();
        // Load both teams reputation — slouží pro satisfaction expectations calc
        const repRows = await db.prepare(
          "SELECT id, reputation FROM teams WHERE id IN (?, ?)",
        ).bind(homeTeamId, awayTeamId).all<{ id: string; reputation: number }>().catch((e) => {
          logger.warn({ module: "match-runner" }, "load team reputations for finances", e);
          return { results: [] };
        });
        const repMap = new Map(repRows.results.map((r) => [r.id, r.reputation ?? 50]));
        const homeRep = repMap.get(homeTeamId) ?? 50;
        const awayRep = repMap.get(awayTeamId) ?? 50;
        await processMatchDayFinances(db, homeTeamId, matchId, true, homeResult, attendance, gameDate, awayRep);
        await processMatchDayFinances(db, awayTeamId, matchId, false, awayResult, attendance, gameDate, homeRep);
      } catch (e) {
        logger.error({ module: "match-runner" }, `Match finances failed for ${matchId}`, e);
      }

      // Manager experience — small chance to improve attributes after each match
      for (const tid of [homeTeamId, awayTeamId]) {
        try {
          // 10% chance per attribute per match
          const attrs = ["coaching", "motivation", "tactics", "discipline"];
          const attr = attrs[Math.floor(Math.random() * attrs.length)];
          if (Math.random() < 0.10) {
            await db.prepare(`UPDATE managers SET ${attr} = MIN(100, ${attr} + 1) WHERE team_id = ?`)
              .bind(tid).run();
          }
          // Youth development improves if young players played
          if (Math.random() < 0.05) {
            await db.prepare("UPDATE managers SET youth_development = MIN(100, youth_development + 1) WHERE team_id = ?")
              .bind(tid).run();
          }
          // Reputation grows with wins
          const isHome = tid === homeTeamId;
          const won = isHome ? result.homeScore > result.awayScore : result.awayScore > result.homeScore;
          if (won && Math.random() < 0.15) {
            await db.prepare("UPDATE managers SET reputation = MIN(100, reputation + 1) WHERE team_id = ?")
              .bind(tid).run();
          }
        } catch { /* manager xp optional */ }
      }

      // Persist condition + morale changes back to DB (batched)
      try {
        const condStmts = [...result.homeLineup, ...result.awayLineup]
          .filter(p => fullIdMap.has(p.id))
          .map(p => db.prepare(
            `UPDATE players SET life_context = json_set(life_context, '$.condition', ?, '$.morale', ?) WHERE id = ?`
          ).bind(Math.round(p.condition), Math.round(p.morale), fullIdMap.get(p.id)!));
        if (condStmts.length > 0) await db.batch(condStmts);
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
  idMap: Map<number, string>;
  positionMap: Map<string, string>;
  absentNames: Array<{ name: string; reason: string; smsText: string }>;
}

export async function buildMatchPlayers(
  db: D1Database, teamId: string,
  rng?: { random: () => number; pick: <T>(a: T[]) => T; int: (min: number, max: number) => number },
  userLineupJson?: string | null,
  idOffset: number = 0,
): Promise<BuildResult> {
  const rows = await db.prepare(
    "SELECT * FROM players WHERE team_id = ? AND (status IS NULL OR status = 'active') ORDER BY overall_rating DESC"
  ).bind(teamId).all();

  // Generate absences — for all teams, including human teams with saved lineups
  let absentIds = new Set<string>();
  const absentInfo: Array<{ name: string; reason: string; smsText: string }> = [];
  const hasUserLineup = !!userLineupJson;
  const allDbIds = rows.results.map(r => (r.id as string).slice(0,8));
  logger.info({ module: "match-runner" }, `buildMatchPlayers team=${teamId.slice(0,8)} total=${rows.results.length} hasLineup=${hasUserLineup} dbIDs=[${allDbIds.join(",")}]`);
  if (rng) {
    try {
      const { generateAbsences } = await import("../events/absence");
      const teamAbsenceRng = rng;
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
          isCelebrity: !!(row.is_celebrity as number), celebrityType: personality.celebrityType, celebrityTier: personality.celebrityTier,
        };
      });
      // Get district for environment-specific excuses (Praha = urban, rest = rural)
      const districtRow = await db.prepare("SELECT v.district FROM teams t JOIN villages v ON t.village_id = v.id WHERE t.id = ?")
        .bind(teamId).first<{ district: string }>().catch((e) => { logger.warn({ module: "match-runner" }, "query failed", e); return null; });
      const absences = generateAbsences(teamAbsenceRng as any, squadForAbsence, "any", districtRow?.district);
      absentIds = new Set(absences.map((a) => rows.results[a.playerIndex]?.id as string).filter(Boolean));
      for (const a of absences) {
        const r = rows.results[a.playerIndex];
        if (r) absentInfo.push({ name: `${r.first_name} ${r.last_name}`, reason: a.reason, smsText: a.smsText });
      }
    } catch (e) { logger.warn({ module: "match-runner" }, "absence generation", e); }
  }

  // Also exclude suspended and injured players
  const injuredIds = new Set<string>();
  const suspendedIds = new Set<string>();
  for (const r of rows.results) {
    if ((r.suspended_matches as number) > 0) {
      suspendedIds.add(r.id as string);
      absentInfo.push({ name: `${r.first_name} ${r.last_name}`, reason: "Stopka za karty", smsText: `Mám stopku, nesmím hrát.` });
    }
  }
  // Check injuries
  const injuryRows = await db.prepare("SELECT player_id FROM injuries WHERE days_remaining > 0 AND player_id IN (SELECT id FROM players WHERE team_id = ?)")
    .bind(teamId).all().catch(() => ({ results: [] }));
  for (const ir of injuryRows.results) injuredIds.add(ir.player_id as string);

  // DEBUG: check each player's exclusion reason
  for (const r of rows.results) {
    const id = r.id as string;
    if (absentIds.has(id)) console.log(`[LINEUP-DEBUG] ${r.first_name} ${r.last_name} (${id.slice(0,8)}) EXCLUDED: absent`);
    if (suspendedIds.has(id)) console.log(`[LINEUP-DEBUG] ${r.first_name} ${r.last_name} (${id.slice(0,8)}) EXCLUDED: suspended=${r.suspended_matches}`);
    if (injuredIds.has(id)) console.log(`[LINEUP-DEBUG] ${r.first_name} ${r.last_name} (${id.slice(0,8)}) EXCLUDED: injured`);
  }

  const allAvailable = rows.results.filter((r) => !absentIds.has(r.id as string) && !suspendedIds.has(r.id as string) && !injuredIds.has(r.id as string));

  logger.info({ module: "match-runner" }, `team=${teamId} DB=${rows.results.length} absent=${absentIds.size} suspended=${suspendedIds.size} injured=${injuredIds.size} available=${allAvailable.length}`);
  if (suspendedIds.size > 0) logger.info({ module: "match-runner" }, `suspended IDs: ${[...suspendedIds].join(",")}`);
  if (injuredIds.size > 0) logger.info({ module: "match-runner" }, `injured IDs: ${[...injuredIds].join(",")}`);

  // If user set a lineup, order players: selected 11 first, then rest as subs
  let ordered = allAvailable;
  if (userLineupJson) {
    try {
      const userPicks = JSON.parse(userLineupJson) as Array<{ playerId: string; matchPosition?: string }>;
      const pickedIds = [...new Set(userPicks.map((p) => p.playerId))];
      // Build starters from allAvailable (excludes absent/injured/suspended players)
      // If a picked player is unavailable, they are silently skipped — rest fills the gap
      const starters: typeof allAvailable = [];
      for (const id of pickedIds) {
        const player = allAvailable.find(r => (r.id as string) === id);
        if (player) {
          starters.push(player);
        } else {
          const isAbsent = absentIds.has(id);
          const isSusp = suspendedIds.has(id);
          const isInj = injuredIds.has(id);
          const dbPlayer = rows.results.find(r => r.id === id);
          if (dbPlayer) {
            logger.warn({ module: "match-runner" }, `LINEUP PLAYER ${dbPlayer.first_name} ${dbPlayer.last_name} (${id}) EXCLUDED: absent=${isAbsent} suspended=${isSusp} injured=${isInj}`);
          } else {
            const msg = `MISSING: ${id} not in ${rows.results.length} rows.`;
            console.log(`[LINEUP-BUG] ${msg}`);
            if (!(globalThis as any).__lineupDebug) (globalThis as any).__lineupDebug = [];
            (globalThis as any).__lineupDebug.push(msg);
          }
        }
      }

      logger.info({ module: "match-runner" }, `Lineup: ${pickedIds.length} picked, ${starters.length} found, ${pickedIds.length - starters.length} missing`);

      const rest = allAvailable.filter((r) => !pickedIds.includes(r.id as string));
      ordered = [...starters, ...rest].slice(0, 16);

      // Log saved vs actual
      const savedNames = pickedIds.map(id => { const p = rows.results.find(r => r.id === id); return p ? `${p.first_name} ${p.last_name}` : `?${id.slice(0,8)}`; });
      const actualNames = ordered.slice(0, 11).map(r => `${r.first_name} ${r.last_name}`);
      logger.info({ module: "match-runner" }, `SAVED:  ${savedNames.join(", ")}`);
      logger.info({ module: "match-runner" }, `ACTUAL: ${actualNames.join(", ")}`);
      if (!(globalThis as any).__lineupDebug) (globalThis as any).__lineupDebug = [];
      const dbgSaved = starters.map(s => `${s.first_name} ${s.last_name}`).join(",");
      const dbgActual = ordered.slice(0, 11).map(s => `${s.first_name} ${s.last_name}`).join(",");
      (globalThis as any).__lineupDebug.push(`team=${teamId.slice(0,8)} starters=${starters.length} ordered11=[${dbgActual}] savedPicked=[${dbgSaved}]`);
    } catch (e) { logger.error({ module: "match-runner" }, `Failed to parse lineup: ${e}`); ordered = allAvailable.slice(0, 16); }
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

  let idCounter = 1 + idOffset;
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

  // ── Assign matchPositions to replacements ──
  // User's lineup is SACRED — positions set by the user are preserved exactly.
  // When players are absent/injured, replacements fill the SAME position slots.
  const starters = players.slice(0, Math.min(11, players.length));

  if (matchPositionMap.size > 0) {
    // Simple approach:
    // 1. Build set of present player dbIds
    const presentDbIds = new Set<string>();
    for (const p of starters) {
      const dbId = idMap.get(p.id);
      if (dbId) presentDbIds.add(dbId);
    }

    // 2. Find which lineup positions are vacant (player absent)
    const missingPositions: string[] = [];
    for (const [playerId, pos] of matchPositionMap) {
      if (!presentDbIds.has(playerId)) {
        missingPositions.push(pos);
      }
    }

    // Capture for debug
    const _debugMissing = [...missingPositions];

    // 3. Assign missing positions to starters without matchPosition
    for (const p of starters) {
      if (p.matchPosition) continue;
      if (missingPositions.length > 0) {
        p.matchPosition = missingPositions.shift()! as "GK" | "DEF" | "MID" | "FWD";
      } else {
        p.matchPosition = p.position;
      }
    }
  } else {
    // No user lineup — auto-assign: 1 GK + rest by natural position
    let hasGK = false;
    for (const p of starters) {
      if (p.matchPosition) { if (p.matchPosition === "GK") hasGK = true; continue; }
      if (!hasGK && p.position === "GK") { p.matchPosition = "GK"; hasGK = true; }
      else p.matchPosition = p.position === "GK" ? "DEF" : p.position;
    }
    // If still no GK, assign the one with best goalkeeping
    if (!hasGK && starters.length > 0) {
      let best = starters.find(p => !p.matchPosition) ?? starters[0];
      for (const p of starters) { if (p.goalkeeping > best.goalkeeping) best = p; }
      best.matchPosition = "GK";
    }
  }

  return { players, idMap, positionMap, absentNames: absentInfo };
}

/**
 * Copy last saved lineup to new calendar_id, or auto-generate if none exists.
 * Validates that copied players still exist and are active.
 */
export async function copyOrCreateLineup(db: D1Database, teamId: string, calendarId: string): Promise<void> {
  const lastLineup = await db.prepare(
    "SELECT formation, tactic, players_data FROM lineups WHERE team_id = ? AND is_auto = 0 ORDER BY submitted_at DESC LIMIT 1"
  ).bind(teamId).first<{ formation: string; tactic: string; players_data: string }>().catch((e) => { logger.error({ module: "match-runner" }, "copyOrCreateLineup: query failed", e); return null; });

  if (lastLineup) {
    const picks = JSON.parse(lastLineup.players_data) as Array<{ playerId: string; matchPosition?: string }>;
    const activeIds = await db.prepare(
      "SELECT id FROM players WHERE team_id = ? AND (status IS NULL OR status = 'active')"
    ).bind(teamId).all();
    const activeSet = new Set(activeIds.results.map((r) => r.id as string));
    const validPicks = picks.filter((p) => activeSet.has(p.playerId));

    if (validPicks.length >= 11) {
      try {
        await db.prepare(
          "INSERT INTO lineups (id, team_id, calendar_id, formation, tactic, players_data, is_auto, submitted_at) VALUES (?, ?, ?, ?, ?, ?, 0, strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))"
        ).bind(crypto.randomUUID(), teamId, calendarId, lastLineup.formation, lastLineup.tactic, JSON.stringify(validPicks.slice(0, 11))).run();
        return;
      } catch (e) {
        logger.error({ module: "match-runner" }, `copyOrCreateLineup INSERT failed for ${teamId} cal=${calendarId}`, e);
      }
    } else {
      logger.warn({ module: "match-runner" }, `copyOrCreateLineup: only ${validPicks.length}/11 valid for ${teamId}`);
    }
  } else {
    logger.warn({ module: "match-runner" }, `copyOrCreateLineup: no lineup found for ${teamId}`);
  }

  // Fallback: auto-generate
  await createAutoLineup(db, teamId, calendarId);
}

export async function createAutoLineup(
  db: D1Database,
  teamId: string,
  calendarId: string,
): Promise<void> {
  const players = await db.prepare(
    "SELECT id, position, overall_rating FROM players WHERE team_id = ? AND (status IS NULL OR status = 'active') ORDER BY overall_rating DESC"
  ).bind(teamId).all();

  // Respect team's saved formation if exists
  const savedLineup = await db.prepare("SELECT formation FROM lineups WHERE team_id = ? ORDER BY submitted_at DESC LIMIT 1")
    .bind(teamId).first<{ formation: string }>().catch((e) => { logger.warn({ module: "match-runner" }, "query failed", e); return null; });
  const formation = savedLineup?.formation ?? "4-4-2";
  const parts = formation.split("-").map(Number);
  const slots: Record<string, number> = { GK: 1, DEF: parts[0] || 4, MID: (parts[1] || 4) + (parts[2] && parts.length > 3 ? parts[2] : 0), FWD: parts[parts.length - 1] || 2 };
  const picked: Array<{ playerId: string; matchPosition: string }> = [];
  const usedIds = new Set<string>();

  // First pass: fill each position with natural players
  for (const pos of ["GK", "DEF", "MID", "FWD"]) {
    const candidates = players.results.filter((p) => p.position === pos && !usedIds.has(p.id as string));
    const count = slots[pos];
    for (let i = 0; i < count && i < candidates.length; i++) {
      picked.push({ playerId: candidates[i].id as string, matchPosition: pos });
      usedIds.add(candidates[i].id as string);
    }
  }

  // Second pass: fill remaining slots with best available (out of position)
  while (picked.length < 11) {
    const remaining = players.results.find((p) => !usedIds.has(p.id as string));
    if (!remaining) break;
    // Find which position still needs players
    const filled: Record<string, number> = { GK: 0, DEF: 0, MID: 0, FWD: 0 };
    for (const p of picked) filled[p.matchPosition]++;
    const needPos = Object.entries(slots).find(([pos, need]) => filled[pos] < need)?.[0] ?? "MID";
    picked.push({ playerId: remaining.id as string, matchPosition: needPos });
    usedIds.add(remaining.id as string);
  }

  const lineupId = crypto.randomUUID();
  await db.prepare(
    "INSERT INTO lineups (id, team_id, calendar_id, formation, tactic, players_data, is_auto) VALUES (?, ?, ?, '4-4-2', 'balanced', ?, 1)"
  ).bind(lineupId, teamId, calendarId, JSON.stringify(picked)).run();
}
