/**
 * Kasa pokut nad skutečnou D1 (Miniflare): hospoda pro kluky se platí nejdřív z kasy,
 * zbytek z rozpočtu klubu; kasa nejde do mínusu.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { Miniflare } from "miniflare";
import { readFileSync } from "node:fs";
import { budgetShareOfSquadPub, paySquadPub } from "./fund";

let miniflare: Miniflare;
let db: D1Database;

beforeAll(async () => {
  miniflare = new Miniflare({ modules: true, script: "export default { fetch() { return new Response('ok'); } }", d1Databases: ["DB"] });
  db = await miniflare.getD1Database("DB");
  await db.prepare("CREATE TABLE teams (id TEXT PRIMARY KEY, budget INTEGER NOT NULL DEFAULT 0, fine_fund_balance INTEGER NOT NULL DEFAULT 0)").run();
  await db.prepare("CREATE TABLE transactions (id TEXT PRIMARY KEY, team_id TEXT, type TEXT, amount INTEGER, balance_after INTEGER, description TEXT, reference_id TEXT, game_date TEXT, created_at TEXT DEFAULT (datetime('now')))").run();
  await db.exec(readFileSync(new URL("../../migrations/0341_fine_fund_spends.sql", import.meta.url), "utf8")
    .replace(/--[^\n]*/g, "").replace(/\n/g, " "));
}, 30_000);

afterAll(async () => { await miniflare.dispose(); });

beforeEach(async () => {
  for (const t of ["fine_fund_spends", "transactions", "teams"]) await db.prepare(`DELETE FROM ${t}`).run();
});

const team = async (budget: number, fund: number) =>
  db.prepare("INSERT INTO teams (id, budget, fine_fund_balance) VALUES ('club', ?, ?)").bind(budget, fund).run();
const state = async () => db.prepare("SELECT budget, fine_fund_balance AS fund FROM teams WHERE id = 'club'").first<{ budget: number; fund: number }>();
const pub = (cost: number) => paySquadPub(db, { fundTeamId: "club", budgetTeamId: "club", cost, description: "Hospoda", gameDate: "2026-12-01T10:00:00Z" });

describe("hospoda z kasy pokut", () => {
  it("když kasa stačí, klub neplatí nic a útrata je zapsaná", async () => {
    await team(10_000, 2_000);
    expect(await pub(1_500)).toEqual({ fromFund: 1_500, fromBudget: 0 });
    expect(await state()).toEqual({ budget: 10_000, fund: 500 });
    const spends = (await db.prepare("SELECT amount_czk, description, game_date FROM fine_fund_spends").all()).results;
    expect(spends).toEqual([{ amount_czk: 1_500, description: "Hospoda", game_date: "2026-12-01" }]);
    expect((await db.prepare("SELECT COUNT(*) AS n FROM transactions").first<{ n: number }>())?.n).toBe(0);
  });

  it("co v kase chybí, doplatí klub z rozpočtu", async () => {
    await team(10_000, 400);
    expect(await pub(1_500)).toEqual({ fromFund: 400, fromBudget: 1_100 });
    expect(await state()).toEqual({ budget: 8_900, fund: 0 });
    const txn = await db.prepare("SELECT amount, description FROM transactions").first();
    expect(txn).toEqual({ amount: -1_100, description: "Hospoda (doplatek ke kase pokut)" });
  });

  it("prázdná kasa: celé platí klub, bez řádku útraty", async () => {
    await team(10_000, 0);
    expect(await pub(600)).toEqual({ fromFund: 0, fromBudget: 600 });
    expect(await state()).toEqual({ budget: 9_400, fund: 0 });
    expect((await db.prepare("SELECT COUNT(*) AS n FROM fine_fund_spends").first<{ n: number }>())?.n).toBe(0);
    expect(await db.prepare("SELECT description FROM transactions").first()).toEqual({ description: "Hospoda" });
  });

  it("předběžná kontrola rozpočtu počítá jen doplatek", async () => {
    await team(300, 1_300);
    expect(await budgetShareOfSquadPub(db, "club", 1_500)).toBe(200);
    expect(await budgetShareOfSquadPub(db, "club", 500)).toBe(0);
  });

  it("dvě útraty po sobě kasu nedostanou do mínusu", async () => {
    await team(10_000, 1_000);
    await pub(600);
    expect(await pub(600)).toEqual({ fromFund: 400, fromBudget: 200 });
    expect(await state()).toEqual({ budget: 9_800, fund: 0 });
  });
});
