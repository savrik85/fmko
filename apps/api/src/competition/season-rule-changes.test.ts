import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Miniflare } from "miniflare";
import { seasonRuleChanges } from "./season-rule-changes";

let miniflare: Miniflare;
let db: D1Database;

const passed = (id: string, kind: string, from: number, value: number, season: number, effective: number | null, closedAt: string) =>
  db.prepare(
    `INSERT INTO competition_proposals (id, league_id, season_number, kind, status, payload, effective_from_season, closed_at, created_at)
     VALUES (?, 'L', ?, ?, 'passed', ?, ?, ?, ?)`,
  ).bind(id, season, kind, JSON.stringify({ value, from }), effective, closedAt, closedAt).run();

beforeAll(async () => {
  miniflare = new Miniflare({ modules: true, script: "export default { fetch() { return new Response('ok'); } }", d1Databases: ["DB"] });
  db = await miniflare.getD1Database("DB");
  await db.prepare("CREATE TABLE competition_governance (league_id TEXT PRIMARY KEY, enabled INTEGER)").run();
  await db.prepare(
    `CREATE TABLE competition_rules (league_id TEXT, season_number INTEGER, levy_bet_pct REAL, bet_max_stake INTEGER,
     ban_own_owner_transfers INTEGER, place_decay REAL, cash_loan_max INTEGER)`,
  ).run();
  await db.prepare(
    `CREATE TABLE competition_proposals (id TEXT PRIMARY KEY, league_id TEXT, season_number INTEGER, kind TEXT, status TEXT,
     payload TEXT, effective_from_season INTEGER, closed_at TEXT, created_at TEXT)`,
  ).run();
  await db.prepare("INSERT INTO competition_governance VALUES ('L', 1), ('OFF', 0)").run();
  // Nová sezóna 3: odvod ze sázek 10 % (dvakrát odhlasovaný), strop sázky 10 000, zákaz transferů,
  // klíč 0,70. Strop půjčky se přes sezónu zvedl a zase vrátil na 40 000.
  await db.prepare("INSERT INTO competition_rules VALUES ('L', 3, 10, 10000, 1, 0.7, 40000)").run();
  await passed("p1", "levy_bet_pct", 0, 5, 2, 3, "2026-09-02");
  await passed("p2", "levy_bet_pct", 0, 10, 2, 3, "2026-09-09");
  await passed("p3", "bet_max_stake", 5000, 10000, 2, null, "2026-09-02");
  await passed("p4", "ban_own_owner_transfers", 0, 1, 2, null, "2026-09-02");
  await passed("p5", "place_decay", 0.8, 0.7, 2, 3, "2026-10-14");
  await passed("p6", "cash_loan_max", 40000, 250000, 2, null, "2026-09-02");
  await passed("p7", "cash_loan_max", 250000, 40000, 2, null, "2026-10-01");
  await passed("p8", "sanction", 0, 3000, 2, null, "2026-09-09");
  // Návrh z dřívější sezóny už není novinka.
  await passed("p9", "bet_max_stake", 2000, 5000, 1, null, "2026-07-01");
});
afterAll(async () => { await miniflare.dispose(); });

describe("pravidla od grémia v úvodu nové sezóny", () => {
  it("ukáže, co platí od téhle sezóny, a pod tím to, co už platí z minulé", async () => {
    const changes = await seasonRuleChanges(db, "L", 3);
    // Tisíce odděluje pevná mezera z toLocaleString("cs").
    expect(changes.map((c) => [c.kind, c.change.replace(/\u00a0/g, " "), c.fromThisSeason])).toEqual([
      ["levy_bet_pct", "0 % → 10 %", true],
      ["place_decay", "0.80 → 0.70", true],
      ["bet_max_stake", "5 000 Kč → 10 000 Kč", false],
      ["ban_own_owner_transfers", "nově platí", false],
    ]);
  });

  it("pravidlo vrácené na původní hodnotu a pokuty vynechá", async () => {
    const kinds = (await seasonRuleChanges(db, "L", 3)).map((c) => c.kind);
    expect(kinds).not.toContain("cash_loan_max");
    expect(kinds).not.toContain("sanction");
  });

  it("soutěž bez samosprávy nic neukáže", async () => {
    expect(await seasonRuleChanges(db, "OFF", 3)).toEqual([]);
  });
});
