import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Miniflare } from "miniflare";
import type { Bindings } from "../index";
import { gameRouter } from "./game";

let miniflare: Miniflare;
let db: D1Database;
let env: Bindings;

beforeAll(async () => {
  miniflare = new Miniflare({
    modules: true,
    script: "export default { fetch() { return new Response('ok'); } }",
    d1Databases: ["DB"],
    kvNamespaces: ["SESSION_KV", "CACHE_KV"],
  });
  db = await miniflare.getD1Database("DB");
  const sessionKv = await miniflare.getKVNamespace("SESSION_KV") as unknown as KVNamespace;
  const cacheKv = await miniflare.getKVNamespace("CACHE_KV") as unknown as KVNamespace;
  await db.prepare(
    `CREATE TABLE teams (id TEXT PRIMARY KEY, user_id TEXT NOT NULL, training_type TEXT, training_approach TEXT,
      training_sessions INTEGER, training_days TEXT, training_plan TEXT)`,
  ).run();
  await db.prepare("INSERT INTO teams (id, user_id, training_type, training_approach, training_sessions) VALUES ('t1', 'u1', 'technique', 'strict', 2)").run();
  await sessionKv.put("session:owner-token", JSON.stringify({ userId: "u1", email: "u1@test.local", teamId: "t1", createdAt: "2026-10-08" }));
  env = { DB: db, SESSION_KV: sessionKv, CACHE_KV: cacheKv, GEMINI_API_KEY: "" } as unknown as Bindings;
});

afterAll(async () => {
  await miniflare.dispose();
});

async function saveTraining(body: Record<string, unknown>) {
  const ctx = { waitUntil() {}, passThroughOnException() {} } as unknown as ExecutionContext;
  return gameRouter.fetch(new Request("http://test.local/teams/t1/training", {
    method: "POST",
    headers: { Authorization: "Bearer owner-token", "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }), env, ctx);
}

async function stored() {
  return db.prepare("SELECT training_type, training_approach FROM teams WHERE id = 't1'").first<{ training_type: string; training_approach: string }>();
}

describe("POST /teams/:id/training", () => {
  it("neznámý typ tréninku nebo přístup odmítne a nic neuloží", async () => {
    const badType = await saveTraining({ type: "kondice", approach: "balanced", sessionsPerWeek: 2 });
    expect(badType.status).toBe(400);
    const badApproach = await saveTraining({ type: "tactics", approach: "balance", sessionsPerWeek: 2 });
    expect(badApproach.status).toBe(400);
    expect(await stored()).toEqual({ training_type: "technique", training_approach: "strict" });
  });

  it("platný typ a přístup uloží", async () => {
    const ok = await saveTraining({ type: "tactics", approach: "relaxed", sessionsPerWeek: 3 });
    expect(ok.status).toBe(200);
    expect(await stored()).toEqual({ training_type: "tactics", training_approach: "relaxed" });
  });
});
