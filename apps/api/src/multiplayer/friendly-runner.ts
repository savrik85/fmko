/**
 * Friendly match runner — simuluje přátelské zápasy (bez calendar/league).
 */

import { simulateMatch } from "../engine/simulation";
import { generateMatchCommentary, loadCommentaryFromDB } from "../engine/commentary";
import { createRng } from "../generators/rng";
import type { TeamSetup, Weather } from "../engine/types";
import { buildMatchPlayers } from "./match-runner";
import { logger } from "../lib/logger";

export async function simulateFriendlyMatches(db: D1Database): Promise<number> {
  const matches = await db.prepare(
    "SELECT id, home_team_id, away_team_id FROM matches WHERE calendar_id IS NULL AND league_id IS NULL AND status = 'lineups_open'"
  ).all();

  if (matches.results.length === 0) return 0;

  let count = 0;

  // Weather for friendlies
  const weathers: Weather[] = ["sunny", "cloudy", "rain", "wind", "snow"];
  const roll = Math.random() * 100;
  let weather: Weather = "cloudy";
  const weights = [30, 30, 20, 15, 5];
  let cum = 0;
  for (let i = 0; i < weathers.length; i++) {
    cum += weights[i];
    if (roll < cum) { weather = weathers[i]; break; }
  }

  for (const match of matches.results) {
    const matchId = match.id as string;
    const homeTeamId = match.home_team_id as string;
    const awayTeamId = match.away_team_id as string;

    try {
      // Use same seed as /next-match endpoint so absences are consistent
      const { seedFromString } = await import("../lib/seed");
      const absenceRng = createRng(seedFromString(matchId));
      const rng = createRng(Date.now() + matchId.charCodeAt(0));

      // Ensure lineups exist — copy last saved or auto-generate
      const { copyOrCreateLineup } = await import("./match-runner");
      const hasHomeLineup = await db.prepare("SELECT id FROM lineups WHERE team_id = ? AND calendar_id = ?")
        .bind(homeTeamId, matchId).first().catch(() => null);
      if (!hasHomeLineup) await copyOrCreateLineup(db, homeTeamId, matchId);

      const hasAwayLineup = await db.prepare("SELECT id FROM lineups WHERE team_id = ? AND calendar_id = ?")
        .bind(awayTeamId, matchId).first().catch(() => null);
      if (!hasAwayLineup) await copyOrCreateLineup(db, awayTeamId, matchId);

      // Load lineups
      const homeLineupRow = await db.prepare("SELECT players_data FROM lineups WHERE team_id = ? AND calendar_id = ?")
        .bind(homeTeamId, matchId).first<{ players_data: string }>().catch(() => null);
      const awayLineupRow = await db.prepare("SELECT players_data FROM lineups WHERE team_id = ? AND calendar_id = ?")
        .bind(awayTeamId, matchId).first<{ players_data: string }>().catch(() => null);

      const homeBuild = await buildMatchPlayers(db, homeTeamId, absenceRng, homeLineupRow?.players_data ?? null);
      const awayBuild = await buildMatchPlayers(db, awayTeamId, absenceRng, awayLineupRow?.players_data ?? null, 100);

      const homeLineup = homeBuild.players;
      const awayLineup = awayBuild.players;
      const homeSubs = homeLineup.splice(11);
      const awaySubs = awayLineup.splice(11);

      // Save pre-simulation copies (simulation mutates arrays via substitutions)
      const homeLineupPreSim = homeLineup.map(p => ({ ...p }));
      const awayLineupPreSim = awayLineup.map(p => ({ ...p }));
      const homeSubsPreSim = homeSubs.map(p => ({ ...p }));
      const awaySubsPreSim = awaySubs.map(p => ({ ...p }));

      const homeTeam = await db.prepare("SELECT name FROM teams WHERE id = ?").bind(homeTeamId).first<{ name: string }>();
      const awayTeam = await db.prepare("SELECT name FROM teams WHERE id = ?").bind(awayTeamId).first<{ name: string }>();

      const homeSetup: TeamSetup = {
        teamId: 1,
        teamName: homeTeam?.name ?? "Domácí",
        lineup: homeLineup,
        subs: homeSubs,
        tactic: "balanced",
      };
      const awaySetup: TeamSetup = {
        teamId: 2,
        teamName: awayTeam?.name ?? "Hosté",
        lineup: awayLineup,
        subs: awaySubs,
        tactic: "balanced",
      };

      // Stadium info
      const stadiumRow = await db.prepare("SELECT pitch_condition FROM stadiums WHERE team_id = ?")
        .bind(homeTeamId).first<{ pitch_condition: number }>().catch(() => null);
      const stadiumNameRow = await db.prepare("SELECT stadium_name FROM teams WHERE id = ?")
        .bind(homeTeamId).first<{ stadium_name: string }>().catch(() => null);

      // Simulate
      const result = simulateMatch(rng, {
        home: homeSetup,
        away: awaySetup,
        weather,
        isHomeAdvantage: false, // přátelák = neutrální
        pitchCondition: stadiumRow?.pitch_condition ?? 50,
        stadiumName: stadiumNameRow?.stadium_name ?? undefined,
        attendance: Math.round(20 + Math.random() * 50), // malá návštěva
      });

      // Commentary
      await loadCommentaryFromDB(db);
      const commentary = generateMatchCommentary(rng, result.events, homeSetup.teamName, awaySetup.teamName);

      // Build lineup data (max 1 GK in starters)
      const buildLineupData = (lineup: typeof homeLineup, subs: typeof homeSubs, idMap: Map<number, string>) => {
        let gkCount = 0;
        const mapStarter = (p: typeof homeLineup[0]) => {
          let pos = p.matchPosition ?? p.position;
          if (pos === "GK") { gkCount++; if (gkCount > 1) pos = "DEF"; }
          return { id: idMap.get(p.id) ?? "", name: `${p.firstName} ${p.lastName}`, position: pos, naturalPosition: p.position,
            rating: Math.round((p.speed + p.technique + p.shooting + p.passing + p.defense) / 5) };
        };
        const mapSub = (p: typeof homeLineup[0]) => ({
          id: idMap.get(p.id) ?? "", name: `${p.firstName} ${p.lastName}`,
          position: p.matchPosition ?? p.position, naturalPosition: p.position,
          rating: Math.round((p.speed + p.technique + p.shooting + p.passing + p.defense) / 5),
        });
        return { starters: lineup.map(mapStarter), subs: subs.map(mapSub) };
      };
      const homeLineupData = buildLineupData(homeLineupPreSim, homeSubsPreSim, homeBuild.idMap);
      const awayLineupData = buildLineupData(awayLineupPreSim, awaySubsPreSim, awayBuild.idMap);

      // Save
      await db.prepare(
        `UPDATE matches SET status = 'simulated', home_score = ?, away_score = ?,
         events = ?, commentary = ?, attendance = ?, stadium_name = ?, pitch_condition = ?, weather = ?,
         home_lineup_data = ?, away_lineup_data = ?,
         simulated_at = datetime('now') WHERE id = ?`
      ).bind(
        result.homeScore, result.awayScore,
        JSON.stringify(result.events), JSON.stringify(commentary),
        Math.round(20 + Math.random() * 50),
        stadiumNameRow?.stadium_name ?? null, stadiumRow?.pitch_condition ?? 50, weather,
        JSON.stringify(homeLineupData), JSON.stringify(awayLineupData),
        matchId,
      ).run();

      // Update challenge status
      await db.prepare("UPDATE challenges SET status = 'played' WHERE match_id = ?").bind(matchId).run().catch(() => {});

      // Persist condition + morale changes for players who actually played
      try {
        const allPlayers = [...result.homeLineup, ...result.awayLineup];
        const fullIdMap = new Map<number, string>();
        for (const [engineId, dbId] of homeBuild.idMap) fullIdMap.set(engineId, dbId);
        for (const [engineId, dbId] of awayBuild.idMap) fullIdMap.set(engineId, dbId);

        const condStmts = allPlayers
          .filter(p => fullIdMap.has(p.id))
          .map(p => db.prepare(
            "UPDATE players SET life_context = json_set(life_context, '$.condition', ?, '$.morale', ?) WHERE id = ?"
          ).bind(Math.round(p.condition), Math.round(p.morale), fullIdMap.get(p.id)!));
        if (condStmts.length > 0) await db.batch(condStmts);
      } catch (e) {
        logger.error({ module: "friendly-runner" }, "Condition persist failed", e);
      }

      // Match experience: small chance to improve skills (same as league, but halved chance)
      try {
        const fullIdMap = new Map<number, string>();
        for (const [engineId, dbId] of homeBuild.idMap) fullIdMap.set(engineId, dbId);
        for (const [engineId, dbId] of awayBuild.idMap) fullIdMap.set(engineId, dbId);

        const matchRng = createRng(Date.now() + matchId.charCodeAt(2));
        for (const [engineId, pm] of Object.entries(result.playerMinutes)) {
          const dbId = fullIdMap.get(Number(engineId));
          if (!dbId) continue;
          const minutes = ((pm as any).left ?? 90) - (pm as any).entered;
          if (minutes < 15) continue;

          const playerRow = await db.prepare("SELECT age, skills, position, team_id FROM players WHERE id = ?")
            .bind(dbId).first<{ age: number; skills: string; position: string; team_id: string }>().catch(() => null);
          if (!playerRow) continue;

          const age = playerRow.age;
          const ageMod = age < 22 ? 0.04 : age < 26 ? 0.025 : age < 30 ? 0.015 : 0.005; // halved vs league
          const minutesMod = minutes / 90;
          const improveChance = ageMod * minutesMod;

          if (matchRng.random() < improveChance) {
            const skills = JSON.parse(playerRow.skills);
            const posSkills: Record<string, string[]> = {
              GK: ["goalkeeping"], DEF: ["defense", "heading", "strength"],
              MID: ["passing", "technique"], FWD: ["shooting", "speed", "technique"],
            };
            const candidates = posSkills[playerRow.position] ?? ["technique"];
            const attr = matchRng.pick(candidates);
            const current = skills[attr] ?? 50;
            if (current < 80) { // lower cap than league (80 vs 85)
              skills[attr] = current + 1;
              await db.prepare("UPDATE players SET skills = ? WHERE id = ?")
                .bind(JSON.stringify(skills), dbId).run();
              await db.prepare(
                "INSERT INTO training_log (player_id, team_id, attribute, old_value, new_value, change, training_type, game_date) VALUES (?, ?, ?, ?, ?, 1, 'friendly', ?)"
              ).bind(dbId, playerRow.team_id, attr, current, current + 1, new Date().toISOString()).run().catch(() => {});
            }
          }
        }
      } catch (e) {
        logger.error({ module: "friendly-runner" }, "Match experience failed", e);
      }

      // SMS both teams
      const smsBody = `⚽ Přátelák odehrán! ${homeSetup.teamName} ${result.homeScore}:${result.awayScore} ${awaySetup.teamName}`;
      for (const tid of [homeTeamId, awayTeamId]) {
        let convId = await db.prepare("SELECT id FROM conversations WHERE team_id = ? AND type = 'system' AND title = 'Sportovní ředitel'")
          .bind(tid).first<{ id: string }>().then((r) => r?.id).catch(() => null);
        if (convId) {
          await db.prepare("INSERT INTO messages (id, conversation_id, sender_type, sender_name, body, sent_at) VALUES (?, ?, 'system', 'Sportovní ředitel', ?, datetime('now'))")
            .bind(crypto.randomUUID(), convId, smsBody).run().catch(() => {});
          await db.prepare("UPDATE conversations SET unread_count = unread_count + 1, last_message_text = ?, last_message_at = datetime('now') WHERE id = ?")
            .bind(smsBody.slice(0, 100), convId).run().catch(() => {});
        }
      }

      count++;
      logger.info({ module: "friendly-runner" }, `Friendly simulated: ${homeSetup.teamName} ${result.homeScore}:${result.awayScore} ${awaySetup.teamName}`);
    } catch (e) {
      logger.error({ module: "friendly-runner" }, `Failed to simulate friendly ${matchId}`, e);
    }
  }

  return count;
}
