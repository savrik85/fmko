/**
 * Sezónní ceny grémia (fair play, návštěvnost, nejlepší střelec) nad skutečnou SQLite.
 *
 * Dotazy filtrovaly zápasy podle `matches.season_number`, který neexistuje: sezónu nese
 * `season_calendar` přes `matches.calendar_id`. Dotaz spadl do `.catch` a žádná cena se
 * nikdy neudělila. Fair play navíc kvůli LEFT JOIN počítalo karty ze všech sezón.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Miniflare } from "miniflare";
import { seasonAwards } from "./grants";

let mf: Miniflare;
let db: D1Database;

beforeAll(async () => {
  mf = new Miniflare({
    modules: true,
    script: "export default { fetch() { return new Response('ok'); } }",
    d1Databases: ["DB"],
  });
  db = await mf.getD1Database("DB");
  for (const sql of [
    `CREATE TABLE teams (id TEXT PRIMARY KEY, name TEXT NOT NULL, league_id TEXT, team_type TEXT NOT NULL DEFAULT 'senior',
       parent_team_id TEXT)`,
    "CREATE TABLE season_calendar (id TEXT PRIMARY KEY, league_id TEXT NOT NULL, season_number INTEGER NOT NULL)",
    `CREATE TABLE matches (id TEXT PRIMARY KEY, league_id TEXT, calendar_id TEXT, home_team_id TEXT, away_team_id TEXT,
       status TEXT, attendance INTEGER)`,
    `CREATE TABLE match_player_stats (id TEXT PRIMARY KEY, match_id TEXT, player_id TEXT, team_id TEXT, goals INTEGER DEFAULT 0,
       yellow_cards INTEGER DEFAULT 0, red_cards INTEGER DEFAULT 0)`,
    "CREATE TABLE players (id TEXT PRIMARY KEY, first_name TEXT, last_name TEXT)",
    "CREATE TABLE departed_players (id TEXT PRIMARY KEY, first_name TEXT, last_name TEXT)",
    `INSERT INTO teams (id, name, league_id) VALUES ('a', 'FK Alfa', 'l1'), ('b', 'FK Beta', 'l1'), ('c', 'FK Cizí', 'l2')`,
    `INSERT INTO season_calendar (id, league_id, season_number) VALUES ('s1r1', 'l1', 1), ('s2r1', 'l1', 2), ('s2r2', 'l1', 2), ('x', 'l2', 2)`,
    // Sezóna 1: Beta tehdy sbírala karty a dávala góly. Do sezóny 2 se to počítat nesmí.
    `INSERT INTO matches (id, league_id, calendar_id, home_team_id, away_team_id, status, attendance) VALUES
       ('m1', 'l1', 's1r1', 'b', 'a', 'simulated', 900),
       ('m2', 'l1', 's2r1', 'a', 'b', 'simulated', 300),
       ('m3', 'l1', 's2r2', 'b', 'a', 'simulated', 200),
       ('m4', 'l2', 'x', 'c', 'c', 'simulated', 5000)`,
    `INSERT INTO players (id, first_name, last_name) VALUES ('pa', 'Adam', 'Alfa'), ('pb', 'Bedřich', 'Beta')`,
    `INSERT INTO match_player_stats (id, match_id, player_id, team_id, goals, yellow_cards, red_cards) VALUES
       ('x1', 'm1', 'pb', 'b', 9, 0, 0),
       ('x2', 'm1', 'pa', 'a', 0, 5, 2),
       ('x3', 'm2', 'pa', 'a', 3, 0, 0),
       ('x4', 'm2', 'pb', 'b', 1, 2, 0),
       ('x5', 'm3', 'pb', 'b', 1, 1, 0)`,
  ]) await db.prepare(sql).run();
});

afterAll(async () => {
  await mf.dispose();
});

describe("sezónní ceny grémia", () => {
  it("udělí všechny tři ceny jen ze zápasů dané sezóny a soutěže", async () => {
    const awards = await seasonAwards(db, { leagueId: "l1", seasonNumber: 2, amountPerAward: 10_000 });
    expect(awards.map((a) => [a.teamId, a.title])).toEqual([
      // Alfa v sezóně 2 bez karet, Beta 3 žluté. Karty Alfy ze sezóny 1 se nepočítají.
      ["a", "Cena fair play FK Alfa"],
      // Domácí průměr sezóny 2: Alfa 300, Beta 200. Sezóna 1 (900) ani cizí liga (5 000) se nepočítá.
      ["a", "Cena za návštěvnost FK Alfa (300 diváků v průměru)"],
      // Sezóna 2: Alfa 3 góly, Beta 2. Devět gólů Bety ze sezóny 1 se nepočítá.
      ["a", "Cena pro nejlepšího střelce Adam Alfa (3 gólů), FK Alfa"],
    ]);
    expect(awards.every((a) => a.amount === 10_000)).toBe(true);
  });

  it("sezóna bez odehraných zápasů nic neudělí", async () => {
    expect(await seasonAwards(db, { leagueId: "l1", seasonNumber: 9, amountPerAward: 10_000 })).toEqual([]);
  });
});
