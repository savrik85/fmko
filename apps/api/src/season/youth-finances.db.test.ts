/**
 * Dorost (U21) nemá vlastní pokladnu: mzdy a tréninky platí mateřský klub
 * a dorost nedostává vlastní dotaci obce ani podporu místních podnikatelů.
 *
 * Běží nad skutečnou SQLite (Miniflare) přes skutečné pondělní zpracování financí.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { Miniflare } from "miniflare";
import { clubAccountOf, processTrainingCost, processWeeklyFinances } from "./finance-processor";

let mf: Miniflare;
let db: D1Database;

const MONDAY = "2026-11-09T16:00:00.000Z";

beforeAll(async () => {
  mf = new Miniflare({ modules: true, script: "export default { fetch() { return new Response('ok'); } }", d1Databases: ["DB"] });
  db = await mf.getD1Database("DB");
  for (const sql of [
    "CREATE TABLE teams (id TEXT PRIMARY KEY, name TEXT, team_type TEXT, parent_team_id TEXT, reputation INTEGER, budget INTEGER)",
    "CREATE TABLE players (id TEXT PRIMARY KEY, team_id TEXT, weekly_wage INTEGER, status TEXT)",
    "CREATE TABLE staff_members (id TEXT PRIMARY KEY, team_id TEXT, role TEXT, coaching INTEGER, medicine INTEGER, maintenance INTEGER, judgement INTEGER, communication INTEGER, work_rate INTEGER, charm INTEGER, weekly_wage INTEGER)",
    "CREATE TABLE sponsor_contracts (id TEXT PRIMARY KEY, team_id TEXT, monthly_amount INTEGER, status TEXT, category TEXT)",
    "CREATE TABLE village_team_favor (team_id TEXT, official_id TEXT, favor INTEGER)",
    "CREATE TABLE stadiums (team_id TEXT PRIMARY KEY, refreshments INTEGER, concession_mode TEXT)",
    "CREATE TABLE transactions (id TEXT PRIMARY KEY, team_id TEXT, type TEXT, amount INTEGER, balance_after INTEGER, description TEXT, reference_id TEXT, game_date TEXT)",
  ]) await db.prepare(sql).run();
});

afterAll(async () => { await mf.dispose(); });

beforeEach(async () => {
  for (const t of ["teams", "players", "transactions"]) await db.prepare(`DELETE FROM ${t}`).run();
  await db.batch([
    db.prepare("INSERT INTO teams VALUES ('club', 'Jitona Spůle', 'senior', NULL, 50, 100000), ('youth', 'Jitona Spůle U21', 'u21', 'club', 50, 20000)"),
    // Áčko: 2 hráči po 500 Kč. Dorost: 3 hráči po 100 Kč, jeden propuštěný mzdu nebere.
    db.prepare(
      `INSERT INTO players VALUES ('a1', 'club', 500, 'active'), ('a2', 'club', 500, NULL),
         ('y1', 'youth', 100, 'active'), ('y2', 'youth', 100, 'active'), ('y3', 'youth', 100, NULL), ('y4', 'youth', 100, 'released')`,
    ),
  ]);
});

const budgetOf = async (teamId: string) =>
  (await db.prepare("SELECT budget FROM teams WHERE id = ?").bind(teamId).first<{ budget: number }>())!.budget;
const ledger = async (teamId: string) =>
  (await db.prepare("SELECT type, amount, description FROM transactions WHERE team_id = ? ORDER BY rowid").bind(teamId)
    .all<{ type: string; amount: number; description: string }>()).results;

describe("z jakého účtu se platí", () => {
  it("dorost platí mateřský klub, áčko samo za sebe", async () => {
    expect(await clubAccountOf(db, "youth")).toEqual({ payerId: "club", isYouth: true });
    expect(await clubAccountOf(db, "club")).toEqual({ payerId: "club", isYouth: false });
  });

  it("neznámý tým a dorost bez mateřského klubu platí sám za sebe", async () => {
    expect(await clubAccountOf(db, "ghost")).toEqual({ payerId: "ghost", isYouth: false });
    await db.prepare("UPDATE teams SET parent_team_id = NULL WHERE id = 'youth'").run();
    expect(await clubAccountOf(db, "youth")).toEqual({ payerId: "youth", isYouth: false });
  });
});

describe("pondělní finance dorostu", () => {
  it("mzdy dorostu se strhnou klubu a v jeho knize jsou označené", async () => {
    await processWeeklyFinances(db, "youth", MONDAY, "hamlet");
    const club = await ledger("club");
    expect(club).toEqual([{ type: "wage", amount: -300, description: "Týdenní mzdy, dorost U21: 3 hráčů" }]);
    expect(await budgetOf("club")).toBe(100000 - 300);
    expect((await ledger("youth")).filter((t) => t.type === "wage")).toEqual([]);
  });

  it("dorost nedostane dotaci obce ani podporu místních podnikatelů", async () => {
    await processWeeklyFinances(db, "youth", MONDAY, "hamlet");
    const youth = await ledger("youth");
    expect(youth.filter((t) => t.description.startsWith("Dotace od obce"))).toEqual([]);
    expect(youth.filter((t) => t.type === "sponsor_income")).toEqual([]);
    // Co na účtu dorostu zůstává: údržba, vybavení a členské příspěvky. Nic z toho se nemění.
    expect(youth.map((t) => t.type).sort()).toEqual(["equipment_expense", "other", "pitch_maintenance"]);
    expect(youth.find((t) => t.type === "other")?.description).toBe("Členské příspěvky: 3 hráčů");
  });

  it("áčku se nic nemění: vlastní mzdy, dotace i podpora podnikatelů", async () => {
    await processWeeklyFinances(db, "club", MONDAY, "hamlet");
    const club = await ledger("club");
    expect(club.find((t) => t.type === "wage")).toEqual({ type: "wage", amount: -1000, description: "Týdenní mzdy: 2 hráčů" });
    // Reputace 50: 5 000 Kč měsíčně, tedy 1 163 Kč týdně. Vesnice a přízeň 50: 6 000 Kč měsíčně, 1 395 Kč týdně.
    expect(club.find((t) => t.type === "sponsor_income")).toEqual({ type: "sponsor_income", amount: 1163, description: "Podpora místních podnikatelů" });
    expect(club.find((t) => t.description === "Dotace od obce")?.amount).toBe(1395);
    expect(await ledger("youth")).toEqual([]);
  });

  it("týden klubu s dorostem: mzdy obou mužstev na jednom účtu", async () => {
    await processWeeklyFinances(db, "club", MONDAY, "hamlet");
    await processWeeklyFinances(db, "youth", MONDAY, "hamlet");
    const wages = (await ledger("club")).filter((t) => t.type === "wage");
    expect(wages.map((t) => t.amount)).toEqual([-1000, -300]);
  });
});

describe("trénink dorostu", () => {
  it("platí ho klub a v knize je vidět, že jde o dorost", async () => {
    const youthBefore = await budgetOf("youth");
    await processTrainingCost(db, "youth", MONDAY, "hamlet");
    expect(await ledger("club")).toEqual([{ type: "training_cost", amount: -200, description: "Trénink, dorost U21" }]);
    expect(await budgetOf("youth")).toBe(youthBefore);
  });

  it("trénink áčka se účtuje jako dřív", async () => {
    await processTrainingCost(db, "club", MONDAY, "hamlet");
    expect(await ledger("club")).toEqual([{ type: "training_cost", amount: -200, description: "Trénink" }]);
  });
});
