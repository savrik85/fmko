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
      const rng = createRng(Date.now() + matchId.charCodeAt(0));

      // Build players (auto-lineup, no calendar needed)
      const homeBuild = await buildMatchPlayers(db, homeTeamId, rng, null);
      const awayBuild = await buildMatchPlayers(db, awayTeamId, rng, null, 100);

      const homeLineup = homeBuild.players;
      const awayLineup = awayBuild.players;
      const homeSubs = homeLineup.splice(11);
      const awaySubs = awayLineup.splice(11);

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

      // Build lineup data
      const mapPlayer = (p: typeof homeLineup[0], idMap: Map<number, string>) => ({
        id: idMap.get(p.id) ?? "", name: `${p.firstName} ${p.lastName}`,
        position: p.matchPosition ?? p.position, naturalPosition: p.position,
        rating: Math.round((p.speed + p.technique + p.shooting + p.passing + p.defense) / 5),
      });
      const homeLineupData = { starters: homeLineup.map((p) => mapPlayer(p, homeBuild.idMap)), subs: homeSubs.map((p) => mapPlayer(p, homeBuild.idMap)) };
      const awayLineupData = { starters: awayLineup.map((p) => mapPlayer(p, awayBuild.idMap)), subs: awaySubs.map((p) => mapPlayer(p, awayBuild.idMap)) };

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

      // Apply experience only (not full stats)
      await db.prepare(
        "UPDATE players SET skills = json_set(skills, '$.experience', MIN(100, COALESCE(json_extract(skills, '$.experience'), 0) + 2)) WHERE team_id IN (?, ?)"
      ).bind(homeTeamId, awayTeamId).run().catch(() => {});

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
