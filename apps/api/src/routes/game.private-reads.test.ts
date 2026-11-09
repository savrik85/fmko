import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Miniflare } from "miniflare";
import type { Bindings } from "../index";
import { gameRouter } from "./game";

/**
 * Veřejné čtení nesmí cizímu klubu vydat víc, než hra ukazuje:
 * sponzoři soupeře jsou jen názvy reklam u hřiště a přesná povaha hráče patří jeho klubu.
 */

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
  const sessionKv = await miniflare.getKVNamespace("SESSION_KV") as unknown as KVNamespace;
  const cacheKv = await miniflare.getKVNamespace("CACHE_KV") as unknown as KVNamespace;

  for (const sql of [
    "CREATE TABLE villages (id TEXT PRIMARY KEY, name TEXT, size TEXT, district TEXT)",
    "CREATE TABLE teams (id TEXT PRIMARY KEY, user_id TEXT, village_id TEXT, parent_team_id TEXT, team_type TEXT, reputation INTEGER, stadium_name TEXT)",
    "CREATE TABLE players (id TEXT PRIMARY KEY, team_id TEXT, loan_from_team_id TEXT, first_name TEXT, last_name TEXT, position TEXT, personality TEXT)",
    "CREATE TABLE relationships (id TEXT PRIMARY KEY, player_a_id TEXT, player_b_id TEXT, type TEXT, strength INTEGER)",
    "CREATE TABLE sponsor_contracts (id TEXT PRIMARY KEY, team_id TEXT, sponsor_id INTEGER, sponsor_name TEXT, category TEXT, monthly_amount INTEGER, win_bonus INTEGER, status TEXT)",
    "INSERT INTO villages VALUES ('v1', 'Testov', 'village', 'Prachatice')",
    "INSERT INTO teams VALUES ('t1', 'u1', 'v1', NULL, 'senior', 50, 'Na Stráni')",
    "INSERT INTO teams VALUES ('t1-u21', 'u1', 'v1', 't1', 'u21', 50, NULL)",
    "INSERT INTO teams VALUES ('t2', 'u2', 'v1', NULL, 'senior', 50, NULL)",
    `INSERT INTO players VALUES ('own', 't1', NULL, 'Jan', 'Novák', 'MID', '{"discipline":71}')`,
    `INSERT INTO players VALUES ('youth', 't1-u21', NULL, 'Petr', 'Malý', 'FWD', '{"discipline":33}')`,
    `INSERT INTO players VALUES ('loaned-out', 't2', 't1', 'Karel', 'Dvořák', 'DEF', '{"discipline":55}')`,
    `INSERT INTO players VALUES ('foreign', 't2', NULL, 'Emil', 'Cizí', 'GK', '{"discipline":12}')`,
    "INSERT INTO relationships VALUES ('r1', 'own', 'youth', 'brothers', 80)",
    "INSERT INTO sponsor_contracts VALUES ('s1', 't1', 1, 'Hospoda U Lípy', 'main', 12900, 500, 'active')",
    "INSERT INTO sponsor_contracts VALUES ('s2', 't1', 2, 'Autoservis Kolář', 'banner', 4300, 0, 'active')",
    "INSERT INTO sponsor_contracts VALUES ('s3', 't1', 3, 'Pila Vlk', 'banner', 2000, 0, 'expired')",
  ]) {
    await db.prepare(sql).run();
  }
  await sessionKv.put("session:owner-token", JSON.stringify({ userId: "u1", email: "u1@test.local", teamId: "t1", createdAt: "2026-11-09" }));
  await sessionKv.put("session:rival-token", JSON.stringify({ userId: "u2", email: "u2@test.local", teamId: "t2", createdAt: "2026-11-09" }));
  env = { DB: db, SESSION_KV: sessionKv, CACHE_KV: cacheKv, GEMINI_API_KEY: "" } as unknown as Bindings;
});

afterAll(async () => {
  await miniflare.dispose();
});

async function get(path: string, token?: string): Promise<Response> {
  const ctx = { waitUntil() {}, passThroughOnException() {} } as unknown as ExecutionContext;
  return gameRouter.fetch(new Request(`http://test.local${path}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  }), env, ctx);
}

describe("sponzoři cizího klubu", () => {
  for (const [who, token] of [["nepřihlášený", undefined], ["trenér jiného klubu", "rival-token"]] as const) {
    it(`${who} dostane jen názvy aktivních reklam u hřiště`, async () => {
      const res = await get("/teams/t1/sponsors", token);
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ bannerContracts: [{ sponsorName: "Autoservis Kolář" }] });
    });
  }
});

describe("povaha a vazby hráče", () => {
  it("vlastního hráče klub vidí celého", async () => {
    const res = await get("/teams/t1/players/own/profile-extras", "owner-token");
    expect(res.status).toBe(200);
    const body = await res.json() as { personality: { discipline: number }; relationships: Array<{ relatedPlayerId: string }> };
    expect(body.personality.discipline).toBe(71);
    expect(body.relationships.map((r) => r.relatedPlayerId)).toEqual(["youth"]);
  });

  it("hráče své U21 a hráče půjčeného jinam taky", async () => {
    expect((await get("/teams/t1/players/youth/profile-extras", "owner-token")).status).toBe(200);
    expect((await get("/teams/t1/players/loaned-out/profile-extras", "owner-token")).status).toBe(200);
  });

  it("cizího hráče přes vlastní tým v adrese nepřečte", async () => {
    const res = await get("/teams/t1/players/foreign/profile-extras", "owner-token");
    expect(res.status).toBe(403);
    expect(JSON.stringify(await res.json())).not.toContain("discipline");
  });

  it("neexistujícího hráče taky ne", async () => {
    expect((await get("/teams/t1/players/nobody/profile-extras", "owner-token")).status).toBe(403);
  });
});
