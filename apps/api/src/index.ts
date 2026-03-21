import { Hono } from "hono";
import { cors } from "hono/cors";
import { villagesRouter } from "./routes/villages";
import { teamsRouter } from "./routes/teams";
import { matchesRouter } from "./routes/matches";
import { leagueRouter } from "./routes/league";
import { gameRouter } from "./routes/game";
import { runScheduledMatches } from "./multiplayer/match-runner";

export type Bindings = {
  DB: D1Database;
  SESSION_KV: KVNamespace;
  CACHE_KV: KVNamespace;
  SEED_DATA: R2Bucket;
};

const app = new Hono<{ Bindings: Bindings }>();

app.use("*", cors({ origin: "*" }));

app.get("/", (c) => c.json({ name: "Okresní Mašina API", version: "0.2.0" }));
app.get("/health", (c) => c.json({ status: "ok" }));

app.route("/api/villages", villagesRouter);
app.route("/api/teams", teamsRouter);
app.route("/api", matchesRouter);
app.route("/api", leagueRouter);
app.route("/api", gameRouter);

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

      // Get all active teams
      const teams = await env.DB.prepare(
        "SELECT id FROM teams"
      ).all();

      for (const team of teams.results) {
        const teamId = team.id as string;

        // Injury recovery: reduce injury duration by 1
        // (Would need injury tracking column — simplified for now)

        // Condition recovery: players recover condition daily
        await env.DB.prepare(
          `UPDATE players SET life_context = json_set(life_context, '$.condition',
            MIN(100, json_extract(life_context, '$.condition') + 5))
          WHERE team_id = ?`
        ).bind(teamId).run();

        // Morale drift toward 50
        await env.DB.prepare(
          `UPDATE players SET life_context = json_set(life_context, '$.morale',
            CASE
              WHEN json_extract(life_context, '$.morale') > 55 THEN json_extract(life_context, '$.morale') - 1
              WHEN json_extract(life_context, '$.morale') < 45 THEN json_extract(life_context, '$.morale') + 1
              ELSE json_extract(life_context, '$.morale')
            END)
          WHERE team_id = ?`
        ).bind(teamId).run();
      }

      console.log(`[Cron] Daily tick processed ${teams.results.length} teams`);
    }
  },
};
