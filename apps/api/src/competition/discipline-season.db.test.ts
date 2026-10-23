/**
 * Důkazy disciplinárky „za sezónu" nad skutečnou D1 (Miniflare).
 *
 * Začátek sezóny se dřív četl ze sloupce `season_calendar.match_date`, který
 * neexistuje: dotaz spadl do catch, okno vyšlo prázdné a výtržnosti se počítaly
 * za celou historii. Karty, přestupy a kritika sudího sezónu nefiltrovaly vůbec.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Miniflare } from "miniflare";
import { collectEvidence, evidenceLimitsFor } from "./discipline";

let miniflare: Miniflare;
let db: D1Database;

const LEAGUE = "league-1";
/** Rollover do 3. sezóny. Předchozí sezóna skončila v červnu. */
const SEASON_3_START = "2026-08-17T16:00:00.000Z";

async function run(sql: string, ...binds: unknown[]) {
  await db.prepare(sql).bind(...binds).run();
}

beforeAll(async () => {
  miniflare = new Miniflare({
    modules: true,
    script: "export default { fetch() { return new Response('ok'); } }",
    d1Databases: ["DB"],
  });
  db = await miniflare.getD1Database("DB");
  for (const sql of [
    `CREATE TABLE teams (id TEXT PRIMARY KEY, user_id TEXT, league_id TEXT, season_start TEXT)`,
    `CREATE TABLE season_calendar (id TEXT PRIMARY KEY, league_id TEXT, season_number INTEGER, game_week INTEGER,
      match_day TEXT, scheduled_at TEXT NOT NULL, status TEXT DEFAULT 'scheduled')`,
    `CREATE TABLE matches (id TEXT PRIMARY KEY, league_id TEXT, calendar_id TEXT, home_team_id TEXT, away_team_id TEXT,
      status TEXT DEFAULT 'simulated', created_at TEXT DEFAULT (datetime('now')))`,
    `CREATE TABLE cup_matches (id TEXT PRIMARY KEY, cup_id TEXT, scheduled_at TEXT)`,
    `CREATE TABLE tournament_matches (id TEXT PRIMARY KEY, scheduled_at TEXT NOT NULL)`,
    `CREATE TABLE match_player_stats (id TEXT PRIMARY KEY, match_id TEXT, player_id TEXT, team_id TEXT,
      red_cards INTEGER NOT NULL DEFAULT 0, created_at TEXT DEFAULT (datetime('now')))`,
    // Bilance u rozhodčích se přes sezóny nenuluje — přesně z ní se dřív brala čísla.
    `CREATE TABLE referee_team_relations (id TEXT PRIMARY KEY, referee_id TEXT, team_id TEXT, red_cards INTEGER NOT NULL DEFAULT 0)`,
    `CREATE TABLE fan_incidents (id TEXT PRIMARY KEY, team_id TEXT, kind TEXT, game_date TEXT)`,
    `CREATE TABLE transfer_offers (id TEXT PRIMARY KEY, player_id TEXT, from_team_id TEXT, to_team_id TEXT, status TEXT,
      created_at TEXT DEFAULT (datetime('now')), resolved_at TEXT)`,
    `CREATE TABLE coach_interviews (id TEXT PRIMARY KEY, team_id TEXT, kind TEXT, match_calendar_id TEXT, analysis TEXT,
      created_at TEXT DEFAULT (datetime('now')))`,
  ]) await run(sql);

  // Kluby: `old` se provinil v minulé sezóně, `now` v téhle. `twin-*` patří stejnému majiteli.
  for (const [id, user] of [["old", "u-old"], ["now", "u-now"], ["twin-old", "u-old"], ["twin-now", "u-now"]]) {
    await run("INSERT INTO teams (id, user_id, league_id, season_start) VALUES (?, ?, ?, ?)", id, user, LEAGUE, SEASON_3_START);
  }

  // Kalendář: 2. sezóna na jaře, 3. sezóna od konce srpna.
  await run("INSERT INTO season_calendar (id, league_id, season_number, game_week, match_day, scheduled_at) VALUES ('s2-r1', ?, 2, 1, 'monday', '2026-04-06T16:00:00.000Z')", LEAGUE);
  await run("INSERT INTO season_calendar (id, league_id, season_number, game_week, match_day, scheduled_at) VALUES ('s3-r1', ?, 3, 1, 'monday', '2026-08-24T16:00:00.000Z')", LEAGUE);
  await run("INSERT INTO matches (id, league_id, calendar_id, home_team_id, away_team_id) VALUES ('m-s2', ?, 's2-r1', 'old', 'now')", LEAGUE);
  await run("INSERT INTO matches (id, league_id, calendar_id, home_team_id, away_team_id) VALUES ('m-s3', ?, 's3-r1', 'now', 'old')", LEAGUE);
  await run("INSERT INTO cup_matches (id, cup_id, scheduled_at) VALUES ('cup-s3', 'cup-3', '2026-09-05T16:00:00.000Z')");

  // Červené karty: `old` tři v minulé sezóně, `now` dvě v lize a jednu v poháru téhle.
  await run("INSERT INTO match_player_stats (id, match_id, player_id, team_id, red_cards) VALUES ('c1', 'm-s2', 'p1', 'old', 2), ('c2', 'm-s2', 'p2', 'old', 1)");
  await run("INSERT INTO match_player_stats (id, match_id, player_id, team_id, red_cards) VALUES ('c3', 'm-s3', 'p3', 'now', 2), ('c4', 'cup-s3', 'p4', 'now', 1)");
  await run("INSERT INTO referee_team_relations (id, referee_id, team_id, red_cards) VALUES ('r1', 'ref', 'old', 3), ('r2', 'ref', 'now', 3)");

  // Výtržnosti: tři loni, tři letos.
  for (const [i, team, day] of [[1, "old", "2026-04-06"], [2, "old", "2026-04-20"], [3, "old", "2026-05-04"],
    [4, "now", "2026-08-24"], [5, "now", "2026-08-31"], [6, "now", "2026-09-07"]] as const) {
    await run("INSERT INTO fan_incidents (id, team_id, kind, game_date) VALUES (?, ?, 'pokrik', ?)", `fi-${i}`, team, `${day}T16:00:00.000Z`);
  }

  // Obchod mezi vlastními kluby: `old` loni, `now` letos v předsezóně (před prvním kolem).
  await run("INSERT INTO transfer_offers (id, player_id, from_team_id, to_team_id, status, resolved_at) VALUES ('t-old', 'x', 'twin-old', 'old', 'accepted', '2026-05-10T10:00:00Z')");
  await run("INSERT INTO transfer_offers (id, player_id, from_team_id, to_team_id, status, resolved_at) VALUES ('t-now', 'y', 'twin-now', 'now', 'accepted', '2026-08-19T10:00:00Z')");

  // Kritika sudího po zápase: dvakrát loni, dvakrát letos.
  const criticismAnalysis = JSON.stringify({ rozhodci: { postoj: "kritika" } });
  for (const [i, team, cal] of [[1, "old", "s2-r1"], [2, "old", "s2-r1"], [3, "now", "s3-r1"], [4, "now", "s3-r1"]] as const) {
    await run("INSERT INTO coach_interviews (id, team_id, kind, match_calendar_id, analysis) VALUES (?, ?, 'post_match', ?, ?)", `ci-${i}`, team, cal, criticismAnalysis);
  }
});

afterAll(async () => {
  await miniflare.dispose();
});

describe("disciplinárka počítá jen aktuální sezónu", () => {
  it("začátek sezóny se dohledá, i když by kalendář sloupec match_date neměl", async () => {
    const limits = await evidenceLimitsFor(db, LEAGUE, 3);
    expect(limits.seasonStart).toBe("2026-08-17");
  });

  it("bez rolloveru platí první kolo sezóny z kalendáře", async () => {
    await run("UPDATE teams SET season_start = NULL");
    try {
      const limits = await evidenceLimitsFor(db, LEAGUE, 3);
      expect(limits.seasonStart).toBe("2026-08-24");
    } finally {
      await run("UPDATE teams SET season_start = ?", SEASON_3_START);
    }
  });

  it("skutky z minulé sezóny se nedají doložit", async () => {
    const limits = { ...(await evidenceLimitsFor(db, LEAGUE, 3)), ownerTransfersBanned: true };
    const kinds = (await collectEvidence(db, "old", limits)).map((e) => e.kind).sort();
    expect(kinds).toEqual([]);
  });

  it("skutky z téhle sezóny ano, i obchod z předsezóny a karta z poháru", async () => {
    const limits = { ...(await evidenceLimitsFor(db, LEAGUE, 3)), ownerTransfersBanned: true };
    const evidence = await collectEvidence(db, "now", limits);
    expect(evidence.map((e) => e.kind).sort()).toEqual(["cards", "fan_violence", "referee_abuse", "transfer"]);
    expect(evidence.find((e) => e.kind === "cards")?.detail).toContain("3 červené karty");
  });
});
