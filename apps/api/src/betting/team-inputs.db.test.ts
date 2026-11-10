/**
 * Vstupy kurzového modelu nad skutečnou D1 (Miniflare): síla týmu bez zraněných
 * a podle uložené sestavy, klubová výhoda domácích dávkou pro víc týmů.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { Miniflare } from "miniflare";
import { loadClubHomeAdvantages, loadMatchStrengths, DEFAULT_STRENGTH } from "./team-inputs";
import { MATCH_HOME_ADVANTAGE } from "../season/fanbase-helpers";

let miniflare: Miniflare;
let db: D1Database;

beforeAll(async () => {
  miniflare = new Miniflare({ modules: true, script: "export default { fetch() { return new Response('ok'); } }", d1Databases: ["DB"] });
  db = await miniflare.getD1Database("DB");
  await db.batch([
    db.prepare("CREATE TABLE players (id TEXT PRIMARY KEY, team_id TEXT, overall_rating INTEGER, status TEXT, suspended_matches INTEGER DEFAULT 0)"),
    db.prepare("CREATE TABLE injuries (id TEXT PRIMARY KEY, player_id TEXT, days_remaining INTEGER)"),
    db.prepare("CREATE TABLE lineups (id TEXT PRIMARY KEY, team_id TEXT, calendar_id TEXT, players_data TEXT, is_auto INTEGER, submitted_at TEXT)"),
    db.prepare("CREATE TABLE team_fanbase (team_id TEXT PRIMARY KEY, hardcore_count INTEGER, regular_count INTEGER, casual_count INTEGER, promo_casual_count INTEGER)"),
    db.prepare("CREATE TABLE bus_satellite_fans (id TEXT PRIMARY KEY, team_id TEXT, hardcore_count INTEGER, regular_count INTEGER, casual_count INTEGER)"),
    db.prepare("CREATE TABLE stadiums (id TEXT PRIMARY KEY, team_id TEXT, capacity INTEGER, ultras_stand INTEGER, stands INTEGER)"),
    db.prepare("CREATE TABLE fan_groups (id TEXT PRIMARY KEY, team_id TEXT, kind TEXT, size INTEGER, mood INTEGER, passion INTEGER, spending INTEGER, noise INTEGER, sector TEXT, closed_matches INTEGER, ticket_discount REAL)"),
    db.prepare("CREATE TABLE matches (id TEXT PRIMARY KEY, league_id TEXT, home_team_id TEXT, status TEXT, attendance INTEGER, simulated_at TEXT)"),
  ]);
});
afterAll(async () => { await miniflare.dispose(); });

beforeEach(async () => {
  for (const t of ["players", "injuries", "lineups", "team_fanbase", "bus_satellite_fans", "stadiums", "fan_groups", "matches"]) {
    await db.prepare(`DELETE FROM ${t}`).run();
  }
  // Dva týmy: jedenáct opor (50) a pět náhradníků (30).
  const stmts: D1PreparedStatement[] = [];
  for (const team of ["home", "away"]) {
    for (let i = 0; i < 11; i++) stmts.push(db.prepare("INSERT INTO players VALUES (?, ?, 50, 'active', 0)").bind(`${team}-star-${i}`, team));
    for (let i = 0; i < 5; i++) stmts.push(db.prepare("INSERT INTO players VALUES (?, ?, 30, 'active', 0)").bind(`${team}-sub-${i}`, team));
  }
  await db.batch(stmts);
});

const lineupOf = (ids: string[]) => JSON.stringify(ids.map((playerId) => ({ playerId, matchPosition: "MID" })));

describe("síla týmů pro nejbližší kolo", () => {
  it("zdravý kádr bez sestavy: nejlepších jedenáct", async () => {
    const s = await loadMatchStrengths(db, ["home", "away"], "round-1", 0);
    expect(s.get("home")).toBe(50);
    expect(s.get("away")).toBe(50);
  });

  it("zranění a stopka oporu vyřadí, hráč mimo aktivní kádr se nepočítá", async () => {
    await db.batch([
      db.prepare("INSERT INTO injuries VALUES ('i1', 'home-star-0', 5)"),
      db.prepare("UPDATE players SET suspended_matches = 1 WHERE id = 'home-star-1'"),
      db.prepare("UPDATE players SET status = 'released' WHERE id = 'home-star-2'"),
    ]);
    const s = await loadMatchStrengths(db, ["home", "away"], "round-1", 0);
    expect(s.get("home")).toBeCloseTo((8 * 50 + 3 * 30) / 11, 10);
    expect(s.get("away")).toBe(50);
  });

  it("zranění, které se do zápasu vyléčí, nevadí", async () => {
    await db.prepare("INSERT INTO injuries VALUES ('i1', 'home-star-0', 2)").run();
    // Zápas za tři dny: dva dny léčení stačí. Zápas zítra: nestačí.
    expect((await loadMatchStrengths(db, ["home"], "round-1", 3)).get("home")).toBe(50);
    expect((await loadMatchStrengths(db, ["home"], "round-1", 2)).get("home")).toBe(50);
    expect((await loadMatchStrengths(db, ["home"], "round-1", 1)).get("home")).toBeCloseTo((10 * 50 + 30) / 11, 10);
  });

  it("sestava uložená pro kolo má přednost před starší ruční i před automatem", async () => {
    const weak = lineupOf([...Array.from({ length: 6 }, (_, i) => `home-star-${i}`), ...Array.from({ length: 5 }, (_, i) => `home-sub-${i}`)]);
    const full = lineupOf(Array.from({ length: 11 }, (_, i) => `home-star-${i}`));
    await db.batch([
      db.prepare("INSERT INTO lineups VALUES ('old', 'home', 'round-0', ?, 0, '2026-11-01T10:00:00Z')").bind(full),
      db.prepare("INSERT INTO lineups VALUES ('auto', 'home', 'round-1', ?, 1, '2026-11-05T10:00:00Z')").bind(full),
      db.prepare("INSERT INTO lineups VALUES ('mine', 'home', 'round-1', ?, 0, '2026-11-04T10:00:00Z')").bind(weak),
    ]);
    const s = await loadMatchStrengths(db, ["home", "away"], "round-1", 0);
    expect(s.get("home")).toBeCloseTo((6 * 50 + 5 * 30) / 11, 10);
    expect(s.get("away")).toBe(50);
  });

  it("bez sestavy pro kolo platí poslední ruční sestava klubu", async () => {
    const weak = lineupOf([...Array.from({ length: 6 }, (_, i) => `home-star-${i}`), ...Array.from({ length: 5 }, (_, i) => `home-sub-${i}`)]);
    const full = lineupOf(Array.from({ length: 11 }, (_, i) => `home-star-${i}`));
    await db.batch([
      db.prepare("INSERT INTO lineups VALUES ('older', 'home', 'round-a', ?, 0, '2026-10-20T10:00:00Z')").bind(full),
      db.prepare("INSERT INTO lineups VALUES ('newer', 'home', 'round-b', ?, 0, '2026-11-01T10:00:00Z')").bind(weak),
      db.prepare("INSERT INTO lineups VALUES ('auto-other', 'home', 'round-c', ?, 1, '2026-11-05T10:00:00Z')").bind(full),
    ]);
    expect((await loadMatchStrengths(db, ["home"], "round-1", 0)).get("home")).toBeCloseTo((6 * 50 + 5 * 30) / 11, 10);
  });

  it("tým bez hráčů dostane výchozí sílu", async () => {
    expect((await loadMatchStrengths(db, ["ghost"], "round-1", 0)).get("ghost")).toBe(DEFAULT_STRENGTH);
    expect((await loadMatchStrengths(db, [], "round-1", 0)).size).toBe(0);
  });
});

describe("klubová výhoda domácích dávkou", () => {
  it("každý klub má svou: tvrdé jádro, autobusy a sektor kotle", async () => {
    await db.batch([
      db.prepare("INSERT INTO team_fanbase VALUES ('home', 40, 0, 0, 0)"),
      db.prepare("INSERT INTO bus_satellite_fans VALUES ('b1', 'home', 10, 0, 0)"),
      db.prepare("INSERT INTO stadiums VALUES ('s1', 'home', 300, 3, 0)"),
      db.prepare("INSERT INTO stadiums VALUES ('s2', 'away', 200, 0, 0)"),
      db.prepare("INSERT INTO matches VALUES ('m1', 'league', 'home', 'simulated', 150, '2026-11-01T17:00:00Z')"),
      db.prepare("INSERT INTO matches VALUES ('m2', 'league', 'away', 'simulated', 100, '2026-11-01T17:00:00Z')"),
    ]);
    const ha = await loadClubHomeAdvantages(db, ["home", "away"]);
    // 50 skalních = 2 body = 0,02; kotel třetí úrovně 0,05.
    expect(ha.get("home")).toBeCloseTo(0.12, 10);
    expect(ha.get("away")).toBe(MATCH_HOME_ADVANTAGE.base);
  });

  it("návštěva se bere z posledních tří domácích ligových zápasů", async () => {
    await db.batch([
      db.prepare("INSERT INTO stadiums VALUES ('s1', 'home', 200, 0, 0)"),
      db.prepare("INSERT INTO matches VALUES ('m0', 'league', 'home', 'simulated', 10, '2026-10-01T17:00:00Z')"),
      db.prepare("INSERT INTO matches VALUES ('m1', 'league', 'home', 'simulated', 190, '2026-11-01T17:00:00Z')"),
      db.prepare("INSERT INTO matches VALUES ('m2', 'league', 'home', 'simulated', 195, '2026-11-04T17:00:00Z')"),
      db.prepare("INSERT INTO matches VALUES ('m3', 'league', 'home', 'simulated', 200, '2026-11-08T17:00:00Z')"),
      db.prepare("INSERT INTO matches VALUES ('m4', NULL, 'home', 'simulated', 5, '2026-11-09T17:00:00Z')"),
    ]);
    // Vyprodáno (průměr 195 z 200): +1 bod = +0,01. Starý poloprázdný zápas ani přátelák se nepočítá.
    expect((await loadClubHomeAdvantages(db, ["home"])).get("home")).toBeCloseTo(0.06, 10);
  });

  it("když dotaz spadne, tým v mapě chybí a kurz vezme průměrný klub", async () => {
    await db.prepare("DROP TABLE fan_groups").run();
    try {
      expect((await loadClubHomeAdvantages(db, ["home"])).size).toBe(0);
    } finally {
      await db.prepare("CREATE TABLE fan_groups (id TEXT PRIMARY KEY, team_id TEXT, kind TEXT, size INTEGER, mood INTEGER, passion INTEGER, spending INTEGER, noise INTEGER, sector TEXT, closed_matches INTEGER, ticket_discount REAL)").run();
    }
  });
});
