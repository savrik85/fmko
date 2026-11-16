/**
 * Rozšíření jednokolového rozpisu na dvoukolo (Strakonice, 16. 11. 2026): odehrané kolo
 * zůstane, zbytek první poloviny se posune dřív, přibudou odvety a U21 jde den po áčku.
 * Běží nad skutečnou SQLite, zápis je jedna dávka a ta se na falešné D1 ověřit nedá.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Miniflare } from "miniflare";
import { createRng } from "../generators/rng";
import { MAX_ROUNDS_PER_WEEK, isSeniorHolidayBlocked } from "../season/calendar";
import { extendLeagueToDouble } from "./extend-schedule";
import { generateSchedule } from "./schedule";

let mf: Miniflare;
let db: D1Database;

const SEASON = 3;
const NEW_LEAGUE = "L-new";
const NEW_U21 = "L-new-u21";
const RUNNING_LEAGUE = "L-running";
const TEAM_COUNT = 14;
const NOW = new Date("2026-11-16T12:00:00.000Z");
const DAY_MS = 86_400_000;
/** Jednokolový rozpis, jak ho liga dostala při založení: pondělí a čtvrtek. */
const SINGLE_DATES = [
  "2026-11-16", "2026-11-19", "2026-11-23", "2026-11-26", "2026-11-30", "2026-12-03", "2026-12-07",
  "2026-12-10", "2026-12-14", "2026-12-17", "2027-01-04", "2027-01-07", "2027-01-11",
].map((d) => `${d}T17:00:00.000Z`);

const DAY_NAMES = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
const dayName = (iso: string) => DAY_NAMES[new Date(iso).getUTCDay()];

async function seedSingleRoundRobin() {
  const stmts: D1PreparedStatement[] = [];
  for (let i = 0; i < TEAM_COUNT; i++) {
    stmts.push(db.prepare("INSERT INTO teams (id, league_id, team_type, game_date) VALUES (?, ?, 'senior', ?)")
      .bind(`t${i}`, NEW_LEAGUE, NOW.toISOString()));
    stmts.push(db.prepare("INSERT INTO teams (id, league_id, team_type, parent_team_id) VALUES (?, ?, 'u21', ?)")
      .bind(`t${i}-u21`, NEW_U21, `t${i}`));
  }
  const firstHalf = generateSchedule(createRng(3), TEAM_COUNT).filter((m) => m.round <= TEAM_COUNT - 1);
  SINGLE_DATES.forEach((at, i) => {
    const u21At = new Date(Date.parse(at) + DAY_MS).toISOString();
    stmts.push(db.prepare("INSERT INTO season_calendar (id, league_id, season_number, game_week, match_day, scheduled_at) VALUES (?, ?, ?, ?, ?, ?)")
      .bind(`cal-${i + 1}`, NEW_LEAGUE, SEASON, i + 1, dayName(at), at));
    stmts.push(db.prepare("INSERT INTO season_calendar (id, league_id, season_number, game_week, match_day, scheduled_at, parent_calendar_id) VALUES (?, ?, ?, ?, ?, ?, ?)")
      .bind(`u21-cal-${i + 1}`, NEW_U21, SEASON, i + 1, dayName(u21At), u21At, `cal-${i + 1}`));
  });
  firstHalf.forEach((m, i) => {
    stmts.push(db.prepare("INSERT INTO matches (id, league_id, calendar_id, round, home_team_id, away_team_id) VALUES (?, ?, ?, ?, ?, ?)")
      .bind(`m-${i}`, NEW_LEAGUE, `cal-${m.round}`, m.round, `t${m.homeTeamIndex}`, `t${m.awayTeamIndex}`));
    stmts.push(db.prepare("INSERT INTO matches (id, league_id, calendar_id, round, home_team_id, away_team_id, parent_match_id) VALUES (?, ?, ?, ?, ?, ?, ?)")
      .bind(`u21-m-${i}`, NEW_U21, `u21-cal-${m.round}`, m.round, `t${m.homeTeamIndex}-u21`, `t${m.awayTeamIndex}-u21`, `m-${i}`));
  });
  await db.batch(stmts);
}

async function roundsOf(leagueId: string) {
  return (await db.prepare(
    `SELECT sc.id, sc.game_week, sc.scheduled_at, sc.match_day, sc.parent_calendar_id, COUNT(m.id) AS matches
       FROM season_calendar sc LEFT JOIN matches m ON m.calendar_id = sc.id
      WHERE sc.league_id = ? GROUP BY sc.id ORDER BY sc.game_week`,
  ).bind(leagueId).all<{ id: string; game_week: number; scheduled_at: string; match_day: string; parent_calendar_id: string | null; matches: number }>()).results;
}

beforeAll(async () => {
  mf = new Miniflare({ modules: true, script: "export default { fetch() { return new Response('ok'); } }", d1Databases: ["DB"] });
  db = await mf.getD1Database("DB");
  for (const sql of [
    "CREATE TABLE seasons (id TEXT PRIMARY KEY, number INTEGER, status TEXT)",
    `CREATE TABLE leagues (id TEXT PRIMARY KEY, season_id TEXT, district TEXT, name TEXT, level TEXT,
       status TEXT DEFAULT 'active', league_type TEXT DEFAULT 'senior', parent_league_id TEXT, match_weekdays TEXT)`,
    `CREATE TABLE teams (id TEXT PRIMARY KEY, league_id TEXT, team_type TEXT, parent_team_id TEXT,
       game_date TEXT, season_start TEXT, season_end TEXT)`,
    `CREATE TABLE season_calendar (id TEXT PRIMARY KEY, league_id TEXT NOT NULL, season_number INTEGER NOT NULL,
       game_week INTEGER NOT NULL, match_day TEXT NOT NULL, scheduled_at TEXT NOT NULL,
       status TEXT NOT NULL DEFAULT 'scheduled', parent_calendar_id TEXT, locked_at TEXT)`,
    `CREATE TABLE matches (id TEXT PRIMARY KEY, league_id TEXT, calendar_id TEXT, round INTEGER,
       home_team_id TEXT NOT NULL, away_team_id TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'scheduled', parent_match_id TEXT)`,
    `INSERT INTO seasons (id, number, status) VALUES ('s3', ${SEASON}, 'active')`,
    `INSERT INTO leagues (id, season_id, district, name, level, league_type, parent_league_id) VALUES
       ('${NEW_LEAGUE}', 's3', 'Strakonice', 'Okresní přebor Strakonice', 'okresni_prebor', 'senior', NULL),
       ('${NEW_U21}', 's3', 'Strakonice U21', 'Okresní přebor Strakonice U21', 'okresni_prebor', 'u21', '${NEW_LEAGUE}'),
       ('${RUNNING_LEAGUE}', 's3', 'Prachatice', 'Schwan liga', 'okresni_prebor', 'senior', NULL)`,
    // Hrající liga určuje poslední kolo sezóny (28. 1. 2027).
    `INSERT INTO teams (id, league_id, team_type, game_date) VALUES ('r1', '${RUNNING_LEAGUE}', 'senior', '${NOW.toISOString()}'), ('r2', '${RUNNING_LEAGUE}', 'senior', '${NOW.toISOString()}')`,
    `INSERT INTO season_calendar (id, league_id, season_number, game_week, match_day, scheduled_at, status) VALUES
       ('run-1', '${RUNNING_LEAGUE}', ${SEASON}, 1, 'monday', '2026-10-26T17:00:00.000Z', 'simulated'),
       ('run-26', '${RUNNING_LEAGUE}', ${SEASON}, 26, 'thursday', '2027-01-28T17:00:00.000Z', 'scheduled')`,
    `INSERT INTO matches (id, league_id, calendar_id, round, home_team_id, away_team_id, status) VALUES
       ('run-m1', '${RUNNING_LEAGUE}', 'run-1', 1, 'r1', 'r2', 'simulated'),
       ('run-m26', '${RUNNING_LEAGUE}', 'run-26', 26, 'r2', 'r1', 'scheduled')`,
  ]) {
    await db.prepare(sql).run();
  }
  await seedSingleRoundRobin();
});

afterAll(async () => { await mf?.dispose(); });

describe("rozšíření jednokolového rozpisu na dvoukolo", () => {
  it("nanečisto vrátí plán a nic nezapíše", async () => {
    const plan = await extendLeagueToDouble(db, NEW_LEAGUE, { dryRun: true, now: NOW });
    expect(plan).toMatchObject({ ok: true, dryRun: true, teams: 14, roundsBefore: 13, roundsAfter: 26, fixedRounds: 1, matchesAdded: 91 });
    expect(plan.added).toHaveLength(13);
    expect(await roundsOf(NEW_LEAGUE)).toHaveLength(13);
    expect(await roundsOf(NEW_U21)).toHaveLength(13);
  });

  it("dnešní kolo zůstane, zbytek se zahustí a přibudou odvety", async () => {
    const result = await extendLeagueToDouble(db, NEW_LEAGUE, { dryRun: false, now: NOW });
    expect(result.ok, result.reason).toBe(true);

    const rounds = await roundsOf(NEW_LEAGUE);
    expect(rounds).toHaveLength(26);
    expect(rounds[0].scheduled_at).toBe(SINGLE_DATES[0]);
    expect(rounds[25].scheduled_at).toBe("2027-01-28T17:00:00.000Z");

    const perWeek = new Map<string, number>();
    rounds.forEach((r, i) => {
      expect(r.game_week).toBe(i + 1);
      expect(r.matches).toBe(7);
      const at = new Date(r.scheduled_at);
      expect(r.match_day).toBe(dayName(r.scheduled_at));
      expect([1, 4, 6]).toContain(at.getUTCDay());
      expect(isSeniorHolidayBlocked(at), r.scheduled_at).toBe(false);
      if (i > 0) expect(r.scheduled_at > rounds[i - 1].scheduled_at).toBe(true);
      const monday = new Date(at.getTime() - ((at.getUTCDay() + 6) % 7) * DAY_MS).toISOString().slice(0, 10);
      perWeek.set(monday, (perWeek.get(monday) ?? 0) + 1);
    });
    for (const [week, count] of perWeek) expect(count, week).toBeLessThanOrEqual(MAX_ROUNDS_PER_WEEK);

    // Každá dvojice jednou doma a jednou venku, odveta je zrcadlo kola o 13 dřív.
    const matches = (await db.prepare(
      "SELECT round, home_team_id, away_team_id FROM matches WHERE league_id = ?",
    ).bind(NEW_LEAGUE).all<{ round: number; home_team_id: string; away_team_id: string }>()).results;
    expect(matches).toHaveLength(182);
    const ordered = new Set(matches.map((m) => `${m.round <= 13 ? 1 : 2}:${m.home_team_id}>${m.away_team_id}`));
    expect(ordered.size).toBe(182);
    for (const m of matches.filter((x) => x.round <= 13)) {
      expect(matches.some((x) => x.round === m.round + 13 && x.home_team_id === m.away_team_id && x.away_team_id === m.home_team_id)).toBe(true);
    }
    expect(new Set(matches.map((m) => `${m.home_team_id}>${m.away_team_id}`)).size).toBe(182);
  });

  it("U21 hraje den po áčku všech 26 kol", async () => {
    const senior = await roundsOf(NEW_LEAGUE);
    const u21 = await roundsOf(NEW_U21);
    expect(u21).toHaveLength(26);
    u21.forEach((r, i) => {
      expect(r.matches).toBe(7);
      expect(r.parent_calendar_id).toBe(senior[i].id);
      expect(Date.parse(r.scheduled_at) - Date.parse(senior[i].scheduled_at)).toBe(DAY_MS);
      expect(r.match_day).toBe(dayName(r.scheduled_at));
    });
  });

  it("podruhé už nic nepřidá", async () => {
    const again = await extendLeagueToDouble(db, NEW_LEAGUE, { dryRun: false, now: NOW });
    expect(again.ok).toBe(false);
    expect(await roundsOf(NEW_LEAGUE)).toHaveLength(26);
    expect(await roundsOf(NEW_U21)).toHaveLength(26);
  });

  it("U21 ligu ani hotovou dvoukolovou ligu nerozšiřuje", async () => {
    expect((await extendLeagueToDouble(db, NEW_U21, { dryRun: false, now: NOW })).ok).toBe(false);
    expect((await extendLeagueToDouble(db, RUNNING_LEAGUE, { dryRun: false, now: NOW })).ok).toBe(false);
  });
});
