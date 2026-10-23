/**
 * Data sezónních slibů nad skutečnou D1 (Miniflare): konečné místo v lize, ve které klub
 * sezónu hrál. V rolloveru postup a sestup přesune kluby do nové ligy dřív, než se sliby
 * vyhodnotí; místo se proto nesmí hledat podle `teams.league_id`.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { Miniflare } from "miniflare";
import { loadSeasonStats } from "./promise-data";

let miniflare: Miniflare;
let db: D1Database;

const SCHEMA = `
  CREATE TABLE league_history (id TEXT PRIMARY KEY, league_id TEXT, final_standings TEXT, season_number INTEGER);
  CREATE TABLE teams (id TEXT PRIMARY KEY, league_id TEXT, reputation INTEGER NOT NULL DEFAULT 50);
  CREATE TABLE season_calendar (id TEXT PRIMARY KEY, league_id TEXT, season_number INTEGER);
  CREATE TABLE matches (
    id TEXT PRIMARY KEY, league_id TEXT, calendar_id TEXT, home_team_id TEXT, away_team_id TEXT,
    home_score INTEGER, away_score INTEGER, status TEXT, attendance INTEGER
  );
  CREATE TABLE cup_competitions (
    id TEXT PRIMARY KEY, season_number INTEGER, status TEXT, total_rounds INTEGER, current_round INTEGER, winner_team_id TEXT
  );
  CREATE TABLE cup_teams (id TEXT PRIMARY KEY, cup_id TEXT, team_id TEXT, eliminated_round INTEGER);
  CREATE TABLE cup_matches (id TEXT PRIMARY KEY, cup_id TEXT);
  CREATE TABLE match_player_stats (match_id TEXT, team_id TEXT, player_id TEXT, started INTEGER);
  CREATE TABLE players (id TEXT PRIMARY KEY, age INTEGER);
  CREATE TABLE fan_incidents (id TEXT PRIMARY KEY, team_id TEXT, match_id TEXT)
`;

async function runSql(sql: string): Promise<void> {
  for (const statement of sql.split(";").map((s) => s.trim()).filter(Boolean)) await db.prepare(statement).run();
}

beforeAll(async () => {
  miniflare = new Miniflare({
    modules: true,
    script: "export default { fetch() { return new Response('ok'); } }",
    d1Databases: ["DB"],
  });
  db = await miniflare.getD1Database("DB");
  await runSql(SCHEMA);
});

afterAll(async () => {
  await miniflare.dispose();
});

beforeEach(async () => {
  for (const table of ["league_history", "teams", "season_calendar", "matches"]) await db.prepare(`DELETE FROM ${table}`).run();
  // Stav po kroku 2b rolloveru: mistr III. třídy s1 už je v přeboru, poslední přeboru p4 v III. třídě.
  await runSql(`
    INSERT INTO teams (id, league_id) VALUES
      ('s1', 'prebor'), ('s2', 'prebor'), ('s3', 'soutez'), ('s4', 'soutez'),
      ('p1', 'prebor'), ('p2', 'prebor'), ('p3', 'soutez'), ('p4', 'soutez')
  `);
});

/** Konečná tabulka, jak ji zapisuje archiv sezóny (season-archive.ts). */
function standings(ids: string[]): string {
  return JSON.stringify(ids.map((teamId, i) => ({ pos: i + 1, teamId, teamName: teamId, points: 30 - i * 3, played: 6 })));
}

describe("loadSeasonStats: místo v lize, ve které klub sezónu hrál", () => {
  it("archiv sezóny: mistr III. třídy je první, i když už je v přeboru", async () => {
    await db.batch([
      // U21 archiv s id, které obsahuje id áčka: nesmí se splést.
      db.prepare("INSERT INTO league_history (id, league_id, final_standings, season_number) VALUES ('h0', 'u21', ?, 3)")
        .bind(standings(["s1-u21", "p1-u21", "s2-u21"])),
      db.prepare("INSERT INTO league_history (id, league_id, final_standings, season_number) VALUES ('h1', 'prebor', ?, 3)")
        .bind(standings(["p1", "p2", "p3", "p4"])),
      db.prepare("INSERT INTO league_history (id, league_id, final_standings, season_number) VALUES ('h2', 'soutez', ?, 3)")
        .bind(standings(["s1", "s2", "s3", "s4"])),
      // Jiná sezóna se nepočítá.
      db.prepare("INSERT INTO league_history (id, league_id, final_standings, season_number) VALUES ('h3', 'prebor', ?, 2)")
        .bind(standings(["s4", "s3", "s2", "s1"])),
    ]);
    const champion = await loadSeasonStats(db, "s1", 3, { agedSinceSeason: true });
    expect([champion.position, champion.teamsInLeague]).toEqual([1, 4]);
    const relegated = await loadSeasonStats(db, "p4", 3, { agedSinceSeason: true });
    expect([relegated.position, relegated.teamsInLeague]).toEqual([4, 4]);
  });

  it("bez archivu: tabulka ze zápasů ligy, ve které klub v té sezóně hrál", async () => {
    // Sezóna 3: III. třída s1 > s3 > s2 > s4, přebor p1 > p3 > p2 > p4. Sezóna 4 už má
    // rozpis s novým složením (s1 v přeboru).
    await runSql(`
      INSERT INTO season_calendar (id, league_id, season_number) VALUES
        ('cs1', 'soutez', 3), ('cs2', 'soutez', 3), ('cp1', 'prebor', 3), ('cp2', 'prebor', 3), ('cn1', 'prebor', 4);
      INSERT INTO matches (id, league_id, calendar_id, home_team_id, away_team_id, home_score, away_score, status) VALUES
        ('m1', 'soutez', 'cs1', 's1', 's4', 3, 0, 'simulated'),
        ('m2', 'soutez', 'cs1', 's2', 's3', 1, 0, 'simulated'),
        ('m3', 'soutez', 'cs2', 's3', 's4', 2, 0, 'simulated'),
        ('m4', 'soutez', 'cs2', 's1', 's2', 1, 0, 'simulated'),
        ('m5', 'prebor', 'cp1', 'p1', 'p2', 2, 0, 'simulated'),
        ('m6', 'prebor', 'cp1', 'p3', 'p4', 1, 0, 'simulated'),
        ('m7', 'prebor', 'cp2', 'p1', 'p4', 2, 0, 'simulated'),
        ('m8', 'prebor', 'cp2', 'p2', 'p3', 1, 1, 'simulated'),
        ('m9', 'prebor', 'cn1', 'p1', 's1', NULL, NULL, 'scheduled')
    `);
    const champion = await loadSeasonStats(db, "s1", 3, { agedSinceSeason: true });
    expect([champion.position, champion.teamsInLeague]).toEqual([1, 4]);
    const relegated = await loadSeasonStats(db, "p4", 3, { agedSinceSeason: true });
    expect([relegated.position, relegated.teamsInLeague]).toEqual([4, 4]);
    // Klub, který v sezóně nehrál žádný ligový zápas, místo nemá.
    expect((await loadSeasonStats(db, "nobody", 3, { agedSinceSeason: true })).position).toBeNull();
  });
});
