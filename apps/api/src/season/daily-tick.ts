/**
 * Denní tick — logika extrahovaná z index.ts scheduled handleru.
 * Spouští trénink, recovery kondice, injury healing, pitch degradation, morale drift.
 */

import type { Bindings } from "../index";
import { createRng } from "../generators/rng";
import { simulateTraining } from "./training";

export interface DailyTickEvent {
  type: "training" | "recovery" | "injury_healed" | "pitch" | "morale";
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

  return { date: now.toISOString(), dayOfWeek, isTrainingDay, events };
}
