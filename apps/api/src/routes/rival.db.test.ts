/**
 * Profil soupeře (/api/teams/:teamId/rival/:rivalId) na skutečné D1 (Miniflare, všechny migrace).
 * Vzájemné zápasy ze všech soutěží, střelci proti sobě, sezóna jen z aktuálního ročníku ligy,
 * rozestavení soupeře a skautský rozbor jen pro majitele.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { Miniflare } from "miniflare";
import { Hono } from "hono";
import { createSession } from "../auth/session";
import type { Bindings } from "../index";
import { rivalRouter } from "./rival";

const app = new Hono<{ Bindings: Bindings }>();
app.route("/api", rivalRouter);

let mf: Miniflare;
let db: D1Database;
let env: Bindings;
let mine: string;
let other: string;

function get(path: string, token?: string): Promise<Response> {
  return Promise.resolve(app.request(path, { headers: token ? { Authorization: `Bearer ${token}` } : {} }, env));
}

const goal = (minute: number, side: 1 | 2) => ({ minute, type: "goal", teamId: side, playerName: "x" });
const lineup = (formation: string, tactic: string) => JSON.stringify({ starters: [], subs: [], formation, tactic });

function player(id: string, team: string, position: string, rating: number) {
  return db.prepare(
    `INSERT INTO players (id, team_id, first_name, last_name, age, position, overall_rating, skills, physical, personality, life_context, avatar)
     VALUES (?, ?, 'Jan', ?, 25, ?, ?, '{}', '{}', '{}', '{}', '{}')`,
  ).bind(id, team, `Hráč-${id}`, position, rating);
}

function stat(id: string, match: string, playerId: string, team: string, goals: number, extra: { yellow?: number; red?: number } = {}) {
  return db.prepare(
    "INSERT INTO match_player_stats (id, match_id, player_id, team_id, goals, yellow_cards, red_cards) VALUES (?, ?, ?, ?, ?, ?, ?)",
  ).bind(id, match, playerId, team, goals, extra.yellow ?? 0, extra.red ?? 0);
}

function match(id: string, calendar: string | null, home: string, away: string, hs: number | null, as: number | null, opts: {
  status?: string; simulatedAt?: string; events?: unknown[]; homeLineup?: string; awayLineup?: string; round?: number;
} = {}) {
  return db.prepare(
    `INSERT INTO matches (id, league_id, calendar_id, round, home_team_id, away_team_id, home_score, away_score, status, simulated_at, events, home_lineup_data, away_lineup_data)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).bind(id, calendar ? "L1" : null, calendar, opts.round ?? null, home, away, hs, as, opts.status ?? "simulated",
    opts.simulatedAt ?? null, opts.events ? JSON.stringify(opts.events) : null, opts.homeLineup ?? null, opts.awayLineup ?? null);
}

beforeAll(async () => {
  mf = new Miniflare({
    modules: true, script: "export default { fetch() { return new Response('ok'); } }",
    d1Databases: ["DB"], kvNamespaces: ["SESSION_KV", "CACHE_KV"],
  });
  db = await mf.getD1Database("DB");
  env = { DB: db, SESSION_KV: await mf.getKVNamespace("SESSION_KV"), CACHE_KV: await mf.getKVNamespace("CACHE_KV") } as unknown as Bindings;
  const dir = new URL("../../migrations/", import.meta.url);
  for (const file of readdirSync(dir).filter((f) => f.endsWith(".sql")).sort()) {
    await db.exec(readFileSync(new URL(file, dir), "utf8").replace(/--[^\n]*/g, "").replace(/\n/g, " "));
  }

  await db.batch([
    db.prepare("INSERT INTO users (id, email, password_hash) VALUES ('u-mine', 'mine@example.test', 'x'), ('u-other', 'other@example.test', 'x'), ('u-third', 'third@example.test', 'x')"),
    db.prepare("INSERT INTO villages (id, name, district, region, population, size, lat, lng) VALUES ('v1', 'Lhota', 'Prachatice', 'Jihočeský', 300, 'village', 49, 14)"),
    // Migrace zakládají první sezónu samy.
    db.prepare("INSERT OR IGNORE INTO seasons (id, number) VALUES ('s1', 1)"),
    // Přátelák a turnaj se do sezóny řadí podle data jejího začátku.
    db.prepare("UPDATE seasons SET created_at = '2026-06-01 00:00:00' WHERE number = 1"),
    db.prepare("INSERT INTO leagues (id, season_id, district, name) VALUES ('L1', (SELECT id FROM seasons WHERE number = 1), 'Prachatice', 'Okresní přebor')"),
    db.prepare(`INSERT INTO teams (id, user_id, village_id, name, league_id) VALUES
      ('mine', 'u-mine', 'v1', 'Sokol Lhota', 'L1'), ('rival', 'u-other', 'v1', 'FK Zbytiny', 'L1'), ('third', 'u-third', 'v1', 'TJ Třetí', 'L1')`),
    db.prepare(`INSERT INTO season_calendar (id, league_id, season_number, game_week, match_day, scheduled_at) VALUES
      ('c0', 'L1', 0, 1, 'saturday', '2026-05-01T16:00:00Z'),
      ('c1', 'L1', 1, 1, 'saturday', '2026-09-01T16:00:00Z'),
      ('c2', 'L1', 1, 2, 'saturday', '2026-09-08T16:00:00Z'),
      ('c3', 'L1', 1, 3, 'saturday', '2026-09-15T16:00:00Z'),
      ('c4', 'L1', 1, 4, 'saturday', '2026-12-01T17:00:00Z')`),
  ]);

  await db.batch([
    player("pm1", "mine", "FWD", 60), player("pm2", "mine", "GK", 50),
    player("r1", "rival", "FWD", 55), player("r2", "rival", "DEF", 45), player("r3", "rival", "GK", 40),
    db.prepare("INSERT INTO departed_players (id, first_name, last_name, position, left_at) VALUES ('d1', 'Karel', 'Odešlý', 'MID', '2026-10-01')"),
  ]);

  await db.batch([
    // Loňský ročník: do vzájemných ano, do sezóny ne.
    match("m0", "c0", "rival", "mine", 0, 4, { simulatedAt: "2026-05-01T16:00:00Z", round: 1 }),
    match("m1", "c1", "mine", "rival", 3, 1, {
      simulatedAt: "2026-09-01T16:00:00Z", round: 1,
      events: [goal(10, 1), goal(30, 1), goal(50, 2), goal(80, 1)], awayLineup: lineup("4-4-2", "balanced"),
    }),
    match("m2", "c2", "rival", "mine", 2, 0, {
      simulatedAt: "2026-09-08T16:00:00Z", round: 2,
      events: [goal(5, 1), goal(89, 1)], homeLineup: lineup("4-5-1", "defensive"),
    }),
    match("m3", "c3", "rival", "third", 1, 1, {
      simulatedAt: "2026-09-15T16:00:00Z", round: 3,
      events: [goal(46, 1), goal(70, 2)], homeLineup: lineup("3-5-2", "offensive"),
    }),
    // Přátelák: vzájemný ano, sezóna ne, bez sestavy se do rozestavení nepočítá.
    match("m4", null, "mine", "rival", 1, 1, { simulatedAt: "2026-09-20T16:00:00Z" }),
    // Budoucí zápas do vzájemných nepatří.
    match("m5", "c4", "mine", "rival", null, null, { status: "scheduled", round: 4 }),
    db.prepare("INSERT INTO cup_competitions (id, season_number, name, total_rounds) VALUES ('cc1', 1, 'Okresní pohár', 3)"),
    db.prepare("INSERT INTO cup_teams (id, cup_id, team_id, name, strength) VALUES ('ct-mine', 'cc1', 'mine', 'Sokol Lhota', 50), ('ct-rival', 'cc1', 'rival', 'FK Zbytiny', 50)"),
    db.prepare(`INSERT INTO cup_matches (id, cup_id, round, bracket_pos, home_cup_team_id, away_cup_team_id, home_score, away_score, home_pens, away_pens, status, scheduled_at, simulated_at, home_lineup_data)
      VALUES ('cm1', 'cc1', 1, 0, 'ct-rival', 'ct-mine', 2, 2, 3, 4, 'simulated', '2026-09-10', '2026-09-10T10:00:00Z', ?)`).bind(lineup("5-3-2", "counter")),
    db.prepare(`INSERT INTO tournaments (id, edition, name, sponsor, city, venue_name, registration_deadline)
      VALUES ('t1', 99, 'Turnaj P-Mobile', 'P-Mobile', 'Prachatice', 'Hřiště', '2026-08-01')`),
    db.prepare(`INSERT INTO tournament_matches (id, tournament_id, stage, day, scheduled_at, home_team_id, away_team_id, home_score, away_score, status, simulated_at, away_lineup_data)
      VALUES ('tm1', 't1', 'qf', 1, '2026-09-25', 'mine', 'rival', 0, 1, 'simulated', '2026-09-25T10:00:00Z', ?)`).bind(lineup("4-3-3", "balanced")),
  ]);

  await db.batch([
    stat("s1", "m0", "pm1", "mine", 4),
    stat("s2", "m1", "pm1", "mine", 2), stat("s3", "m1", "r1", "rival", 1),
    stat("s4", "m2", "r1", "rival", 1, { red: 1 }), stat("s5", "m2", "d1", "rival", 1),
    stat("s6", "m3", "r1", "rival", 1), stat("s7", "m3", "r2", "rival", 0, { yellow: 2 }),
    stat("s8", "cm1", "r1", "ct-rival", 2), stat("s9", "cm1", "pm1", "ct-mine", 2),
    stat("s10", "tm1", "r2", "rival", 1),
  ]);

  await db.batch([
    db.prepare(`INSERT INTO staff_members (id, team_id, role, district, profession, first_name, last_name, age, weekly_wage, signing_fee, avatar)
      VALUES ('scout1', 'mine', 'skaut', 'Prachatice', 'skaut', 'Petr', 'Skaut', 50, 100, 0, '{}')`),
    db.prepare(`INSERT INTO scout_assignments (id, team_id, staff_id, age_min, age_max, radius_km, weekly_cost, weeks_total, status, started_game_date, assignment_type, target_team_id, result_data, closed_at)
      VALUES ('sa1', 'mine', 'scout1', 0, 99, 0, 500, 1, 'finished', '2026-11-20', 'match', 'rival', ?, strftime('%Y-%m-%dT%H:%M:%SZ','now'))`)
      .bind(JSON.stringify({ formation: "4-4-2", tactic: "Vyrovnaná", keyPlayer: "Jan Hráč-r1 (ÚTO, hodnocení 55)", weakPlayer: "Jan Hráč-r3 (BRA)", bonusUntil: "2099-01-01T00:00:00Z" })),
  ]);

  mine = await createSession(env.SESSION_KV, "u-mine", "mine@example.test", null);
  other = await createSession(env.SESSION_KV, "u-other", "other@example.test", null);
}, 120_000);

afterAll(async () => { await mf?.dispose(); });

describe("profil soupeře: přístup", () => {
  it("bez přihlášení 401, cizí tým 403", async () => {
    expect((await get("/api/teams/mine/rival/rival")).status).toBe(401);
    expect((await get("/api/teams/mine/rival/rival", other)).status).toBe(403);
  });

  it("sám se sebou 400, neznámý soupeř 404", async () => {
    expect((await get("/api/teams/mine/rival/mine", mine)).status).toBe(400);
    expect((await get("/api/teams/mine/rival/nikdo", mine)).status).toBe(404);
  });
});

describe("profil soupeře: obsah", () => {
  let p: any;
  beforeAll(async () => {
    const res = await get("/api/teams/mine/rival/rival", mine);
    expect(res.status).toBe(200);
    p = await res.json();
  });

  it("vzájemné zápasy ze všech soutěží, nejnovější první, bez neodehraného", () => {
    expect(p.headToHead.matches.map((m: any) => m.id)).toEqual(["tm1", "m4", "cm1", "m2", "m1", "m0"]);
    expect(p.headToHead.matches.map((m: any) => m.competition)).toEqual(["tournament", "friendly", "cup", "league", "league", "league"]);
    expect(p.headToHead.summary).toEqual({ played: 6, wins: 2, draws: 2, losses: 2, goalsFor: 10, goalsAgainst: 7 });
  });

  it("u každého zápasu sezóna: liga z kalendáře, pohár z ročníku, přátelák a turnaj podle data", () => {
    expect(p.headToHead.matches.map((m: any) => [m.id, m.season])).toEqual([
      ["tm1", 1], ["m4", 1], ["cm1", 1], ["m2", 1], ["m1", 1], ["m0", 0],
    ]);
  });

  it("zápas je z mého pohledu, pohár s penaltami", () => {
    const cup = p.headToHead.matches.find((m: any) => m.id === "cm1");
    expect(cup).toMatchObject({ isHome: false, myScore: 2, rivalScore: 2, myPens: 4, rivalPens: 3, result: "D", label: "Čtvrtfinále" });
    const m2 = p.headToHead.matches.find((m: any) => m.id === "m2");
    expect(m2).toMatchObject({ isHome: false, myScore: 0, rivalScore: 2, result: "L", label: "2. kolo" });
    expect(p.headToHead.matches.find((m: any) => m.id === "tm1").label).toBe("Turnaj P-Mobile, čtvrtfinále");
  });

  it("střelci ve vzájemných zápasech, i pohároví a odešlí", () => {
    expect(p.scorers.rival).toEqual([
      { playerId: "r1", name: "Jan Hráč-r1", goals: 4 },
      { playerId: "r2", name: "Jan Hráč-r2", goals: 1 },
      { playerId: null, name: "Karel Odešlý", goals: 1 },
    ]);
    expect(p.scorers.mine).toEqual([{ playerId: "pm1", name: "Jan Hráč-pm1", goals: 8 }]);
  });

  it("sezóna jen z aktuálního ročníku ligy", () => {
    expect(p.season.leagueName).toBe("Okresní přebor");
    expect(p.season.rival).toMatchObject({
      position: 1, points: 4,
      total: { played: 3, wins: 1, draws: 1, losses: 1, goalsFor: 4, goalsAgainst: 4 },
      home: { played: 2, wins: 1, draws: 1, losses: 0, goalsFor: 3, goalsAgainst: 1 },
      away: { played: 1, wins: 0, draws: 0, losses: 1, goalsFor: 1, goalsAgainst: 3 },
      form: ["D", "W", "L"],
    });
    expect(p.season.me).toMatchObject({ position: 2, points: 3 });
  });

  it("góly soupeře po čtvrthodinách a jeho karty v sezóně", () => {
    expect(p.rivalGoals).toEqual({ matches: 3, scored: [1, 0, 0, 2, 0, 1], conceded: [1, 1, 0, 0, 1, 1] });
    expect(p.rivalCards).toEqual({ matches: 3, yellow: 2, red: 1 });
  });

  it("řady obou týmů a nejlepší hráči soupeře s góly v lize", () => {
    expect(p.lines.rival).toEqual({ overall: 47, GK: 40, DEF: 45, MID: null, FWD: 55 });
    expect(p.lines.me).toEqual({ overall: 55, GK: 50, DEF: null, MID: null, FWD: 60 });
    expect(p.keyPlayers.map((k: any) => [k.id, k.rating, k.goals])).toEqual([["r1", 55, 3], ["r2", 45, 0], ["r3", 40, 0]]);
  });

  it("rozestavení z posledních pěti zápasů soupeře se sestavou, i proti jiným", () => {
    expect(p.formations.map((f: any) => [f.matchId, f.formation, f.opponentName])).toEqual([
      ["tm1", "4-3-3", "Sokol Lhota"],
      ["m3", "3-5-2", "TJ Třetí"],
      ["cm1", "5-3-2", "Sokol Lhota"],
      ["m2", "4-5-1", "Sokol Lhota"],
      ["m1", "4-4-2", "Sokol Lhota"],
    ]);
  });

  it("hotový skautský rozbor s platným bonusem", () => {
    expect(p.scoutReport).toMatchObject({ formation: "4-4-2", keyPlayer: "Jan Hráč-r1 (ÚTO, hodnocení 55)", bonusActive: true });
  });

  it("bez rozboru je scoutReport null", async () => {
    const res = await get("/api/teams/mine/rival/third", mine);
    const third = await res.json() as any;
    expect(third.scoutReport).toBeNull();
    expect(third.headToHead.summary.played).toBe(0);
  });
});
