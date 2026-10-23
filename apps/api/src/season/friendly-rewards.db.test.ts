import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { Miniflare } from "miniflare";
import { processMatchDayFinances } from "./finance-processor";

/**
 * Přátelák je trénink, za výsledek se v něm neplatí.
 *
 * Výhra v přáteláku dřív vyplatila sponzorský bonus za výhru, 500 Kč „od soutěže“
 * a bonus fanoušků. Přátelák jde domluvit každé tři dny, takže si dva manažeři mohli
 * bonusy točit dokola. Vstupné a bufet zůstávají, ty platí diváci.
 */

let miniflare: Miniflare;
let db: D1Database;

beforeAll(async () => {
  miniflare = new Miniflare({
    modules: true,
    script: "export default { fetch() { return new Response('ok'); } }",
    d1Databases: ["DB"],
  });
  db = await miniflare.getD1Database("DB");
  for (const sql of [
    "CREATE TABLE villages (id TEXT PRIMARY KEY, size TEXT)",
    "CREATE TABLE teams (id TEXT PRIMARY KEY, village_id TEXT, budget INTEGER, reputation INTEGER)",
    "CREATE TABLE transactions (id TEXT PRIMARY KEY, team_id TEXT, type TEXT, amount INTEGER, balance_after INTEGER, description TEXT, reference_id TEXT, game_date TEXT)",
    "CREATE TABLE sponsor_contracts (id TEXT PRIMARY KEY, team_id TEXT, monthly_amount INTEGER, win_bonus INTEGER, status TEXT)",
    "CREATE TABLE fans (id TEXT PRIMARY KEY, team_id TEXT, satisfaction INTEGER, loyalty INTEGER, expected_performance INTEGER, base_ticket_price INTEGER, last_match_delta INTEGER, last_match_reasons TEXT, updated_at TEXT)",
    // Zbytek jen kvůli tichému výstupu: zápasové finance sahají i sem, s prázdnými tabulkami jedou na výchozí hodnoty.
    "CREATE TABLE stadiums (team_id TEXT, concession_mode TEXT, pitch_condition INTEGER)",
    "CREATE TABLE equipment (team_id TEXT)",
    "CREATE TABLE concession_products (id TEXT PRIMARY KEY, team_id TEXT, product_key TEXT, quality_level INTEGER, sell_price INTEGER, stock_quantity INTEGER, stock_l1 INTEGER DEFAULT 0, stock_l2 INTEGER DEFAULT 0, stock_l3 INTEGER DEFAULT 0, updated_at TEXT, UNIQUE (team_id, product_key))",
    "CREATE TABLE staff_members (team_id TEXT, role TEXT, coaching INTEGER, medicine INTEGER, maintenance INTEGER, judgement INTEGER, communication INTEGER, work_rate INTEGER, charm INTEGER)",
    "CREATE TABLE managers (team_id TEXT, reputation INTEGER, motivation INTEGER)",
    "CREATE TABLE matches (id TEXT PRIMARY KEY, home_team_id TEXT, away_team_id TEXT, home_score INTEGER, away_score INTEGER, simulated_at TEXT, created_at TEXT, calendar_id TEXT)",
    "CREATE TABLE fans_match_history (id TEXT PRIMARY KEY, team_id TEXT, match_id TEXT, gamedate TEXT, satisfaction_before INTEGER, satisfaction_after INTEGER, delta INTEGER, reasons TEXT, opponent_name TEXT, result TEXT, attendance INTEGER)",
  ]) {
    await db.prepare(sql).run();
  }
});

afterAll(async () => {
  await miniflare.dispose();
});

beforeEach(async () => {
  await db.exec("DELETE FROM villages");
  await db.exec("DELETE FROM teams");
  await db.exec("DELETE FROM transactions");
  await db.exec("DELETE FROM sponsor_contracts");
  await db.exec("DELETE FROM fans");
  await db.batch([
    db.prepare("INSERT INTO villages VALUES ('v1', 'village')"),
    db.prepare("INSERT INTO teams VALUES ('t1', 'v1', 0, 50)"),
    db.prepare("INSERT INTO sponsor_contracts VALUES ('s1', 't1', 5000, 400, 'active')"),
  ]);
});

async function transactionsOf(type: string) {
  return (await db.prepare("SELECT amount FROM transactions WHERE team_id = 't1' AND type = ?")
    .bind(type).all<{ amount: number }>()).results;
}

describe("prémie za výsledek", () => {
  it("výhra v přáteláku nevyplatí sponzorský bonus, prémii ani bonus fanoušků", async () => {
    await processMatchDayFinances(db, "t1", "m1", true, "win", 60, "2026-10-01", 50, true);
    expect(await transactionsOf("match_reward")).toHaveLength(0);
  });

  it("remíza v přáteláku taky ne", async () => {
    await processMatchDayFinances(db, "t1", "m1", false, "draw", 60, "2026-10-01", 50, true);
    expect(await transactionsOf("match_reward")).toHaveLength(0);
  });

  it("vstupné z přáteláku zůstává", async () => {
    await processMatchDayFinances(db, "t1", "m1", true, "win", 60, "2026-10-01", 50, true);
    const income = await transactionsOf("match_income");
    expect(income).toHaveLength(1);
    expect(income[0].amount).toBeGreaterThan(0);
  });

  it("výhra v mistráku prémie vyplatí jako dřív", async () => {
    await processMatchDayFinances(db, "t1", "m1", true, "win", 60, "2026-10-01", 50, false);
    const reward = await transactionsOf("match_reward");
    expect(reward).toHaveLength(1);
    // sponzor 400 + soutěž 500 + fanoušci obce 100
    expect(reward[0].amount).toBe(1000);
  });
});
