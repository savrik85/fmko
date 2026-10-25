/**
 * Admin AI trenérů: přístup jen pro admina, přepínač režimu v KV, deník a seznam klubů.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Miniflare } from "miniflare";
import type { Bindings } from "../index";
import { COACH_MODE_KEY } from "../ai-coach/mode";
import { adminAiCoachRouter } from "./admin-ai-coach";

let miniflare: Miniflare;
let env: Bindings;

beforeAll(async () => {
  miniflare = new Miniflare({
    modules: true,
    script: "export default { fetch() { return new Response('ok'); } }",
    d1Databases: ["DB"],
    kvNamespaces: ["SESSION_KV", "CACHE_KV"],
  });
  const db = await miniflare.getD1Database("DB");
  const sessions = (await miniflare.getKVNamespace("SESSION_KV")) as unknown as KVNamespace;
  const cache = (await miniflare.getKVNamespace("CACHE_KV")) as unknown as KVNamespace;
  for (const sql of [
    "CREATE TABLE users (id TEXT PRIMARY KEY, is_admin INTEGER)",
    "CREATE TABLE leagues (id TEXT PRIMARY KEY, name TEXT)",
    "CREATE TABLE teams (id TEXT PRIMARY KEY, name TEXT, user_id TEXT, parent_team_id TEXT, league_id TEXT, budget INTEGER, reputation INTEGER, game_date TEXT)",
    `CREATE TABLE managers (id TEXT PRIMARY KEY, user_id TEXT, team_id TEXT, name TEXT, ai_profile TEXT, tactics INTEGER,
      youth_development INTEGER, discipline INTEGER, motivation INTEGER)`,
    "INSERT INTO users VALUES ('admin-1', 1), ('player-1', 0)",
    "INSERT INTO leagues VALUES ('lg1', 'Přebor Prahy')",
    "INSERT INTO teams VALUES ('ai-1', 'Meteor Žižkov', 'ai', NULL, 'lg1', 50000, 50, '2026-11-02T16:00:00.000Z')",
    "INSERT INTO managers VALUES ('m1', 'ai', 'ai-1', 'Karel Trenér', NULL, 40, 50, 45, 50)",
  ]) await db.prepare(sql).run();
  const migration = readFileSync(resolve(__dirname, "../../migrations/0276_ai_clubs.sql"), "utf8");
  for (const stmt of migration.split(";").map((x) => x.replace(/^--.*$/gm, "").trim()).filter((x) => /^CREATE/i.test(x))) {
    await db.prepare(stmt).run();
  }
  await db.prepare(
    `INSERT INTO ai_coach_decisions (id, team_id, kind, mode, model, actions, used_fallback, error, latency_ms)
     VALUES ('d1', 'ai-1', 'match', 'on', '@cf/openai/gpt-oss-120b', '{"decision":{"reasoning":"press high"}}', 0, NULL, 42000),
            ('d2', 'ai-1', 'weekly', 'on', '@cf/openai/gpt-oss-120b', '{"decision":{"reasoning":"save money"}}', 1, 'timeout', 90000)`,
  ).run();
  const now = new Date().toISOString();
  await sessions.put("session:admin-token", JSON.stringify({ userId: "admin-1", email: "a@x", teamId: null, createdAt: now, renewedAt: now }));
  await sessions.put("session:player-token", JSON.stringify({ userId: "player-1", email: "p@x", teamId: null, createdAt: now, renewedAt: now }));
  env = { DB: db, SESSION_KV: sessions, CACHE_KV: cache } as unknown as Bindings;
});

afterAll(async () => {
  await miniflare.dispose();
});

function call(path: string, token: string | null, init: RequestInit = {}) {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (token) headers.Authorization = `Bearer ${token}`;
  return adminAiCoachRouter.request(path, { ...init, headers }, env);
}

describe("admin AI trenérů", () => {
  it("bez přihlášení 401, hráč bez admina 403", async () => {
    expect((await call("/mode", null)).status).toBe(401);
    expect((await call("/mode", "player-token")).status).toBe(403);
  });

  it("přepínač: oblast se nastaví a ostatní zůstanou", async () => {
    const res = await call("/mode", "admin-token", { method: "POST", body: JSON.stringify({ match: "shadow" }) });
    expect(res.status).toBe(200);
    const body = await res.json() as { modes: Record<string, string> };
    expect(body.modes).toEqual({ match: "shadow", weekly: "on", market: "on" });
    expect(JSON.parse((await env.CACHE_KV.get(COACH_MODE_KEY)) ?? "{}")).toEqual({ match: "shadow", weekly: "on", market: "on" });
    const all = await call("/mode", "admin-token", { method: "POST", body: JSON.stringify({ mode: "off" }) });
    expect(((await all.json()) as { modes: Record<string, string> }).modes).toEqual({ match: "off", weekly: "off", market: "off" });
  });

  it("neplatný režim odmítne", async () => {
    const res = await call("/mode", "admin-token", { method: "POST", body: JSON.stringify({ match: "turbo" }) });
    expect(res.status).toBe(400);
  });

  it("deník vrátí rozhodnutí s odůvodněním, filtr na druh", async () => {
    const res = await call("/decisions?teamId=ai-1&kind=weekly", "admin-token");
    const body = await res.json() as { decisions: Array<{ id: string; reasoning: string; usedFallback: boolean; teamName: string }> };
    expect(body.decisions).toHaveLength(1);
    expect(body.decisions[0]).toMatchObject({ id: "d2", reasoning: "save money", usedFallback: true, teamName: "Meteor Žižkov" });
  });

  it("seznam AI klubů s povahou trenéra a chybovostí", async () => {
    const res = await call("/clubs", "admin-token");
    const body = await res.json() as { clubs: Array<{ teamId: string; profile: { thrift: number }; profileStored: boolean; decisions7d: number; fallback7d: number }>; totals: { decisions7d: number; fallback7d: number } };
    expect(body.clubs).toHaveLength(1);
    expect(body.clubs[0].teamId).toBe("ai-1");
    expect(typeof body.clubs[0].profile.thrift).toBe("number");
    expect(body.clubs[0].profileStored).toBe(false);
    expect(body.clubs[0].decisions7d).toBe(2);
    expect(body.totals.fallback7d).toBe(1);
  });

  it("ruční spuštění kontroluje parametry", async () => {
    expect((await call("/run?task=match", "admin-token", { method: "POST" })).status).toBe(400);
    expect((await call("/run?teamId=ai-1&task=sleep", "admin-token", { method: "POST" })).status).toBe(400);
  });
});
