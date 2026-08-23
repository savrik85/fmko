import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Miniflare } from "miniflare";
import { findTransferSearchPlayerRows, resolveTransferSearchContext } from "./player-search";

let miniflare: Miniflare;
let db: D1Database;

beforeAll(async () => {
  miniflare = new Miniflare({
    modules: true,
    script: "export default { fetch() { return new Response('ok'); } }",
    d1Databases: ["DB"],
  });
  db = await miniflare.getD1Database("DB");

  await db.exec("CREATE TABLE leagues (id TEXT PRIMARY KEY, parent_league_id TEXT, league_type TEXT NOT NULL)");
  await db.exec("CREATE TABLE teams (id TEXT PRIMARY KEY, league_id TEXT NOT NULL, parent_team_id TEXT, user_id TEXT NOT NULL, name TEXT NOT NULL)");
  await db.exec("CREATE TABLE players (id TEXT PRIMARY KEY, team_id TEXT NOT NULL, first_name TEXT NOT NULL, last_name TEXT NOT NULL, nickname TEXT, age INTEGER NOT NULL, position TEXT NOT NULL, overall_rating INTEGER NOT NULL, weekly_wage INTEGER NOT NULL DEFAULT 0, skills TEXT NOT NULL DEFAULT '{}', physical TEXT NOT NULL DEFAULT '{}', avatar TEXT NOT NULL DEFAULT '{}', squad_number INTEGER, nationality TEXT, status TEXT)");

  const insertLeague = (id: string, parentId: string | null, type: string) =>
    db.prepare("INSERT INTO leagues VALUES (?, ?, ?)").bind(id, parentId, type);
  const insertTeam = (id: string, leagueId: string, parentId: string | null, userId: string, name: string) =>
    db.prepare("INSERT INTO teams VALUES (?, ?, ?, ?, ?)").bind(id, leagueId, parentId, userId, name);
  const insertPlayer = (id: string, teamId: string, firstName: string, lastName: string, age: number, position: string, rating: number, status: string) =>
    db.prepare("INSERT INTO players (id, team_id, first_name, last_name, age, position, overall_rating, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?)")
      .bind(id, teamId, firstName, lastName, age, position, rating, status);

  await db.batch([
    insertLeague("league-a", null, "senior"),
    insertLeague("league-a-u21", "league-a", "u21"),
    insertLeague("league-b", null, "senior"),
    insertTeam("own-a", "league-a", null, "user-own", "Vlastní A"),
    insertTeam("own-u21", "league-a-u21", "own-a", "user-own", "Vlastní U21"),
    insertTeam("rival-a", "league-a", null, "user-rival", "Soupeř A"),
    insertTeam("rival-u21", "league-a-u21", "rival-a", "user-rival", "Soupeř U21"),
    insertTeam("ai-a", "league-a", null, "ai", "Počítač"),
    insertTeam("other-a", "league-b", null, "user-other", "Jiná liga"),
    insertPlayer("own-senior-player", "own-a", "Vlastní", "Senior", 25, "MID", 60, "active"),
    insertPlayer("own-u21-player", "own-u21", "Vlastní", "Junior", 18, "MID", 30, "active"),
    insertPlayer("rival-senior-player", "rival-a", "Cizí", "Senior", 26, "DEF", 55, "active"),
    insertPlayer("rival-u21-player", "rival-u21", "Cizí", "Junior", 18, "MID", 20, "active"),
    insertPlayer("inactive-u21-player", "rival-u21", "Bývalý", "Junior", 19, "FWD", 25, "quit"),
    insertPlayer("ai-player", "ai-a", "AI", "Hráč", 24, "GK", 50, "active"),
    insertPlayer("other-player", "other-a", "Jiná", "Liga", 23, "FWD", 50, "active"),
  ]);

  await db.prepare(
    `WITH RECURSIVE sequence(n) AS (
       SELECT 1
       UNION ALL
       SELECT n + 1 FROM sequence WHERE n < 201
     )
     INSERT INTO players (id, team_id, first_name, last_name, age, position, overall_rating, status)
       SELECT 'high-rating-' || n, 'rival-a', 'Silný', 'Hráč ' || n, 25, 'MID', 80, 'active'
       FROM sequence`,
  ).run();
});

afterAll(async () => {
  await miniflare.dispose();
});

describe("vyhledávání hráčů pro přestupy", () => {
  it("zahrne soupeřův A-tým i navázanou U21 a vyloučí cizí scope", async () => {
    const rows = await findTransferSearchPlayerRows(db, "league-a", "own-a");
    const ids = new Set(rows.map((row) => row.id));

    expect(ids).toContain("rival-senior-player");
    expect(ids).toContain("rival-u21-player");
    expect(ids).not.toContain("own-senior-player");
    expect(ids).not.toContain("own-u21-player");
    expect(ids).not.toContain("inactive-u21-player");
    expect(ids).not.toContain("ai-player");
    expect(ids).not.toContain("other-player");
  });

  it("normalizuje volání za U21 na mateřský klub a seniorskou ligu", async () => {
    const context = await resolveTransferSearchContext(db, "own-u21");

    expect(context).toEqual({ leagueId: "league-a", rootTeamId: "own-a" });

    const rows = await findTransferSearchPlayerRows(db, context!.leagueId, context!.rootTeamId);

    expect(rows.some((row) => row.team_id === "own-u21")).toBe(false);
  });

  it("neodřízne nízko hodnoceného juniora po prvních 200 hráčích", async () => {
    const rows = await findTransferSearchPlayerRows(db, "league-a", "own-a");

    expect(rows.length).toBeGreaterThan(200);
    expect(rows.at(-1)?.id).toBe("rival-u21-player");
  });
});
