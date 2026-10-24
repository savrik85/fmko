/**
 * Úroveň gólů soutěže nad skutečnou D1 (Miniflare): přehrání nového enginu
 * (ENGINE_FALLBACK_LEVEL) jako prior, který jedno kolo nezahodí.
 *
 * Po opravě enginu (11. 10. 2026) bylo do konce sezóny 2 jen kolo 12. 10., sedm zápasů
 * na ligu, a z něj se počítaly kurzy na 26. 10.: Prachatice 1,09 místo 1,38 z přehrání
 * 6 552 zápasů, Praha 1,56 místo 1,36, Budějovice 0,84 místo 1,12.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { Miniflare } from "miniflare";
import { loadGoalLevel } from "./board";
import { ENGINE_FALLBACK_LEVEL, ENGINE_SINCE } from "./engine-transition";

const PRACHATICE_LEAGUE = "7a82b469-d4db-4ee6-b730-2ec85a68122d";

let miniflare: Miniflare;
let db: D1Database;

beforeAll(async () => {
  miniflare = new Miniflare({ modules: true, script: "export default { fetch() { return new Response('ok'); } }", d1Databases: ["DB"] });
  db = await miniflare.getD1Database("DB");
  await db.prepare("CREATE TABLE season_calendar (id TEXT PRIMARY KEY, league_id TEXT, status TEXT, scheduled_at TEXT)").run();
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

/** Kolo sedmi zápasů, v každém padne `goals` gólů (null = zápas bez výsledku). */
async function round(id: string, scheduledAt: string, goals: number | null): Promise<void> {
  await db.prepare("INSERT INTO season_calendar VALUES (?, ?, 'simulated', ?)").bind(id, PRACHATICE_LEAGUE, scheduledAt).run();
  for (let m = 0; m < 7; m++) {
    await db.prepare("INSERT INTO matches VALUES (?, ?, ?, ?, ?, ?, 'simulated')")
      .bind(`${id}-m${m}`, id, `t-${2 * m}`, `t-${2 * m + 1}`, goals === null ? null : goals - 1, goals === null ? null : 1).run();
  }
}

describe("úroveň gólů soutěže z kurzového lístku", () => {
  it("bez kola nového enginu platí přehrání", async () => {
    await round("old-round", "2026-10-05T16:00:00.000Z", 9); // starý „hokejový" engine se nepočítá
    expect(await loadGoalLevel(db, PRACHATICE_LEAGUE)).toBe(ENGINE_FALLBACK_LEVEL[PRACHATICE_LEAGUE]);
    expect(ENGINE_SINCE).toBe("2026-10-11");
  });

  it("jedno kolo posune úroveň jen část cesty", async () => {
    // 7 zápasů po 4 gólech při 7 × 3,222 očekávaných: samotné kolo dá 28 / 22,554 = 1,2415.
    // Přehrání 1,38 je kolo zpátky: 14 × 0,5^(1/2) = 9,8995 zápasu proti 7.
    // (9,8995 × 1,38 + 7 × 1,2415) / 16,8995 = 1,3226.
    await round("round-1", "2026-10-12T16:00:00.000Z", 4);
    expect(await loadGoalLevel(db, PRACHATICE_LEAGUE)).toBeCloseTo(1.3226, 4);
  });

  it("kolo bez výsledků vrátí přehrání, ne referenční úroveň", async () => {
    await round("round-1", "2026-10-12T16:00:00.000Z", null);
    expect(await loadGoalLevel(db, PRACHATICE_LEAGUE)).toBe(ENGINE_FALLBACK_LEVEL[PRACHATICE_LEAGUE]);
  });
});
