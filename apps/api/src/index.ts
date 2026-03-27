import { Hono } from "hono";
import { cors } from "hono/cors";
import { authRouter } from "./routes/auth";
import { villagesRouter } from "./routes/villages";
import { teamsRouter } from "./routes/teams";
import { matchesRouter } from "./routes/matches";
import { leagueRouter } from "./routes/league";
import { gameRouter } from "./routes/game";
import { messagingRouter } from "./routes/messaging";
// transfers endpoints are in gameRouter
import { runScheduledMatches } from "./multiplayer/match-runner";
import { executeDailyTick } from "./season/daily-tick";

export type Bindings = {
  DB: D1Database;
  SESSION_KV: KVNamespace;
  CACHE_KV: KVNamespace;
  SEED_DATA: R2Bucket;
};

const app = new Hono<{ Bindings: Bindings }>();

app.use("*", cors({ origin: "*" }));

// Global error handler — structured JSON logging
app.onError((err, c) => {
  const reqId = crypto.randomUUID().slice(0, 8);
  const entry = {
    ts: new Date().toISOString(),
    level: "error",
    mod: "api",
    msg: `${c.req.method} ${c.req.url}`,
    err: err.message,
    stack: err.stack?.split("\n").slice(0, 4).join(" | "),
    reqId,
  };
  console.error(JSON.stringify(entry));
  return c.json({ error: err.message, reqId }, 500);
});

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

    // Daily tick: 4:00 CET (3:00 UTC) — or manual trigger (empty cron)
    if (cron === "0 3 * * *" || !cron) {
      console.log("[Cron] Running daily tick...");
      try {
        const result = await executeDailyTick(env);
        console.log(`[Cron] Daily tick done: ${result.events.length} events, training=${result.isTrainingDay}`);
      } catch (e) {
        console.error("[Cron] Daily tick failed:", e);
      }
    }
  },
};
