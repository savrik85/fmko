import { Hono } from "hono";
import { cors } from "hono/cors";
import { authRouter } from "./routes/auth";
import { villagesRouter } from "./routes/villages";
import { teamsRouter } from "./routes/teams";
import { matchesRouter } from "./routes/matches";
import { leagueRouter } from "./routes/league";
import { gameRouter } from "./routes/game";
import { messagingRouter } from "./routes/messaging";
import { runScheduledMatches } from "./multiplayer/match-runner";
import { createRng } from "./generators/rng";
import { simulateTraining } from "./season/training";

export type Bindings = {
  DB: D1Database;
  SESSION_KV: KVNamespace;
  CACHE_KV: KVNamespace;
  SEED_DATA: R2Bucket;
};

const app = new Hono<{ Bindings: Bindings }>();

app.use("*", cors({ origin: "*" }));

app.get("/", (c) => c.json({ name: "Prales API", version: "0.2.0" }));
app.get("/health", (c) => c.json({ status: "ok" }));

app.route("/auth", authRouter);
app.route("/api/villages", villagesRouter);
app.route("/api/teams", teamsRouter);
app.route("/api", matchesRouter);
app.route("/api", leagueRouter);
app.route("/api", gameRouter);
app.route("/api", messagingRouter);

export default {
  fetch: app.fetch,

  async scheduled(event: ScheduledEvent, env: Bindings, ctx: ExecutionContext) {
    const cron = event.cron;
    console.log(`[Cron] Trigger: ${cron} at ${new Date().toISOString()}`);

    // Match simulation ticks: St 20:00, So 15:00, Ne 15:00 CET
    if (cron === "0 19 * * 3" || cron === "0 14 * * 6" || cron === "0 14 * * 0") {
      console.log("[Cron] Running match simulation tick...");

      // Find calendar entries scheduled for now
      const now = new Date();
      const windowStart = new Date(now.getTime() - 5 * 60 * 1000); // 5 min window

      const calendars = await env.DB.prepare(
        "SELECT id FROM season_calendar WHERE scheduled_at BETWEEN ? AND ? AND status = 'scheduled'"
      ).bind(windowStart.toISOString(), now.toISOString()).all();

      for (const cal of calendars.results) {
        const results = await runScheduledMatches(env.DB, cal.id as string);
        console.log(`[Cron] Simulated ${results.length} matches for calendar ${cal.id}`);

        // Mark calendar as simulated
        await env.DB.prepare(
          "UPDATE season_calendar SET status = 'simulated' WHERE id = ?"
        ).bind(cal.id).run();
      }
    }

    // Daily tick: 4:00 CET (3:00 UTC)
    if (cron === "0 3 * * *") {
      console.log("[Cron] Running daily tick...");

      // Get all active teams (non-AI only for training)
      const teams = await env.DB.prepare(
        "SELECT id, training_type, training_approach, training_sessions FROM teams WHERE user_id != 'ai'"
      ).all();

      // Day of week: 0=Sun, 1=Mon ... 5=Fri, 6=Sat
      const dayOfWeek = new Date().getUTCDay();
      const isTrainingDay = dayOfWeek >= 1 && dayOfWeek <= 5; // Mon-Fri

      for (const team of teams.results) {
        const teamId = team.id as string;

        // ── Training (Mon-Fri, if plan is set) ──
        if (isTrainingDay && team.training_type) {
          try {
            const playersResult = await env.DB.prepare(
              "SELECT * FROM players WHERE team_id = ? ORDER BY overall_rating DESC"
            ).bind(teamId).all();

            const squad = playersResult.results.map((row) => {
              const skills = JSON.parse(row.skills as string);
              const personality = JSON.parse(row.personality as string);
              const lifeContext = JSON.parse(row.life_context as string);
              return {
                firstName: row.first_name as string, lastName: row.last_name as string,
                age: row.age as number, position: row.position as "GK" | "DEF" | "MID" | "FWD",
                speed: skills.speed, technique: skills.technique, shooting: skills.shooting,
                passing: skills.passing, heading: skills.heading, defense: skills.defense,
                goalkeeping: skills.goalkeeping, stamina: skills.speed, strength: skills.defense,
                injuryProneness: 10, discipline: personality.discipline,
                patriotism: personality.patriotism, alcohol: personality.alcohol,
                temper: personality.temper, occupation: lifeContext.occupation,
                bodyType: "normal" as const, avatarConfig: {} as any,
                condition: lifeContext.condition ?? 100, morale: lifeContext.morale ?? 50,
                preferredFoot: "right" as const, preferredSide: "center" as const,
                leadership: personality.leadership ?? 30, workRate: personality.workRate ?? 50,
                aggression: personality.aggression ?? 40, consistency: personality.consistency ?? 50,
                clutch: personality.clutch ?? 50,
              };
            });

            // Load equipment effects
            const { calculateEffects } = await import("./equipment/equipment-generator");
            const equip = await env.DB.prepare("SELECT * FROM equipment WHERE team_id = ?")
              .bind(teamId).first<Record<string, unknown>>().catch(() => null);

            let equipEffects = { trainingMultiplier: 1.0, tacticsTrainingBonus: 0 };
            if (equip) {
              const levels: Record<string, number> = {};
              const conditions: Record<string, number> = {};
              for (const [k, v] of Object.entries(equip)) {
                if (k.endsWith("_condition")) conditions[k] = v as number;
                else if (typeof v === "number" && k !== "id") levels[k] = v;
              }
              const fx = calculateEffects(levels, conditions);
              equipEffects = { trainingMultiplier: fx.trainingMultiplier, tacticsTrainingBonus: fx.tacticsTrainingBonus };
            }

            const rng = createRng(Date.now() + teamId.charCodeAt(0));
            const result = simulateTraining(rng, squad, {
              type: (team.training_type as any) ?? "conditioning",
              approach: (team.training_approach as any) ?? "balanced",
              sessionsPerWeek: (team.training_sessions as number) ?? 2,
            }, undefined, equipEffects.trainingMultiplier);

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
              day: new Date().toLocaleDateString("cs", { weekday: "long" }),
            };

            await env.DB.prepare(
              "UPDATE teams SET last_training_at = ?, last_training_result = ? WHERE id = ?"
            ).bind(new Date().toISOString(), JSON.stringify(summary), teamId).run();
          } catch (e) {
            console.error(`[Cron] Training failed for team ${teamId}:`, e);
          }
        }

      }

      // ── Global ticks (all teams including AI) ──

      // Pitch degradation: natural loses 1/day, hybrid 0.5/day, artificial 0
      await env.DB.prepare(
        "UPDATE stadiums SET pitch_condition = MAX(5, pitch_condition - 1) WHERE pitch_type = 'natural'"
      ).run();
      await env.DB.prepare(
        "UPDATE stadiums SET pitch_condition = MAX(10, pitch_condition - 1) WHERE pitch_type = 'hybrid' AND (ABS(RANDOM()) % 2 = 0)"
      ).run();
      // Artificial never degrades

      // Injury recovery: reduce duration by 1 day, delete healed
      await env.DB.prepare(
        "UPDATE injuries SET days_remaining = days_remaining - 1 WHERE days_remaining > 0"
      ).run();
      await env.DB.prepare(
        "DELETE FROM injuries WHERE days_remaining <= 0"
      ).run();

      // Condition recovery: all players recover condition daily
      await env.DB.prepare(
        `UPDATE players SET life_context = json_set(life_context, '$.condition',
          MIN(100, json_extract(life_context, '$.condition') + 5))`
      ).run();

      // Morale drift toward 50
      await env.DB.prepare(
        `UPDATE players SET life_context = json_set(life_context, '$.morale',
          CASE
            WHEN json_extract(life_context, '$.morale') > 55 THEN json_extract(life_context, '$.morale') - 1
            WHEN json_extract(life_context, '$.morale') < 45 THEN json_extract(life_context, '$.morale') + 1
            ELSE json_extract(life_context, '$.morale')
          END)`
      ).run();

      console.log(`[Cron] Daily tick: ${teams.results.length} teams trained (${isTrainingDay ? "training day" : "rest day"})`);
    }
  },
};
