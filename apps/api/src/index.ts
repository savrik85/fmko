import { Hono } from "hono";
import { cors } from "hono/cors";

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

// Seed data routes (read from R2)
app.get("/api/seed/villages", async (c) => {
  const cached = await c.env.CACHE_KV.get("seed:villages");
  if (cached) return c.json(JSON.parse(cached));

  const obj = await c.env.SEED_DATA.get("villages.json");
  if (!obj) return c.json({ error: "Villages data not found" }, 404);

  const data = await obj.text();
  await c.env.CACHE_KV.put("seed:villages", data, { expirationTtl: 86400 });
  return c.json(JSON.parse(data));
});

app.get("/api/seed/surnames/:regionCode", async (c) => {
  const obj = await c.env.SEED_DATA.get("surnames_by_region.json");
  if (!obj) return c.json({ error: "Surnames data not found" }, 404);

  const data = JSON.parse(await obj.text());
  const regionCode = c.req.param("regionCode");
  const region = data[regionCode];
  if (!region) return c.json({ error: "Region not found" }, 404);
  return c.json(region);
});

app.get("/api/seed/firstnames", async (c) => {
  const obj = await c.env.SEED_DATA.get("firstnames_by_decade.json");
  if (!obj) return c.json({ error: "Firstnames data not found" }, 404);
  return c.json(JSON.parse(await obj.text()));
});

// Scheduled handler (cron trigger for between-round simulation)
export default {
  fetch: app.fetch,
  async scheduled(event: ScheduledEvent, env: Bindings, ctx: ExecutionContext) {
    // TODO: FMK-16 — mezikolová simulace
    console.log("Cron trigger fired:", event.cron);
  },
};
