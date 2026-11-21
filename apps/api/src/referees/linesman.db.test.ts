/**
 * Domácí pomezní s praporkem nad skutečnou D1 (Miniflare): uložení se sestavou,
 * načtení před výkopem, počítání za sezónu a skutek za třetího nadržujícího.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { Miniflare } from "miniflare";

const issued: Array<Record<string, unknown>> = [];
vi.mock("../competition/discipline", () => ({
  issueSanction: vi.fn(async (_db: unknown, opts: Record<string, unknown>) => {
    // Jako skutečná služba: stejný referenceId se podruhé nezapíše.
    if (issued.some((s) => s.referenceId === opts.referenceId)) return null;
    issued.push(opts);
    return `sanc-${issued.length}`;
  }),
}));

import { saveLineup } from "../services/lineup";
import {
  LINESMAN_BIAS_FINE, LINESMAN_BIAS_KIND, LINESMAN_BIAS_LIMIT, LINESMAN_TILT,
  countHomerLinesmen, loadLinesmanFanLeaders, loadLinesmanOverview, punishLinesmanBias, resolveMatchLinesman,
  validateLinesmanForTeam,
} from "./linesman";

let miniflare: Miniflare;
let db: D1Database;

const LEAGUE = "league-1";
const TEAM = "home-team";
const OTHER = "away-team";
const XI = ["p0", "p1", "p2", "p3", "p4", "p5", "p6", "p7", "p8", "p9", "p10"];
const POSITIONS = ["GK", "DEF", "DEF", "DEF", "DEF", "MID", "MID", "MID", "MID", "FWD", "FWD"];

async function run(sql: string, ...binds: unknown[]) {
  await db.prepare(sql).bind(...binds).run();
}

function lineupData(style: "fair" | "homer" | null): string {
  return JSON.stringify({
    starters: [], subs: [], formation: "4-4-2", tactic: "balanced", hardness: "normal", captainId: null,
    ...(style ? { linesman: { kind: "player", id: "p-inj", name: "Karel Zraněný", style, swapped: false } } : {}),
  });
}

beforeAll(async () => {
  miniflare = new Miniflare({
    modules: true,
    script: "export default { fetch() { return new Response('ok'); } }",
    d1Databases: ["DB"],
  });
  db = await miniflare.getD1Database("DB");
  for (const sql of [
    `CREATE TABLE season_calendar (id TEXT PRIMARY KEY, league_id TEXT, season_number INTEGER, status TEXT DEFAULT 'scheduled', scheduled_at TEXT)`,
    `CREATE TABLE matches (id TEXT PRIMARY KEY, calendar_id TEXT, home_team_id TEXT, away_team_id TEXT,
      status TEXT DEFAULT 'simulated', home_lineup_data TEXT, away_lineup_data TEXT)`,
    `CREATE TABLE players (id TEXT PRIMARY KEY, team_id TEXT, first_name TEXT, last_name TEXT, status TEXT DEFAULT 'active', suspended_matches INTEGER DEFAULT 0)`,
    `CREATE TABLE injuries (id TEXT PRIMARY KEY, player_id TEXT, days_remaining INTEGER)`,
    `CREATE TABLE tournament_matches (id TEXT PRIMARY KEY, tournament_id TEXT, home_team_id TEXT, away_team_id TEXT)`,
    `CREATE TABLE fan_groups (id TEXT PRIMARY KEY, team_id TEXT, kind TEXT, name TEXT, leader_id TEXT)`,
    `CREATE TABLE fan_leaders (id TEXT PRIMARY KEY, group_id TEXT, team_id TEXT, first_name TEXT, last_name TEXT,
      nickname TEXT, status TEXT DEFAULT 'active')`,
    `CREATE TABLE lineups (id TEXT PRIMARY KEY, team_id TEXT NOT NULL, calendar_id TEXT NOT NULL, formation TEXT NOT NULL DEFAULT '4-4-2',
      tactic TEXT NOT NULL DEFAULT 'balanced', hardness TEXT NOT NULL DEFAULT 'normal', players_data TEXT NOT NULL DEFAULT '[]',
      captain_id TEXT, preset_slot TEXT, match_plan TEXT, bench_data TEXT, submitted_at TEXT, is_auto INTEGER NOT NULL DEFAULT 0, linesman TEXT)`,
    `CREATE TABLE lineup_presets (team_id TEXT NOT NULL, slot TEXT NOT NULL, formation TEXT NOT NULL, tactic TEXT NOT NULL,
      hardness TEXT NOT NULL DEFAULT 'normal', captain_id TEXT, players_data TEXT NOT NULL, match_plan TEXT, bench_data TEXT,
      updated_at TEXT, linesman TEXT, PRIMARY KEY (team_id, slot))`,
  ]) await run(sql);

  // Kádr: jedenáctka p0–p10, lavička p11–p12, zraněný p-inj, hráč soupeře a hráč, který klub opustil.
  for (const id of [...XI, "p11", "p12"]) await run("INSERT INTO players (id, team_id, first_name, last_name) VALUES (?, ?, 'Jan', ?)", id, TEAM, id);
  await run("INSERT INTO players (id, team_id, first_name, last_name) VALUES ('p-inj', ?, 'Karel', 'Zraněný')", TEAM);
  await run("INSERT INTO injuries (id, player_id, days_remaining) VALUES ('i1', 'p-inj', 10)");
  await run("INSERT INTO players (id, team_id, first_name, last_name) VALUES ('p-foreign', ?, 'Cizí', 'Hráč')", OTHER);
  await run("INSERT INTO players (id, team_id, first_name, last_name, status) VALUES ('p-gone', ?, 'Bývalý', 'Hráč', 'released')", TEAM);

  await run("INSERT INTO fan_groups (id, team_id, kind, name, leader_id) VALUES ('fg-1', ?, 'kotel', 'Prales Boys', 'fl-1')", TEAM);
  await run("INSERT INTO fan_leaders (id, group_id, team_id, first_name, last_name, nickname) VALUES ('fl-1', 'fg-1', ?, 'Pepa', 'Bubeník', 'Buben')", TEAM);
  await run("INSERT INTO fan_leaders (id, group_id, team_id, first_name, last_name, status) VALUES ('fl-old', 'fg-1', ?, 'Starý', 'Vůdce', 'retired')", TEAM);
  await run("INSERT INTO fan_leaders (id, group_id, team_id, first_name, last_name) VALUES ('fl-foreign', 'fg-x', ?, 'Cizí', 'Kotelník')", OTHER);

  // Sezóna 2 (loni) a 3 (letos).
  for (let r = 1; r <= 6; r++) {
    await run("INSERT INTO season_calendar (id, league_id, season_number, scheduled_at) VALUES (?, ?, 3, ?)", `s3-r${r}`, LEAGUE, `2026-09-0${r}T16:00:00Z`);
  }
  await run("INSERT INTO season_calendar (id, league_id, season_number, status) VALUES ('s2-r1', ?, 2, 'simulated')", LEAGUE);
  await run("INSERT INTO season_calendar (id, league_id, season_number, status) VALUES ('s2-r2', ?, 2, 'simulated')", LEAGUE);
});

afterAll(async () => { await miniflare.dispose(); });

beforeEach(async () => {
  issued.length = 0;
  await run("DELETE FROM matches");
  await run("DELETE FROM lineups");
  await run("DELETE FROM lineup_presets");
});

describe("výběr pomezního při uložení sestavy", () => {
  const occupied = new Set([...XI, "p11", "p12"]);

  it("pomezním může být hráč mimo zápas (i zraněný) a aktivní vůdce kotle", async () => {
    expect(await validateLinesmanForTeam(db, TEAM, { kind: "player", id: "p-inj", style: "homer" }, occupied)).toEqual({ ok: true });
    expect(await validateLinesmanForTeam(db, TEAM, { kind: "fan_leader", id: "fl-1", style: "fair" }, occupied)).toEqual({ ok: true });
  });

  it("hráč v sestavě nebo na lavičce praporek nedrží", async () => {
    expect(await validateLinesmanForTeam(db, TEAM, { kind: "player", id: "p3", style: "fair" }, occupied)).toMatchObject({ ok: false });
    expect(await validateLinesmanForTeam(db, TEAM, { kind: "player", id: "p12", style: "fair" }, occupied)).toMatchObject({ ok: false });
  });

  it("cizí hráč, bývalý hráč, cizí a vysloužilý vůdce kotle neprojdou", async () => {
    for (const choice of [
      { kind: "player", id: "p-foreign", style: "fair" },
      { kind: "player", id: "p-gone", style: "fair" },
      { kind: "fan_leader", id: "fl-foreign", style: "homer" },
      { kind: "fan_leader", id: "fl-old", style: "homer" },
    ] as const) {
      expect(await validateLinesmanForTeam(db, TEAM, choice, occupied)).toMatchObject({ ok: false });
    }
  });

  it("sestava s pomezním se uloží do zápasu i do presetu, neplatný pomezní ji zastaví", async () => {
    const body = {
      calendarId: "s3-r1", formation: "4-4-2", tactic: "balanced", presetSlot: "A" as const,
      players: XI.map((playerId, i) => ({ playerId, matchPosition: POSITIONS[i] })),
      linesman: { kind: "player", id: "p-inj", style: "homer" },
    };
    const res = await saveLineup(db, TEAM, body);
    expect(res.ok).toBe(true);
    const row = await db.prepare("SELECT linesman FROM lineups WHERE team_id = ? AND calendar_id = 's3-r1'").bind(TEAM).first<{ linesman: string }>();
    expect(JSON.parse(row!.linesman)).toEqual({ kind: "player", id: "p-inj", style: "homer" });
    const preset = await db.prepare("SELECT linesman FROM lineup_presets WHERE team_id = ? AND slot = 'A'").bind(TEAM).first<{ linesman: string }>();
    expect(JSON.parse(preset!.linesman)).toEqual({ kind: "player", id: "p-inj", style: "homer" });

    // Pomezní nastoupil do základu: sestava se neuloží a uložený pomezní zůstane.
    const bad = await saveLineup(db, TEAM, { ...body, linesman: { kind: "player", id: "p5", style: "fair" } });
    expect(bad).toMatchObject({ ok: false, status: 400 });

    // Bez pomezního (null) se volba smaže.
    expect((await saveLineup(db, TEAM, { ...body, linesman: null })).ok).toBe(true);
    const cleared = await db.prepare("SELECT linesman FROM lineups WHERE team_id = ? AND calendar_id = 's3-r1'").bind(TEAM).first<{ linesman: string | null }>();
    expect(cleared!.linesman).toBeNull();
  });

  it("nabídne aktivní vůdce kotle klubu", async () => {
    expect(await loadLinesmanFanLeaders(db, TEAM)).toEqual([{ id: "fl-1", name: 'Pepa „Buben" Bubeník', groupName: "Prales Boys" }]);
  });
});

describe("podklad pro stránku sestavy", () => {
  it("doma nabídne volbu s uloženým pomezním a počtem nadržování, venku ne", async () => {
    await run("INSERT INTO matches (id, calendar_id, home_team_id, away_team_id, status) VALUES ('next-home', 's3-r5', ?, ?, 'lineups_open')", TEAM, OTHER);
    await run("INSERT INTO matches (id, calendar_id, home_team_id, away_team_id, status) VALUES ('next-away', 's3-r6', ?, ?, 'lineups_open')", OTHER, TEAM);
    await run("INSERT INTO matches (id, calendar_id, home_team_id, away_team_id, home_lineup_data) VALUES ('done', 's3-r1', ?, ?, ?)", TEAM, OTHER, lineupData("homer"));
    // Na tohle kolo sestava není: platí poslední uložená.
    await run("INSERT INTO lineups (id, team_id, calendar_id, is_auto, submitted_at, linesman) VALUES ('last', ?, 's3-r1', 0, '2026-09-01', ?)",
      TEAM, JSON.stringify({ kind: "fan_leader", id: "fl-1", style: "homer" }));

    const home = await loadLinesmanOverview(db, TEAM, "s3-r5");
    expect(home).toMatchObject({
      applies: true, current: { kind: "fan_leader", id: "fl-1", style: "homer" }, homerUses: 1,
      limit: LINESMAN_BIAS_LIMIT, fine: LINESMAN_BIAS_FINE,
    });
    expect(home.fanLeaders.map((l) => l.id)).toEqual(["fl-1"]);

    expect(await loadLinesmanOverview(db, TEAM, "s3-r6")).toMatchObject({ applies: false, current: null, fanLeaders: [] });
  });
});

describe("pomezní před výkopem", () => {
  it("načte pomezního ze sestavy domácích a spočítá posun", async () => {
    await run("INSERT INTO lineups (id, team_id, calendar_id, is_auto, submitted_at, linesman) VALUES ('l1', ?, 's3-r2', 0, '2026-09-01', ?)",
      TEAM, JSON.stringify({ kind: "fan_leader", id: "fl-1", style: "homer" }));
    const r = await resolveMatchLinesman(db, { matchId: "m-x", calendarId: "s3-r2", homeTeamId: TEAM, refereeStrictness: 0, playingIds: new Set(XI) });
    expect(r).not.toBeNull();
    expect(r!.stored).toMatchObject({ kind: "fan_leader", id: "fl-1", name: 'Pepa „Buben" Bubeník', style: "homer" });
    expect(r!.tilt).toBe(r!.stored.swapped ? 0 : LINESMAN_TILT.homer);
  });

  it("hráč, který nakonec nastoupil, pomezním není", async () => {
    await run("INSERT INTO lineups (id, team_id, calendar_id, is_auto, submitted_at, linesman) VALUES ('l2', ?, 's3-r3', 0, '2026-09-01', ?)",
      TEAM, JSON.stringify({ kind: "player", id: "p-inj", style: "homer" }));
    expect(await resolveMatchLinesman(db, { matchId: "m-y", calendarId: "s3-r3", homeTeamId: TEAM, refereeStrictness: 50, playingIds: new Set([...XI, "p-inj"]) })).toBeNull();
  });

  it("sestava bez pomezního vrátí null", async () => {
    await run("INSERT INTO lineups (id, team_id, calendar_id, is_auto, submitted_at) VALUES ('l3', ?, 's3-r4', 0, '2026-09-01')", TEAM);
    expect(await resolveMatchLinesman(db, { matchId: "m-z", calendarId: "s3-r4", homeTeamId: TEAM, refereeStrictness: 50, playingIds: new Set(XI) })).toBeNull();
  });
});

describe("opakovaný nadržující pomezní za sezónu", () => {
  async function homeMatch(id: string, cal: string, style: "fair" | "homer" | null, home = TEAM) {
    await run("INSERT INTO matches (id, calendar_id, home_team_id, away_team_id, home_lineup_data) VALUES (?, ?, ?, ?, ?)",
      id, cal, home, home === TEAM ? OTHER : TEAM, lineupData(style));
  }

  it("počítá jen nadržující pomezní domácích v téhle sezóně", async () => {
    await homeMatch("old-1", "s2-r1", "homer");
    await homeMatch("old-2", "s2-r2", "homer");
    await homeMatch("m1", "s3-r1", "homer");
    await homeMatch("m2", "s3-r2", "fair");
    await homeMatch("m3", "s3-r3", null);
    await homeMatch("m4", "s3-r4", "homer", OTHER);
    await run("INSERT INTO matches (id, calendar_id, home_team_id, away_team_id, home_lineup_data) VALUES ('m-bad', 's3-r5', ?, ?, 'nečitelné')", TEAM, OTHER);
    expect(await countHomerLinesmen(db, { teamId: TEAM, leagueId: LEAGUE, seasonNumber: 3 })).toBe(1);
  });

  it("třetí nadržující pomezní v sezóně je skutek linesman_bias, druhý ještě ne", async () => {
    await homeMatch("m1", "s3-r1", "homer");
    await homeMatch("m2", "s3-r2", "homer");
    const second = await punishLinesmanBias(db, { matchId: "m2", teamId: TEAM, leagueId: LEAGUE, seasonNumber: 3, gameDate: "2026-09-02" });
    expect(second).toEqual({ uses: 2, sanctioned: false });
    expect(issued).toHaveLength(0);

    await homeMatch("m3", "s3-r3", "homer");
    const third = await punishLinesmanBias(db, { matchId: "m3", teamId: TEAM, leagueId: LEAGUE, seasonNumber: 3, gameDate: "2026-09-03" });
    expect(third).toEqual({ uses: LINESMAN_BIAS_LIMIT, sanctioned: true });
    expect(issued).toHaveLength(1);
    expect(issued[0]).toMatchObject({
      kind: LINESMAN_BIAS_KIND, teamId: TEAM, leagueId: LEAGUE, seasonNumber: 3, amount: LINESMAN_BIAS_FINE,
      issuedBy: "rule", referenceId: "linesman-bias-m3", gameDate: "2026-09-03",
    });
    expect(String(issued[0].reason)).not.toContain("—");

    // Opakovaný běh téhož zápasu (retry fronty) pokutu podruhé neudělí.
    const retry = await punishLinesmanBias(db, { matchId: "m3", teamId: TEAM, leagueId: LEAGUE, seasonNumber: 3, gameDate: "2026-09-03" });
    expect(retry.sanctioned).toBe(false);
    expect(issued).toHaveLength(1);
  });
});
