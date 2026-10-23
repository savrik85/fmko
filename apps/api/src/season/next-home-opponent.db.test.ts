/**
 * Kdo přijede k nejbližšímu domácímu zápasu (sektor hostů na stadionu).
 *
 * Dotaz dřív řadil podle `season_calendar.match_date`, který neexistuje. Spadl do
 * catch, soupeř vyšel null a hosté ani jádro jejich kotle se pro příští domácí
 * zápas nikdy nespočítali.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Miniflare } from "miniflare";
import { findNextHomeLeagueOpponent } from "./next-home-match";

let miniflare: Miniflare;
let db: D1Database;

beforeAll(async () => {
  miniflare = new Miniflare({
    modules: true,
    script: "export default { fetch() { return new Response('ok'); } }",
    d1Databases: ["DB"],
  });
  db = await miniflare.getD1Database("DB");
  for (const sql of [
    "CREATE TABLE teams (id TEXT PRIMARY KEY, name TEXT, primary_color TEXT)",
    `CREATE TABLE season_calendar (id TEXT PRIMARY KEY, league_id TEXT, season_number INTEGER, game_week INTEGER,
      match_day TEXT, scheduled_at TEXT NOT NULL, status TEXT DEFAULT 'scheduled')`,
    `CREATE TABLE matches (id TEXT PRIMARY KEY, league_id TEXT, calendar_id TEXT, home_team_id TEXT, away_team_id TEXT,
      home_score INTEGER, away_score INTEGER, status TEXT DEFAULT 'scheduled')`,
    `INSERT INTO teams VALUES ('home', 'Sokol Doma', '#00AA00'), ('stale', 'Zbytek z loňska', '#111111'),
      ('played', 'Už odehráno', '#222222'), ('next', 'Příští soupeř', '#B91C1C'), ('later', 'Až potom', '#333333')`,
    `INSERT INTO season_calendar (id, league_id, season_number, game_week, match_day, scheduled_at) VALUES
      ('s1-r9', 'l1', 1, 9, 'monday', '2026-03-02T16:00:00.000Z'),
      ('s2-r1', 'l1', 2, 1, 'monday', '2026-08-24T16:00:00.000Z'),
      ('s2-r2', 'l1', 2, 2, 'thursday', '2026-08-27T16:00:00.000Z'),
      ('s2-r3', 'l1', 2, 3, 'monday', '2026-08-31T16:00:00.000Z')`,
    // Neodehraný zbytek z minulé sezóny (kolo, které se nedohrálo) leží v kalendáři nejdřív.
    `INSERT INTO matches (id, league_id, calendar_id, home_team_id, away_team_id, home_score, away_score, status) VALUES
      ('m-stale', 'l1', 's1-r9', 'home', 'stale', NULL, NULL, 'scheduled'),
      ('m-played', 'l1', 's2-r1', 'home', 'played', 2, 1, 'simulated'),
      ('m-later', 'l1', 's2-r3', 'home', 'later', NULL, NULL, 'scheduled'),
      ('m-next', 'l1', 's2-r2', 'home', 'next', NULL, NULL, 'scheduled')`,
  ]) await db.prepare(sql).run();
});

afterAll(async () => {
  await miniflare.dispose();
});

describe("soupeř nejbližšího domácího zápasu", () => {
  it("je nejbližší neodehraný domácí zápas aktuální sezóny", async () => {
    const opponent = await findNextHomeLeagueOpponent(db, "home");
    expect(opponent).toEqual({ id: "next", name: "Příští soupeř", primary_color: "#B91C1C" });
  });

  it("tým bez domácího zápasu nemá nikoho", async () => {
    expect(await findNextHomeLeagueOpponent(db, "next")).toBeNull();
  });
});
