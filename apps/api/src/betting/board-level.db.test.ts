/**
 * Úroveň gólů soutěže nad skutečnou D1 (Miniflare): přehrání nového enginu
 * (ENGINE_FALLBACK_LEVEL) jako prior, který jedno kolo nezahodí.
 *
 * Po opravě enginu (11. 10. 2026) bylo do konce sezóny 2 jen kolo 12. 10., sedm zápasů
 * na ligu, a z něj se počítaly kurzy na 26. 10.: Prachatice 1,09 místo 1,38 z přehrání
 * 6 552 zápasů, Praha 1,56 místo 1,36, Budějovice 0,84 místo 1,12.
 *
 * Od 30. 10. se kola minulé sezóny nepočítají vůbec a úroveň je zvlášť pro domácí
 * a pro hosty.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { Miniflare } from "miniflare";
import { loadGoalLevel } from "./board";
import { ENGINE_FALLBACK_LEVEL, ENGINE_SINCE } from "./engine-transition";
import { BASE_AWAY_GOALS, BASE_HOME_GOALS, LEVEL_HALF_LIFE_ROUNDS, LEVEL_PRIOR_MATCHES } from "./odds-model";

const PRACHATICE_LEAGUE = "7a82b469-d4db-4ee6-b730-2ec85a68122d";

let miniflare: Miniflare;
let db: D1Database;

beforeAll(async () => {
  miniflare = new Miniflare({ modules: true, script: "export default { fetch() { return new Response('ok'); } }", d1Databases: ["DB"] });
  db = await miniflare.getD1Database("DB");
  await db.prepare("CREATE TABLE season_calendar (id TEXT PRIMARY KEY, league_id TEXT, season_number INTEGER, status TEXT, scheduled_at TEXT)").run();
  await db.prepare(
    "CREATE TABLE matches (id TEXT PRIMARY KEY, calendar_id TEXT, home_team_id TEXT, away_team_id TEXT, home_score INTEGER, away_score INTEGER, status TEXT)",
  ).run();
  await db.prepare("CREATE TABLE players (id TEXT PRIMARY KEY, team_id TEXT, overall_rating INTEGER, status TEXT)").run();
});
afterAll(async () => { await miniflare.dispose(); });

beforeEach(async () => {
  for (const t of ["season_calendar", "matches", "players"]) await db.prepare(`DELETE FROM ${t}`).run();
  // Čtrnáct týmů se stejně silnou jedenáctkou (rating 40): očekávané góly zápasu při
  // úrovni 1 jsou pak přesně báze modelu, 1,742 + 1,480 = 3,222.
  for (let t = 0; t < 14; t++) {
    for (let p = 0; p < 11; p++) {
      await db.prepare("INSERT INTO players VALUES (?, ?, 40, 'active')").bind(`p-${t}-${p}`, `t-${t}`).run();
    }
  }
});

const PRIOR = ENGINE_FALLBACK_LEVEL[PRACHATICE_LEAGUE];
const bothSides = (level: number) => ({ home: level, away: level });

/**
 * Kolo sedmi zápasů, v každém padne `goals` gólů, z toho jeden hostům
 * (null = zápas bez výsledku).
 */
async function round(id: string, scheduledAt: string, goals: number | null, season = 3): Promise<void> {
  await db.prepare("INSERT INTO season_calendar VALUES (?, ?, ?, 'simulated', ?)").bind(id, PRACHATICE_LEAGUE, season, scheduledAt).run();
  for (let m = 0; m < 7; m++) {
    await db.prepare("INSERT INTO matches VALUES (?, ?, ?, ?, ?, ?, 'simulated')")
      .bind(`${id}-m${m}`, id, `t-${2 * m}`, `t-${2 * m + 1}`, goals === null ? null : goals - 1, goals === null ? null : 1).run();
  }
}

describe("úroveň gólů soutěže z kurzového lístku", () => {
  it("bez kola nového enginu platí přehrání", async () => {
    await round("old-round", "2026-10-05T16:00:00.000Z", 9); // starý „hokejový" engine se nepočítá
    expect(await loadGoalLevel(db, PRACHATICE_LEAGUE)).toEqual(bothSides(PRIOR));
    expect(ENGINE_SINCE).toBe("2026-10-11");
  });

  it("jedno kolo posune úroveň jen část cesty, domácí a hosty zvlášť", async () => {
    // 7 zápasů 3:1 při vyrovnaných kádrech: domácí dají 3 proti 1,742, hosté 1 proti 1,480.
    // Přehrání je kolo zpátky: 14 × 0,5^(1/2) = 9,8995 zápasu proti 7.
    await round("round-1", "2026-10-26T17:00:00.000Z", 4);
    const priorWeight = LEVEL_PRIOR_MATCHES * Math.pow(0.5, 1 / LEVEL_HALF_LIFE_ROUNDS);
    const level = await loadGoalLevel(db, PRACHATICE_LEAGUE);
    expect(level.home).toBeCloseTo((priorWeight * PRIOR + 7 * (3 / BASE_HOME_GOALS)) / (priorWeight + 7), 4);
    expect(level.away).toBeCloseTo((priorWeight * PRIOR + 7 * (1 / BASE_AWAY_GOALS)) / (priorWeight + 7), 4);
    expect(level.home).toBeGreaterThan(level.away);
  });

  it("kolo bez výsledků vrátí přehrání, ne referenční úroveň", async () => {
    await round("round-1", "2026-10-12T16:00:00.000Z", null);
    expect(await loadGoalLevel(db, PRACHATICE_LEAGUE)).toEqual(bothSides(PRIOR));
  });

  it("kola minulé sezóny se nepočítají (Budějovice 26. 10. 2026)", async () => {
    // Konec sezóny 2 na novém enginu s automatem v sestavách: málo gólů.
    await round("season-2-last", "2026-10-12T16:00:00.000Z", 2, 2);
    // Před prvním kolem sezóny 3 platí jen prior, ne úroveň z minulého ročníku.
    await db.prepare("INSERT INTO season_calendar VALUES ('season-3-open', ?, 3, 'scheduled', '2026-10-26T17:00:00.000Z')")
      .bind(PRACHATICE_LEAGUE).run();
    expect(await loadGoalLevel(db, PRACHATICE_LEAGUE)).toEqual(bothSides(PRIOR));

    // Po prvním kole sezóny 3 vyjde totéž, jako kdyby sezóna 2 vůbec nebyla.
    await round("season-3-first", "2026-10-29T17:00:00.000Z", 6);
    const withOldSeason = await loadGoalLevel(db, PRACHATICE_LEAGUE);
    await db.prepare("DELETE FROM matches WHERE calendar_id = 'season-2-last'").run();
    await db.prepare("DELETE FROM season_calendar WHERE id = 'season-2-last'").run();
    expect(withOldSeason).toEqual(await loadGoalLevel(db, PRACHATICE_LEAGUE));
  });
});
