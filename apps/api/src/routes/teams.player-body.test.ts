import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Miniflare } from "miniflare";
import type { Bindings } from "../index";
import { teamsRouter } from "./teams";

let miniflare: Miniflare;
let env: Bindings;

const SKILLS = { speed: 47, technique: 30, shooting: 30, passing: 30, heading: 34, defense: 30, goalkeeping: 1 };

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
    `CREATE TABLE teams (id TEXT PRIMARY KEY, user_id TEXT NOT NULL, name TEXT NOT NULL,
      team_type TEXT DEFAULT 'senior', parent_team_id TEXT, game_date TEXT)`,
    `CREATE TABLE players (id TEXT PRIMARY KEY, team_id TEXT, first_name TEXT, last_name TEXT,
      age INTEGER, position TEXT, overall_rating INTEGER, skills TEXT, physical TEXT, personality TEXT,
      life_context TEXT, avatar TEXT, skills_max TEXT, weekly_wage INTEGER, loan_from_team_id TEXT,
      loan_until TEXT, status TEXT)`,
    `CREATE TABLE injuries (id TEXT PRIMARY KEY, player_id TEXT, team_id TEXT, type TEXT, days_remaining INTEGER)`,
    `CREATE TABLE weight_log (id INTEGER PRIMARY KEY AUTOINCREMENT, player_id TEXT NOT NULL, team_id TEXT NOT NULL,
      game_date TEXT NOT NULL, weight REAL NOT NULL, source TEXT NOT NULL, created_at TEXT DEFAULT (datetime('now')))`,
  ]) await db.prepare(sql).run();

  const player = (id: string, teamId: string, height: number, weight: number) => db.prepare(
    `INSERT INTO players (id, team_id, first_name, last_name, age, position, overall_rating, skills, physical,
      personality, life_context, avatar, skills_max, weekly_wage)
     VALUES (?, ?, 'Jan', 'Kolman', 27, 'MID', 40, ?, ?, '{}', ?, '{}', '{}', 200)`,
  ).bind(id, teamId, JSON.stringify(SKILLS),
    JSON.stringify({ stamina: 60, strength: 53, injuryProneness: 50, height, weight, bodyType: "stocky" }),
    JSON.stringify({ condition: 90, morale: 60, occupation: "Řidič" }));

  await db.batch([
    db.prepare("INSERT INTO teams (id, user_id, name, game_date) VALUES ('my-a', 'user-me', 'Můj klub', '2026-10-08T16:00:00.000Z')"),
    db.prepare("INSERT INTO teams (id, user_id, name) VALUES ('rival-a', 'user-rival', 'Soupeř')"),
    player("my-heavy", "my-a", 180, 96),
    player("rival-heavy", "rival-a", 175, 96),
    db.prepare("INSERT INTO weight_log (player_id, team_id, game_date, weight, source) VALUES ('my-heavy', 'my-a', '2026-09-10', 93, 'weekly')"),
    db.prepare("INSERT INTO weight_log (player_id, team_id, game_date, weight, source) VALUES ('my-heavy', 'my-a', '2026-10-05', 95.5, 'weekly')"),
    db.prepare("INSERT INTO weight_log (player_id, team_id, game_date, weight, source) VALUES ('rival-heavy', 'rival-a', '2026-09-10', 90, 'weekly')"),
  ]);

  await sessionKv.put("session:token-me", JSON.stringify({
    userId: "user-me", email: "me@test.local", teamId: "my-a", createdAt: "2026-10-08T10:00:00.000Z",
  }));

  env = { DB: db, SESSION_KV: sessionKv } as unknown as Bindings;
});

afterAll(async () => {
  await miniflare.dispose();
});

async function get(path: string) {
  const headers = new Headers({ Authorization: "Bearer token-me" });
  const response = await teamsRouter.fetch(new Request(`http://test.local/${path}`, { headers }), env);
  expect(response.status).toBe(200);
  return response.json() as Promise<any>;
}

describe("postava v seznamu kádru (srovnání hráčů v profilu)", () => {
  it("vlastní hráč 180 cm / 96 kg: −8 rychlost a výdrž, +1 síla, ideál 76", async () => {
    const [p] = await get("my-a/players");
    expect(p.body).toMatchObject({
      bodyType: "stocky", idealWeight: 76, effects: { speed: -8, stamina: -8, strength: 1, heading: 0 },
    });
  });

  it("cizí hráč: postava ze zamlžených hodnot (96 kg → 95 kg), přesnou váhu neprozradí", async () => {
    const [p] = await get("rival-a/players");
    expect(p.physical.weight).toBe(95);
    expect(p.body.effects).toEqual({ speed: -10, stamina: -10, strength: 1, heading: -2 });
  });
});

describe("postava v detailu hráče", () => {
  it("cizí hráč: body se počítá až ze zamlžených hodnot", async () => {
    const p = await get("my-a/players/rival-heavy");
    expect(p.physical.weight).toBe(95);
    expect(p.body.effects).toEqual({ speed: -10, stamina: -10, strength: 1, heading: -2 });
  });
});

describe("váha v čase: trend a historie", () => {
  it("vlastní hráč: trend proti záznamu ~28 dní starému (96 − 93 = +3)", async () => {
    const p = await get("my-a/players/my-heavy");
    expect(p.body.trend30d).toBe(3);
  });

  it("cizí hráč: trend se neukazuje", async () => {
    const p = await get("my-a/players/rival-heavy");
    expect(p.body.trend30d).toBeNull();
  });

  it("historie váhy vlastního hráče, nejnovější první", async () => {
    const r = await get("my-a/players/my-heavy/weight-log");
    expect(r.entries.map((e: { weight: number }) => e.weight)).toEqual([95.5, 93]);
    expect(r.entries[0]).toMatchObject({ gameDate: "2026-10-05", source: "weekly" });
  });

  it("historie cizího hráče je zakázaná", async () => {
    const headers = new Headers({ Authorization: "Bearer token-me" });
    const response = await teamsRouter.fetch(new Request("http://test.local/my-a/players/rival-heavy/weight-log", { headers }), env);
    expect(response.status).toBe(403);
  });
});
