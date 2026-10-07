import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Miniflare } from "miniflare";
import type { Bindings } from "../index";
import u21Router from "./u21";

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
    `CREATE TABLE teams (id TEXT PRIMARY KEY, user_id TEXT NOT NULL, name TEXT NOT NULL,
      team_type TEXT DEFAULT 'senior', parent_team_id TEXT, league_id TEXT)`,
    `CREATE TABLE players (id TEXT PRIMARY KEY, team_id TEXT, first_name TEXT, last_name TEXT, nickname TEXT,
      age INTEGER, position TEXT, overall_rating INTEGER, skills TEXT, physical TEXT, personality TEXT,
      life_context TEXT, avatar TEXT, weekly_wage INTEGER, status TEXT, parent_club_id TEXT,
      next_match_return INTEGER DEFAULT 0, coach_relationship INTEGER DEFAULT 50, skills_max TEXT, experience INTEGER)`,
    `CREATE TABLE injuries (id TEXT PRIMARY KEY, player_id TEXT, team_id TEXT, type TEXT, days_remaining INTEGER)`,
  ]) await db.prepare(sql).run();

  const player = (id: string, rating: number, lifeContext: Record<string, unknown>) => db.prepare(
    `INSERT INTO players (id, team_id, first_name, last_name, age, position, overall_rating, skills, physical,
      personality, life_context, avatar, weekly_wage, coach_relationship, skills_max, experience)
     VALUES (?, 'my-u21', 'Jakub', 'Vácha', 19, 'MID', ?, '{"speed":44}', '{"stamina":51}', '{}', ?, '{}', 120, 73,
       '{"vision":{"current":38,"max":60}}', 12)`,
  ).bind(id, rating, JSON.stringify(lifeContext));

  await db.batch([
    db.prepare("INSERT INTO teams (id, user_id, name) VALUES ('my-a', 'user-me', 'Můj klub')"),
    db.prepare("INSERT INTO teams (id, user_id, name, team_type, parent_team_id) VALUES ('my-u21', 'user-me', 'Můj klub U21', 'u21', 'my-a')"),
    db.prepare("INSERT INTO teams (id, user_id, name) VALUES ('rival-a', 'user-rival', 'Soupeř')"),
    player("healthy", 46, { condition: 90, morale: 60 }),
    player("injured", 41, { condition: 70, morale: 50, absence: { reason: "Zkouška ve škole" } }),
    db.prepare("INSERT INTO injuries (id, player_id, team_id, type, days_remaining) VALUES ('i1', 'injured', 'my-u21', 'Natažený sval', 4)"),
    db.prepare("INSERT INTO injuries (id, player_id, team_id, type, days_remaining) VALUES ('i2', 'healthy', 'my-u21', 'Stará modřina', 0)"),
  ]);

  for (const [token, userId, teamId] of [["token-me", "user-me", "my-a"], ["token-rival", "user-rival", "rival-a"]]) {
    await sessionKv.put(`session:${token}`, JSON.stringify({
      userId, email: `${userId}@test.local`, teamId, createdAt: "2026-10-07T10:00:00.000Z",
    }));
  }

  env = { DB: db, SESSION_KV: sessionKv } as unknown as Bindings;
});

afterAll(async () => {
  await miniflare.dispose();
});

function requestSquad(token?: string) {
  const headers = new Headers();
  if (token) headers.set("Authorization", `Bearer ${token}`);
  return u21Router.fetch(new Request("http://test.local/teams/my-a/u21/players", { headers }), env);
}

async function squad(token: string) {
  const response = await requestSquad(token);
  expect(response.status).toBe(200);
  const body = await response.json() as { players: Array<Record<string, any>> };
  return new Map(body.players.map((p) => [p.id as string, p]));
}

describe("kádr U21 pro tabulku atributů", () => {
  it("majitel dostane vztah k trenérovi, aktivní zranění a absenci", async () => {
    const players = await squad("token-me");
    const injured = players.get("injured")!;
    expect(injured.coach_relationship).toBe(73);
    expect(injured.injury).toEqual({ type: "Natažený sval", daysRemaining: 4 });
    expect(injured.absence).toEqual({ reason: "Zkouška ve škole" });
    expect(injured.skills.speed).toBe(44);
  });

  it("majitel dostane i podklady pro přehled a zkušenost", async () => {
    const injured = (await squad("token-me")).get("injured")!;
    expect(JSON.parse(injured.skills_max).vision.current).toBe(38);
    expect(injured.experience).toBe(12);
  });

  it("vyléčené zranění (0 dní) se nehlásí", async () => {
    const players = await squad("token-me");
    expect(players.get("healthy")!.injury).toBeNull();
    expect(players.get("healthy")!.absence).toBeNull();
  });

  it("bez přihlášení se kádr U21 nevydá", async () => {
    expect((await requestSquad()).status).toBe(401);
  });

  it("trenér cizího klubu kádr U21 nedostane", async () => {
    expect((await requestSquad("token-rival")).status).toBe(403);
  });
});
