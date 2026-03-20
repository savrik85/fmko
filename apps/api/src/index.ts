import { Hono } from "hono";
import { cors } from "hono/cors";
import { auth } from "./routes/auth";
import { villagesRouter } from "./routes/villages";
import { teamsRouter } from "./routes/teams";

export type Bindings = {
  DB: D1Database;
  SESSION_KV: KVNamespace;
  CACHE_KV: KVNamespace;
  SEED_DATA: R2Bucket;
};

const app = new Hono<{ Bindings: Bindings }>();

// CORS for frontend
app.use("*", cors({
  origin: ["http://localhost:3000", "https://okresni-masina.pages.dev"],
}));

// Health check
app.get("/", (c) => {
  return c.json({ name: "Okresní Mašina API", version: "0.0.1" });
});

app.get("/health", (c) => {
  return c.json({ status: "ok" });
});

// Routes
app.route("/auth", auth);
app.route("/api/villages", villagesRouter);
app.route("/api/teams", teamsRouter);

// Scheduled handler (cron trigger for between-round simulation)
export default {
  fetch: app.fetch,
  async scheduled(event: ScheduledEvent, env: Bindings, ctx: ExecutionContext) {
    // TODO: FMK-16 — mezikolová simulace
    console.log("Cron trigger fired:", event.cron);
  },
};
