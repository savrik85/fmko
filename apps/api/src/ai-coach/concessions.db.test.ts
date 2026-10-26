/**
 * Bufet AI klubů na skutečné D1 (Miniflare, všechny migrace).
 *
 * V pondělní správě model zvolí provoz bufetu a u každého produktu kvalitu, cenu a nákup;
 * kód hlídá meze a rezervu a nakupuje stejnou službou jako člověk (services/concessions.ts).
 * AI klub pak v domácím zápase opravdu prodává (finance zápasu) a před dalším domácím
 * zápasem si sklad dorovná. Neplatná volba produktu = náhradní pravidlo, shadow jen zapíše.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { Miniflare } from "miniflare";
import { Hono } from "hono";
import type { Bindings } from "../index";
import { createSession } from "../auth/session";
import { gameRouter } from "../routes/game";
import { processMatchDayFinances } from "../season/finance-processor";
import type { ProductKey } from "../season/concession-catalog";
import { fallbackProductChoice, salesFor, type ConcessionContext, type ConcessionTopUpPlan } from "./concession-decision";
import { loadConcessionContext, topUpConcessions } from "./concessions";
import { runAiCoachTask } from "./jobs";
import { COACH_MODE_KEY } from "./mode";
import { generateAiProfile, type AiCoachProfile } from "./profile";
import { loadWeeklyContext, runWeeklyReview } from "./weekly";

const app = new Hono<{ Bindings: Bindings }>();
app.route("/api", gameRouter);

let mf: Miniflare;
let db: D1Database;
let baseEnv: Bindings;
let villages: string[] = [];

const MONDAY = "2026-11-02";
/** Pondělní správa v 8:00 v Praze. */
const REVIEW_AT = new Date(`${MONDAY}T07:00:00.000Z`);
const THURSDAY_MATCH = "2026-11-05T17:00:00.000Z";
const SUNDAY = "2026-11-08";
const PAST_ATTENDANCE = [180, 200, 220];

/** Štědrý trenér (střední kvalita v náhradním pravidle). */
const profile = (over: Partial<AiCoachProfile> = {}): AiCoachProfile => ({ ...generateAiProfile("ai-stand", null), thrift: 30, ...over });

interface Product { product_key: string; quality_level: number; sell_price: number; stock_l1: number; stock_l2: number; stock_l3: number }

async function products(teamId: string): Promise<Record<string, Product>> {
  const rows = await db.prepare("SELECT product_key, quality_level, sell_price, stock_l1, stock_l2, stock_l3 FROM concession_products WHERE team_id = ?")
    .bind(teamId).all<Product>();
  return Object.fromEntries(rows.results.map((r) => [r.product_key, r]));
}

function stockOf(p: Product, level: number): number {
  return [0, p.stock_l1, p.stock_l2, p.stock_l3][level] ?? 0;
}

async function budgetOf(teamId: string): Promise<number> {
  return (await db.prepare("SELECT budget FROM teams WHERE id = ?").bind(teamId).first<{ budget: number }>())!.budget;
}

async function modeOf(teamId: string): Promise<string> {
  return (await db.prepare("SELECT concession_mode FROM stadiums WHERE team_id = ?").bind(teamId).first<{ concession_mode: string }>())!.concession_mode;
}

async function wholesale(teamId: string): Promise<Array<{ amount: number; description: string }>> {
  return (await db.prepare("SELECT amount, description FROM transactions WHERE team_id = ? AND type = 'concession_wholesale' ORDER BY rowid")
    .bind(teamId).all<{ amount: number; description: string }>()).results;
}

interface Logged { mode: string; used_fallback: number; error: string | null; actions: string | null; executed: string | null; input_summary: string | null }

async function lastLog(teamId: string, kind: string): Promise<Logged | null> {
  return db.prepare("SELECT mode, used_fallback, error, actions, executed, input_summary FROM ai_coach_decisions WHERE team_id = ? AND kind = ? ORDER BY created_at DESC, rowid DESC LIMIT 1")
    .bind(teamId, kind).first<Logged>();
}

async function logCount(teamId: string, kind: string): Promise<number> {
  return (await db.prepare("SELECT COUNT(*) AS n FROM ai_coach_decisions WHERE team_id = ? AND kind = ?").bind(teamId, kind).first<{ n: number }>())?.n ?? 0;
}

/**
 * AI klub s vlastním občerstvením L1 (zatím externí provozovatel), třemi odehranými a čtvrtečním
 * domácím zápasem. Každý klub má vlastní ligu, ať se kola klubů v testu nepletou.
 */
async function setupClub(id: string, budget: number, village: string, over: Partial<AiCoachProfile> = {}): Promise<void> {
  const league = `lg-${id}`;
  const stmts: D1PreparedStatement[] = [
    db.prepare("INSERT INTO leagues (id, season_id, district, name, level) VALUES (?, 'season-3', ?, 'Okresní přebor', 'okresni_prebor')")
      .bind(league, `Okres ${id}`),
    db.prepare("INSERT INTO teams (id, user_id, village_id, name, budget, reputation, league_id, game_date) VALUES (?, 'ai', ?, ?, ?, 50, ?, ?)")
      .bind(id, village, `Klub ${id}`, budget, league, `${MONDAY}T05:00:00.000Z`),
    db.prepare("INSERT INTO managers (id, user_id, team_id, name, backstory, avatar, ai_profile) VALUES (?, 'ai', ?, 'Jan Trenér', '', '{}', ?)")
      .bind(`mgr-${id}`, id, JSON.stringify(profile(over))),
    db.prepare("INSERT INTO stadiums (id, team_id, refreshments, concession_mode, pitch_condition) VALUES (?, ?, 1, 'external', 80)").bind(`st-${id}`, id),
  ];
  PAST_ATTENDANCE.forEach((attendance, i) => {
    const at = `2026-10-${12 + i * 7}T16:00:00.000Z`;
    stmts.push(
      db.prepare("INSERT INTO season_calendar (id, league_id, season_number, game_week, match_day, scheduled_at, status) VALUES (?, ?, 3, ?, 'monday', ?, 'simulated')")
        .bind(`cal-${id}-p${i}`, league, i + 1, at),
      db.prepare(`INSERT INTO matches (id, league_id, calendar_id, home_team_id, away_team_id, status, home_score, away_score, attendance, simulated_at)
                  VALUES (?, ?, ?, ?, 'opp', 'simulated', 1, 0, ?, ?)`).bind(`m-${id}-p${i}`, league, `cal-${id}-p${i}`, id, attendance, at),
    );
  });
  stmts.push(
    db.prepare("INSERT INTO season_calendar (id, league_id, season_number, game_week, match_day, scheduled_at, status) VALUES (?, ?, 3, 4, 'thursday', ?, 'scheduled')")
      .bind(`cal-${id}-thu`, league, THURSDAY_MATCH),
    db.prepare("INSERT INTO matches (id, league_id, calendar_id, home_team_id, away_team_id, status) VALUES (?, ?, ?, ?, 'opp', 'scheduled')")
      .bind(`m-${id}-thu`, league, `cal-${id}-thu`, id),
  );
  await db.batch(stmts);
}

interface FakeAi {
  weeklyPrompts: string[];
  weeklySchemas: Array<Record<string, unknown>>;
  env: Bindings;
}

/**
 * Workers AI: pondělní správě odpoví `weekly`, výběru hlavního sponzora i sponzora stadionu „nikoho“
 * (peníze ze smlouvy by rozhodily rozpočet), ostatním prázdným objektem.
 */
function fakeAi(weekly: unknown, onWeekly?: () => Promise<void>): FakeAi {
  const weeklyPrompts: string[] = [];
  const weeklySchemas: Array<Record<string, unknown>> = [];
  const ai = {
    run: async (_model: string, input: { messages: Array<{ role: string; content: string }>; response_format?: { json_schema?: { name?: string; schema?: Record<string, unknown> } } }) => {
      const name = input.response_format?.json_schema?.name;
      let answer: unknown = {};
      if (name === "weekly_decision") {
        weeklyPrompts.push(input.messages.find((m) => m.role === "user")?.content ?? "");
        weeklySchemas.push(input.response_format?.json_schema?.schema ?? {});
        if (onWeekly) await onWeekly();
        answer = weekly;
      } else if (name === "main_sponsor" || name === "stadium_sponsor") {
        answer = { choice: "none", reason: "not this week" };
      }
      return { choices: [{ message: { content: JSON.stringify(answer) } }], usage: { prompt_tokens: 10, completion_tokens: 5 } };
    },
  };
  return { weeklyPrompts, weeklySchemas, env: { ...baseEnv, AI: ai } as unknown as Bindings };
}

type ProductAnswer = { tier: number; price: number; buy: number };

/** Platná pondělní správa bez placených položek, s blokem bufetu. */
function weeklyAnswer(concessions: { mode: string; products: Partial<Record<ProductKey, ProductAnswer>> }): Record<string, unknown> {
  return {
    training: { focus: "mixed", intensity: "normal", sessions: 3, approach: "balanced" },
    ticketPrice: "keep", pitchMaintenance: "none", pitchCareMode: "keep",
    stadium: [], equipmentUpgrades: [], equipmentRepairs: [], hire: [], academy: "keep", banners: [], promote: [], sendDown: [],
    transfers: { stance: "hold", focus: [], sell: [] },
    concessions,
    reasoning: "Own bar pays off, beer is what people want.",
  };
}

function tierOf(c: ConcessionContext, key: ProductKey, level: number) {
  const tier = c.products.find((p) => p.key === key)?.tiers.find((t) => t.level === level);
  if (!tier) throw new Error(`v nabídce chybí ${key} L${level}`);
  return tier;
}

async function concessionState(teamId: string): Promise<{ c: ConcessionContext; reserve: number; spendable: number }> {
  const ctx = await loadWeeklyContext(db, teamId);
  if (!ctx) throw new Error(`kontext klubu ${teamId}`);
  return { c: ctx.concessions, reserve: ctx.finance.reserve, spendable: ctx.finance.spendable };
}

beforeAll(async () => {
  mf = new Miniflare({
    modules: true,
    script: "export default { fetch() { return new Response('ok'); } }",
    d1Databases: ["DB"],
    kvNamespaces: ["SESSION_KV", "CACHE_KV"],
  });
  db = await mf.getD1Database("DB");
  baseEnv = { DB: db, SESSION_KV: await mf.getKVNamespace("SESSION_KV"), CACHE_KV: await mf.getKVNamespace("CACHE_KV") } as unknown as Bindings;
  const dir = new URL("../../migrations/", import.meta.url);
  for (const file of readdirSync(dir).filter((f) => f.endsWith(".sql")).sort()) {
    const source = readFileSync(new URL(file, dir), "utf8").replace(/--[^\n]*/g, "").replace(/\n/g, " ");
    await db.exec(source);
  }
  villages = (await db.prepare("SELECT id FROM villages WHERE district = 'Prachatice' ORDER BY id LIMIT 8").all<{ id: string }>()).results.map((r) => r.id);
  await db.batch([
    db.prepare("INSERT INTO users (id, email, password_hash) VALUES ('u-human', 'human@example.test', 'x')"),
    db.prepare("INSERT INTO seasons (id, number, status) VALUES ('season-3', 3, 'active')"),
    db.prepare("INSERT INTO teams (id, user_id, village_id, name, budget, reputation, game_date) VALUES ('opp', 'ai', ?, 'Soupeř', 50000, 50, ?)")
      .bind(villages[0], `${MONDAY}T05:00:00.000Z`),
    db.prepare("INSERT INTO teams (id, user_id, village_id, name, budget, reputation, game_date) VALUES ('human', 'u-human', ?, 'Jiskra', 50000, 50, ?)")
      .bind(villages[1], `${MONDAY}T05:00:00.000Z`),
    db.prepare("INSERT INTO stadiums (id, team_id, refreshments, concession_mode) VALUES ('st-human', 'human', 1, 'external')"),
  ]);
  await setupClub("ai-stand", 150_000, villages[2]);
  await setupClub("ai-bounds", 150_000, villages[3]);
  await setupClub("ai-shadow", 150_000, villages[4]);
  await setupClub("ai-reserve", 18_000, villages[5]);
  await setupClub("ai-squeeze", 60_000, villages[6]);
}, 180_000);

afterAll(async () => {
  await mf.dispose();
});

beforeEach(async () => {
  await baseEnv.CACHE_KV.delete(COACH_MODE_KEY);
});

describe("bufet v pondělní správě: model volí, kód hlídá", () => {
  let chosen: Record<"beer" | "sausage" | "lemonade", ProductAnswer>;

  it("platný nákup a ceny od modelu se provedou stejnou službou jako u člověka", async () => {
    const { c } = await concessionState("ai-stand");
    expect(c.modeOptions).toEqual(["external", "self"]);
    expect(c.fixtures.map((f) => f.id)).toEqual(["m-ai-stand-thu"]);
    expect(c.attendance).toMatchObject({ average: 200, matches: 3 });
    chosen = {
      beer: { tier: 2, price: 38, buy: Math.min(800, tierOf(c, "beer", 2).maxBuy) },
      sausage: { tier: 2, price: 45, buy: Math.min(80, tierOf(c, "sausage", 2).maxBuy) },
      lemonade: { tier: 1, price: 15, buy: Math.min(150, tierOf(c, "lemonade", 1).maxBuy) },
    };
    const ai = fakeAi(weeklyAnswer({ mode: "self", products: { ...chosen, mulled_wine: { tier: 3, price: 60, buy: 0 } } }));
    const before = await budgetOf("ai-stand");

    const res = await runWeeklyReview(ai.env, "ai-stand", REVIEW_AT);

    expect(res.used).toBe("model");
    expect(ai.weeklyPrompts[0]).toContain("REFRESHMENTS now: external operator");
    expect(ai.weeklyPrompts[0]).toContain("league on Thu (about 200 spectators");
    expect((ai.weeklySchemas[0].required as string[])).toContain("concessions");

    expect(await modeOf("ai-stand")).toBe("self");
    const after = await products("ai-stand");
    expect(after.beer).toMatchObject({ quality_level: 2, sell_price: 38, stock_l2: chosen.beer.buy });
    expect(after.sausage).toMatchObject({ quality_level: 2, sell_price: 45, stock_l2: chosen.sausage.buy });
    expect(after.lemonade).toMatchObject({ quality_level: 1, sell_price: 15, stock_l1: chosen.lemonade.buy });
    expect(after.mulled_wine).toMatchObject({ quality_level: 3, sell_price: 60, stock_l3: 0 });

    // Nákup jako u člověka: transakce „Nákup <produkt> (N ks × P Kč)“ a rozpočet o přesně tolik níž.
    const cost = chosen.beer.buy * 20 + chosen.sausage.buy * 25 + chosen.lemonade.buy * 8;
    const bought = await wholesale("ai-stand");
    expect(bought.map((t) => t.description).sort()).toEqual([
      `Nákup Klobása (${chosen.sausage.buy} ks × 25 Kč)`,
      `Nákup Limonáda (${chosen.lemonade.buy} ks × 8 Kč)`,
      `Nákup Pivo (${chosen.beer.buy} ks × 20 Kč)`,
    ]);
    expect(bought.reduce((s, t) => s + t.amount, 0)).toBe(-cost);
    expect(await budgetOf("ai-stand")).toBe(before - cost);
    expect(res.spent).toBe(cost);

    const log = await lastLog("ai-stand", "weekly");
    expect(log?.used_fallback).toBe(0);
    const actions = JSON.parse(log!.actions!) as { decision: { concessions: { decidedBy: string; products: Array<{ decidedBy: string }> } }; rejected: string[]; concessionPlan: { mode: string; decidedBy: string } };
    expect(actions.decision.concessions.decidedBy).toBe("model");
    expect(actions.decision.concessions.products.every((p) => p.decidedBy === "model")).toBe(true);
    expect(actions.rejected).toEqual([]);
    expect(actions.concessionPlan).toMatchObject({ mode: "self", decidedBy: "model" });
    const executed = JSON.parse(log!.executed!) as Array<{ action: string; ok: boolean }>;
    expect(executed.filter((e) => e.action.startsWith("concession_")).every((e) => e.ok)).toBe(true);
    expect(executed.filter((e) => e.action === "concession_stock")).toHaveLength(3);
  }, 120_000);

  it("AI klub pak v domácím zápase opravdu prodává (finance zápasu)", async () => {
    const before = await products("ai-stand");
    await processMatchDayFinances(db, "ai-stand", "m-ai-stand-thu", true, "win", 210, THURSDAY_MATCH, 50, false, "cloudy");
    await db.prepare("UPDATE matches SET status = 'simulated', attendance = 210, simulated_at = ? WHERE id = 'm-ai-stand-thu'").bind(THURSDAY_MATCH).run();
    await db.prepare("UPDATE season_calendar SET status = 'simulated' WHERE id = 'cal-ai-stand-thu'").run();

    const sales = (await db.prepare("SELECT product_key, quality_level, sell_price, sold_count, revenue FROM concession_match_sales WHERE team_id = 'ai-stand' AND match_id = 'm-ai-stand-thu'")
      .all<{ product_key: string; quality_level: number; sell_price: number; sold_count: number; revenue: number }>()).results;
    const sold = Object.fromEntries(sales.map((s) => [s.product_key, s]));
    expect(sold.beer).toMatchObject({ quality_level: 2, sell_price: 38 });
    expect(sold.beer.sold_count).toBeGreaterThan(300);
    expect(sold.sausage.sold_count).toBeGreaterThan(0);
    expect(sold.lemonade.sold_count).toBeGreaterThan(0);
    expect(sold.mulled_wine.sold_count).toBe(0);

    const income = await db.prepare("SELECT amount FROM transactions WHERE team_id = 'ai-stand' AND type = 'concession_income_self' AND reference_id = 'm-ai-stand-thu'")
      .first<{ amount: number }>();
    expect(income?.amount).toBe(sales.reduce((s, x) => s + x.revenue, 0));
    expect(income!.amount).toBeGreaterThan(10_000);

    // Prodalo se ze skladu zvolené kvality.
    const after = await products("ai-stand");
    expect(stockOf(after.beer, 2)).toBe(stockOf(before.beer, 2) - sold.beer.sold_count);
    expect(stockOf(after.lemonade, 1)).toBe(stockOf(before.lemonade, 1) - sold.lemonade.sold_count);
  }, 60_000);

  it("před dalším domácím zápasem dokoupí na pokrytí z pondělí, jen jednou a jen přes den", async () => {
    // V neděli přibyl domácí zápas (pohárem posunuté kolo), sklad po čtvrtku nestačí.
    await db.batch([
      db.prepare("INSERT INTO season_calendar (id, league_id, season_number, game_week, match_day, scheduled_at, status) VALUES ('cal-ai-stand-sun', 'lg-ai-stand', 3, 5, 'sunday', ?, 'scheduled')")
        .bind(`${SUNDAY}T17:00:00.000Z`),
      db.prepare("INSERT INTO matches (id, league_id, calendar_id, home_team_id, away_team_id, status) VALUES ('m-ai-stand-sun', 'lg-ai-stand', 'cal-ai-stand-sun', 'ai-stand', 'opp', 'scheduled')"),
      db.prepare("UPDATE teams SET game_date = ? WHERE id = 'ai-stand'").bind(`${SUNDAY}T05:00:00.000Z`),
    ]);
    const before = await products("ai-stand");
    const budgetBefore = await budgetOf("ai-stand");

    // V noci ne.
    expect((await topUpConcessions(baseEnv, "ai-stand", new Date(`${SUNDAY}T02:15:00.000Z`))).bought).toBe(0);
    // V režimu shadow ne.
    await baseEnv.CACHE_KV.put(COACH_MODE_KEY, JSON.stringify({ weekly: "shadow" }));
    expect((await topUpConcessions(baseEnv, "ai-stand", new Date(`${SUNDAY}T07:00:00.000Z`))).bought).toBe(0);
    await baseEnv.CACHE_KV.delete(COACH_MODE_KEY);
    expect(await logCount("ai-stand", "concession_topup")).toBe(0);

    // Ranní úloha `match` (cron 0 7, v listopadu 8:00 v Praze): sestava a dorovnání bufetu.
    const morning = new Date(`${SUNDAY}T07:00:00.000Z`);
    const task = await runAiCoachTask(baseEnv, "ai-stand", "match", SUNDAY, morning);
    expect(task.status).toBe("done");
    const after = await products("ai-stand");
    const spent = -(await wholesale("ai-stand")).slice(3).reduce((s, t) => s + t.amount, 0);
    expect(spent).toBeGreaterThan(0);
    // Pivo se dorovná ve zvolené kvalitě na pokrytí z pondělí (sklad po nákupu / očekávaný prodej týdne).
    const plan = (JSON.parse((await lastLog("ai-stand", "weekly"))!.actions!) as { concessionPlan: ConcessionTopUpPlan }).concessionPlan;
    const cover = plan.products.find((x) => x.key === "beer")!.cover;
    expect(cover).toBeGreaterThan(1);
    const sunday = await loadConcessionContext(db, "ai-stand", { gameDay: SUNDAY, days: 1, spendable: 1_000_000 });
    expect(sunday.fixtures.map((f) => f.id)).toEqual(["m-ai-stand-sun"]);
    const expectedSunday = salesFor(sunday, "beer", 2, chosen.beer.price);
    expect(stockOf(after.beer, 2)).toBe(Math.ceil(expectedSunday * cover));
    expect(stockOf(after.beer, 2)).toBeGreaterThan(expectedSunday);
    expect(stockOf(after.beer, 2)).toBeGreaterThan(stockOf(before.beer, 2));
    expect(after.beer.stock_l1 + after.beer.stock_l3).toBe(before.beer.stock_l1 + before.beer.stock_l3);
    // Svařák trenér v pondělí nekoupil vůbec: nedokupuje se.
    expect(after.mulled_wine.stock_l3).toBe(0);
    expect(await budgetOf("ai-stand")).toBe(budgetBefore - spent);

    const log = await lastLog("ai-stand", "concession_topup");
    expect(log?.used_fallback).toBe(0);
    expect(log?.mode).toBe("on");
    const executed = JSON.parse(log!.executed!) as Array<{ product: string; ok: boolean }>;
    expect(executed.some((e) => e.product === "beer" && e.ok)).toBe(true);

    // Opakované doručení úlohy a pozdější pokus téhož dne: sklad stačí, nic dalšího.
    expect((await runAiCoachTask(baseEnv, "ai-stand", "match", SUNDAY, morning)).status).toBe("duplicate");
    expect((await topUpConcessions(baseEnv, "ai-stand", new Date(`${SUNDAY}T10:15:00.000Z`))).bought).toBe(0);
    expect(await logCount("ai-stand", "concession_topup")).toBe(1);
    expect(await budgetOf("ai-stand")).toBe(budgetBefore - spent);
  }, 60_000);

  it("nákup mimo meze a neznámá kvalita: ty produkty rozhodne náhradní pravidlo, platné volby modelu zůstanou", async () => {
    const { c } = await concessionState("ai-bounds");
    const beer = tierOf(c, "beer", 2);
    const ai = fakeAi(weeklyAnswer({
      mode: "self",
      products: {
        beer: { tier: 2, price: 38, buy: beer.maxBuy + 1 },
        sausage: { tier: 4, price: 45, buy: 50 },
        lemonade: { tier: 1, price: 15, buy: 100 },
        mulled_wine: { tier: 1, price: 28, buy: 0 },
      },
    }));
    const p = profile();
    const fallbackBeer = fallbackProductChoice(c.products.find((x) => x.key === "beer")!, p);
    const fallbackSausage = fallbackProductChoice(c.products.find((x) => x.key === "sausage")!, p);
    expect(fallbackBeer).toMatchObject({ tier: 2, price: 35 });

    await runWeeklyReview(ai.env, "ai-bounds", REVIEW_AT);

    const after = await products("ai-bounds");
    expect(after.beer).toMatchObject({ quality_level: 2, sell_price: 35, stock_l2: fallbackBeer.buy });
    expect(after.sausage).toMatchObject({ quality_level: fallbackSausage.tier, sell_price: fallbackSausage.price });
    expect(stockOf(after.sausage, fallbackSausage.tier)).toBe(fallbackSausage.buy);
    expect(after.lemonade).toMatchObject({ quality_level: 1, sell_price: 15, stock_l1: 100 });
    expect(stockOf(after.beer, 2)).toBeLessThanOrEqual(beer.maxBuy);

    const log = await lastLog("ai-bounds", "weekly");
    expect(log?.used_fallback).toBe(0);
    const actions = JSON.parse(log!.actions!) as { rejected: string[]; decision: { concessions: { products: Array<{ key: string; decidedBy: string }> } } };
    expect(actions.rejected.some((x) => x.startsWith("concessions.beer: nákup"))).toBe(true);
    expect(actions.rejected.some((x) => x.startsWith("concessions.sausage: neznámá kvalita 4"))).toBe(true);
    const by = Object.fromEntries(actions.decision.concessions.products.map((x) => [x.key, x.decidedBy]));
    expect(by).toEqual({ sausage: "fallback", beer: "fallback", lemonade: "model", mulled_wine: "model" });
  }, 120_000);

  it("režim shadow: rozhodne a zapíše, provoz, ceny, sklad ani peníze se nezmění", async () => {
    await baseEnv.CACHE_KV.put(COACH_MODE_KEY, JSON.stringify({ weekly: "shadow" }));
    const { c } = await concessionState("ai-shadow");
    const before = { products: await products("ai-shadow"), budget: await budgetOf("ai-shadow") };
    const ai = fakeAi(weeklyAnswer({
      mode: "self",
      products: { beer: { tier: 3, price: 55, buy: Math.min(500, tierOf(c, "beer", 3).maxBuy) } },
    }));

    const res = await runWeeklyReview(ai.env, "ai-shadow", REVIEW_AT);

    expect(res.mode).toBe("shadow");
    expect(res.executed).toEqual([]);
    expect(await modeOf("ai-shadow")).toBe("external");
    expect(await products("ai-shadow")).toEqual(before.products);
    expect(await budgetOf("ai-shadow")).toBe(before.budget);
    expect(await wholesale("ai-shadow")).toEqual([]);
    const log = await lastLog("ai-shadow", "weekly");
    expect(log?.mode).toBe("shadow");
    expect(log?.executed).toBeNull();
    const actions = JSON.parse(log!.actions!) as { plan: Array<{ kind: string; key?: string }>; decision: { concessions: { mode: string } } };
    expect(actions.decision.concessions.mode).toBe("self");
    expect(actions.plan.some((a) => a.kind === "concession_mode")).toBe(true);
    expect(actions.plan.some((a) => a.kind === "concession_stock" && a.key === "beer")).toBe(true);
  }, 120_000);
});

describe("bufet nikdy pod rezervu", () => {
  it("model chce maximum všeho: koupí se jen do peněz nad rezervou", async () => {
    const { c, reserve, spendable } = await concessionState("ai-reserve");
    expect(spendable).toBe(18_000 - reserve);
    expect(spendable).toBeGreaterThan(0);
    const all = Object.fromEntries(c.products.map((p) => [p.key, { tier: 3, price: tierOf(c, p.key, 3).defaultPrice, buy: tierOf(c, p.key, 3).maxBuy }]));
    const ai = fakeAi(weeklyAnswer({ mode: "self", products: all }));

    await runWeeklyReview(ai.env, "ai-reserve", REVIEW_AT);

    const spent = -(await wholesale("ai-reserve")).reduce((s, t) => s + t.amount, 0);
    expect(spent).toBeGreaterThan(0);
    expect(spent).toBeLessThanOrEqual(spendable);
    expect(await budgetOf("ai-reserve")).toBeGreaterThanOrEqual(reserve);
    const log = await lastLog("ai-reserve", "weekly");
    const actions = JSON.parse(log!.actions!) as { skipped: Array<{ item: string; reason: string }> };
    expect(actions.skipped.some((s) => s.item.startsWith("stock:") && s.reason.startsWith("rezerva"))).toBe(true);
  }, 120_000);

  it("rozpočet spadne, zatímco model přemýšlí: nákup, po kterém by nezbyla rezerva, se neprovede", async () => {
    const { c, reserve } = await concessionState("ai-squeeze");
    const beer = tierOf(c, "beer", 2);
    expect(beer.maxBuy).toBeGreaterThan(100);
    const ai = fakeAi(weeklyAnswer({ mode: "self", products: { beer: { tier: 2, price: 35, buy: beer.maxBuy } } }), async () => {
      // Pokuta mezitím: nad rezervou zbude 500 Kč.
      await db.prepare("UPDATE teams SET budget = ? WHERE id = 'ai-squeeze'").bind(reserve + 500).run();
    });

    await runWeeklyReview(ai.env, "ai-squeeze", REVIEW_AT);

    expect(await budgetOf("ai-squeeze")).toBe(reserve + 500);
    expect(await wholesale("ai-squeeze")).toEqual([]);
    const executed = JSON.parse((await lastLog("ai-squeeze", "weekly"))!.executed!) as Array<{ action: string; ok: boolean; detail: string }>;
    const stock = executed.filter((e) => e.action === "concession_stock");
    expect(stock.length).toBeGreaterThan(0);
    expect(stock.every((e) => !e.ok && e.detail.startsWith("rezerva"))).toBe(true);
  }, 120_000);
});

describe("domácí zápasy, na které se nakupuje", () => {
  it("liga, pohár i přátelák doma do příští správy; venku, na neutrální půdě a později ne", async () => {
    await setupClub("ai-fixtures", 80_000, villages[7]);
    await db.batch([
      db.prepare("INSERT INTO cup_competitions (id, season_number, name, total_rounds) VALUES ('cup-3', 3, 'Okresní pohár', 5)"),
      db.prepare("INSERT INTO cup_teams (id, cup_id, team_id, name, strength) VALUES ('ct-ai', 'cup-3', 'ai-fixtures', 'Klub', 40), ('ct-opp', 'cup-3', 'opp', 'Soupeř', 40)"),
      db.prepare(`INSERT INTO cup_matches (id, cup_id, round, bracket_pos, home_cup_team_id, away_cup_team_id, status, scheduled_at) VALUES
        ('cm-home', 'cup-3', 2, 1, 'ct-ai', 'ct-opp', 'scheduled', '2026-11-04T11:00:00.000Z'),
        ('cm-away', 'cup-3', 3, 1, 'ct-opp', 'ct-ai', 'scheduled', '2026-11-06T11:00:00.000Z')`),
      db.prepare(`INSERT INTO matches (id, home_team_id, away_team_id, status, created_at) VALUES
        ('f-home', 'ai-fixtures', 'opp', 'scheduled', '2026-11-07T16:00:00.000Z'),
        ('f-neutral', 'ai-fixtures', 'opp', 'scheduled', '2026-11-06T16:00:00.000Z'),
        ('f-away', 'opp', 'ai-fixtures', 'scheduled', '2026-11-03T16:00:00.000Z'),
        ('f-later', 'ai-fixtures', 'opp', 'scheduled', '2026-11-10T16:00:00.000Z')`),
      db.prepare(`INSERT INTO challenges (id, challenger_team_id, challenged_team_id, status, match_id, expires_at, match_date, venue) VALUES
        ('ch-home', 'ai-fixtures', 'opp', 'accepted', 'f-home', '2026-11-07', '2026-11-07', 'challenger'),
        ('ch-neutral', 'ai-fixtures', 'opp', 'accepted', 'f-neutral', '2026-11-06', '2026-11-06', 'neutral'),
        ('ch-away', 'ai-fixtures', 'opp', 'accepted', 'f-away', '2026-11-03', '2026-11-03', 'opponent'),
        ('ch-later', 'ai-fixtures', 'opp', 'accepted', 'f-later', '2026-11-10', '2026-11-10', 'challenger')`),
    ]);

    const c = await loadConcessionContext(db, "ai-fixtures", { gameDay: MONDAY, days: 7, spendable: 50_000 });
    expect(c.fixtures.map((f) => [f.id, f.kind])).toEqual([["cm-home", "cup"], ["m-ai-fixtures-thu", "league"], ["f-home", "friendly"]]);
    const [cup, league, friendly] = c.fixtures;
    // Návštěva z posledních domácích zápasů, přátelák má svou (chodí na něj 20 až 70 lidí).
    expect(cup).toMatchObject({ attendance: 200, peak: 250, temperature: null });
    expect(league.attendance).toBe(200);
    expect(typeof league.temperature).toBe("number");
    expect(friendly).toMatchObject({ attendance: 45, peak: 70, weather: "cloudy", temperature: null });
    // Prodej celého týdne je součet zápasů.
    const beer = c.products.find((p) => p.key === "beer")!.tiers[0];
    const leagueOnly = await loadConcessionContext(db, "ai-fixtures", { gameDay: "2026-11-05", days: 1, spendable: 50_000 });
    expect(beer.expectedSales).toBeGreaterThan(leagueOnly.products.find((p) => p.key === "beer")!.tiers[0].expectedSales);
  }, 60_000);
});

describe("bufet člověka jde stejnou službou", () => {
  it("provoz, kvalita a nákup přes routy hry", async () => {
    const token = await createSession(baseEnv.SESSION_KV, "u-human", "human@example.test", "human");
    const call = (method: string, path: string, body: unknown) => app.request(`/api/teams/human${path}`, {
      method, headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` }, body: JSON.stringify(body),
    }, baseEnv);

    expect(await (await call("PATCH", "/concession/mode", { mode: "self" })).json()).toEqual({ ok: true, mode: "self" });
    expect(await (await call("PATCH", "/concession/products/beer", { qualityLevel: 2, sellPrice: 40 })).json())
      .toEqual({ ok: true, qualityLevel: 2, sellPrice: 40 });
    const restock = await call("POST", "/concession/restock", { productKey: "beer", quantity: 100 });
    expect(restock.status).toBe(200);
    expect(await restock.json()).toEqual({ ok: true, newStock: 100, totalCost: 2_000 });
    expect((await products("human")).beer).toMatchObject({ quality_level: 2, sell_price: 40, stock_l2: 100 });
    expect(await wholesale("human")).toEqual([{ amount: -2_000, description: "Nákup Pivo (100 ks × 20 Kč)" }]);

    const unknown = await call("POST", "/concession/restock", { productKey: "kebab", quantity: 1 });
    expect(unknown.status).toBe(400);
    await db.prepare("UPDATE stadiums SET refreshments = 0 WHERE team_id = 'human'").run();
    expect((await call("PATCH", "/concession/mode", { mode: "self" })).status).toBe(400);
  }, 60_000);
});
