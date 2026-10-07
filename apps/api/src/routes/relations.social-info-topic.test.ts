import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Miniflare } from "miniflare";
import type { Bindings } from "../index";
import { relationsRouter } from "./relations";

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

  for (const sql of [
    "CREATE TABLE teams (id TEXT PRIMARY KEY, user_id TEXT NOT NULL, name TEXT NOT NULL, league_id TEXT)",
    "CREATE TABLE managers (team_id TEXT, name TEXT)",
    `CREATE TABLE manager_interactions (id TEXT PRIMARY KEY, type TEXT, actor_team_id TEXT, target_team_id TEXT,
      match_id TEXT, payload TEXT, status TEXT, created_at TEXT DEFAULT (datetime('now')))`,
    `CREATE TABLE matches (id TEXT PRIMARY KEY, home_team_id TEXT, away_team_id TEXT, home_score INTEGER,
      away_score INTEGER, status TEXT, simulated_at TEXT)`,
  ]) await db.prepare(sql).run();

  const payload = JSON.stringify({ eventId: "ev-1", topic: "Kdo letos spadne?" });
  await db.batch([
    db.prepare("INSERT INTO teams (id, user_id, name, league_id) VALUES ('host', 'user-host', 'Sokol Lhota', 'l1')"),
    db.prepare("INSERT INTO teams (id, user_id, name, league_id) VALUES ('guest', 'user-guest', 'Slavoj Vrbno', 'l1')"),
    db.prepare("INSERT INTO managers (team_id, name) VALUES ('host', 'Jan Novák'), ('guest', 'Petr Malý')"),
    db.prepare("INSERT INTO manager_interactions (id, type, actor_team_id, target_team_id, payload, status) VALUES ('st-1', 'stammtisch', 'host', 'host', ?, 'planned')").bind(payload),
    db.prepare("INSERT INTO manager_interactions (id, type, actor_team_id, target_team_id, payload, status) VALUES ('inv-1', 'stammtisch_invite', 'host', 'guest', ?, 'invited')").bind(payload),
  ]);

  for (const [token, userId, teamId] of [["token-host", "user-host", "host"], ["token-guest", "user-guest", "guest"]]) {
    await sessionKv.put(`session:${token}`, JSON.stringify({
      userId, email: `${userId}@test.local`, teamId, createdAt: "2026-10-07T10:00:00.000Z",
    }));
  }

  env = { DB: db, SESSION_KV: sessionKv } as unknown as Bindings;
});

afterAll(async () => {
  await miniflare.dispose();
});

function requestSocialInfo(teamId: string, token?: string) {
  const headers = new Headers();
  if (token) headers.set("Authorization", `Bearer ${token}`);
  return relationsRouter.fetch(new Request(`http://test.local/teams/${teamId}/social-info`, { headers }), env);
}

async function socialInfo(teamId: string, token: string) {
  const response = await requestSocialInfo(teamId, token);
  expect(response.status).toBe(200);
  return response.json() as Promise<Record<string, any>>;
}

describe("social-info posezení s trenéry", () => {
  it("pozvaný vidí téma u příchozí pozvánky", async () => {
    const info = await socialInfo("guest", "token-guest");
    expect(info.incomingInvites[0].topic).toBe("Kdo letos spadne?");
  });

  it("hostitel vidí téma u domluveného posezení", async () => {
    const info = await socialInfo("host", "token-host");
    expect(info.stammtisch.planned).toBe(true);
    expect(info.stammtisch.topic).toBe("Kdo letos spadne?");
  });

  it("bez přihlášení se pozvánky a plány posezení nevydají", async () => {
    expect((await requestSocialInfo("guest")).status).toBe(401);
    expect((await requestSocialInfo("host")).status).toBe(401);
  });

  it("trenér cizího klubu cizí pozvánky ani plány nevidí", async () => {
    expect((await requestSocialInfo("guest", "token-host")).status).toBe(403);
    expect((await requestSocialInfo("host", "token-guest")).status).toBe(403);
  });
});
