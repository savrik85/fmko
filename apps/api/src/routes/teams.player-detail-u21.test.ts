import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Miniflare } from "miniflare";
import type { Bindings } from "../index";
import { teamsRouter } from "./teams";

let miniflare: Miniflare;
let env: Bindings;

const SKILLS = { speed: 27, technique: 18, shooting: 14, passing: 16, heading: 41, defense: 31, goalkeeping: 1, creativity: 32, setPieces: 33 };
const PHYSICAL = { stamina: 36, strength: 26, injuryProneness: 31 };
const PERSONALITY = { discipline: 47, patriotism: 52, alcohol: 33, temper: 41 };

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
  ]) await db.prepare(sql).run();

  const player = (id: string, teamId: string) => db.prepare(
    `INSERT INTO players (id, team_id, first_name, last_name, age, position, overall_rating, skills, physical,
      personality, life_context, avatar, skills_max, weekly_wage)
     VALUES (?, ?, 'Ondřej', 'Kolman', 18, 'DEF', 27, ?, ?, ?, ?, '{}', ?, 180)`,
  ).bind(id, teamId, JSON.stringify(SKILLS), JSON.stringify(PHYSICAL), JSON.stringify(PERSONALITY),
    JSON.stringify({ condition: 87, morale: 63, occupation: "Student" }), JSON.stringify({ vision: { current: 28, max: 60 } }));

  await db.batch([
    db.prepare("INSERT INTO teams (id, user_id, name) VALUES ('my-a', 'user-me', 'Můj klub')"),
    // Stará data na testu: rezerva převzatého klubu zůstala na 'ai'. Vlastnictví se má poznat přes áčko.
    db.prepare("INSERT INTO teams (id, user_id, name, team_type, parent_team_id) VALUES ('my-u21', 'ai', 'Můj klub U21', 'u21', 'my-a')"),
    db.prepare("INSERT INTO teams (id, user_id, name) VALUES ('rival-a', 'user-rival', 'Soupeř')"),
    db.prepare("INSERT INTO teams (id, user_id, name, team_type, parent_team_id) VALUES ('rival-u21', 'user-rival', 'Soupeř U21', 'u21', 'rival-a')"),
    player("my-junior", "my-u21"),
    player("rival-senior", "rival-a"),
    player("rival-junior", "rival-u21"),
  ]);

  await sessionKv.put("session:token-me", JSON.stringify({
    userId: "user-me", email: "me@test.local", teamId: "my-a", createdAt: "2026-10-07T10:00:00.000Z",
  }));

  env = { DB: db, SESSION_KV: sessionKv } as unknown as Bindings;
});

afterAll(async () => {
  await miniflare.dispose();
});

async function detail(teamId: string, playerId: string, token?: string) {
  const headers = new Headers();
  if (token) headers.set("Authorization", `Bearer ${token}`);
  const response = await teamsRouter.fetch(new Request(`http://test.local/${teamId}/players/${playerId}`, { headers }), env);
  expect(response.status).toBe(200);
  return response.json() as Promise<Record<string, any>>;
}

describe("detail hráče: vlastní U21 se nezamlžuje", () => {
  it("vlastní U21 hráč přijde přesně, se mzdou a potenciálem, akce zůstávají jen áčku", async () => {
    const p = await detail("my-a", "my-junior", "token-me");
    expect(p.skills.heading).toBe(41);
    expect(p.skills.setPieces).toBe(33);
    expect(p.physical.stamina).toBe(36);
    expect(p.personality.temper).toBe(41);
    expect(p.weekly_wage).toBe(180);
    expect(p.lifeContext.condition).toBe(87);
    expect(p.skills_max).toBeDefined();
    expect(p.isOwn).toBe(false);
  });

  it("hráč soupeře i jeho U21 zůstávají zamlžení na pětky a bez mzdy", async () => {
    for (const id of ["rival-senior", "rival-junior"]) {
      const p = await detail("my-a", id, "token-me");
      expect(p.skills.heading).toBe(40);
      expect(p.skills.setPieces).toBe(35);
      expect(p.weekly_wage).toBeNull();
      expect(p.skills_max).toBeUndefined();
    }
  });

  it("bez přihlášení se vlastní U21 nedá odemknout podvržením áčka v URL", async () => {
    const p = await detail("my-a", "my-junior");
    expect(p.skills.heading).toBe(40);
    expect(p.weekly_wage).toBeNull();
  });
});
