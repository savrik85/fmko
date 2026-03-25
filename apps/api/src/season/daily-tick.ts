/**
 * Denní tick — logika extrahovaná z index.ts scheduled handleru.
 * Spouští trénink, recovery kondice, injury healing, pitch degradation, morale drift.
 */

import type { Bindings } from "../index";
import { createRng } from "../generators/rng";
import { simulateTraining } from "./training";

export interface DailyTickEvent {
  type: "training" | "recovery" | "injury_healed" | "pitch" | "morale" | "match" | "day";
  description: string;
  data?: unknown;
}

export interface DailyTickResult {
  date: string;
  dayOfWeek: number;
  isTrainingDay: boolean;
  events: DailyTickEvent[];
}

/**
 * Execute one day's worth of game simulation.
 */
export async function executeDailyTick(
  env: Bindings,
  gameDate?: Date,
): Promise<DailyTickResult> {
  const now = gameDate ?? new Date();
  const dayOfWeek = now.getUTCDay();
  const isTrainingDay = dayOfWeek >= 1 && dayOfWeek <= 5;
  const events: DailyTickEvent[] = [];

  // ── Training (Mon-Fri, if plan is set) ──
  const teams = await env.DB.prepare(
    "SELECT id, training_type, training_approach, training_sessions FROM teams WHERE user_id != 'ai'"
  ).all();

  for (const team of teams.results) {
    const teamId = team.id as string;

    if (isTrainingDay && team.training_type) {
      try {
        const playersResult = await env.DB.prepare(
          "SELECT * FROM players WHERE team_id = ? ORDER BY overall_rating DESC"
        ).bind(teamId).all();

        const squad = playersResult.results.map((row) => {
          const skills = JSON.parse(row.skills as string);
          const personality = JSON.parse(row.personality as string);
          const lifeContext = JSON.parse(row.life_context as string);
          const physical = row.physical ? JSON.parse(row.physical as string) : {};
          return {
            firstName: row.first_name as string, lastName: row.last_name as string,
            age: row.age as number, position: row.position as "GK" | "DEF" | "MID" | "FWD",
            speed: skills.speed, technique: skills.technique, shooting: skills.shooting,
            passing: skills.passing, heading: skills.heading ?? 0, defense: skills.defense,
            goalkeeping: skills.goalkeeping ?? 0,
            stamina: physical.stamina ?? skills.stamina ?? skills.speed,
            strength: physical.strength ?? skills.strength ?? skills.defense,
            injuryProneness: personality.injuryProneness ?? 50,
            discipline: personality.discipline,
            patriotism: personality.patriotism, alcohol: personality.alcohol,
            temper: personality.temper, occupation: lifeContext.occupation ?? "",
            bodyType: "normal" as const, avatarConfig: {} as any,
            condition: lifeContext.condition ?? 100, morale: lifeContext.morale ?? 50,
            preferredFoot: "right" as const, preferredSide: "center" as const,
            leadership: personality.leadership ?? 30, workRate: personality.workRate ?? 50,
            aggression: personality.aggression ?? 40, consistency: personality.consistency ?? 50,
            clutch: personality.clutch ?? 50,
          };
        });

        const { calculateEffects } = await import("../equipment/equipment-generator");
        const equip = await env.DB.prepare("SELECT * FROM equipment WHERE team_id = ?")
          .bind(teamId).first<Record<string, unknown>>().catch(() => null);

        let equipMul = 1.0;
        if (equip) {
          const levels: Record<string, number> = {};
          const conditions: Record<string, number> = {};
          for (const [k, v] of Object.entries(equip)) {
            if (k.endsWith("_condition")) conditions[k] = v as number;
            else if (typeof v === "number" && k !== "id") levels[k] = v;
          }
          equipMul = calculateEffects(levels, conditions).trainingMultiplier;
        }

        const rng = createRng(now.getTime() + teamId.charCodeAt(0));
        const result = simulateTraining(rng, squad, {
          type: (team.training_type as any) ?? "conditioning",
          approach: (team.training_approach as any) ?? "balanced",
          sessionsPerWeek: (team.training_sessions as number) ?? 2,
        }, undefined, equipMul);

        const attendanceWithNames = result.attendance.map((a) => ({
          playerName: `${squad[a.playerIndex].firstName} ${squad[a.playerIndex].lastName}`,
          attended: a.attended,
          reason: a.reason,
        }));
        const improvementsWithNames = result.improvements.map((imp) => ({
          playerName: `${squad[imp.playerIndex].firstName} ${squad[imp.playerIndex].lastName}`,
          attribute: imp.attribute,
          change: imp.change,
        }));

        const summary = {
          attendance: attendanceWithNames,
          improvements: improvementsWithNames,
          teamChemistry: result.teamChemistry,
          attendedCount: attendanceWithNames.filter((a) => a.attended).length,
          totalCount: attendanceWithNames.length,
          day: now.toLocaleDateString("cs", { weekday: "long" }),
        };

        await env.DB.prepare(
          "UPDATE teams SET last_training_at = ?, last_training_result = ? WHERE id = ?"
        ).bind(now.toISOString(), JSON.stringify(summary), teamId).run();

        // Persist skill changes to DB + recalculate wages
        for (const imp of result.improvements) {
          const player = squad[imp.playerIndex];
          const playerId = playersResult.results[imp.playerIndex].id as string;
          const currentSkills = JSON.parse(playersResult.results[imp.playerIndex].skills as string);
          if (imp.attribute in currentSkills) {
            currentSkills[imp.attribute] = player[imp.attribute as keyof typeof player];
            // Update skills + recalculate overall_rating + update weekly_wage
            await env.DB.prepare("UPDATE players SET skills = ? WHERE id = ?")
              .bind(JSON.stringify(currentSkills), playerId).run();
            // Recalculate wage based on current overall_rating
            await env.DB.prepare(
              "UPDATE players SET weekly_wage = ROUND(10 + (overall_rating / 100.0) * 400) WHERE id = ?"
            ).bind(playerId).run();
          }
        }

        events.push({
          type: "training",
          description: `Trénink: ${summary.attendedCount}/${summary.totalCount} hráčů, ${improvementsWithNames.length} zlepšení`,
          data: summary,
        });
      } catch (e) {
        console.error(`[DailyTick] Training failed for team ${teamId}:`, e);
      }
    }
  }

  // ── Global ticks ──

  // Pitch degradation
  await env.DB.prepare(
    "UPDATE stadiums SET pitch_condition = MAX(5, pitch_condition - 1) WHERE pitch_type = 'natural'"
  ).run();
  await env.DB.prepare(
    "UPDATE stadiums SET pitch_condition = MAX(10, pitch_condition - 1) WHERE pitch_type = 'hybrid' AND (ABS(RANDOM()) % 2 = 0)"
  ).run();

  // Equipment condition degradation (slow — 1-2 points per day for used items)
  const equipCategories = ["balls", "jerseys", "training_cones", "first_aid", "boots_stock", "bibs", "goalkeeper_gear", "water_bottles", "tactics_board"];
  for (const cat of equipCategories) {
    // Only degrade items with level > 0, by 1 point/day (50% chance)
    await env.DB.prepare(
      `UPDATE equipment SET ${cat}_condition = MAX(5, ${cat}_condition - 1) WHERE ${cat} > 0 AND (ABS(RANDOM()) % 2 = 0)`
    ).run().catch(() => {});
  }

  // Injury recovery
  await env.DB.prepare(
    "UPDATE injuries SET days_remaining = days_remaining - 1 WHERE days_remaining > 0"
  ).run();
  const healed = await env.DB.prepare(
    "SELECT p.first_name, p.last_name FROM injuries i JOIN players p ON i.player_id = p.id WHERE i.days_remaining <= 0"
  ).all().catch(() => ({ results: [] }));
  await env.DB.prepare("DELETE FROM injuries WHERE days_remaining <= 0").run();

  if (healed.results.length > 0) {
    events.push({
      type: "injury_healed",
      description: `Vyléčeno: ${healed.results.map((r) => `${r.first_name} ${r.last_name}`).join(", ")}`,
    });
  }

  // Condition recovery: stamina-based
  await env.DB.prepare(
    `UPDATE players SET life_context = json_set(life_context, '$.condition',
      MIN(100, json_extract(life_context, '$.condition') +
        CASE
          WHEN json_extract(skills, '$.stamina') >= 75 THEN 18
          WHEN json_extract(skills, '$.stamina') >= 50 THEN 14
          WHEN json_extract(skills, '$.stamina') >= 25 THEN 10
          ELSE 7
        END
      ))`
  ).run();
  events.push({ type: "recovery", description: "Regenerace kondice (dle staminy)" });

  // Morale drift toward 50
  await env.DB.prepare(
    `UPDATE players SET life_context = json_set(life_context, '$.morale',
      CASE
        WHEN json_extract(life_context, '$.morale') > 55 THEN json_extract(life_context, '$.morale') - 1
        WHEN json_extract(life_context, '$.morale') < 45 THEN json_extract(life_context, '$.morale') + 1
        ELSE json_extract(life_context, '$.morale')
      END)`
  ).run();
  events.push({ type: "morale", description: "Morálka se stabilizuje" });

  // ── Advance game date for ALL teams (including AI) ──
  const allTeams = await env.DB.prepare(
    "SELECT t.id, t.league_id, t.game_date, t.training_type, t.training_sessions, v.size as village_size FROM teams t LEFT JOIN villages v ON t.village_id = v.id"
  ).all();
  for (const team of allTeams.results) {
    const teamId = team.id as string;
    const gameDate = team.game_date as string | null;
    if (gameDate) {
      const gd = new Date(gameDate);
      gd.setDate(gd.getDate() + 1);
      const newDayOfWeek = gd.getUTCDay();
      const newGameDate = gd.toISOString();

      await env.DB.prepare("UPDATE teams SET game_date = ? WHERE id = ?")
        .bind(newGameDate, teamId).run();

      events.push({ type: "day", description: `Herní den: ${gd.toLocaleDateString("cs", { weekday: "long", day: "numeric", month: "numeric" })}` });

      // ── Weekly finances (Monday) ──
      if (newDayOfWeek === 1) {
        try {
          const { processWeeklyFinances } = await import("./finance-processor");
          await processWeeklyFinances(env.DB, teamId, newGameDate, (team.village_size as string) ?? "village");
        } catch (e) {
          console.error(`[DailyTick] Weekly finances failed for team ${teamId}:`, e);
        }
      }

      // ── Training cost (only on actual training days, not every weekday) ──
      if (team.training_type && newDayOfWeek >= 1 && newDayOfWeek <= 5) {
        const sessions = (team.training_sessions as number) ?? 2;
        // Map sessions/week to specific days: 1→Tue, 2→Tue+Thu, 3→Mon+Wed+Fri, 4→Mon+Tue+Thu+Fri, 5→all
        const trainingDayMap: Record<number, number[]> = {
          1: [2], 2: [2, 4], 3: [1, 3, 5], 4: [1, 2, 4, 5], 5: [1, 2, 3, 4, 5],
        };
        const trainingDays = trainingDayMap[sessions] ?? trainingDayMap[2];
        if (trainingDays.includes(newDayOfWeek)) {
          try {
            const { processTrainingCost } = await import("./finance-processor");
            await processTrainingCost(env.DB, teamId, newGameDate, (team.village_size as string) ?? "village");
          } catch (e) {
            console.error(`[DailyTick] Training cost failed for team ${teamId}:`, e);
          }
        }
      }

      // Check if there's a match scheduled for this date
      const leagueId = team.league_id as string | null;

      if (leagueId) {
        const dayStart = new Date(gd); dayStart.setUTCHours(0, 0, 0, 0);
        const dayEnd = new Date(gd); dayEnd.setUTCHours(23, 59, 59, 999);

        const matchCal = await env.DB.prepare(
          "SELECT id FROM season_calendar WHERE league_id = ? AND scheduled_at BETWEEN ? AND ? AND status = 'scheduled'"
        ).bind(leagueId, dayStart.toISOString(), dayEnd.toISOString()).first<{ id: string }>();

        if (matchCal) {
          try {
            // Switch matches from 'scheduled' to 'lineups_open' so runner can find them
            await env.DB.prepare(
              "UPDATE matches SET status = 'lineups_open' WHERE calendar_id = ? AND status = 'scheduled'"
            ).bind(matchCal.id).run();

            const { runScheduledMatches } = await import("../multiplayer/match-runner");
            const results = await runScheduledMatches(env.DB, matchCal.id);
            await env.DB.prepare("UPDATE season_calendar SET status = 'simulated' WHERE id = ?")
              .bind(matchCal.id).run();
            events.push({ type: "match", description: `Zápasový den! ${results.length} zápasů odsimulováno.` });

            // Zpravodaj: článek o výsledcích kola
            if (results.length > 0) {
              try {
                const calRow = await env.DB.prepare("SELECT game_week FROM season_calendar WHERE id = ?")
                  .bind(matchCal.id).first<{ game_week: number }>();
                const gameWeek = calRow?.game_week ?? 0;

                const matchRows = await env.DB.prepare(
                  `SELECT m.home_score, m.away_score, t1.name as home_name, t2.name as away_name
                   FROM matches m JOIN teams t1 ON m.home_team_id = t1.id JOIN teams t2 ON m.away_team_id = t2.id
                   WHERE m.calendar_id = ? AND m.status = 'simulated'`
                ).bind(matchCal.id).all();

                const lines: string[] = [];
                let topScore = 0;
                let topMatch = "";
                for (const r of matchRows.results) {
                  const hs = r.home_score as number; const as_ = r.away_score as number;
                  const hn = r.home_name as string; const an = r.away_name as string;
                  if (hs > as_) lines.push(`${hn} porazil ${an} ${hs}:${as_}`);
                  else if (hs < as_) lines.push(`${an} zvítězil nad ${hn} ${as_}:${hs}`);
                  else lines.push(`${hn} remizoval s ${an} ${hs}:${as_}`);
                  if (hs + as_ > topScore) { topScore = hs + as_; topMatch = `${hn} vs ${an} ${hs}:${as_}`; }
                }

                const headline = `${gameWeek}. kolo: přehled výsledků`;
                const body = lines.join(". ") + "." + (topScore >= 4 ? ` Nejvíce gólů padlo v utkání ${topMatch}.` : "");

                const newsId = crypto.randomUUID();
                await env.DB.prepare(
                  "INSERT INTO news (id, league_id, type, headline, body, game_week, created_at) VALUES (?, ?, 'round_results', ?, ?, ?, datetime('now'))"
                ).bind(newsId, leagueId, headline, body, gameWeek).run();
              } catch (e) {
                console.error("[DailyTick] News generation failed:", e);
              }
            }
          } catch (e) {
            console.error(`[DailyTick] Match sim failed:`, e);
          }
        }
      }
    }
  }

  return { date: now.toISOString(), dayOfWeek, isTrainingDay, events };
}
