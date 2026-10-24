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
import { loadMatchMods } from "../equipment/match-mods";
import { logger } from "../lib/logger";
import { scoutingRouter } from "../routes/scouting";
import { recordTransaction } from "../season/finance-processor";
import { executeStaffTick } from "../staff/staff-tick";
import {
  createLeagueScoutAssignment, createMatchScoutAssignment, createPlayerScoutAssignment, createScoutAssignment, maintainScoutReports,
  refundUnworkedScoutTravel, runScoutWork,
} from "./scout-work";

const app = new Hono<{ Bindings: Bindings }>();
app.route("/api", scoutingRouter);

let mf: Miniflare;
let db: D1Database;
let env: Bindings;

/** Čtvrtek, kdy manažer úkoly zadá, a pondělí, kdy skauti pracují (staff tick). */
const THURSDAY = "2026-10-22T16:00:00.000Z";
const FRIDAY = "2026-10-23T16:00:00.000Z";
const SATURDAY = "2026-10-24T16:00:00.000Z";
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

  it("bez peněz na cestovné skaut na misi nejede a nic se nestrhne (zrušeno s vysvětlením)", async () => {
    const player = ok(await createPlayerScoutAssignment(db, { teamId: BUYER, staffId: "sc-player", targetPlayerId: "a-star", gameDate: THURSDAY }));
    await db.prepare("UPDATE teams SET budget = 200 WHERE id = ?").bind(BUYER).run();

    await runScoutWork(env, { gameDate: MONDAY });

    expect(await travelOf(player.id)).toEqual([]);
    expect(await budget()).toBe(200);
    expect(await assignment(player.id)).toMatchObject({ status: "cancelled", reports_sent: 0 });
    expect((await scoutSms()).some((s) => s.includes("nejsou peníze"))).toBe(true);
  });
});

describe("rozbor soupeře a mise do dvou dnů", () => {
  beforeEach(seed);

  it("mise skaut odvede za dva dny i mimo pondělí, týdenní úkoly čekají na pondělí", async () => {
    const player = ok(await createPlayerScoutAssignment(db, { teamId: BUYER, staffId: "sc-player", targetPlayerId: "a-star", gameDate: THURSDAY }));
    const match = ok(await createMatchScoutAssignment(db, { teamId: BUYER, staffId: "sc-match", targetTeamId: OPP_A, gameDate: THURSDAY }));
    const league = ok(await createLeagueScoutAssignment(db, { teamId: BUYER, staffId: "sc-league", assignmentType: "league", weeks: 2, gameDate: THURSDAY }));

    await runScoutWork(env, { gameDate: FRIDAY, missionsOnly: true });
    expect(await assignment(player.id)).toMatchObject({ status: "active", weeks_worked: 0 });
    expect(await assignment(match.id)).toMatchObject({ status: "active", weeks_worked: 0 });

    await runScoutWork(env, { gameDate: SATURDAY, missionsOnly: true });
    expect(await assignment(player.id)).toMatchObject({ status: "finished", reports_sent: 1 });
    expect(await assignment(match.id)).toMatchObject({ status: "finished", reports_sent: 1 });
    expect(await assignment(league.id)).toMatchObject({ status: "active", weeks_worked: 0 });
  });

  it("denní staff tick pošle skauta na misi, v sobotu týdenní úkol nepracuje", async () => {
    const match = ok(await createMatchScoutAssignment(db, { teamId: BUYER, staffId: "sc-match", targetTeamId: OPP_A, gameDate: THURSDAY }));
    const league = ok(await createLeagueScoutAssignment(db, { teamId: BUYER, staffId: "sc-league", assignmentType: "league", weeks: 2, gameDate: THURSDAY }));
    await db.prepare("INSERT OR REPLACE INTO game_clock (id, offset_days) VALUES (1, 0)").run();

    await executeStaffTick(env, new Date(SATURDAY));

    expect(await assignment(match.id)).toMatchObject({ status: "finished", reports_sent: 1 });
    expect(await assignment(league.id)).toMatchObject({ status: "active", weeks_worked: 0 });
  });

  it("hotový rozbor dá v lize +2 techniku a +3 morálku jen proti rozebranému soupeři", async () => {
    const match = ok(await createMatchScoutAssignment(db, { teamId: BUYER, staffId: "sc-match", targetTeamId: OPP_A, gameDate: THURSDAY }));
    await runScoutWork(env, { gameDate: MONDAY });

    const scouted = await loadMatchMods(db, BUYER, true, OPP_A);
    const other = await loadMatchMods(db, BUYER, true, OPP_B);
    expect(scouted.techniqueMod - other.techniqueMod).toBe(2);
    expect(scouted.moraleMod - other.moraleMod).toBe(3);

    const data = JSON.parse((await assignment(match.id))!.result_data!) as Record<string, unknown>;
    expect(data).toMatchObject({ techniqueBonus: 2, moraleBonus: 3 });
    expect(data).not.toHaveProperty("tacticalBonus");
    // Co formulář slibuje: rozestavení a styl, klíčový hráč, slabé místo a bonus.
    const sms = (await scoutSms()).find((s) => s.startsWith("📋"))!;
    expect(sms).toContain("3-5-2 a taktiku „Vyrovnaná“");
    expect(sms).toContain("Petr Rychlý (záložník, hodnocení 58)");
    expect(sms).toContain("Slabé místo: Karel Pomalý (obránce)");
    expect(sms).toContain("+2 technika a +3 morálka");
    expect(sms).not.toMatch(/[—–]/);
  });

  it("bonus z rozboru po 14 dnech skončí, i když hranice padne na týž den", async () => {
    const match = ok(await createMatchScoutAssignment(db, { teamId: BUYER, staffId: "sc-match", targetTeamId: OPP_A, gameDate: THURSDAY }));
    await runScoutWork(env, { gameDate: MONDAY });
    // Hotovo před 14 dny a kusem dne: dřív se `closed_at` (s T) porovnával jako text
    // s datetime() (s mezerou) a na hraničním dni bonus platil dál.
    const edgeDay = new Date(Date.now() - 14 * 86_400_000).toISOString().slice(0, 10);
    await db.prepare("UPDATE scout_assignments SET closed_at = ? WHERE id = ?").bind(`${edgeDay}T00:00:00Z`, match.id).run();

    const scouted = await loadMatchMods(db, BUYER, true, OPP_A);
    const other = await loadMatchMods(db, BUYER, true, OPP_B);
    expect(scouted.techniqueMod).toBe(other.techniqueMod);
    expect(scouted.moraleMod).toBe(other.moraleMod);
  });
});

describe("hlášení o hráči, který hraje ve hře", () => {
  beforeEach(seed);

  async function asBuyer(path: string, init?: RequestInit) {
    const token = await createSession(env.SESSION_KV, "u-buyer", "buyer@example.test", BUYER);
    return app.request(path, { ...init, headers: { ...(init?.headers ?? {}), Authorization: `Bearer ${token}`, "Content-Type": "application/json" } }, env);
  }

  it("vede na profil hráče a s klubem se o něm jednat nedá (žádný klon hráče)", async () => {
    const league = ok(await createLeagueScoutAssignment(db, { teamId: BUYER, staffId: "sc-league", assignmentType: "league", weeks: 2, gameDate: THURSDAY }));
    const player = ok(await createPlayerScoutAssignment(db, { teamId: BUYER, staffId: "sc-player", targetPlayerId: "a-star", gameDate: THURSDAY }));
    await runScoutWork(env, { gameDate: MONDAY });

    const [leagueReport] = await reportsOf(league.id);
    const [playerReport] = await reportsOf(player.id);
    expect(JSON.parse(playerReport.player_data).gamePlayerId).toBe("a-star");
    expect(["a-star", "a-weak", "b-fwd"]).toContain(JSON.parse(leagueReport.player_data).gamePlayerId);
    // Cenu a ochotu u hráče ve hře neurčuje klub mimo hru, skaut je nevymýšlí.
    expect(leagueReport.ask_hint).toBeNull();

    const list = await (await asBuyer(`/api/teams/${BUYER}/scout`)).json() as { reports: Array<{ id: string; gamePlayerId: string | null }> };
    expect(list.reports.find((r) => r.id === playerReport.id)?.gamePlayerId).toBe("a-star");

    const detail = await (await asBuyer(`/api/teams/${BUYER}/scout/reports/${playerReport.id}`)).json() as {
      report: { gamePlayerId: string | null; willingness: unknown; askHint: number | null };
    };
    expect(detail.report).toMatchObject({ gamePlayerId: "a-star", willingness: null, askHint: null });

    const res = await asBuyer(`/api/teams/${BUYER}/scout/reports/${playerReport.id}/negotiate`, {
      method: "POST", body: JSON.stringify({ amount: 10_000 }),
    });
    expect(res.status).toBe(400);
    expect(((await res.json()) as { error: string }).error).toContain("profilu");
    expect((await db.prepare("SELECT COUNT(*) AS n FROM ai_negotiations").first<{ n: number }>())!.n).toBe(0);
    expect((await db.prepare("SELECT status FROM scout_reports WHERE id = ?").bind(playerReport.id).first<{ status: string }>())!.status).toBe("active");
  });

  it("ligový skaut nehlásí stejného hráče dvakrát za sebou", async () => {
    const league = ok(await createLeagueScoutAssignment(db, { teamId: BUYER, staffId: "sc-league", assignmentType: "league", weeks: 2, gameDate: THURSDAY }));
    await runScoutWork(env, { gameDate: MONDAY });
    await runScoutWork(env, { gameDate: "2026-11-02T16:00:00.000Z" });

    const ids = (await reportsOf(league.id)).map((r) => JSON.parse(r.player_data).gamePlayerId as string);
    expect(ids).toHaveLength(2);
    expect(new Set(ids).size).toBe(2);
  });

  it("hráče ve hře nesebere náhodou klub mimo hru, hlášení zmizí, až hráč ve hře nebude", async () => {
    const player = ok(await createPlayerScoutAssignment(db, { teamId: BUYER, staffId: "sc-player", targetPlayerId: "a-star", gameDate: THURSDAY }));
    await runScoutWork(env, { gameDate: MONDAY });
    const [report] = await reportsOf(player.id);

    // Dřív ho údržba hlášení sebrala s šancí 3 % denně („sebral ho jiný klub“).
    for (let i = 0; i < 300; i++) await maintainScoutReports(db, undefined);
    expect((await db.prepare("SELECT status FROM scout_reports WHERE id = ?").bind(report.id).first<{ status: string }>())!.status).toBe("active");

    await db.prepare("DELETE FROM players WHERE id = 'a-star'").run();
    await maintainScoutReports(db, undefined);
    expect((await db.prepare("SELECT status FROM scout_reports WHERE id = ?").bind(report.id).first<{ status: string }>())!.status).toBe("gone");
  });
});

describe("vrácení cestovného za úkoly bez práce", () => {
  beforeEach(seed);

  /** Úkol a jeho stržení tak, jak je na produkci zapsal starý kód (bez práce). */
  async function oldTask(id: string, staffId: string, type: string, status: string, charges: Array<{ id: string; at: string; amount?: number }>) {
    await db.prepare(
      `INSERT INTO scout_assignments (id, team_id, staff_id, assignment_type, age_min, age_max, radius_km, weekly_cost, weeks_total, status, started_game_date)
       VALUES (?, ?, ?, ?, 16, 21, 0, 500, 4, ?, '2026-10-05T16:00:00.000Z')`,
    ).bind(id, BUYER, staffId, type, status).run();
    for (const c of charges) {
      await db.prepare(
        "INSERT INTO transactions (id, team_id, type, amount, balance_after, description, reference_id, game_date, created_at) VALUES (?, ?, 'scout_travel', ?, 0, 'Cestovné skauta', ?, '2026-10-12', ?)",
      ).bind(c.id, BUYER, c.amount ?? -500, id, c.at).run();
    }
  }

  it("vrátí každé stržení za úkol bez práce jednou, práci po opravě a doručitelné mise ne", async () => {
    await oldTask("u21-old", "sc-u21", "u21_league", "active", [{ id: "tx-1", at: "2026-10-12 05:00:03" }, { id: "tx-2", at: "2026-10-19 05:00:04" }]);
    await oldTask("league-old", "sc-league", "league", "active", [
      { id: "tx-3", at: "2026-10-19 05:00:05" },
      // Týden odpracovaný po nasazení opravy se platí normálně.
      { id: "tx-after-fix", at: "2026-10-26 05:00:06" },
    ]);
    await oldTask("player-cancelled", "sc-player", "player", "cancelled", [{ id: "tx-4", at: "2026-10-09 14:07:49" }]);
    // Aktivní mise zaplacená při zadání: hlášení po opravě dostane, nevrací se.
    await oldTask("player-active", "sc-match", "player", "active", [{ id: "tx-5", at: "2026-10-22 09:05:17" }]);
    // Oblast fungovala, nevrací se.
    await oldTask("area-ok", "sc-area", "area", "active", [{ id: "tx-6", at: "2026-10-19 05:00:01", amount: -3000 }]);
    const before = "2026-10-25T12:00:00.000Z";

    const dry = await refundUnworkedScoutTravel(db, { before, apply: false });
    expect(dry.refunds.map((r) => r.transactionId).sort()).toEqual(["tx-1", "tx-2", "tx-3", "tx-4"]);
    expect(dry.total).toBe(2000);
    expect(await budget()).toBe(START_BUDGET);

    const done = await refundUnworkedScoutTravel(db, { before, apply: true });
    expect(done.total).toBe(2000);
    expect(await budget()).toBe(START_BUDGET + 2000);
    const refundRows = (await db.prepare(
      "SELECT reference_id, amount, description FROM transactions WHERE type = 'scout_travel' AND amount > 0 ORDER BY reference_id",
    ).all<{ reference_id: string; amount: number; description: string }>()).results;
    expect(refundRows.map((r) => [r.reference_id, r.amount])).toEqual([["tx-1", 500], ["tx-2", 500], ["tx-3", 500], ["tx-4", 500]]);
    expect(refundRows[0].description).toBe("Vráceno cestovné skauta: úkol bez práce (U21 liga)");

    // Druhý běh nic nevrátí.
    expect((await refundUnworkedScoutTravel(db, { before, apply: true })).total).toBe(0);
    expect(await budget()).toBe(START_BUDGET + 2000);
  });
});
