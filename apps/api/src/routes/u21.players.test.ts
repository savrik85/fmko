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
      next_match_return INTEGER DEFAULT 0, coach_relationship INTEGER DEFAULT 50)`,
    `CREATE TABLE injuries (id TEXT PRIMARY KEY, player_id TEXT, team_id TEXT, type TEXT, days_remaining INTEGER)`,
  ]) await db.prepare(sql).run();

  const player = (id: string, rating: number, lifeContext: Record<string, unknown>) => db.prepare(
    `INSERT INTO players (id, team_id, first_name, last_name, age, position, overall_rating, skills, physical,
      personality, life_context, avatar, weekly_wage, coach_relationship)
     VALUES (?, 'my-u21', 'Jakub', 'Vácha', 19, 'MID', ?, '{"speed":44}', '{"stamina":51}', '{}', ?, '{}', 120, 73)`,
  ).bind(id, rating, JSON.stringify(lifeContext));

  await db.batch([
    db.prepare("INSERT INTO teams (id, user_id, name) VALUES ('my-a', 'user-me', 'Můj klub')"),
    db.prepare("INSERT INTO teams (id, user_id, name, team_type, parent_team_id) VALUES ('my-u21', 'user-me', 'Můj klub U21', 'u21', 'my-a')"),
    player("zdravy", 46, { condition: 90, morale: 60 }),
    player("zraneny", 41, { condition: 70, morale: 50, absence: { reason: "Zkouška ve škole" } }),
    db.prepare("INSERT INTO injuries (id, player_id, team_id, type, days_remaining) VALUES ('i1', 'zraneny', 'my-u21', 'Natažený sval', 4)"),
    db.prepare("INSERT INTO injuries (id, player_id, team_id, type, days_remaining) VALUES ('i2', 'zdravy', 'my-u21', 'Stará modřina', 0)"),
  ]);

  await sessionKv.put("session:token-me", JSON.stringify({
    userId: "user-me", email: "me@test.local", teamId: "my-a", createdAt: "2026-10-07T10:00:00.000Z",
  }));

  env = { DB: db, SESSION_KV: sessionKv } as unknown as Bindings;
});

afterAll(async () => {
  await miniflare.dispose();
});

async function squad(token?: string) {
  const headers = new Headers();
  if (token) headers.set("Authorization", `Bearer ${token}`);
  const response = await u21Router.fetch(new Request("http://test.local/teams/my-a/u21/players", { headers }), env);
  expect(response.status).toBe(200);
  const body = await response.json() as { players: Array<Record<string, any>> };
  return new Map(body.players.map((p) => [p.id as string, p]));
}

describe("kádr U21 pro tabulku atributů", () => {
  it("majitel dostane vztah k trenérovi, aktivní zranění a absenci", async () => {
    const players = await squad("token-me");
    const zraneny = players.get("zraneny")!;
    expect(zraneny.coach_relationship).toBe(73);
    expect(zraneny.injury).toEqual({ type: "Natažený sval", daysRemaining: 4 });
    expect(zraneny.absence).toEqual({ reason: "Zkouška ve škole" });
    expect(zraneny.skills.speed).toBe(44);
  });

  it("vyléčené zranění (0 dní) se nehlásí", async () => {
    const players = await squad("token-me");
    expect(players.get("zdravy")!.injury).toBeNull();
    expect(players.get("zdravy")!.absence).toBeNull();
  });

  it("bez přihlášení se vztah k trenérovi nevrací", async () => {
    const players = await squad();
    expect(players.get("zraneny")!.coach_relationship).toBeUndefined();
  });
});
