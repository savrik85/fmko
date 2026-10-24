import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { Miniflare } from "miniflare";
import { loadHomeAttendance, RECENT_HOME_MATCHES, summarizeAttendance } from "./home-attendance";

/**
 * Přístavby tribun se prodávaly jen s kapacitou. Pět klubů za zhruba 460 000 Kč
 * postavilo místa, která žádný zápas nenaplnil. Nabídka teď ukáže vedle kapacity,
 * kolik lidí doma opravdu chodí: průměr a nejvyšší návštěvu za poslední zápasy.
 */

describe("souhrn návštěvy", () => {
  it("průměr se zaokrouhlí na celé diváky", () => {
    expect(summarizeAttendance([100, 101, 120])).toEqual({ matches: 3, average: 107, max: 120 });
  });

  it("bez zápasů není co ukázat", () => {
    expect(summarizeAttendance([])).toEqual({ matches: 0, average: null, max: null });
  });
});

describe("domácí návštěva z databáze", () => {
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
      `CREATE TABLE matches (id TEXT PRIMARY KEY, calendar_id TEXT, home_team_id TEXT, away_team_id TEXT,
        status TEXT, attendance INTEGER, simulated_at TEXT)`,
      "CREATE TABLE cup_teams (id TEXT PRIMARY KEY, team_id TEXT)",
      `CREATE TABLE cup_matches (id TEXT PRIMARY KEY, home_cup_team_id TEXT, away_cup_team_id TEXT,
        status TEXT, attendance INTEGER, simulated_at TEXT)`,
      "INSERT INTO cup_teams VALUES ('ct-club', 'club'), ('ct-big', NULL)",
    ]) await db.prepare(sql).run();
  });

  afterAll(async () => {
    await miniflare.dispose();
  });

  beforeEach(async () => {
    await db.prepare("DELETE FROM matches").run();
    await db.prepare("DELETE FROM cup_matches").run();
  });

  async function league(id: string, o: { home?: string; attendance: number | null; at: string; calendar?: string | null; status?: string }) {
    await db.prepare("INSERT INTO matches VALUES (?, ?, ?, 'rival', ?, ?, ?)")
      .bind(id, o.calendar === undefined ? "cal" : o.calendar, o.home ?? "club", o.status ?? "simulated", o.attendance, o.at).run();
  }

  it("počítá ligové i pohárové domácí zápasy, venkovní, přátelské a neodehrané ne", async () => {
    await league("l1", { attendance: 200, at: "2026-10-01" });
    await league("l2", { attendance: 300, at: "2026-10-08" });
    await league("away", { home: "rival", attendance: 900, at: "2026-10-09" });
    await league("friendly", { attendance: 40, at: "2026-10-10", calendar: null });
    await league("future", { attendance: null, at: "2026-10-20", status: "scheduled" });
    await db.prepare("INSERT INTO cup_matches VALUES ('c1', 'ct-club', 'ct-big', 'simulated', 400, '2026-10-05')").run();
    await db.prepare("INSERT INTO cup_matches VALUES ('c2', 'ct-big', 'ct-club', 'simulated', 5000, '2026-10-06')").run();

    expect(await loadHomeAttendance(db, "club")).toEqual({ matches: 3, average: 300, max: 400 });
  });

  it("bere jen posledních pár zápasů", async () => {
    // Staré vyprodané zápasy z doby, kdy klub měl menší stadion, se nepočítají.
    for (let i = 0; i < 5; i++) await league(`old${i}`, { attendance: 900, at: `2026-08-0${i + 1}` });
    for (let i = 0; i < RECENT_HOME_MATCHES; i++) {
      await league(`new${i}`, { attendance: 100 + i, at: `2026-10-${String(i + 10).padStart(2, "0")}` });
    }
    const summary = await loadHomeAttendance(db, "club");
    expect(summary).toEqual({ matches: RECENT_HOME_MATCHES, average: 105, max: 100 + RECENT_HOME_MATCHES - 1 });
  });

  it("klub bez odehraného domácího zápasu", async () => {
    expect(await loadHomeAttendance(db, "club")).toEqual({ matches: 0, average: null, max: null });
  });
});
