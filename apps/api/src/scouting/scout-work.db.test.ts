/**
 * Skaut na úkolu na skutečné D1 (Miniflare, všechny migrace).
 *
 * Starší testy (multi-scout.test.ts) mockovaly databázi, takže prošly i dotazy na sloupce,
 * které ve schématu nejsou (players.village_id, players.face_config, teams.formation,
 * teams.city). Na produkci pak úkoly „Sledovat hráče“, „U21 liga“, „Naše liga“ a „Rozbor
 * soupeře“ nikdy nic neudělaly, jen se strhávalo cestovné (prověrka 2026-10-24).
 */
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { Miniflare } from "miniflare";
import { Hono } from "hono";
import type { Bindings } from "../index";
import { createSession } from "../auth/session";
import { logger } from "../lib/logger";
import { scoutingRouter } from "../routes/scouting";
import { recordTransaction } from "../season/finance-processor";
import {
  createLeagueScoutAssignment, createMatchScoutAssignment, createPlayerScoutAssignment, createScoutAssignment, runScoutWork,
} from "./scout-work";

const app = new Hono<{ Bindings: Bindings }>();
app.route("/api", scoutingRouter);

let mf: Miniflare;
let db: D1Database;
let env: Bindings;

/** Čtvrtek, kdy manažer úkoly zadá, a pondělí, kdy skauti pracují (staff tick). */
const THURSDAY = "2026-10-22T16:00:00.000Z";
const MONDAY = "2026-10-26T16:00:00.000Z";

const BUYER = "t-buyer";
const BUYER_U21 = "t-buyer-u21";
const OPP_A = "t-opp-a";
const OPP_B = "t-opp-b";
const OPP_A_U21 = "t-opp-a-u21";
const SENIOR_LEAGUE = "l-senior";
const U21_LEAGUE = "l-u21";
const START_BUDGET = 50_000;

const SKILLS = {
  speed: 40, technique: 45, shooting: 42, passing: 44, heading: 38, defense: 35, goalkeeping: 10,
  stamina: 50, strength: 45, vision: 40, creativity: 41, setPieces: 30,
};
const skillsMax = Object.fromEntries(Object.entries(SKILLS).map(([k, v]) => [k, { current: v, maxPotential: v + 15 }]));

beforeAll(async () => {
  mf = new Miniflare({
    modules: true,
    script: "export default { fetch() { return new Response('ok'); } }",
    d1Databases: ["DB"],
    kvNamespaces: ["SESSION_KV", "CACHE_KV"],
  });
  db = await mf.getD1Database("DB");
  env = { DB: db, SESSION_KV: await mf.getKVNamespace("SESSION_KV"), CACHE_KV: await mf.getKVNamespace("CACHE_KV") } as unknown as Bindings;
  const dir = new URL("../../migrations/", import.meta.url);
  for (const file of readdirSync(dir).filter((f) => f.endsWith(".sql")).sort()) {
    const source = readFileSync(new URL(file, dir), "utf8").replace(/--[^\n]*/g, "").replace(/\n/g, " ");
    await db.exec(source);
  }
}, 120_000);

afterAll(async () => { await mf.dispose(); });

async function insertPlayer(id: string, teamId: string, o: { age: number; position: string; rating: number; first?: string; last?: string }) {
  await db.prepare(
    `INSERT INTO players (id, team_id, first_name, last_name, age, position, overall_rating, skills, physical, personality,
       life_context, avatar, skills_max, hidden_talent, status)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 45, 'active')`,
  ).bind(
    id, teamId, o.first ?? "Jan", o.last ?? `Hráč${id}`, o.age, o.position, o.rating,
    JSON.stringify(SKILLS), JSON.stringify({ height: 180, weight: 78, preferredFoot: "right" }),
    JSON.stringify({ workRate: 70, loyalty: 55, alcohol: 20, temper: 40, leadership: 50, discipline: 60 }),
    JSON.stringify({ morale: 60, condition: 90, occupation: "zedník" }),
    JSON.stringify({ id: `face-${id}`, body: { id: "body", color: "#f2d6cb", size: 1 } }),
    JSON.stringify(skillsMax),
  ).run();
}

/** Čistý stav: klub kupce s áčkem i dorostem, dva soupeři v lize a dorost soupeře v U21 lize. */
async function seed() {
  for (const t of [
    "transactions", "messages", "conversations", "scout_reports", "scout_assignments", "outside_players", "outside_clubs",
    "ai_negotiation_events", "ai_negotiations", "lineups", "staff_members", "players", "managers",
  ]) {
    await db.prepare(`DELETE FROM ${t}`).run();
  }
  await db.prepare("DELETE FROM teams").run();
  await db.prepare("DELETE FROM leagues").run();
  await db.prepare("DELETE FROM seasons").run();
  await db.batch([
    db.prepare("INSERT OR IGNORE INTO users (id, email, password_hash) VALUES ('u-buyer', 'buyer@example.test', 'x'), ('u-opp', 'opp@example.test', 'x')"),
    db.prepare("INSERT INTO seasons (id, number, status) VALUES ('s-1', 1, 'active')"),
    db.prepare("INSERT INTO leagues (id, season_id, district, name, level) VALUES (?, 's-1', 'Prachatice', 'Okresní přebor', 'okresni_prebor')").bind(SENIOR_LEAGUE),
    db.prepare("INSERT INTO leagues (id, season_id, district, name, level, league_type) VALUES (?, 's-1', 'Prachatice U21', 'Okresní přebor U21', 'okresni_prebor', 'u21')").bind(U21_LEAGUE),
    db.prepare(
      `INSERT INTO teams (id, user_id, village_id, name, budget, league_id, team_type, parent_team_id, game_date) VALUES
       (?, 'u-buyer', 'p06', 'FK Vlachovo Březí', ?, ?, 'senior', NULL, ?),
       (?, 'u-buyer', 'p06', 'FK Vlachovo Březí U21', 0, ?, 'u21', ?, ?),
       (?, 'u-opp', 'p07', 'SK Čkyně', 30000, ?, 'senior', NULL, ?),
       (?, 'u-opp', 'p05', 'TJ Lhenice', 30000, ?, 'senior', NULL, ?),
       (?, 'u-opp', 'p07', 'SK Čkyně U21', 0, ?, 'u21', ?, ?)`,
    ).bind(
      BUYER, START_BUDGET, SENIOR_LEAGUE, THURSDAY,
      BUYER_U21, U21_LEAGUE, BUYER, THURSDAY,
      OPP_A, SENIOR_LEAGUE, THURSDAY,
      OPP_B, SENIOR_LEAGUE, THURSDAY,
      OPP_A_U21, U21_LEAGUE, OPP_A, THURSDAY,
    ),
  ]);
  // Kupec má slabý kádr (laťka sestavy 20), takže skaut v okolí vždycky někoho nahlásí.
  for (let i = 0; i < 12; i++) await insertPlayer(`b${i}`, BUYER, { age: 25, position: ["GK", "DEF", "MID", "FWD"][i % 4], rating: 20 });
  await insertPlayer("a-star", OPP_A, { age: 26, position: "MID", rating: 58, first: "Petr", last: "Rychlý" });
  await insertPlayer("a-weak", OPP_A, { age: 30, position: "DEF", rating: 31, first: "Karel", last: "Pomalý" });
  await insertPlayer("b-fwd", OPP_B, { age: 24, position: "FWD", rating: 49, first: "Josef", last: "Střelec" });
  await insertPlayer("y-talent", OPP_A_U21, { age: 18, position: "MID", rating: 38, first: "Adam", last: "Mladý" });
  await insertPlayer("y-keeper", OPP_A_U21, { age: 19, position: "GK", rating: 33, first: "Tomáš", last: "Chytal" });
  // Soupeř hraje 3-5-2 (poslední uložená sestava).
  await db.prepare(
    "INSERT INTO lineups (id, team_id, calendar_id, formation, tactic, players_data, submitted_at, is_auto) VALUES ('lu-a', ?, 'cal-1', '3-5-2', 'balanced', '[]', '2026-10-20T10:00:00Z', 0)",
  ).bind(OPP_A).run();
  for (const id of ["sc-area", "sc-player", "sc-match", "sc-u21", "sc-league"]) {
    await db.prepare(
      `INSERT INTO staff_members (id, district, team_id, role, profession, first_name, last_name, age, judgement, communication, weekly_wage, signing_fee, avatar, hired_at)
       VALUES (?, 'Prachatice', ?, 'skaut', 'skaut', 'Karel', ?, 50, 14, 12, 300, 1000, '{}', '2026-10-01')`,
    ).bind(id, BUYER, `Skaut-${id}`).run();
  }
}

async function assignment(id: string) {
  return db.prepare("SELECT * FROM scout_assignments WHERE id = ?").bind(id).first<{
    status: string; weeks_worked: number; reports_sent: number; result_data: string | null; last_work_game_date: string | null;
  }>();
}

async function reportsOf(assignmentId: string) {
  return (await db.prepare("SELECT * FROM scout_reports WHERE assignment_id = ?").bind(assignmentId).all<{
    id: string; first_name: string; last_name: string; age: number; player_data: string; ask_hint: number | null;
  }>()).results;
}

async function scoutSms(): Promise<string[]> {
  const rows = await db.prepare(
    "SELECT m.body FROM messages m JOIN conversations c ON c.id = m.conversation_id WHERE c.team_id = ? AND c.title = 'Skaut' ORDER BY m.sent_at",
  ).bind(BUYER).all<{ body: string }>();
  return rows.results.map((r) => r.body);
}

function ok<T extends { ok: boolean }>(res: T): Extract<T, { ok: true }> {
  if (!res.ok) throw new Error(`úkol se nezadal: ${JSON.stringify(res)}`);
  return res as Extract<T, { ok: true }>;
}

describe("týden práce nad skutečným schématem", () => {
  beforeEach(seed);

  it("každý typ úkolu odvede týden práce a pošle hlášení", async () => {
    const area = ok(await createScoutAssignment(db, {
      teamId: BUYER, staffId: "sc-area", positions: null, ageMin: 18, ageMax: 32, radiusKm: 30, weeks: 2, gameDate: THURSDAY,
    }));
    const player = ok(await createPlayerScoutAssignment(db, { teamId: BUYER, staffId: "sc-player", targetPlayerId: "a-star", gameDate: THURSDAY }));
    const match = ok(await createMatchScoutAssignment(db, { teamId: BUYER, staffId: "sc-match", targetTeamId: OPP_A, gameDate: THURSDAY }));
    const u21 = ok(await createLeagueScoutAssignment(db, { teamId: BUYER, staffId: "sc-u21", assignmentType: "u21_league", weeks: 2, gameDate: THURSDAY }));
    const league = ok(await createLeagueScoutAssignment(db, { teamId: BUYER, staffId: "sc-league", assignmentType: "league", weeks: 2, gameDate: THURSDAY }));

    const work = await runScoutWork(env, { gameDate: MONDAY });
    expect(work.teams).toBe(5);

    // Oblast: týden odpracovaný a jedno hlášení z klubu mimo hru.
    expect(await assignment(area.id)).toMatchObject({ status: "active", weeks_worked: 1, reports_sent: 1 });
    expect(await reportsOf(area.id)).toHaveLength(1);

    // Sledování hráče: hotovo, hlášení o tom, koho manažer chtěl.
    expect(await assignment(player.id)).toMatchObject({ status: "finished", weeks_worked: 1, reports_sent: 1 });
    const [playerReport] = await reportsOf(player.id);
    expect(`${playerReport.first_name} ${playerReport.last_name}`).toBe("Petr Rychlý");

    // Rozbor soupeře: hotovo, rozestavení ze skutečné sestavy soupeře.
    const matchRow = await assignment(match.id);
    expect(matchRow).toMatchObject({ status: "finished", weeks_worked: 1, reports_sent: 1 });
    expect(JSON.parse(matchRow!.result_data!)).toMatchObject({ opponentId: OPP_A, formation: "3-5-2" });
    expect((await scoutSms()).some((s) => s.includes("SK Čkyně") && s.includes("3-5-2"))).toBe(true);

    // U21 liga: hlášení o mladíkovi z dorostu soupeře, ne o hráči z áčka.
    expect(await assignment(u21.id)).toMatchObject({ status: "active", weeks_worked: 1, reports_sent: 1 });
    const [u21Report] = await reportsOf(u21.id);
    expect(["Adam", "Tomáš"]).toContain(u21Report.first_name);
    expect(u21Report.age).toBeLessThanOrEqual(21);

    // Naše liga: hlášení o hráči soupeře z ligy.
    expect(await assignment(league.id)).toMatchObject({ status: "active", weeks_worked: 1, reports_sent: 1 });
    const [leagueReport] = await reportsOf(league.id);
    expect(["Rychlý", "Pomalý", "Střelec"]).toContain(leagueReport.last_name);
  });

  it("stránka skauta nabídne soupeře z ligy k rozboru", async () => {
    const token = await createSession(env.SESSION_KV, "u-buyer", "buyer@example.test", BUYER);
    const res = await app.request(`/api/teams/${BUYER}/scout`, { headers: { Authorization: `Bearer ${token}` } }, env);
    expect(res.status).toBe(200);
    const body = await res.json() as { opponents: Array<{ id: string; name: string; city: string | null }> };
    expect(body.opponents.map((o) => o.name).sort()).toEqual(["SK Čkyně", "TJ Lhenice"]);
    expect(body.opponents.find((o) => o.id === OPP_A)?.city).toBe("Čkyně");
  });
});

/** D1, která na dotazu odpovídajícím `pattern` spadne (výpadek uprostřed týdenní práce). */
function failingDb(pattern: RegExp): D1Database {
  return new Proxy(db, {
    get(target, prop) {
      if (prop === "prepare") {
        return (sql: string) => {
          if (pattern.test(sql)) throw new Error("simulovaný výpadek D1");
          return target.prepare(sql);
        };
      }
      const value = Reflect.get(target, prop, target);
      return typeof value === "function" ? value.bind(target) : value;
    },
  });
}

async function travelOf(assignmentId: string) {
  return (await db.prepare("SELECT amount, description FROM transactions WHERE type = 'scout_travel' AND reference_id = ?")
    .bind(assignmentId).all<{ amount: number; description: string }>()).results;
}

async function budget(): Promise<number> {
  return (await db.prepare("SELECT budget FROM teams WHERE id = ?").bind(BUYER).first<{ budget: number }>())!.budget;
}

describe("cestovné až po odvedené práci", () => {
  beforeEach(seed);
  afterEach(() => { vi.restoreAllMocks(); });

  it("když týdenní práce spadne, cestovné se nestrhne a chyba se zaloguje", async () => {
    const errors = vi.spyOn(logger, "error");
    const league = ok(await createLeagueScoutAssignment(db, { teamId: BUYER, staffId: "sc-league", assignmentType: "league", weeks: 2, gameDate: THURSDAY }));
    const area = ok(await createScoutAssignment(db, {
      teamId: BUYER, staffId: "sc-area", positions: null, ageMin: 18, ageMax: 32, radiusKm: 30, weeks: 2, gameDate: THURSDAY,
    }));
    const player = ok(await createPlayerScoutAssignment(db, { teamId: BUYER, staffId: "sc-player", targetPlayerId: "a-star", gameDate: THURSDAY }));

    await runScoutWork({ DB: failingDb(/INSERT INTO scout_reports/) }, { gameDate: MONDAY });

    expect(await budget()).toBe(START_BUDGET);
    for (const id of [league.id, area.id, player.id]) {
      expect(await travelOf(id)).toEqual([]);
      expect(await assignment(id)).toMatchObject({ status: "active", weeks_worked: 0, reports_sent: 0 });
    }
    expect(errors.mock.calls.filter(([ctx]) => ctx.module === "scouting")).toHaveLength(3);
  });

  it("sledování hráče a rozbor se platí až po práci, týdenní úkoly po odvedeném týdnu", async () => {
    const player = ok(await createPlayerScoutAssignment(db, { teamId: BUYER, staffId: "sc-player", targetPlayerId: "a-star", gameDate: THURSDAY }));
    const match = ok(await createMatchScoutAssignment(db, { teamId: BUYER, staffId: "sc-match", targetTeamId: OPP_A, gameDate: THURSDAY }));
    const u21 = ok(await createLeagueScoutAssignment(db, { teamId: BUYER, staffId: "sc-u21", assignmentType: "u21_league", weeks: 2, gameDate: THURSDAY }));
    const area = ok(await createScoutAssignment(db, {
      teamId: BUYER, staffId: "sc-area", positions: null, ageMin: 18, ageMax: 32, radiusKm: 15, weeks: 2, gameDate: THURSDAY,
    }));
    // Zadání nic nestojí.
    expect(await budget()).toBe(START_BUDGET);

    await runScoutWork(env, { gameDate: MONDAY });

    expect(await travelOf(player.id)).toEqual([{ amount: -500, description: "Cestovné skauta: sledování hráče Petr Rychlý" }]);
    expect(await travelOf(match.id)).toEqual([{ amount: -500, description: "Cestovné skauta: zápasový rozbor soupeře SK Čkyně" }]);
    expect(await travelOf(u21.id)).toEqual([{ amount: -500, description: "Cestovné skauta (U21 liga)" }]);
    expect(await travelOf(area.id)).toEqual([{ amount: -1500, description: "Cestovné skauta (okruh 15 km)" }]);
    expect(await budget()).toBe(START_BUDGET - 3000);
  });

  it("mise zaplacená už při zadání (starý kód) se po práci nestrhne podruhé", async () => {
    const player = ok(await createPlayerScoutAssignment(db, { teamId: BUYER, staffId: "sc-player", targetPlayerId: "a-star", gameDate: THURSDAY }));
    await recordTransaction(db, BUYER, "scout_travel", -500, "Cestovné skauta: sledování hráče Petr Rychlý", THURSDAY, player.id);

    await runScoutWork(env, { gameDate: MONDAY });

    expect(await assignment(player.id)).toMatchObject({ status: "finished", reports_sent: 1 });
    expect(await travelOf(player.id)).toHaveLength(1);
    expect(await budget()).toBe(START_BUDGET - 500);
  });

  it("bez peněz na cestovné skaut na misi nejede a nic se nestrhne", async () => {
    const player = ok(await createPlayerScoutAssignment(db, { teamId: BUYER, staffId: "sc-player", targetPlayerId: "a-star", gameDate: THURSDAY }));
    await db.prepare("UPDATE teams SET budget = 200 WHERE id = ?").bind(BUYER).run();

    await runScoutWork(env, { gameDate: MONDAY });

    expect(await travelOf(player.id)).toEqual([]);
    expect(await budget()).toBe(200);
    expect(await assignment(player.id)).toMatchObject({ status: "cancelled", reports_sent: 0 });
    expect((await scoutSms()).some((s) => s.includes("nejsou peníze"))).toBe(true);
  });
});
