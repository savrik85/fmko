import { Hono } from "hono";
import { cors } from "hono/cors";
import { villagesRouter } from "./routes/villages";
import { teamsRouter } from "./routes/teams";
import { matchesRouter } from "./routes/matches";
import { leagueRouter } from "./routes/league";

export type Bindings = {
  DB: D1Database;
  SESSION_KV: KVNamespace;
  CACHE_KV: KVNamespace;
  SEED_DATA: R2Bucket;
};

const app = new Hono<{ Bindings: Bindings }>();

app.use("*", cors({ origin: "*" }));

app.get("/", (c) => c.json({ name: "Okresní Mašina API", version: "0.1.0" }));
app.get("/health", (c) => c.json({ status: "ok" }));

app.route("/api/villages", villagesRouter);
app.route("/api/teams", teamsRouter);
app.route("/api", matchesRouter);
app.route("/api", leagueRouter);

export default app;
