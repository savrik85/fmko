/**
 * Ligová bilance trenéra v detailu zápasu na skutečné D1 (Miniflare): počítá se jen aktuální sezóna
 * a jen odehraná kola před výkopem, ať jde o ligový zápas, nebo o pohár mezi dvěma koly. A vztah trenérů:
 * objímají se jen ti, jejichž vztah hra ukazuje jako přátelský (relationLabel).
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Miniflare } from "miniflare";
import { loadMatchLook } from "./match-look";

let mf: Miniflare;
let db: D1Database;

const ROUNDS = ["2026-11-01T17:00:00.000Z", "2026-11-08T17:00:00.000Z", "2026-11-15T17:00:00.000Z", "2026-11-22T17:00:00.000Z"];

beforeAll(async () => {
  mf = new Miniflare({ modules: true, script: "export default { fetch() { return new Response('ok'); } }", d1Databases: ["DB"] });
  db = await mf.getD1Database("DB");
  await db.batch([
    db.prepare(`CREATE TABLE teams (id TEXT PRIMARY KEY, primary_color TEXT, secondary_color TEXT, jersey_pattern TEXT, home_shorts_color TEXT, home_socks_color TEXT,
      away_primary_color TEXT, away_secondary_color TEXT, away_jersey_pattern TEXT, away_shorts_color TEXT, away_socks_color TEXT)`),
    db.prepare("CREATE TABLE managers (team_id TEXT, name TEXT, avatar TEXT, motivation INTEGER)"),
    db.prepare("CREATE TABLE manager_relations (team_a_id TEXT, team_b_id TEXT, respect INTEGER, heat INTEGER DEFAULT 0, PRIMARY KEY (team_a_id, team_b_id))"),
    db.prepare("CREATE TABLE season_calendar (id TEXT PRIMARY KEY, league_id TEXT, season_number INTEGER, scheduled_at TEXT)"),
    db.prepare("CREATE TABLE matches (id TEXT PRIMARY KEY, calendar_id TEXT, home_team_id TEXT, away_team_id TEXT, home_score INTEGER, away_score INTEGER, status TEXT)"),
    db.prepare("INSERT INTO teams (id, primary_color) VALUES ('h', '#B91C1C'), ('a', '#1D4ED8')"),
    db.prepare("INSERT INTO managers (team_id, name, avatar, motivation) VALUES ('h', 'Domácí Trenér', '{}', 60), ('a', 'Hostující Trenér', '{}', 40)"),
    // Loňská sezóna: dvě výhry domácích, které se do bilance nepočítají.
    db.prepare("INSERT INTO season_calendar (id, league_id, season_number, scheduled_at) VALUES ('old1', 'lg', 1, '2026-05-01T17:00:00.000Z'), ('old2', 'lg', 1, '2026-05-08T17:00:00.000Z')"),
    db.prepare("INSERT INTO matches (id, calendar_id, home_team_id, away_team_id, home_score, away_score, status) VALUES ('o1', 'old1', 'h', 'a', 3, 0, 'simulated'), ('o2', 'old2', 'x', 'h', 0, 1, 'simulated')"),
    ...ROUNDS.map((at, n) => db.prepare("INSERT INTO season_calendar (id, league_id, season_number, scheduled_at) VALUES (?, 'lg', 2, ?)").bind(`r${n + 1}`, at)),
    // Letos: domácí vyhráli doma, remizovali venku a prohráli; čtvrté kolo se ještě nehrálo.
    db.prepare(`INSERT INTO matches (id, calendar_id, home_team_id, away_team_id, home_score, away_score, status) VALUES
      ('m1', 'r1', 'h', 'x', 2, 0, 'simulated'), ('m2', 'r2', 'x', 'h', 1, 1, 'simulated'), ('m3', 'r3', 'h', 'a', 0, 1, 'simulated'), ('m4', 'r4', 'a', 'h', NULL, NULL, 'scheduled')`),
  ]);
}, 60_000);

afterAll(async () => { await mf?.dispose(); });

const records = async (kickoff: string | null) => {
  const look = await loadMatchLook(db, { teamId: "h" }, { teamId: "a" }, null, null, kickoff);
  return [look.home_coach!.record, look.away_coach!.record];
};

describe("ligová bilance trenéra", () => {
  it("před prvním kolem sezóny žádná není, loňské zápasy se nepočítají", async () => {
    expect(await records(ROUNDS[0])).toEqual([null, null]);
  });

  it("ligový zápas: odehraná kola před ním, bez něj samotného", async () => {
    expect(await records(ROUNDS[2])).toEqual([{ played: 2, won: 1 }, null]);
  });

  it("pohár mezi koly a neodehrané kolo: všechno, co se v lize do té doby odehrálo", async () => {
    expect(await records("2026-11-18T11:00:00.000Z")).toEqual([{ played: 3, won: 1 }, { played: 1, won: 1 }]);
    expect(await records(ROUNDS[3])).toEqual([{ played: 3, won: 1 }, { played: 1, won: 1 }]);
  });

  it("přátelák čas výkopu nemá a bilanci neukazuje", async () => {
    expect(await records(null)).toEqual([null, null]);
  });
});

describe("vztah trenérů", () => {
  const goodTerms = async () => (await loadMatchLook(db, { teamId: "h" }, { teamId: "a" }, null, null, null)).coaches_on_good_terms;

  it("objímají se dobří známí a lepší, i přátelská rivalita a spojenci s napětím; sousedské špičkování a rivalové ne", async () => {
    expect(await goodTerms()).toBe(false);
    // Dvojice je uložená s menším id jako první.
    await db.prepare("INSERT INTO manager_relations (team_a_id, team_b_id, respect) VALUES ('a', 'h', 0)").run();
    expect(await goodTerms()).toBe(false);
    await db.prepare("UPDATE manager_relations SET respect = -15").run();
    expect(await goodTerms()).toBe(false);
    await db.prepare("UPDATE manager_relations SET respect = 9").run();
    expect(await goodTerms()).toBe(false);
    await db.prepare("UPDATE manager_relations SET respect = 10").run();
    expect(await goodTerms()).toBe(true);
    // Sousedské špičkování.
    await db.prepare("UPDATE manager_relations SET heat = 20").run();
    expect(await goodTerms()).toBe(false);
    // Přátelská rivalita.
    await db.prepare("UPDATE manager_relations SET respect = 30").run();
    expect(await goodTerms()).toBe(true);
    // Spojenec, i když to mezi kluby jiskří.
    await db.prepare("UPDATE manager_relations SET respect = 70, heat = 30").run();
    expect(await goodTerms()).toBe(true);
    // Vážený rival.
    await db.prepare("UPDATE manager_relations SET heat = 90").run();
    expect(await goodTerms()).toBe(false);
  });
});
