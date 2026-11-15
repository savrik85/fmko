/**
 * Známka sudího v obsazení kola musí být stejná jako v listině pod ním:
 * z přeboru i III. třídy dohromady. Dřív obsazení bralo jen soutěž kola,
 * takže u téhož jména stály na jedné obrazovce dvě různé známky.
 * Běží nad skutečnou SQLite, falešná D1 by spojení soutěží přes `leagues` nepoznala.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Miniflare } from "miniflare";
import { refereeStandings } from "./referee-bans";
import { delegationOf } from "./referee-roster";

let mf: Miniflare;
let db: D1Database;

const TOP_LEAGUE = "L-top";
const LOWER_LEAGUE = "L-lower";
const U21_LEAGUE = "L-u21";
const SEASON = 3;
const ROUND = "cal-1";

beforeAll(async () => {
  mf = new Miniflare({
    modules: true,
    script: "export default { fetch() { return new Response('ok'); } }",
    d1Databases: ["DB"],
  });
  db = await mf.getD1Database("DB");

  for (const sql of [
    `CREATE TABLE leagues (id TEXT PRIMARY KEY, season_id TEXT, district TEXT, name TEXT, level TEXT,
       status TEXT DEFAULT 'active', league_type TEXT DEFAULT 'senior')`,
    "CREATE TABLE teams (id TEXT PRIMARY KEY, name TEXT)",
    `CREATE TABLE referees (id TEXT PRIMARY KEY, first_name TEXT, last_name TEXT, nickname TEXT,
       archetype TEXT, district TEXT, status TEXT DEFAULT 'active')`,
    `CREATE TABLE referee_stats (referee_id TEXT, season_number INTEGER, league_id TEXT,
       matches INTEGER, grade_sum REAL)`,
    `CREATE TABLE matches (id TEXT PRIMARY KEY, calendar_id TEXT, home_team_id TEXT, away_team_id TEXT,
       referee_id TEXT)`,
    "CREATE TABLE competition_referee_swaps (match_id TEXT, calendar_id TEXT, reason TEXT)",
    `CREATE TABLE competition_referee_bans (id TEXT PRIMARY KEY, league_id TEXT, referee_id TEXT,
       season_number INTEGER)`,
    `INSERT INTO leagues (id, season_id, district, name, level, league_type) VALUES
       ('${TOP_LEAGUE}', 's3', 'Prachatice', 'Okresní přebor', 'okresni_prebor', 'senior'),
       ('${LOWER_LEAGUE}', 's3', 'Prachatice', 'III. třída', 'okresni_soutez', 'senior'),
       ('${U21_LEAGUE}', 's3', 'Prachatice', 'Přebor U21', 'okresni_prebor', 'u21')`,
    "INSERT INTO teams (id, name) VALUES ('t1', 'Čkyně A'), ('t2', 'Čkyně B'), ('t3', 'Spůle'), ('t4', 'Volary')",
    `INSERT INTO referees (id, first_name, last_name, nickname, archetype, district) VALUES
       ('ref-both', 'Vladimír', 'Jungvirt', NULL, 'fair', 'Prachatice'),
       ('ref-new', 'Alena', 'Hodinová', NULL, 'fair', 'Prachatice')`,
    // Přebor 1 zápas za 3,1; III. třída 3 zápasy za 7,0; U21 se nepočítá. Minulá sezóna taky ne.
    `INSERT INTO referee_stats (referee_id, season_number, league_id, matches, grade_sum) VALUES
       ('ref-both', ${SEASON}, '${TOP_LEAGUE}', 1, 3.1),
       ('ref-both', ${SEASON}, '${LOWER_LEAGUE}', 3, 7.0),
       ('ref-both', ${SEASON}, '${U21_LEAGUE}', 2, 9.0),
       ('ref-both', ${SEASON - 1}, '${TOP_LEAGUE}', 4, 4.0)`,
    `INSERT INTO matches (id, calendar_id, home_team_id, away_team_id, referee_id) VALUES
       ('m1', '${ROUND}', 't1', 't2', 'ref-both'),
       ('m2', '${ROUND}', 't3', 't4', 'ref-new')`,
  ]) {
    await db.prepare(sql).run();
  }
});

afterAll(async () => { await mf.dispose(); });

describe("známka sudího v obsazení kola", () => {
  it("počítá přebor i III. třídu dohromady", async () => {
    const delegation = await delegationOf(db, ROUND, TOP_LEAGUE, SEASON);
    const match = delegation.find((m) => m.matchId === "m1");
    expect(match?.avgGrade).toBeCloseTo(10.1 / 4, 5);
  });

  it("je stejná jako v listině pod obsazením", async () => {
    const [delegation, standings] = await Promise.all([
      delegationOf(db, ROUND, TOP_LEAGUE, SEASON),
      refereeStandings(db, TOP_LEAGUE, SEASON, "Prachatice"),
    ]);
    const listed = standings.find((r) => r.refereeId === "ref-both");
    expect(listed?.matches).toBe(4);
    expect(delegation.find((m) => m.matchId === "m1")?.avgGrade).toBe(listed?.avgGrade);
  });

  it("kolo III. třídy ukáže totéž číslo", async () => {
    const delegation = await delegationOf(db, ROUND, LOWER_LEAGUE, SEASON);
    expect(delegation.find((m) => m.matchId === "m1")?.avgGrade).toBeCloseTo(10.1 / 4, 5);
  });

  it("sudí bez odpískaného zápasu známku nemá", async () => {
    const delegation = await delegationOf(db, ROUND, TOP_LEAGUE, SEASON);
    expect(delegation.find((m) => m.matchId === "m2")?.avgGrade).toBeNull();
  });
});
