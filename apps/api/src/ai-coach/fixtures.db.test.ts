/**
 * Které zápasy AI trenér dnes chystá a které kluby vůbec spravuje (Miniflare D1).
 *
 * Pohár: jen aktuální kolo aktivního poháru aktivní sezóny, stejně jako pohárový tick.
 * Neodehrané zápasy starých pohárů se už nehrají, sestava na ně by byla zbytečná.
 * Kluby: jen z existující ligy, kluby smazané ligy nehrají a nemají hráče.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Miniflare } from "miniflare";
import { listAiClubs } from "./jobs";
import { findTodaysFixtures } from "./match";

let miniflare: Miniflare;
let db: D1Database;

const DAY = "2026-11-02";

beforeAll(async () => {
  miniflare = new Miniflare({
    modules: true,
    script: "export default { fetch() { return new Response('ok'); } }",
    d1Databases: ["DB"],
  });
  db = await miniflare.getD1Database("DB");
  for (const sql of [
    "CREATE TABLE seasons (id TEXT PRIMARY KEY, number INTEGER, status TEXT)",
    "CREATE TABLE leagues (id TEXT PRIMARY KEY, name TEXT)",
    "CREATE TABLE teams (id TEXT PRIMARY KEY, name TEXT, user_id TEXT, parent_team_id TEXT, league_id TEXT, team_type TEXT, game_date TEXT)",
    "CREATE TABLE season_calendar (id TEXT PRIMARY KEY, league_id TEXT, season_number INTEGER, scheduled_at TEXT, status TEXT)",
    "CREATE TABLE matches (id TEXT PRIMARY KEY, calendar_id TEXT, league_id TEXT, home_team_id TEXT, away_team_id TEXT, status TEXT, created_at TEXT)",
    "CREATE TABLE challenges (id TEXT PRIMARY KEY, match_id TEXT, status TEXT)",
    "CREATE TABLE cup_competitions (id TEXT PRIMARY KEY, season_number INTEGER, status TEXT, current_round INTEGER, total_rounds INTEGER)",
    "CREATE TABLE cup_teams (id TEXT PRIMARY KEY, cup_id TEXT, team_id TEXT, name TEXT)",
    "CREATE TABLE cup_matches (id TEXT PRIMARY KEY, cup_id TEXT, round INTEGER, home_cup_team_id TEXT, away_cup_team_id TEXT, status TEXT, scheduled_at TEXT)",
    "INSERT INTO seasons VALUES ('s2', 2, 'finished'), ('s3', 3, 'active')",
    "INSERT INTO leagues VALUES ('lg1', 'Přebor')",
    `INSERT INTO teams VALUES
      ('ai-1', 'Sokol Lhota', 'ai', NULL, 'lg1', 'senior', '${DAY}T16:00:00.000Z'),
      ('ai-1-u21', 'Sokol Lhota U21', 'ai', 'ai-1', 'lg1', 'u21', '${DAY}T16:00:00.000Z'),
      ('ai-orphan', 'Lokomotiva Troja', 'ai', NULL, 'gone', 'senior', '${DAY}T16:00:00.000Z'),
      ('human', 'Slavoj Ves', 'u1', NULL, 'lg1', 'senior', '${DAY}T16:00:00.000Z')`,
    // Starý pohár z minulé sezóny (pořád „active" po resetu), letošní pohár ve 2. kole.
    `INSERT INTO cup_competitions VALUES ('cup-old', 2, 'active', 1, 7), ('cup-now', 3, 'active', 2, 7)`,
    `INSERT INTO cup_teams VALUES ('ct-old-ai', 'cup-old', 'ai-1', 'Sokol Lhota'), ('ct-old-x', 'cup-old', NULL, 'Velkoklub'),
      ('ct-now-ai', 'cup-now', 'ai-1', 'Sokol Lhota'), ('ct-now-x', 'cup-now', NULL, 'Velkoklub'), ('ct-now-y', 'cup-now', NULL, 'Jiný')`,
    `INSERT INTO cup_matches VALUES
      ('cm-old', 'cup-old', 1, 'ct-old-ai', 'ct-old-x', 'scheduled', '2026-08-01T16:00:00.000Z'),
      ('cm-now-r1', 'cup-now', 1, 'ct-now-ai', 'ct-now-y', 'scheduled', '2026-10-20T16:00:00.000Z'),
      ('cm-now-r2', 'cup-now', 2, 'ct-now-x', 'ct-now-ai', 'scheduled', '${DAY}T11:00:00.000Z'),
      ('cm-next', 'cup-now', 3, 'ct-now-ai', 'ct-now-x', 'scheduled', '2026-11-20T11:00:00.000Z')`,
  ]) await db.prepare(sql).run();
});

afterAll(async () => {
  await miniflare.dispose();
});

describe("zápasy a kluby AI trenéra", () => {
  it("pohár: jen aktuální kolo aktivního poháru letošní sezóny, staré poháry ani předchozí kola ne", async () => {
    const fixtures = await findTodaysFixtures(db, "ai-1", DAY);
    expect(fixtures).toEqual([{ calendarId: "cm-now-r2", kind: "cup" }]);
  });

  it("dokončený pohár už nic nenabídne", async () => {
    await db.prepare("UPDATE cup_competitions SET status = 'finished' WHERE id = 'cup-now'").run();
    try {
      expect(await findTodaysFixtures(db, "ai-1", DAY)).toEqual([]);
    } finally {
      await db.prepare("UPDATE cup_competitions SET status = 'active' WHERE id = 'cup-now'").run();
    }
  });

  it("AI trenér spravuje jen áčka z existující ligy", async () => {
    expect(await listAiClubs(db)).toEqual(["ai-1"]);
  });
});
