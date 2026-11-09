/**
 * Dva souběžné POST /api/teams téhož uživatele zakládaly dva kluby: kontrola a vložení
 * byly dva kroky a na teams.user_id není unikátní index.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { Miniflare } from "miniflare";
import { insertHumanTeamOnce, type NewHumanTeam } from "./insert-human-team";

let miniflare: Miniflare;
let db: D1Database;

beforeAll(async () => {
  miniflare = new Miniflare({
    modules: true,
    script: "export default { fetch() { return new Response('ok'); } }",
    d1Databases: ["DB"],
  });
  db = await miniflare.getD1Database("DB");
  await db.prepare(
    `CREATE TABLE teams (id TEXT PRIMARY KEY, user_id TEXT NOT NULL, village_id TEXT, name TEXT, primary_color TEXT,
      secondary_color TEXT, budget INTEGER, jersey_pattern TEXT, badge_pattern TEXT, stadium_name TEXT,
      team_type TEXT, parent_team_id TEXT)`,
  ).run();
});

afterAll(async () => {
  await miniflare.dispose();
});

beforeEach(async () => {
  await db.prepare("DELETE FROM teams").run();
});

function team(id: string, userId = "u1"): NewHumanTeam {
  return {
    id, userId, villageId: "v1", name: `SK ${id}`, primaryColor: "#2D5F2D", secondaryColor: "#FFFFFF",
    budget: 20000, jerseyPattern: "solid", badgePattern: "shield", stadiumName: null,
  };
}

async function teamsOf(userId: string): Promise<string[]> {
  const rows = await db.prepare("SELECT id FROM teams WHERE user_id = ? ORDER BY id").bind(userId).all<{ id: string }>();
  return rows.results.map((r) => r.id);
}

describe("insertHumanTeamOnce", () => {
  it("první klub uživatele vloží se všemi poli", async () => {
    expect(await insertHumanTeamOnce(db, { ...team("a"), stadiumName: "Na Stráni" })).toBe(true);
    expect(await db.prepare("SELECT user_id, village_id, name, budget, jersey_pattern, badge_pattern, stadium_name FROM teams WHERE id = 'a'").first())
      .toEqual({ user_id: "u1", village_id: "v1", name: "SK a", budget: 20000, jersey_pattern: "solid", badge_pattern: "shield", stadium_name: "Na Stráni" });
  });

  it("souběžné požadavky téhož uživatele založí jediný klub", async () => {
    const results = await Promise.all(Array.from({ length: 8 }, (_, i) => insertHumanTeamOnce(db, team(`race-${i}`))));
    expect(results.filter(Boolean)).toHaveLength(1);
    expect(await teamsOf("u1")).toHaveLength(1);
  });

  it("druhý klub po prvním nevloží", async () => {
    await insertHumanTeamOnce(db, team("a"));
    expect(await insertHumanTeamOnce(db, team("b"))).toBe(false);
    expect(await teamsOf("u1")).toEqual(["a"]);
  });

  it("U21 po převzatém áčku novému klubu nebrání", async () => {
    await db.prepare("INSERT INTO teams (id, user_id, name, team_type, parent_team_id) VALUES ('old-u21', 'u1', 'Rezerva', 'u21', 'gone')").run();
    expect(await insertHumanTeamOnce(db, team("a"))).toBe(true);
    expect(await teamsOf("u1")).toEqual(["a", "old-u21"]);
  });

  it("kluby jiných uživatelů ani AI kluby nevadí", async () => {
    await db.prepare("INSERT INTO teams (id, user_id, name) VALUES ('ai-1', 'ai', 'AI klub'), ('ai-2', 'ai', 'AI klub 2')").run();
    await insertHumanTeamOnce(db, team("other", "u2"));
    expect(await insertHumanTeamOnce(db, team("a"))).toBe(true);
  });

  it("pro sdílený účet AI se nepoužívá", async () => {
    await expect(insertHumanTeamOnce(db, team("x", "ai"))).rejects.toThrow();
  });
});
