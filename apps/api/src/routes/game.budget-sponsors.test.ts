import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { Miniflare } from "miniflare";
import type { Bindings } from "../index";
import { gameRouter } from "./game";

/**
 * Sponzor vyplácí každé pondělí měsíční částku / 4,3 × 2 (finance-processor). Přehled
 * financí dřív ukazoval u každé smlouvy jen měsíční částku / 4,3, tedy polovinu, a řádky
 * smluv se nesčítaly se souhrnem „Sponzorské smlouvy“ na téže stránce, který ×2 měl.
 * Rozhodnutí majitele: peníze chodí dál stejně, opraví se jen to, co hra ukazuje.
 */

let miniflare: Miniflare;
let db: D1Database;
let env: Bindings;

beforeAll(async () => {
  miniflare = new Miniflare({
    modules: true,
    script: "export default { fetch() { return new Response('ok'); } }",
    d1Databases: ["DB"],
    kvNamespaces: ["SESSION_KV", "CACHE_KV"],
  });
  db = await miniflare.getD1Database("DB");
  const sessionKv = await miniflare.getKVNamespace("SESSION_KV") as unknown as KVNamespace;
  const cacheKv = await miniflare.getKVNamespace("CACHE_KV") as unknown as KVNamespace;

  for (const sql of [
    "CREATE TABLE villages (id TEXT PRIMARY KEY, name TEXT, size TEXT, population INTEGER, district TEXT)",
    "CREATE TABLE teams (id TEXT PRIMARY KEY, user_id TEXT, village_id TEXT, budget INTEGER, reputation INTEGER, training_sessions INTEGER)",
    "CREATE TABLE players (id TEXT PRIMARY KEY, team_id TEXT, first_name TEXT, last_name TEXT, position TEXT, overall_rating INTEGER, weekly_wage INTEGER, status TEXT)",
    "CREATE TABLE sponsor_contracts (id TEXT PRIMARY KEY, team_id TEXT, sponsor_name TEXT, sponsor_type TEXT, category TEXT, monthly_amount INTEGER, win_bonus INTEGER, status TEXT)",
    "CREATE TABLE village_team_favor (id TEXT PRIMARY KEY, team_id TEXT, official_id TEXT, favor INTEGER)",
    "CREATE TABLE staff_members (id TEXT PRIMARY KEY, team_id TEXT, weekly_wage INTEGER)",
    "CREATE TABLE cash_loans (id TEXT PRIMARY KEY, team_id TEXT, principal INTEGER, total_to_repay INTEGER, remaining INTEGER, total_installments INTEGER, installments_paid INTEGER, per_match_installment INTEGER, status TEXT)",
    "CREATE TABLE seasons (id TEXT PRIMARY KEY, number INTEGER, status TEXT)",
    "CREATE TABLE transfer_installments (id TEXT PRIMARY KEY, buyer_team_id TEXT, seller_team_id TEXT, installment_amount INTEGER, installments_total INTEGER, installments_paid INTEGER, remaining INTEGER, status TEXT)",
    "INSERT INTO villages VALUES ('v1', 'Testov', 'village', 800, 'Prachatice')",
    "INSERT INTO teams VALUES ('t1', 'u1', 'v1', 50000, 50, 2)",
    "INSERT INTO players VALUES ('p1', 't1', 'Jan', 'Novák', 'MID', 40, 200, NULL)",
    "INSERT INTO sponsor_contracts VALUES ('s1', 't1', 'Hospoda U Lípy', 'hospoda', 'main', 12900, 500, 'active')",
    "INSERT INTO sponsor_contracts VALUES ('s2', 't1', 'Autoservis Kolář', 'firma', 'banner', 4300, 0, 'active')",
  ]) {
    await db.prepare(sql).run();
  }
  await sessionKv.put("session:owner-token", JSON.stringify({ userId: "u1", email: "u1@test.local", teamId: "t1", createdAt: "2026-10-08" }));
  env = { DB: db, SESSION_KV: sessionKv, CACHE_KV: cacheKv, GEMINI_API_KEY: "" } as unknown as Bindings;
});

afterAll(async () => {
  await miniflare.dispose();
});

async function budget(): Promise<Record<string, any>> {
  const ctx = { waitUntil() {}, passThroughOnException() {} } as unknown as ExecutionContext;
  const r = await gameRouter.fetch(new Request("http://test.local/teams/t1/budget", {
    headers: { Authorization: "Bearer owner-token" },
  }), env, ctx);
  expect(r.status).toBe(200);
  return r.json() as Promise<Record<string, any>>;
}

describe("přehled financí: sponzorské smlouvy", () => {
  it("každá smlouva ukazuje, kolik sponzor opravdu týdně vyplácí", async () => {
    const b = await budget();
    const byName = Object.fromEntries((b.sponsors as Array<{ name: string; weeklyAmount: number }>).map((s) => [s.name, s.weeklyAmount]));
    // 12 900 Kč měsíčně ve smlouvě = 12 900 / 4,3 × 2 = 6 000 Kč na účet každé pondělí
    expect(byName["Hospoda U Lípy"]).toBe(6000);
    expect(byName["Autoservis Kolář"]).toBe(2000);
  });

  it("řádky smluv dají dohromady souhrn sponzorských smluv", async () => {
    const b = await budget();
    const rows = (b.sponsors as Array<{ weeklyAmount: number }>).reduce((sum, s) => sum + s.weeklyAmount, 0);
    expect(rows).toBe(b.weekly.income.sponsors);
  });
});

/**
 * Měsíční částku ze smlouvy na týdenní příjem dřív přepočítávalo několik míst po svém
 * (monthly / 4,3) a všechna ukazovala polovinu. Teď jde všechno přes sponsorWeeklyPayout.
 */
const DISPLAYS = [
  "apps/web/src/lib/sponsor-format.ts",
  "apps/web/src/app/(hra)/sponzori/page.tsx",
  "apps/api/src/routes/game.ts",
];

describe.each(DISPLAYS)("%s", (file) => {
  it("nepřepočítává měsíční částku sponzora na týdenní bez násobitele výplaty", () => {
    const source = readFileSync(join(__dirname, "..", "..", "..", "..", file), "utf-8");
    expect(/onthly(Amount)? \/ 4\.3\)(?! \* SPONSOR_PAYOUT_MULTIPLIER)/.test(source)).toBe(false);
  });
});
