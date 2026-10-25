/**
 * Další rozhodnutí AI klubu na trhu modelem na skutečné D1 (Miniflare, všechny migrace):
 * nouzový podpis volného hráče, skaut, inzeráty na přebytečné hráče a nabídka hráče k poptávce.
 *
 * Model navrhuje, kód hlídá: falešný binding Workers AI odpovídá podle názvu schématu. Platná volba
 * se provede stejnou službou jako u člověka, neplatná (mimo meze, neznámý klíč) rozhodne pravidlo,
 * shadow jen zapíše do deníku.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { Miniflare } from "miniflare";
import { marketValue } from "@okresni-masina/shared";
import type { Bindings } from "../index";
import { COACH_MODEL } from "./llm";
import { COACH_MODE_KEY } from "./mode";
import { generateAiProfile, type AiCoachProfile } from "./profile";
import { runTransferMarket } from "./transfer-market";
import { HARD_FLOOR_RATIO, openingAsk, reservationPrice } from "./valuation";

let mf: Miniflare;
let db: D1Database;
let kv: KVNamespace;

const AI_CLUB = "ai-market";
const LEAGUE = "l-op";
const START_BUDGET = 200_000;
const GAME_DATE = "2026-10-26T16:00:00.000Z";
const FUTURE = "2099-01-01T00:00:00.000Z";

/** Neobchodník bez kurzu: pravidlo nic nevystaví; šetrnost 30 a ambice 60 = skaut na 30 km. */
const PROFILE: AiCoachProfile = {
  ...generateAiProfile(AI_CLUB, null), ambition: 60, thrift: 30, trading: 40, patience: 50, youthFocus: 40, favouriteFormations: ["4-4-2"],
};

const SKILLS = {
  speed: 40, technique: 45, shooting: 42, passing: 44, heading: 38, defense: 35, goalkeeping: 10,
  stamina: 50, strength: 45, vision: 40, creativity: 41, setPieces: 30,
};

beforeAll(async () => {
  mf = new Miniflare({
    modules: true,
    script: "export default { fetch() { return new Response('ok'); } }",
    d1Databases: ["DB"],
    kvNamespaces: ["CACHE_KV"],
  });
  db = await mf.getD1Database("DB");
  kv = (await mf.getKVNamespace("CACHE_KV")) as unknown as KVNamespace;
  const dir = new URL("../../migrations/", import.meta.url);
  for (const file of readdirSync(dir).filter((f) => f.endsWith(".sql")).sort()) {
    const source = readFileSync(new URL(file, dir), "utf8").replace(/--[^\n]*/g, "").replace(/\n/g, " ");
    await db.exec(source);
  }
  // `transfer_listings.rejected_by` má produkce, ale žádná migrace ho nezakládá (přidán ručně).
  const hasRejectedBy = await db.prepare("SELECT 1 FROM pragma_table_info('transfer_listings') WHERE name = 'rejected_by'").first();
  if (!hasRejectedBy) await db.exec("ALTER TABLE transfer_listings ADD COLUMN rejected_by TEXT");
}, 120_000);

afterAll(async () => { await mf.dispose(); });

/** Úklid mezi testy: všechny tabulky s vazbou na tým nebo hráče, v několika průchodech kvůli cizím klíčům. */
async function wipe(): Promise<void> {
  const linked = (await db.prepare(
    `SELECT DISTINCT m.name FROM sqlite_master m WHERE m.type = 'table' AND m.name NOT LIKE 'sqlite_%' AND m.name NOT LIKE '_cf_%'
       AND (EXISTS (SELECT 1 FROM pragma_table_info(m.name) p
                     WHERE p.name IN ('team_id', 'player_id', 'buyer_team_id', 'seller_team_id', 'from_team_id', 'to_team_id', 'negotiation_id', 'assignment_id', 'demand_id'))
         OR EXISTS (SELECT 1 FROM pragma_foreign_key_list(m.name) f
                     WHERE f."table" IN ('teams', 'players', 'leagues', 'seasons', 'managers', 'staff_members', 'scout_assignments', 'ai_negotiations',
                                         'transfer_listings', 'transfer_offers', 'transfer_demands', 'conversations')))`,
  ).all<{ name: string }>()).results.map((r) => r.name);
  const tables = [...new Set([...linked, "players", "managers", "teams", "leagues", "seasons"])];
  let lastError = "";
  for (let pass = 0; pass < 6; pass++) {
    const failed: string[] = [];
    for (const t of tables) {
      try {
        await db.prepare(`DELETE FROM ${t}`).run();
      } catch (e) {
        failed.push(t);
        lastError = `${t}: ${String(e)}`;
      }
    }
    if (failed.length === 0) return;
  }
  throw new Error(`úklid testovací databáze se nepovedl: ${lastError}`);
}

beforeEach(async () => {
  await wipe();
  await db.prepare("DELETE FROM free_agents").run();
  await kv.delete(COACH_MODE_KEY);
  await db.batch([
    db.prepare("INSERT OR IGNORE INTO users (id, email, password_hash) VALUES ('ai', 'ai@system.local', 'none')"),
    db.prepare("INSERT INTO seasons (id, number, status) VALUES ('s-1', 1, 'active')"),
    db.prepare("INSERT INTO leagues (id, season_id, district, name, level) VALUES (?, 's-1', 'Prachatice', 'Okresní přebor', 'okresni_prebor')").bind(LEAGUE),
    db.prepare("INSERT INTO teams (id, user_id, village_id, name, budget, league_id, team_type, game_date) VALUES (?, 'ai', 'p06', 'Sokol Vlachovo Březí', ?, ?, 'senior', ?)")
      .bind(AI_CLUB, START_BUDGET, LEAGUE, GAME_DATE),
  ]);
});

interface SquadRow { id: string; position: string; rating: number; age: number }

async function seedPlayers(rows: SquadRow[]): Promise<void> {
  await db.batch(rows.map((p) => db.prepare(
    `INSERT INTO players (id, team_id, first_name, last_name, age, position, overall_rating, skills, physical, personality, life_context, avatar, status)
     VALUES (?, ?, 'Jan', ?, ?, ?, ?, ?, '{}', '{}', '{}', '{}', 'active')`,
  ).bind(p.id, AI_CLUB, `Hráč ${p.id}`, p.age, p.position, p.rating, JSON.stringify(SKILLS))));
}

/** 14 hráčů po 30 bodech, 4-4-2: pod minimem kádru, nejvíc chybí záložník (pak obránce). */
async function seedSmallSquad(): Promise<void> {
  await seedPlayers(Array.from({ length: 14 }, (_, i) => ({ id: `p${i}`, position: ["GK", "DEF", "MID", "FWD"][i % 4], rating: 30, age: 26 })));
}

/** 20 hráčů, plná hloubka všech postů a tři přebyteční (od nejstaršího): brankář, obránce, útočník. */
async function seedFullSquad(): Promise<void> {
  const rows: SquadRow[] = [];
  for (const [position, n] of [["GK", 2], ["DEF", 6], ["MID", 6], ["FWD", 3]] as const) {
    for (let i = 0; i < n; i++) rows.push({ id: `${position.toLowerCase()}${i}`, position, rating: 45, age: 26 });
  }
  rows.push(
    { id: "sur-gk", position: "GK", rating: 40, age: 33 },
    { id: "sur-def", position: "DEF", rating: 40, age: 31 },
    { id: "sur-fwd", position: "FWD", rating: 40, age: 29 },
  );
  await seedPlayers(rows);
}

interface FakeCall { name: string; prompt: string }

/** Odpovědi, když test pro dané rozhodnutí neřekne jinak: nic nekoupit, nevystavit, nenabídnout, neposlat. */
const DEFAULT_ANSWERS: Record<string, unknown> = {
  buy_pick: { choice: "none", bid: 0, loanDays: 0, reason: "nothing today" },
  buy_negotiation: { action: "withdraw", amount: 0, reason: "" },
  transfer_listing: { list: [], reason: "keep them" },
  demand_pitch_offer: { choice: "none", reason: "keep them" },
  scout_task: { send: false, position: "MID", radius: 15, ages: "prime", reason: "not now" },
};

/** Falešný binding Workers AI: odpověď podle názvu schématu, záznam každého volání. */
function fakeAi(answers: Record<string, unknown> = {}) {
  const calls: FakeCall[] = [];
  const run = async (_model: string, input: {
    messages: Array<{ role: string; content: string }>; response_format?: { json_schema?: { name?: string } };
  }) => {
    const name = input.response_format?.json_schema?.name ?? "";
    calls.push({ name, prompt: input.messages.find((m) => m.role === "user")?.content ?? "" });
    const answer = name in answers ? answers[name] : DEFAULT_ANSWERS[name] ?? {};
    return { choices: [{ message: { content: JSON.stringify(answer) } }], usage: { prompt_tokens: 10, completion_tokens: 5 } };
  };
  return { binding: { run }, calls };
}

function marketEnv(ai?: unknown): Bindings {
  return { DB: db, CACHE_KV: kv, AI: ai } as unknown as Bindings;
}

async function runMarket(ai: { binding: unknown } | null, now = new Date(), profile: AiCoachProfile = PROFILE) {
  return runTransferMarket(marketEnv(ai?.binding), AI_CLUB, now, { profile, ignoreSchedule: true });
}

interface MarketLog { mode: string; model: string | null; used_fallback: number; error: string | null; raw_output: string | null }

async function marketLog(): Promise<MarketLog> {
  const row = await db.prepare("SELECT mode, model, used_fallback, error, raw_output FROM ai_coach_decisions WHERE team_id = ? AND kind = 'transfer_market' ORDER BY created_at DESC, rowid DESC LIMIT 1")
    .bind(AI_CLUB).first<MarketLog>();
  if (!row) throw new Error("trh nezapsal rozhodnutí do deníku");
  return row;
}

async function count(sql: string, ...binds: unknown[]): Promise<number> {
  return (await db.prepare(sql).bind(...binds).first<{ n: number }>())?.n ?? 0;
}

async function insertFreeAgent(id: string, position: string, rating: number, wage: number, age: number): Promise<void> {
  await db.prepare(
    `INSERT INTO free_agents (id, district, first_name, last_name, age, position, overall_rating, weekly_wage, village_id, expires_at)
     VALUES (?, 'Prachatice', 'Volný', ?, ?, ?, ?, ?, 'p06', ?)`,
  ).bind(id, `Hráč ${id}`, age, position, rating, wage, FUTURE).run();
}

describe("nouzový podpis volného hráče pod minimem kádru", () => {
  beforeEach(async () => {
    await seedSmallSquad();
    await insertFreeAgent("fa-mid", "MID", 35, 200, 24);
    await insertFreeAgent("fa-def", "DEF", 38, 300, 27);
  });

  it("model vybere hráče a mzdu z rozpětí, podpis jde přes stejnou službu jako u člověka", async () => {
    const ai = fakeAi({ emergency_signing: { choice: "a2", wage: 360, reason: "the defender is better" } });
    const res = await runMarket(ai);
    const prompt = ai.calls.find((c) => c.name === "emergency_signing")?.prompt ?? "";
    expect(prompt).toContain("URGENT: your senior squad has only 14 players and you never go below 16");
    // Pořadí pravidla: nejpotřebnější post (záložník) první.
    expect(prompt).toContain('"a1": MID, age 24, rating 35, asks 200 CZK a week. Offer a weekly wage between 200 CZK and 250 CZK.');
    expect(prompt).toContain('"a2": DEF, age 27, rating 38, asks 300 CZK a week. Offer a weekly wage between 300 CZK and 375 CZK.');
    const sign = res.actions.find((a) => a.kind === "sign_free_agent");
    expect(sign).toMatchObject({ playerId: "fa-def", amount: 360, decidedBy: "model", reason: "the defender is better" });
    expect(["signed", "refused"]).toContain(sign?.result);
    if (sign?.result === "signed") {
      expect(await count("SELECT COUNT(*) AS n FROM players WHERE team_id = ? AND last_name = 'Hráč fa-def' AND weekly_wage = 360", AI_CLUB)).toBe(1);
    }
    expect(await marketLog()).toMatchObject({ model: COACH_MODEL, used_fallback: 0 });
  });

  it("mzda mimo rozpětí neplatí: pravidlo vezme nejlepšího na nejpotřebnější post za svou mzdu", async () => {
    const ai = fakeAi({ emergency_signing: { choice: "a2", wage: 999, reason: "overpay" } });
    const res = await runMarket(ai);
    // Ambice 60: o 15 % víc, než hráč chce.
    expect(res.actions.find((a) => a.kind === "sign_free_agent")).toMatchObject({ playerId: "fa-mid", amount: 230, decidedBy: "fallback", reason: "rules" });
    const log = await marketLog();
    expect(log.used_fallback).toBe(1);
    expect(log.error).toContain("volný hráč: neplatná odpověď modelu");
  });

  it("režim shadow: model vybere, nic se nepodepíše", async () => {
    await kv.put(COACH_MODE_KEY, JSON.stringify({ market: "shadow" }));
    const ai = fakeAi({ emergency_signing: { choice: "a2", wage: 330, reason: "cheap enough" } });
    const res = await runMarket(ai);
    expect(res.actions.find((a) => a.kind === "sign_free_agent")).toMatchObject({ playerId: "fa-def", amount: 330, result: "shadow", decidedBy: "model" });
    expect(await count("SELECT COUNT(*) AS n FROM free_agents")).toBe(2);
    expect(await count("SELECT COUNT(*) AS n FROM players WHERE team_id = ?", AI_CLUB)).toBe(14);
    expect(await marketLog()).toMatchObject({ mode: "shadow", used_fallback: 0 });
  });
});

describe("skaut: jestli, kam a koho hledat", () => {
  beforeEach(async () => {
    await seedSmallSquad();
    await db.prepare(
      `INSERT INTO staff_members (id, district, team_id, role, profession, first_name, last_name, age, judgement, communication, weekly_wage, signing_fee, avatar, hired_at)
       VALUES ('sc-1', 'Prachatice', ?, 'skaut', 'skaut', 'Karel', 'Skaut', 50, 14, 12, 300, 1000, '{}', '2026-10-01')`,
    ).bind(AI_CLUB).run();
  });

  async function task() {
    return db.prepare("SELECT positions, radius_km, age_min, age_max, weeks_total, status FROM scout_assignments WHERE team_id = ?")
      .bind(AI_CLUB).first<{ positions: string; radius_km: number; age_min: number; age_max: number; weeks_total: number; status: string }>();
  }

  it("model pošle skauta na vybraný post, okruh a věk ze sady kódu stejným zadáním jako člověk", async () => {
    const ai = fakeAi({ scout_task: { send: true, position: "DEF", radius: 50, ages: "experienced", reason: "need an experienced defender" } });
    const res = await runMarket(ai);
    const prompt = ai.calls.find((c) => c.name === "scout_task")?.prompt ?? "";
    expect(prompt).toContain('POSITIONS where you look for a signing: "MID"');
    expect(prompt).toContain('"DEF" (defender, need 0.70, 2 short)');
    expect(prompt).toContain("RADIUS: 15 km for 1,500 CZK a week, 30 km for 3,000 CZK a week, 50 km for 5,000 CZK a week");
    expect(await task()).toEqual({ positions: '["DEF"]', radius_km: 50, age_min: 25, age_max: 34, weeks_total: 2, status: "active" });
    expect(res.actions.find((a) => a.kind === "scout_task")).toMatchObject({ position: "DEF", amount: 50, result: "started", decidedBy: "model" });
  });

  it("model skauta neposlat: žádný úkol, v deníku proč", async () => {
    const res = await runMarket(fakeAi({ scout_task: { send: false, position: "MID", radius: 15, ages: "prime", reason: "save the travel money" } }));
    expect(await task()).toBeNull();
    expect(res.actions.find((a) => a.kind === "no_scout")).toMatchObject({ decidedBy: "model", reason: "save the travel money" });
  });

  it("okruh mimo sadu neplatí: pravidlo pošle skauta na nejpotřebnější post podle povahy", async () => {
    const res = await runMarket(fakeAi({ scout_task: { send: true, position: "DEF", radius: 40, ages: "prime", reason: "" } }));
    expect(await task()).toEqual({ positions: '["MID"]', radius_km: 30, age_min: 19, age_max: 31, weeks_total: 2, status: "active" });
    expect(res.actions.find((a) => a.kind === "scout_task")).toMatchObject({ position: "MID", amount: 30, decidedBy: "fallback" });
    expect((await marketLog()).used_fallback).toBe(1);
  });

  it("režim shadow: model rozhodne, skaut nikam nejede", async () => {
    await kv.put(COACH_MODE_KEY, JSON.stringify({ market: "shadow" }));
    const res = await runMarket(fakeAi({ scout_task: { send: true, position: "DEF", radius: 50, ages: "experienced", reason: "go" } }));
    expect(await task()).toBeNull();
    expect(res.actions.find((a) => a.kind === "scout_task")).toMatchObject({ position: "DEF", amount: 50, result: "shadow", decidedBy: "model" });
  });
});

describe("inzeráty na přebytečné hráče: koho a za kolik, nikdy pod rezervací", () => {
  beforeEach(async () => { await seedFullSquad(); });

  const reservationOf = (id: string, position: string, age: number, now: Date, profile = PROFILE) =>
    reservationPrice({ marketValue: marketValue(40, age, position), importance: "surplus", profile, playerId: id, now });

  async function listings(): Promise<Array<{ player_id: string; asking_price: number }>> {
    return (await db.prepare("SELECT player_id, asking_price FROM transfer_listings WHERE team_id = ? AND status = 'active' ORDER BY player_id")
      .bind(AI_CLUB).all<{ player_id: string; asking_price: number }>()).results;
  }

  it("model vystaví vybraného hráče za cenu z rozpětí stejnou službou jako člověk", async () => {
    const now = new Date();
    const reservation = reservationOf("sur-def", "DEF", 31, now);
    const price = Math.ceil((reservation * 1.2) / 100) * 100;
    const ai = fakeAi({ transfer_listing: { list: [{ player: "s2", price }], reason: "sell the spare defender" } });
    const res = await runMarket(ai, now);
    const prompt = ai.calls.find((c) => c.name === "transfer_listing")?.prompt ?? "";
    expect(prompt).toContain("you can list at most 2 more right now");
    expect(prompt).toContain(`"s2": DEF, age 31, rating 40`);
    expect(prompt).toContain(`Asking price between ${reservation.toLocaleString("en-US")} CZK`);
    expect(await listings()).toEqual([{ player_id: "sur-def", asking_price: price }]);
    expect(res.actions.find((a) => a.kind === "list")).toMatchObject({ playerId: "sur-def", amount: price, result: "listed", decidedBy: "model" });
    expect(await marketLog()).toMatchObject({ model: COACH_MODEL, used_fallback: 0 });
  });

  it("cena pod rezervací, víc hráčů než míst nebo neznámý hráč neplatí: vystaví pravidlo za svou cenu", async () => {
    // Obchodník: pravidlo vystaví dva nejstarší přebytečné hráče za první požadavek.
    const trader = { ...PROFILE, trading: 60 };
    const now = new Date();
    const floor = Math.floor((marketValue(40, 31, "DEF") * HARD_FLOOR_RATIO) / 100) * 100;
    const bad = [
      { list: [{ player: "s2", price: floor }], reason: "dump him" },
      { list: [{ player: "s1", price: 1000 }, { player: "s2", price: 4000 }, { player: "s3", price: 4000 }], reason: "everyone" },
      { list: [{ player: "s7", price: 3000 }], reason: "who" },
    ];
    for (const answer of bad) {
      await db.prepare("DELETE FROM transfer_listings").run();
      const res = await runMarket(fakeAi({ transfer_listing: answer }), now, trader);
      const expected = [
        { player_id: "sur-def", asking_price: openingAsk({ marketValue: marketValue(40, 31, "DEF"), importance: "surplus", profile: trader, playerId: "sur-def", now }) },
        { player_id: "sur-gk", asking_price: openingAsk({ marketValue: marketValue(40, 33, "GK"), importance: "surplus", profile: trader, playerId: "sur-gk", now }) },
      ];
      expect(await listings()).toEqual(expected);
      for (const l of expected) expect(l.asking_price).toBeGreaterThanOrEqual(reservationOf(l.player_id, l.player_id === "sur-gk" ? "GK" : "DEF", l.player_id === "sur-gk" ? 33 : 31, now, trader));
      expect(res.actions.filter((a) => a.kind === "list").every((a) => a.decidedBy === "fallback")).toBe(true);
      expect((await marketLog()).used_fallback).toBe(1);
    }
  });

  it("model nevystaví nikoho: žádný inzerát, v deníku proč", async () => {
    const res = await runMarket(fakeAi({ transfer_listing: { list: [], reason: "they cover injuries" } }));
    expect(await listings()).toEqual([]);
    expect(res.actions.find((a) => a.kind === "no_list")).toMatchObject({ decidedBy: "model", reason: "they cover injuries" });
  });

  it("režim shadow: model vybere, inzerát nevznikne", async () => {
    await kv.put(COACH_MODE_KEY, JSON.stringify({ market: "shadow" }));
    const now = new Date();
    const price = Math.ceil(reservationOf("sur-fwd", "FWD", 29, now) / 100) * 100;
    const res = await runMarket(fakeAi({ transfer_listing: { list: [{ player: "s3", price }], reason: "sell" } }), now);
    expect(await listings()).toEqual([]);
    expect(res.actions.find((a) => a.kind === "list")).toMatchObject({ playerId: "sur-fwd", amount: price, result: "shadow", decidedBy: "model" });
  });
});

describe("nabídka přebytečného hráče k poptávce", () => {
  beforeEach(async () => {
    await seedFullSquad();
    // Dvě poptávky klubů mimo hru z okresu; novější (útočník) je v pořadí pravidla první.
    const club = JSON.stringify({ name: "TJ Mimo hru", city: "Netolice", district: "Prachatice", rating: 40, country: "CZ" });
    const demand = (id: string, position: string, createdAt: string) => db.prepare(
      `INSERT INTO transfer_demands (id, team_id, club_data, district, position, age_min, age_max, role, max_price, min_rating, status, expires_at, created_at)
       VALUES (?, NULL, ?, 'Prachatice', ?, 25, 33, 'squad', 8000, 30, 'active', ?, ?)`,
    ).bind(id, club, position, FUTURE, createdAt);
    await db.batch([demand("demand-def", "DEF", "2026-10-20T10:00:00.000Z"), demand("demand-fwd", "FWD", "2026-10-21T10:00:00.000Z")]);
  });

  async function pitches(): Promise<Array<{ demand_id: string; player_id: string }>> {
    return (await db.prepare("SELECT demand_id, player_id FROM transfer_demand_pitches WHERE team_id = ? ORDER BY demand_id")
      .bind(AI_CLUB).all<{ demand_id: string; player_id: string }>()).results;
  }

  it("model vybere poptávku a hráče, nabídne ho stejnou službou jako člověk", async () => {
    const ai = fakeAi({ demand_pitch_offer: { choice: "p2", reason: "the defender fits best" } });
    const res = await runMarket(ai);
    const prompt = ai.calls.find((c) => c.name === "demand_pitch_offer")?.prompt ?? "";
    expect(prompt).toContain('"p1": offer your FWD, age 29, rating 40');
    expect(prompt).toContain('"p2": offer your DEF, age 31, rating 40');
    expect(prompt).not.toContain("TJ Mimo hru");
    expect(await pitches()).toEqual([{ demand_id: "demand-def", player_id: "sur-def" }]);
    expect(res.actions.find((a) => a.kind === "pitch")).toMatchObject({ playerId: "sur-def", demandId: "demand-def", decidedBy: "model" });
  });

  it("model nikoho nenabídne: žádná nabídka, v deníku proč", async () => {
    const res = await runMarket(fakeAi({ demand_pitch_offer: { choice: "none", reason: "keep the squad" } }));
    expect(await pitches()).toEqual([]);
    expect(res.actions.find((a) => a.kind === "no_pitch")).toMatchObject({ decidedBy: "model", reason: "keep the squad" });
  });

  it("neznámá volba neplatí: pravidlo nabídne prvního hráče k první poptávce", async () => {
    const res = await runMarket(fakeAi({ demand_pitch_offer: { choice: "p9", reason: "" } }));
    expect(await pitches()).toEqual([{ demand_id: "demand-fwd", player_id: "sur-fwd" }]);
    expect(res.actions.find((a) => a.kind === "pitch")).toMatchObject({ playerId: "sur-fwd", decidedBy: "fallback" });
    expect((await marketLog()).used_fallback).toBe(1);
  });

  it("režim shadow: model vybere, nikomu se nic nenabídne", async () => {
    await kv.put(COACH_MODE_KEY, JSON.stringify({ market: "shadow" }));
    const res = await runMarket(fakeAi({ demand_pitch_offer: { choice: "p2", reason: "fits" } }));
    expect(await pitches()).toEqual([]);
    expect(res.actions.find((a) => a.kind === "pitch")).toMatchObject({ playerId: "sur-def", result: "shadow", decidedBy: "model" });
  });
});
