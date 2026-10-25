/**
 * Přestupy s AI kluby od začátku do konce nad skutečnou SQLite (Miniflare):
 * člověk nabídne přes routy, AI odpoví (přijme, protinávrh, odmítne) a přijetí přesune
 * peníze i hráče stejně jako mezi lidmi. K tomu pokusy AI klub obrat.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { Miniflare } from "miniflare";
import { readFileSync } from "node:fs";
import type { Bindings } from "../index";
import { marketValue } from "@okresni-masina/shared";

const sideEffects = vi.hoisted(() => ({
  attachNewcomerRelations: vi.fn(async () => 0),
  createTransferNews: vi.fn(async () => undefined),
  createNotification: vi.fn(async () => undefined),
  sendWebPushToPlayerWatchers: vi.fn(async () => undefined),
  applyOfferRejectionImpact: vi.fn(async () => undefined),
  computeInterestForOffer: vi.fn(async () => null),
  evaluateSigningChance: vi.fn(() => ({ accepted: true, chance: 1, factors: [] })),
}));

vi.mock("../transfers/attach-relations", () => ({ attachNewcomerRelations: sideEffects.attachNewcomerRelations }));
vi.mock("../transfers/transfer-news", () => ({ createTransferNews: sideEffects.createTransferNews }));
vi.mock("../community/notifications", () => ({ createNotification: sideEffects.createNotification }));
vi.mock("../community/web-push", () => ({ sendWebPushToPlayerWatchers: sideEffects.sendWebPushToPlayerWatchers }));
vi.mock("../transfers/offer-rejection-impact", () => ({ applyOfferRejectionImpact: sideEffects.applyOfferRejectionImpact }));
vi.mock("../transfers/player-interest", () => ({
  INTEREST_LABELS: ["Bez zájmu", "Spíš ne", "Spíš ano", "Chce odejít"],
  computeInterestForOffer: sideEffects.computeInterestForOffer,
  loadCoachStandings: async () => new Map(),
}));
vi.mock("../transfers/player-agency", () => ({
  evaluateSigningChance: sideEffects.evaluateSigningChance,
  haversineKm: () => 10,
}));

// Scénáře projdou celou cestu přes routy, služby a SQLite (i osm kol smlouvání): pod zátěží
// stroje 5 s nestačí, proto vlastní limit jako u ostatních pomalých DB testů.
vi.setConfig({ testTimeout: 30_000, hookTimeout: 60_000 });

import { gameRouter } from "../routes/game";
import { replyToTransferOffers } from "./transfer-replies";
import { runTransferMarket } from "./transfer-market";
import { openingAsk, reservationPrice, VALUATION_WINDOW_DAYS, valuationWindow } from "./valuation";
import { analyzeSquad, loadClubSquad } from "./squad";
import { COACH_MODEL } from "./llm";
import { requiredLoanFee } from "./transfer-decision";
import type { AiCoachProfile } from "./profile";

let miniflare: Miniflare;
let db: D1Database;
let cacheKv: KVNamespace;
let env: Bindings;

const FUTURE = "2099-08-30T12:00:00.000Z";
const GAME_DATE = "2026-10-20T12:00:00.000Z";
const HOUR = 3_600_000;

const PROFILE: AiCoachProfile = {
  version: 1, ambition: 50, thrift: 40, youthFocus: 30, risk: 50, trading: 60, building: 50, patience: 50,
  favouriteTactic: "balanced", favouriteFormations: ["4-4-2"],
};

/** Čas, kdy už uplynula každá lidská prodleva (max 20 h), ale lhůta (3 dny) ne. */
const later = (hours = 21) => new Date(Date.now() + hours * HOUR);

/**
 * Jako `later`, ale aspoň `spanHours` před koncem 14denního okna ocenění: rezervace se mezi
 * několika běhy testu nezmění (jinak by občas padl na přelomu okna).
 */
function laterInWindow(spanHours: number): Date {
  const t = later();
  const windowEnd = (valuationWindow(t) + 1) * VALUATION_WINDOW_DAYS * 86_400_000;
  return t.getTime() + spanHours * HOUR < windowEnd ? t : new Date(windowEnd + HOUR);
}

interface FakeModelInput {
  messages: Array<{ role: string; content: string }>;
  response_format?: { json_schema: { schema: { properties: { action: { enum: string[] }; amount: { minimum?: number; maximum?: number } } } } };
}

interface FakeAi {
  calls: number;
  prompts: string[];
  run: (model: string, input: unknown) => Promise<unknown>;
}

/** Workers AI nanečisto: vrátí odpověď (nebo ji spočítá ze vstupu) a počítá volání. */
function fakeAi(answer: unknown): FakeAi {
  const ai: FakeAi = {
    calls: 0,
    prompts: [],
    run: async (_model, input) => {
      ai.calls++;
      const req = input as FakeModelInput;
      ai.prompts.push(req.messages[1]?.content ?? "");
      const reply = typeof answer === "function" ? (answer as (r: FakeModelInput) => unknown)(req) : answer;
      return { choices: [{ message: { content: JSON.stringify(reply) } }], usage: { prompt_tokens: 10, completion_tokens: 5 } };
    },
  };
  return ai;
}

function withAi(ai: FakeAi | { run: (...args: unknown[]) => Promise<unknown> }): Bindings {
  return { ...env, AI: ai } as unknown as Bindings;
}

interface DecisionRow {
  mode: string; model: string | null; used_fallback: number; error: string | null; actions: string; executed: string;
  tokens_in: number | null; tokens_out: number | null; raw_output: string | null; input_summary: string | null;
}

/** Poslední zápis deníku k nabídce. */
async function decisionFor(ref: string): Promise<DecisionRow | null> {
  return db.prepare(
    `SELECT mode, model, used_fallback, error, actions, executed, tokens_in, tokens_out, raw_output, input_summary
       FROM ai_coach_decisions WHERE context_ref = ? ORDER BY created_at DESC, rowid DESC LIMIT 1`,
  ).bind(ref).first<DecisionRow>();
}

async function executeStatements(sql: string) {
  for (const statement of sql.split(";").map((part) => part.trim()).filter(Boolean)) {
    await db.prepare(statement).run();
  }
}

beforeAll(async () => {
  miniflare = new Miniflare({
    modules: true,
    script: "export default { fetch() { return new Response('ok'); } }",
    d1Databases: ["DB"],
    kvNamespaces: ["SESSION_KV", "CACHE_KV"],
  });
  db = await miniflare.getD1Database("DB");
  const sessionKv = await miniflare.getKVNamespace("SESSION_KV") as unknown as KVNamespace;
  cacheKv = await miniflare.getKVNamespace("CACHE_KV") as unknown as KVNamespace;

  await executeStatements(`
    CREATE TABLE villages (id TEXT PRIMARY KEY, name TEXT NOT NULL, district TEXT NOT NULL, lat REAL NOT NULL, lng REAL NOT NULL, size TEXT NOT NULL DEFAULT 'village');
    CREATE TABLE club_links (team_id TEXT PRIMARY KEY, group_id TEXT NOT NULL, note TEXT, created_at TEXT);
    CREATE TABLE sponsor_contracts (id TEXT PRIMARY KEY, team_id TEXT NOT NULL, monthly_amount INTEGER NOT NULL, status TEXT NOT NULL DEFAULT 'active');
    CREATE TABLE village_team_favor (team_id TEXT NOT NULL, official_id TEXT, favor INTEGER NOT NULL DEFAULT 50);
    CREATE TABLE leagues (id TEXT PRIMARY KEY, name TEXT, district TEXT NOT NULL, league_type TEXT NOT NULL DEFAULT 'senior', parent_league_id TEXT);
    CREATE TABLE teams (
      id TEXT PRIMARY KEY, user_id TEXT NOT NULL, parent_team_id TEXT, team_type TEXT NOT NULL DEFAULT 'senior', name TEXT NOT NULL,
      budget INTEGER NOT NULL DEFAULT 0, game_date TEXT, league_id TEXT, village_id TEXT,
      primary_color TEXT NOT NULL DEFAULT '#225522', secondary_color TEXT NOT NULL DEFAULT '#ffffff',
      badge_pattern TEXT, badge_symbol TEXT, badge_initials TEXT, badge_primary_color TEXT, badge_secondary_color TEXT,
      reputation INTEGER NOT NULL DEFAULT 50, ai_since TEXT, ai_former_user_id TEXT
    );
    CREATE TABLE managers (
      id TEXT PRIMARY KEY, team_id TEXT NOT NULL, user_id TEXT, name TEXT NOT NULL, backstory TEXT, avatar TEXT, age INTEGER,
      coaching INTEGER, motivation INTEGER, tactics INTEGER, youth_development INTEGER, discipline INTEGER, reputation INTEGER,
      licence_level INTEGER, ai_profile TEXT
    );
    CREATE TABLE players (
      id TEXT PRIMARY KEY, team_id TEXT NOT NULL, first_name TEXT NOT NULL, last_name TEXT NOT NULL, nickname TEXT,
      age INTEGER NOT NULL, position TEXT NOT NULL, overall_rating INTEGER NOT NULL,
      skills TEXT NOT NULL DEFAULT '{}', physical TEXT NOT NULL DEFAULT '{}', personality TEXT NOT NULL DEFAULT '{}',
      life_context TEXT NOT NULL DEFAULT '{}', avatar TEXT NOT NULL DEFAULT '{}', weekly_wage INTEGER NOT NULL DEFAULT 0,
      squad_number INTEGER, loan_from_team_id TEXT, loan_until TEXT, parent_club_id TEXT, next_match_return INTEGER NOT NULL DEFAULT 0,
      residence TEXT, commute_km INTEGER NOT NULL DEFAULT 0, status TEXT NOT NULL DEFAULT 'active', nationality TEXT DEFAULT 'CZ',
      is_celebrity INTEGER NOT NULL DEFAULT 0, hidden_talent REAL, skills_max TEXT, coach_relationship INTEGER
    );
    CREATE TABLE transfer_offers (
      id TEXT PRIMARY KEY, player_id TEXT NOT NULL, from_team_id TEXT NOT NULL, to_team_id TEXT NOT NULL, offer_amount INTEGER NOT NULL,
      counter_amount INTEGER, message TEXT, reject_message TEXT, status TEXT NOT NULL DEFAULT 'pending', expires_at TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')), resolved_at TEXT, offer_type TEXT NOT NULL DEFAULT 'transfer',
      loan_duration INTEGER, last_action_by TEXT, offered_player_id TEXT, target_squad TEXT NOT NULL DEFAULT 'senior',
      player_interest INTEGER, virtual_team_data TEXT, upfront_pct INTEGER NOT NULL DEFAULT 100, installments INTEGER NOT NULL DEFAULT 0,
      sell_on_pct INTEGER NOT NULL DEFAULT 0
    );
    CREATE TABLE transfer_offer_events (
      id TEXT PRIMARY KEY, offer_id TEXT NOT NULL, team_id TEXT NOT NULL, event_type TEXT NOT NULL, amount INTEGER, message TEXT,
      created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')), upfront_pct INTEGER, installments INTEGER, sell_on_pct INTEGER
    );
    CREATE TABLE player_contracts (
      id TEXT PRIMARY KEY, player_id TEXT NOT NULL, team_id TEXT NOT NULL, season_id TEXT, joined_at TEXT NOT NULL DEFAULT (datetime('now')),
      left_at TEXT, join_type TEXT NOT NULL, leave_type TEXT, fee INTEGER NOT NULL DEFAULT 0, is_active INTEGER NOT NULL DEFAULT 1
    );
    CREATE TABLE transactions (
      id TEXT PRIMARY KEY, team_id TEXT NOT NULL, type TEXT NOT NULL, amount INTEGER NOT NULL, balance_after INTEGER NOT NULL,
      description TEXT NOT NULL, reference_id TEXT, game_date TEXT NOT NULL
    );
    CREATE TABLE transfer_installments (
      id TEXT PRIMARY KEY, offer_id TEXT NOT NULL, player_id TEXT NOT NULL, player_name TEXT NOT NULL, buyer_team_id TEXT NOT NULL,
      seller_team_id TEXT NOT NULL, seller_name TEXT, total_amount INTEGER NOT NULL, upfront_amount INTEGER NOT NULL,
      installment_amount INTEGER NOT NULL, installments_total INTEGER NOT NULL, installments_paid INTEGER NOT NULL DEFAULT 0,
      remaining INTEGER NOT NULL, status TEXT NOT NULL DEFAULT 'active', created_game_date TEXT, last_paid_game_date TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')), closed_at TEXT
    );
    CREATE TABLE sell_on_clauses (
      id TEXT PRIMARY KEY, offer_id TEXT NOT NULL, player_id TEXT NOT NULL, player_name TEXT NOT NULL, beneficiary_team_id TEXT NOT NULL,
      owner_team_id TEXT NOT NULL, pct INTEGER NOT NULL, status TEXT NOT NULL DEFAULT 'active', paid_amount INTEGER, paid_offer_id TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')), resolved_at TEXT
    );
    CREATE TABLE injuries (id TEXT PRIMARY KEY, player_id TEXT NOT NULL, days_remaining INTEGER NOT NULL DEFAULT 0, is_fake INTEGER NOT NULL DEFAULT 0);
    CREATE TABLE transfer_listings (
      id TEXT PRIMARY KEY, player_id TEXT NOT NULL, team_id TEXT NOT NULL, asking_price INTEGER NOT NULL, league_id TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'active', expires_at TEXT NOT NULL, is_ai_listing INTEGER NOT NULL DEFAULT 0, ai_player_data TEXT,
      rejected_by TEXT, created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE transfer_bids (
      id TEXT PRIMARY KEY, listing_id TEXT NOT NULL, team_id TEXT NOT NULL, amount INTEGER NOT NULL, counter_amount INTEGER,
      last_action_by TEXT, status TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE seasons (id TEXT PRIMARY KEY, number INTEGER NOT NULL, status TEXT NOT NULL);
    CREATE TABLE season_calendar (id TEXT PRIMARY KEY, league_id TEXT NOT NULL, season_number INTEGER NOT NULL);
    CREATE TABLE conversations (
      id TEXT PRIMARY KEY, team_id TEXT NOT NULL, type TEXT NOT NULL, title TEXT NOT NULL, pinned INTEGER NOT NULL DEFAULT 0,
      unread_count INTEGER NOT NULL DEFAULT 0, last_message_text TEXT, last_message_at TEXT, created_at TEXT
    );
    CREATE TABLE messages (id TEXT PRIMARY KEY, conversation_id TEXT NOT NULL, sender_type TEXT NOT NULL, sender_name TEXT NOT NULL, body TEXT NOT NULL, sent_at TEXT);
    CREATE TABLE departed_players (
      id TEXT PRIMARY KEY, first_name TEXT, last_name TEXT, nickname TEXT, position TEXT, age INTEGER, overall_rating INTEGER,
      team_id TEXT, team_name TEXT, league_id TEXT, leave_type TEXT, season_number INTEGER, avatar TEXT, left_at TEXT
    );
    CREATE TABLE transfer_offer_swap_players (offer_id TEXT NOT NULL, player_id TEXT NOT NULL, sort_order INTEGER NOT NULL DEFAULT 0, PRIMARY KEY (offer_id, player_id));
    CREATE TABLE team_achievements (team_id TEXT NOT NULL, achievement_key TEXT NOT NULL, earned_at TEXT NOT NULL, tier TEXT, meta TEXT, PRIMARY KEY (team_id, achievement_key));
    CREATE TABLE free_agents (
      id TEXT PRIMARY KEY, district TEXT NOT NULL, first_name TEXT NOT NULL, last_name TEXT NOT NULL, nickname TEXT, age INTEGER NOT NULL,
      position TEXT NOT NULL, overall_rating INTEGER NOT NULL DEFAULT 50, skills TEXT NOT NULL DEFAULT '{}', physical TEXT NOT NULL DEFAULT '{}',
      personality TEXT NOT NULL DEFAULT '{}', life_context TEXT NOT NULL DEFAULT '{}', avatar TEXT NOT NULL DEFAULT '{}', hidden_talent REAL DEFAULT 0,
      weekly_wage INTEGER NOT NULL DEFAULT 0, source TEXT NOT NULL DEFAULT 'generated', released_from_team_id TEXT, village_id TEXT,
      rejected_by TEXT NOT NULL DEFAULT '[]', expires_at TEXT NOT NULL, is_celebrity INTEGER DEFAULT 0, nationality TEXT DEFAULT 'CZ',
      skills_max TEXT, created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE ai_coach_decisions (
      id TEXT PRIMARY KEY, team_id TEXT NOT NULL, kind TEXT NOT NULL, mode TEXT NOT NULL, model TEXT, context_ref TEXT, input_summary TEXT,
      raw_output TEXT, actions TEXT, executed TEXT, used_fallback INTEGER NOT NULL DEFAULT 0, error TEXT, tokens_in INTEGER, tokens_out INTEGER,
      latency_ms INTEGER, created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
    );
    CREATE TABLE ai_coach_claims (team_id TEXT NOT NULL, task TEXT NOT NULL, day TEXT NOT NULL, claimed_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')), PRIMARY KEY (team_id, task, day))
  `);
  await executeStatements(readFileSync(new URL("../../migrations/0268_player_promises.sql", import.meta.url), "utf8")
    .split("-- Sliby, které už běží")[0].replace(/--.*$/gm, ""));
  await executeStatements([
    readFileSync(new URL("../../migrations/0269_transfer_demands.sql", import.meta.url), "utf8"),
    readFileSync(new URL("../../migrations/0270_transfer_demand_skills.sql", import.meta.url), "utf8"),
  ].join(";\n").replace(/--.*$/gm, ""));

  for (const [token, userId, teamId] of [["human-token", "user-human", "human"], ["former-token", "user-former", "former-new"], ["third-token", "user-third", "third"]]) {
    await sessionKv.put(`session:${token}`, JSON.stringify({ userId, email: `${userId}@test.local`, teamId, createdAt: GAME_DATE }));
  }

  env = {
    DB: db, SESSION_KV: sessionKv, CACHE_KV: cacheKv,
    GEMINI_API_KEY: "", VAPID_PUBLIC_KEY: "", VAPID_PRIVATE_KEY: "", VAPID_SUBJECT: "",
  } as unknown as Bindings;
});

afterAll(async () => {
  await miniflare.dispose();
});

const AI_SQUAD: Array<[string, string, number, number]> = [
  // id, post, hodnocení, věk
  ["ai-gk1", "GK", 50, 28], ["ai-gk2", "GK", 44, 31],
  ["ai-def1", "DEF", 55, 26], ["ai-def2", "DEF", 52, 27], ["ai-def3", "DEF", 50, 25], ["ai-def4", "DEF", 48, 29], ["ai-def5", "DEF", 44, 30], ["ai-def6", "DEF", 40, 33],
  ["ai-mid1", "MID", 54, 25], ["ai-mid2", "MID", 51, 26], ["ai-mid3", "MID", 49, 27], ["ai-mid4", "MID", 47, 28], ["ai-mid5", "MID", 43, 30], ["ai-mid6", "MID", 41, 32],
  ["ai-fwd1", "FWD", 53, 26], ["ai-fwd2", "FWD", 50, 27], ["ai-fwd3", "FWD", 45, 29], ["ai-fwd4", "FWD", 42, 31],
  ["ai-ext1", "MID", 39, 33], ["ai-ext2", "DEF", 38, 34],
];

function playerInsert(id: string, teamId: string, position: string, rating: number, age: number) {
  return db.prepare(
    `INSERT INTO players (id, team_id, first_name, last_name, age, position, overall_rating, weekly_wage, residence)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'Testov')`,
  ).bind(id, teamId, "Hráč", id, age, position, rating, Math.round(10 + rating * 4));
}

beforeEach(async () => {
  vi.clearAllMocks();
  await executeStatements(`
    DELETE FROM messages; DELETE FROM conversations; DELETE FROM transactions; DELETE FROM transfer_offer_events; DELETE FROM transfer_bids;
    DELETE FROM transfer_listings; DELETE FROM player_contracts; DELETE FROM transfer_offer_swap_players; DELETE FROM transfer_offers;
    DELETE FROM players; DELETE FROM managers; DELETE FROM teams; DELETE FROM villages; DELETE FROM leagues; DELETE FROM seasons;
    DELETE FROM sponsor_contracts; DELETE FROM club_links; DELETE FROM ai_coach_decisions; DELETE FROM ai_coach_claims;
    DELETE FROM transfer_demands; DELETE FROM transfer_demand_pitches; DELETE FROM free_agents; DELETE FROM transfer_installments;
    DELETE FROM sell_on_clauses; DELETE FROM player_promises; DELETE FROM injuries
  `);
  await cacheKv.delete("ai_coach_mode");

  const stmts: D1PreparedStatement[] = [
    db.prepare("INSERT INTO villages (id, name, district, lat, lng) VALUES ('village', 'Testov', 'Test', 49.0, 14.0)"),
    db.prepare("INSERT INTO leagues (id, name, district, league_type) VALUES ('league-a', 'Okresní přebor Test', 'Test', 'senior')"),
    db.prepare("INSERT INTO seasons (id, number, status) VALUES ('season', 3, 'active')"),
    db.prepare("INSERT INTO sponsor_contracts (id, team_id, monthly_amount) VALUES ('sp-human', 'human', 100000)"),
  ];
  const team = (id: string, userId: string, name: string, budget: number, former: string | null = null) =>
    db.prepare(`INSERT INTO teams (id, user_id, team_type, name, budget, game_date, league_id, village_id, ai_former_user_id)
      VALUES (?, ?, 'senior', ?, ?, ?, 'league-a', 'village', ?)`).bind(id, userId, name, budget, GAME_DATE, former);
  stmts.push(
    team("ai-club", "ai", "Sokol Lhota", 150_000),
    team("human", "user-human", "FK Testov", 300_000),
    team("third", "user-third", "TJ Třetí", 300_000),
    // Opuštěný klub, který převzal AI trenér, a nový klub jeho bývalého majitele.
    team("ai-taken", "ai", "Převzaté Kobylisy", 100_000, "user-former"),
    team("former-new", "user-former", "Nový klub bývalého majitele", 300_000),
    db.prepare("INSERT INTO managers (id, team_id, user_id, name, avatar) VALUES ('m-ai', 'ai-club', 'ai', 'Jan Trenér', '{}'), ('m-human', 'human', 'user-human', 'Petr Člověk', '{}')"),
  );
  for (const [id, pos, rating, age] of AI_SQUAD) stmts.push(playerInsert(id, "ai-club", pos, rating, age));
  // Převzatý klub: jeden brankář a pár hráčů.
  stmts.push(playerInsert("taken-gk", "ai-taken", "GK", 48, 27), playerInsert("taken-mid", "ai-taken", "MID", 50, 26));
  // Lidský klub: pár hráčů na výměnu a útočník, kterého by AI mohla chtít.
  stmts.push(
    playerInsert("h-weak-mid", "human", "MID", 38, 31),
    playerInsert("h-young-mid", "human", "MID", 34, 19),
    playerInsert("h-fwd", "human", "FWD", 58, 25),
  );
  await db.batch(stmts);
});

async function callRoute(path: string, options: { method?: string; token?: string; body?: Record<string, unknown> } = {}) {
  const headers = new Headers();
  if (options.token) headers.set("Authorization", `Bearer ${options.token}`);
  if (options.body) headers.set("Content-Type", "application/json");
  const pending: Promise<unknown>[] = [];
  const ctx = { waitUntil: (p: Promise<unknown>) => pending.push(p), passThroughOnException: () => undefined } as unknown as ExecutionContext;
  const res = await gameRouter.fetch(new Request(`http://test.local${path}`, {
    method: options.method ?? "GET", headers, body: options.body ? JSON.stringify(options.body) : undefined,
  }), env, ctx);
  await Promise.all(pending);
  return res;
}

async function offerFromHuman(body: Record<string, unknown>, token = "human-token", team = "human") {
  const res = await callRoute(`/teams/${team}/offers`, { method: "POST", token, body });
  const json = await res.json() as Record<string, unknown>;
  return { status: res.status, offerId: json.offerId as string, json };
}

async function offerRow(id: string) {
  return db.prepare("SELECT status, counter_amount, offer_amount, last_action_by, upfront_pct, installments FROM transfer_offers WHERE id = ?")
    .bind(id).first<{ status: string; counter_amount: number | null; offer_amount: number; last_action_by: string | null; upfront_pct: number; installments: number }>();
}

async function budgetOf(teamId: string): Promise<number> {
  return (await db.prepare("SELECT budget FROM teams WHERE id = ?").bind(teamId).first<{ budget: number }>())!.budget;
}

async function smsTo(teamId: string): Promise<string[]> {
  const rows = await db.prepare("SELECT m.body FROM messages m JOIN conversations c ON c.id = m.conversation_id WHERE c.team_id = ?")
    .bind(teamId).all<{ body: string }>();
  return rows.results.map((r) => r.body);
}

async function analysisNow() {
  return analyzeSquad(await loadClubSquad(db, "ai-club"), PROFILE);
}

function mvOf(id: string): number {
  const p = AI_SQUAD.find(([pid]) => pid === id)!;
  return marketValue(p[2], p[3], p[1]);
}

describe("člověk kupuje od AI klubu", () => {
  it("nabídka nad požadavkem projde až po lidské prodlevě a přesune peníze i hráče jako mezi lidmi", async () => {
    const squad = await analysisNow();
    const playerId = "ai-mid4";
    const importance = squad.importanceOf(playerId);
    const when = later();
    const ask = openingAsk({ marketValue: mvOf(playerId), importance, profile: PROFILE, playerId, now: when });
    const offer = await offerFromHuman({ playerId, amount: ask });
    expect(offer.status).toBe(200);
    // AI klubu nepřišla SMS ani oznámení, odpoví sám.
    expect(await smsTo("ai-club")).toEqual([]);
    expect(sideEffects.createNotification).not.toHaveBeenCalled();

    // Hned to AI nevyřídí: odpovídá za 1 až 20 hodin.
    expect(await replyToTransferOffers(env, "ai-club", new Date(), PROFILE)).toBe(0);
    expect((await offerRow(offer.offerId))?.status).toBe("pending");

    const before = { human: await budgetOf("human"), ai: await budgetOf("ai-club") };
    expect(await replyToTransferOffers(env, "ai-club", when, PROFILE)).toBe(1);
    expect((await offerRow(offer.offerId))?.status).toBe("accepted");
    expect(await budgetOf("human")).toBe(before.human - ask);
    expect(await budgetOf("ai-club")).toBe(before.ai + ask);
    const moved = await db.prepare("SELECT team_id FROM players WHERE id = ?").bind(playerId).first<{ team_id: string }>();
    expect(moved?.team_id).toBe("human");
    const tx = await db.prepare("SELECT team_id, type, amount FROM transactions ORDER BY team_id").all<{ team_id: string; type: string; amount: number }>();
    expect(tx.results).toEqual([
      { team_id: "ai-club", type: "transfer_income", amount: ask },
      { team_id: "human", type: "transfer_fee", amount: -ask },
    ]);
    const contract = await db.prepare("SELECT team_id, join_type, fee FROM player_contracts WHERE player_id = ? AND is_active = 1").bind(playerId).first();
    expect(contract).toEqual({ team_id: "human", join_type: "transfer", fee: ask });
    // Člověk dostal SMS jako od lidského klubu, AI klub nic.
    expect((await smsTo("human")).some((b) => b.includes("Přestup potvrzen"))).toBe(true);
    expect(await smsTo("ai-club")).toEqual([]);
    // Deník rozhodnutí.
    const log = await db.prepare("SELECT kind, mode, executed FROM ai_coach_decisions WHERE context_ref = ?").bind(offer.offerId).first();
    expect(log).toEqual({ kind: "transfer_reply", mode: "on", executed: JSON.stringify("accepted") });

    // Druhý běh (duplicitní zpráva z fronty) už nic neudělá.
    expect(await replyToTransferOffers(env, "ai-club", later(22), PROFILE)).toBe(0);
  });

  it("mírně pod rezervací přijde protinávrh nad rezervací; člověk ho přijme přes routu", async () => {
    const playerId = "ai-mid3";
    const when = later();
    const squad = await analysisNow();
    const reservation = reservationPrice({ marketValue: mvOf(playerId), importance: squad.importanceOf(playerId), profile: PROFILE, playerId, now: when });
    const bid = Math.ceil(reservation * 0.9 / 100) * 100;
    const offer = await offerFromHuman({ playerId, amount: bid });
    await replyToTransferOffers(env, "ai-club", when, PROFILE);
    const row = await offerRow(offer.offerId);
    expect(row?.status).toBe("countered");
    expect(row?.last_action_by).toBe("ai-club");
    expect(row?.counter_amount).toBeGreaterThanOrEqual(reservation);
    // Člověk vidí protinávrh jako od kteréhokoli klubu a je na tahu.
    const list = await callRoute("/teams/human/offers", { token: "human-token" });
    const { outgoing } = await list.json() as { outgoing: Array<{ id: string; on_turn: boolean; to_team_name: string }> };
    expect(outgoing.find((o) => o.id === offer.offerId)).toMatchObject({ on_turn: true, to_team_name: "Sokol Lhota" });
    const accept = await callRoute(`/teams/human/offers/${offer.offerId}/accept`, { method: "POST", token: "human-token", body: {} });
    expect(accept.status).toBe(200);
    expect((await db.prepare("SELECT team_id FROM players WHERE id = ?").bind(playerId).first<{ team_id: string }>())?.team_id).toBe("human");
  });

  it("nabídka pod 60 % tržní hodnoty se odmítne a další nabídka na hráče jde až po 10 dnech", async () => {
    const playerId = "ai-def3";
    const lowball = Math.floor(mvOf(playerId) * 0.55 / 100) * 100;
    const offer = await offerFromHuman({ playerId, amount: lowball });
    await replyToTransferOffers(env, "ai-club", later(), PROFILE);
    expect((await offerRow(offer.offerId))?.status).toBe("rejected");
    expect((await smsTo("human")).some((b) => b.includes("odmítl"))).toBe(true);
    // Odmítnutí AI klubu hráče naštve stejně jako u člověka (spec AI klubů 3.2). Zprávy AI klubu
    // applyOfferRejectionImpact nepíše, to hlídá ai-club-unrest.db.test.ts.
    expect(sideEffects.applyOfferRejectionImpact).toHaveBeenCalledTimes(1);
    expect(sideEffects.applyOfferRejectionImpact).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ id: offer.offerId }), "reject", expect.anything());
    const retry = await offerFromHuman({ playerId, amount: lowball + 5000 });
    expect(retry.status).toBe(429);
  });

  it("opakované zkoušení ceny přes stažení a novou nabídku AI nevynuluje a pod rezervaci nejde", async () => {
    const playerId = "ai-mid2";
    const when = later();
    const squad = await analysisNow();
    const reservation = reservationPrice({ marketValue: mvOf(playerId), importance: squad.importanceOf(playerId), profile: PROFILE, playerId, now: when });
    let amount = Math.ceil(reservation * 0.8 / 100) * 100;
    const asks: number[] = [];
    let finalStatus = "";
    for (let round = 0; round < 8; round++) {
      const offer = await offerFromHuman({ playerId, amount });
      if (offer.status !== 200) { finalStatus = `blocked:${offer.status}`; break; }
      await replyToTransferOffers(env, "ai-club", new Date(when.getTime() + round * HOUR), PROFILE);
      const row = await offerRow(offer.offerId);
      if (row?.status !== "countered") { finalStatus = row?.status ?? "missing"; break; }
      expect(row.counter_amount).toBeGreaterThanOrEqual(reservation);
      asks.push(row.counter_amount!);
      // Člověk protinávrh nebere, stáhne nabídku a zkusí to znovu o kousek výš.
      const withdraw = await callRoute(`/teams/human/offers/${offer.offerId}`, { method: "DELETE", token: "human-token", body: {} });
      expect(withdraw.status).toBe(200);
      amount += 200;
    }
    // AI ztratí trpělivost a jednání ukončí; hráče nikdy nepustí pod rezervací.
    expect(finalStatus).toBe("rejected");
    expect(asks.length).toBeGreaterThan(0);
    for (let i = 1; i < asks.length; i++) expect(asks[i]).toBeLessThanOrEqual(asks[i - 1]);
    expect((await db.prepare("SELECT team_id FROM players WHERE id = ?").bind(playerId).first<{ team_id: string }>())?.team_id).toBe("ai-club");
  });

  it("splátky s 10% zálohou na úrovni rezervace AI nevezme, stejnou částku hotově ano", async () => {
    const when = later();
    const squad = await analysisNow();
    const cashPlayer = "ai-fwd3";
    const instPlayer = "ai-def4";
    const priceFor = (playerId: string) => openingAsk({ marketValue: mvOf(playerId), importance: squad.importanceOf(playerId), profile: PROFILE, playerId, now: when });
    const instAmount = priceFor(instPlayer);
    const inst = await offerFromHuman({ playerId: instPlayer, amount: instAmount, upfrontPct: 10, installments: 20 });
    expect(inst.status).toBe(200);
    const cash = await offerFromHuman({ playerId: cashPlayer, amount: priceFor(cashPlayer) });
    await replyToTransferOffers(env, "ai-club", when, PROFILE);
    expect((await offerRow(cash.offerId))?.status).toBe("accepted");
    const instRow = await offerRow(inst.offerId);
    expect(instRow?.status).not.toBe("accepted");
    if (instRow?.status === "countered") expect(instRow.counter_amount).toBeGreaterThan(instAmount);
  });

  it("výměna za slabšího hráče s doplatkem do tržní ceny se nepřijme", async () => {
    const playerId = "ai-mid1";
    const topUp = Math.max(100, Math.ceil((mvOf(playerId) - marketValue(38, 31, "MID")) / 100) * 100);
    const offer = await offerFromHuman({ playerId, amount: topUp, offeredPlayerIds: ["h-weak-mid"] });
    expect(offer.status).toBe(200);
    await replyToTransferOffers(env, "ai-club", later(), PROFILE);
    expect((await offerRow(offer.offerId))?.status).not.toBe("accepted");
    expect((await db.prepare("SELECT team_id FROM players WHERE id = 'h-weak-mid'").first<{ team_id: string }>())?.team_id).toBe("human");
  });

  it("posledního brankáře AI neprodá ani za trojnásobek", async () => {
    const offer = await offerFromHuman({ playerId: "taken-gk", amount: marketValue(48, 27, "GK") * 3 }, "third-token", "third");
    expect(offer.status).toBe(200);
    await replyToTransferOffers(env, "ai-taken", later(), PROFILE);
    expect((await offerRow(offer.offerId))?.status).toBe("rejected");
    expect((await db.prepare("SELECT team_id FROM players WHERE id = 'taken-gk'").first<{ team_id: string }>())?.team_id).toBe("ai-taken");
  });

  it("klub bývalého majitele s převzatým klubem neobchoduje: nabídka neprojde, stará se odmítne", async () => {
    const direct = await offerFromHuman({ playerId: "taken-mid", amount: 200_000 }, "former-token", "former-new");
    expect(direct.status).toBe(403);
    // Nabídka z doby před převzetím: AI ji nepřijme, i když je štědrá.
    await db.prepare(`INSERT INTO transfer_offers (id, player_id, from_team_id, to_team_id, offer_amount, status, expires_at, last_action_by)
      VALUES ('old-offer', 'taken-mid', 'former-new', 'ai-taken', 200000, 'pending', ?, 'former-new')`).bind(new Date(Date.now() + 3 * 86_400_000).toISOString()).run();
    await replyToTransferOffers(env, "ai-taken", later(), PROFILE);
    expect((await offerRow("old-offer"))?.status).toBe("rejected");
    expect((await db.prepare("SELECT team_id FROM players WHERE id = 'taken-mid'").first<{ team_id: string }>())?.team_id).toBe("ai-taken");
    expect(await budgetOf("former-new")).toBe(300_000);
  });

  it("souběžné protinávrhy kádr nerozeberou: oba brankáři ani hráči pod minimum najednou", async () => {
    const when = later();
    const squad = await analysisNow();
    const nearReservation = (playerId: string) => Math.ceil(reservationPrice({
      marketValue: mvOf(playerId), importance: squad.importanceOf(playerId), profile: PROFILE, playerId, now: when,
    }) * 0.9 / 100) * 100;
    // Kádr na hraně: 17 hráčů áčka (minimum je 16).
    await db.prepare("DELETE FROM players WHERE id IN ('ai-ext1', 'ai-ext2', 'ai-def6')").run();
    const gk1 = await offerFromHuman({ playerId: "ai-gk1", amount: nearReservation("ai-gk1") });
    const gk2 = await offerFromHuman({ playerId: "ai-gk2", amount: nearReservation("ai-gk2") });
    const def5 = await offerFromHuman({ playerId: "ai-def5", amount: nearReservation("ai-def5") });
    await replyToTransferOffers(env, "ai-club", when, PROFILE);
    const statuses = await Promise.all([gk1, gk2, def5].map(async (o) => (await offerRow(o.offerId))?.status));
    // Nanejvýš jeden protinávrh: další hráč by s ním dohromady porušil pojistku kádru.
    expect(statuses.filter((s) => s === "countered" || s === "accepted").length).toBe(1);
    // Člověk přijme, co jde: AI má pořád brankáře a aspoň 16 hráčů.
    for (const o of [gk1, gk2, def5]) {
      if ((await offerRow(o.offerId))?.status === "countered") {
        await callRoute(`/teams/human/offers/${o.offerId}/accept`, { method: "POST", token: "human-token", body: {} });
      }
    }
    const left = await db.prepare("SELECT COUNT(*) AS n, SUM(CASE WHEN position = 'GK' THEN 1 ELSE 0 END) AS gk FROM players WHERE team_id = 'ai-club'")
      .first<{ n: number; gk: number }>();
    expect(left!.gk).toBeGreaterThanOrEqual(1);
    expect(left!.n).toBeGreaterThanOrEqual(16);
  });

  it("protinávrh AI, který mezitím přestal jít (kádr se změnil), se při přijetí neprovede", async () => {
    const when = later();
    const squad = await analysisNow();
    const amount = Math.ceil(reservationPrice({ marketValue: mvOf("ai-gk1"), importance: squad.importanceOf("ai-gk1"), profile: PROFILE, playerId: "ai-gk1", now: when }) * 0.9 / 100) * 100;
    const offer = await offerFromHuman({ playerId: "ai-gk1", amount });
    await replyToTransferOffers(env, "ai-club", when, PROFILE);
    expect((await offerRow(offer.offerId))?.status).toBe("countered");
    // Druhý brankář mezitím z klubu odešel: přijetím by AI zůstala bez brankáře.
    await db.prepare("DELETE FROM players WHERE id = 'ai-gk2'").run();
    const before = await budgetOf("human");
    const accept = await callRoute(`/teams/human/offers/${offer.offerId}/accept`, { method: "POST", token: "human-token", body: {} });
    expect(accept.status).toBe(409);
    expect((await offerRow(offer.offerId))?.status).toBe("withdrawn");
    expect((await db.prepare("SELECT team_id FROM players WHERE id = 'ai-gk1'").first<{ team_id: string }>())?.team_id).toBe("ai-club");
    expect(await budgetOf("human")).toBe(before);
  });

  it("hráče s doložkou pro kupujícího AI za rezervaci nepustí: zpětný odkup s procenty nevynese", async () => {
    const playerId = "ai-mid4";
    const when = later();
    const squad = await analysisNow();
    const ask = openingAsk({ marketValue: mvOf(playerId), importance: squad.importanceOf(playerId), profile: PROFILE, playerId, now: when });
    // AI klub hráče kdysi koupil od člověka s doložkou 50 % z dalšího prodeje.
    await db.prepare(`INSERT INTO sell_on_clauses (id, offer_id, player_id, player_name, beneficiary_team_id, owner_team_id, pct)
      VALUES ('clause', 'old', ?, 'Hráč', 'human', 'ai-club', 50)`).bind(playerId).run();
    const offer = await offerFromHuman({ playerId, amount: ask });
    await replyToTransferOffers(env, "ai-club", when, PROFILE);
    const row = await offerRow(offer.offerId);
    expect(row?.status).not.toBe("accepted");
    if (row?.status === "countered") expect(row.counter_amount).toBeGreaterThanOrEqual(ask * 1.9);
  });

  it("v režimu shadow AI jen zapíše rozhodnutí do deníku a nabídku nechá", async () => {
    await cacheKv.put("ai_coach_mode", JSON.stringify({ market: "shadow" }));
    const offer = await offerFromHuman({ playerId: "ai-fwd4", amount: 200_000 });
    await replyToTransferOffers(env, "ai-club", later(), PROFILE);
    expect((await offerRow(offer.offerId))?.status).toBe("pending");
    const log = await db.prepare("SELECT mode, executed, actions FROM ai_coach_decisions WHERE context_ref = ?").bind(offer.offerId).first<{ mode: string; executed: string; actions: string }>();
    expect(log?.mode).toBe("shadow");
    expect(JSON.parse(log!.executed)).toBe("shadow");
    expect(JSON.parse(log!.actions).kind).toBe("accept");
    // Další hodina v shadow nic nového nezapíše, po přepnutí na `on` AI opravdu odpoví.
    await replyToTransferOffers(env, "ai-club", later(22), PROFILE);
    expect((await db.prepare("SELECT COUNT(*) AS n FROM ai_coach_decisions WHERE context_ref = ?").bind(offer.offerId).first<{ n: number }>())?.n).toBe(1);
    await cacheKv.put("ai_coach_mode", "on");
    await replyToTransferOffers(env, "ai-club", later(23), PROFILE);
    expect((await offerRow(offer.offerId))?.status).toBe("accepted");
  });

  it("přebytečného mladíka AI půjčí i zadarmo, oporu nepůjčí ani za peníze", async () => {
    await db.batch([playerInsert("ai-young", "ai-club", "MID", 33, 19)]);
    const young = await offerFromHuman({ playerId: "ai-young", amount: 0, offerType: "loan", loanDuration: 45 });
    expect(young.status).toBe(200);
    const key = await offerFromHuman({ playerId: "ai-def1", amount: 20_000, offerType: "loan", loanDuration: 30 });
    expect(key.status).toBe(200);
    await replyToTransferOffers(env, "ai-club", later(), PROFILE);
    expect((await offerRow(young.offerId))?.status).toBe("accepted");
    const loaned = await db.prepare("SELECT team_id, loan_from_team_id FROM players WHERE id = 'ai-young'").first();
    expect(loaned).toEqual({ team_id: "human", loan_from_team_id: "ai-club" });
    expect((await offerRow(key.offerId))?.status).toBe("rejected");
    expect((await db.prepare("SELECT team_id FROM players WHERE id = 'ai-def1'").first<{ team_id: string }>())?.team_id).toBe("ai-club");
  });

  it("nabídku klubu mimo hru AI přijme jen nad rezervací, smlouvat s ním nejde", async () => {
    const insertVirtual = (id: string, playerId: string, amount: number) => db.prepare(
      `INSERT INTO transfer_offers (id, player_id, from_team_id, to_team_id, offer_amount, offer_type, status, message, virtual_team_data, expires_at, created_at)
       VALUES (?, ?, 'virtual_ai', 'ai-club', ?, 'transfer', 'pending', 'Zájem', '{"name":"SK Strakonice"}', ?, strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))`,
    ).bind(id, playerId, amount, new Date(Date.now() + 3 * 86_400_000).toISOString()).run();
    await insertVirtual("v-low", "ai-def5", Math.floor(mvOf("ai-def5") * 0.8 / 100) * 100);
    await insertVirtual("v-high", "ai-fwd4", mvOf("ai-fwd4") * 3);
    await replyToTransferOffers(env, "ai-club", later(), PROFILE);
    expect((await offerRow("v-low"))?.status).toBe("rejected");
    expect((await offerRow("v-high"))?.status).toBe("accepted");
    expect(await db.prepare("SELECT id FROM players WHERE id = 'ai-fwd4'").first()).toBeNull();
  });
});

describe("o nabídce na hráče AI klubu rozhoduje model, kód hlídá", () => {
  const reservationOf = async (playerId: string, when: Date) => {
    const squad = await analysisNow();
    return reservationPrice({ marketValue: mvOf(playerId), importance: squad.importanceOf(playerId), profile: PROFILE, playerId, now: when });
  };
  const askOf = async (playerId: string, when: Date) => {
    const squad = await analysisNow();
    return openingAsk({ marketValue: mvOf(playerId), importance: squad.importanceOf(playerId), profile: PROFILE, playerId, now: when });
  };
  const teamOf = async (playerId: string) =>
    (await db.prepare("SELECT team_id FROM players WHERE id = ?").bind(playerId).first<{ team_id: string }>())?.team_id;

  it("model přijme nabídku mezi rezervací a požadavkem a přijetí se provede jako mezi lidmi", async () => {
    const playerId = "ai-mid4";
    const when = later();
    const reservation = await reservationOf(playerId, when);
    const ai = fakeAi({ action: "accept", amount: 0, reason: "Fair money for a backup." });
    const offer = await offerFromHuman({ playerId, amount: reservation });
    const before = { human: await budgetOf("human"), ai: await budgetOf("ai-club") };
    expect(await replyToTransferOffers(withAi(ai), "ai-club", when, PROFILE)).toBe(1);
    expect(ai.calls).toBe(1);
    expect((await offerRow(offer.offerId))?.status).toBe("accepted");
    expect(await budgetOf("ai-club")).toBe(before.ai + reservation);
    expect(await budgetOf("human")).toBe(before.human - reservation);
    expect(await teamOf(playerId)).toBe("human");
    const log = await decisionFor(offer.offerId);
    expect(log).toMatchObject({ mode: "on", model: COACH_MODEL, used_fallback: 0, error: null, tokens_in: 10, tokens_out: 5 });
    expect(JSON.parse(log!.executed)).toBe("accepted");
    expect(JSON.parse(log!.actions)).toMatchObject({
      kind: "accept", reason: "model", decidedBy: "model", reasoning: "Fair money for a backup.", allowed: ["accept", "counter", "reject"],
    });
    // Model dostal čísla, povahu a možnosti; žádný text, který píšou lidé (název klubu).
    expect(ai.prompts[0]).toContain(`your minimum ${reservation.toLocaleString("en-US")} CZK`);
    expect(ai.prompts[0]).toContain("a club run by a human manager, from your district");
    expect(ai.prompts[0]).not.toContain("FK Testov");
    expect(log!.input_summary).toContain("OPTIONS:");
  });

  it("přijetí pod rezervací model neprosadí: rozhodne náhradní pravidlo a pošle protinávrh nad rezervací", async () => {
    const playerId = "ai-mid3";
    const when = later();
    const reservation = await reservationOf(playerId, when);
    const ai = fakeAi({ action: "accept", amount: 0, reason: "Take the money." });
    const offer = await offerFromHuman({ playerId, amount: Math.ceil(reservation * 0.9 / 100) * 100 });
    await replyToTransferOffers(withAi(ai), "ai-club", when, PROFILE);
    expect(ai.calls).toBe(1);
    const row = await offerRow(offer.offerId);
    expect(row?.status).toBe("countered");
    expect(row?.counter_amount).toBeGreaterThanOrEqual(reservation);
    expect(await teamOf(playerId)).toBe("ai-club");
    const log = await decisionFor(offer.offerId);
    expect(log).toMatchObject({ used_fallback: 1, model: COACH_MODEL });
    expect(log!.error).toContain("nepřípustná akce");
    expect(log!.raw_output).toContain("accept");
    expect(JSON.parse(log!.actions)).toMatchObject({ kind: "counter", decidedBy: "fallback", allowed: ["counter", "reject"] });
  });

  it("protinávrh modelu mimo meze neprojde, pod rezervací ani nad požadavkem", async () => {
    const when = later();
    const midReservation = await reservationOf("ai-mid3", when);
    const fwdReservation = await reservationOf("ai-fwd3", when);
    const ai = fakeAi((req: FakeModelInput) => (req.messages[1].content.includes("PLAYER: FWD")
      ? { action: "counter", amount: 9_000_000, reason: "Greedy." }
      : { action: "counter", amount: Math.floor(midReservation * 0.5 / 100) * 100, reason: "Cheap." }));
    const mid = await offerFromHuman({ playerId: "ai-mid3", amount: Math.ceil(midReservation * 0.9 / 100) * 100 });
    const fwd = await offerFromHuman({ playerId: "ai-fwd3", amount: Math.ceil(fwdReservation * 0.9 / 100) * 100 });
    await replyToTransferOffers(withAi(ai), "ai-club", when, PROFILE);
    expect(ai.calls).toBe(2);
    for (const [offer, reservation] of [[mid, midReservation], [fwd, fwdReservation]] as const) {
      const row = await offerRow(offer.offerId);
      expect(row?.status).toBe("countered");
      expect(row?.counter_amount).toBeGreaterThanOrEqual(reservation);
      expect(row?.counter_amount).toBeLessThan(9_000_000);
      const log = await decisionFor(offer.offerId);
      expect(log?.used_fallback).toBe(1);
      expect(log?.error).toContain("mimo meze");
    }
  });

  it("protinávrh modelu v mezích odejde přesně a člověk ho může přijmout", async () => {
    const playerId = "ai-def4";
    const when = later();
    const reservation = await reservationOf(playerId, when);
    const counterAt = Math.min(reservation + 500, await askOf(playerId, when));
    const ai = fakeAi({ action: "counter", amount: counterAt, reason: "Meet me in the middle." });
    const offer = await offerFromHuman({ playerId, amount: Math.ceil(reservation * 0.9 / 100) * 100 });
    await replyToTransferOffers(withAi(ai), "ai-club", when, PROFILE);
    expect(await offerRow(offer.offerId)).toMatchObject({ status: "countered", counter_amount: counterAt, last_action_by: "ai-club" });
    const log = await decisionFor(offer.offerId);
    expect(log?.used_fallback).toBe(0);
    expect(JSON.parse(log!.actions)).toMatchObject({ kind: "counter", reason: "model", ask: counterAt, decidedBy: "model" });
    const accept = await callRoute(`/teams/human/offers/${offer.offerId}/accept`, { method: "POST", token: "human-token", body: {} });
    expect(accept.status).toBe(200);
    expect(await teamOf(playerId)).toBe("human");
  });

  it("pod 60 % tržní hodnoty odmítne kód, model se vůbec neptá", async () => {
    const ai = fakeAi({ action: "accept", amount: 0, reason: "Any money is good money." });
    const playerId = "ai-def3";
    const offer = await offerFromHuman({ playerId, amount: Math.floor(mvOf(playerId) * 0.55 / 100) * 100 });
    await replyToTransferOffers(withAi(ai), "ai-club", later(), PROFILE);
    expect(ai.calls).toBe(0);
    expect((await offerRow(offer.offerId))?.status).toBe("rejected");
    const log = await decisionFor(offer.offerId);
    expect(log).toMatchObject({ model: null, used_fallback: 0, error: null, raw_output: null, tokens_in: null });
    expect(JSON.parse(log!.actions)).toMatchObject({ kind: "reject", reason: "hard_floor", decidedBy: "guard", allowed: ["reject"] });
  });

  it("nabídku ve výši vlastního protinávrhu AI přijme kód bez modelu", async () => {
    const playerId = "ai-mid2";
    const when = laterInWindow(3);
    const reservation = await reservationOf(playerId, when);
    const counterAt = Math.min(reservation + 300, await askOf(playerId, when));
    const ai = fakeAi({ action: "counter", amount: counterAt, reason: "My price." });
    const offer = await offerFromHuman({ playerId, amount: Math.ceil(reservation * 0.9 / 100) * 100 });
    await replyToTransferOffers(withAi(ai), "ai-club", when, PROFILE);
    expect((await offerRow(offer.offerId))?.counter_amount).toBe(counterAt);
    // Člověk místo přijetí pošle protinávrh přesně ve výši požadavku AI: AI své slovo dodrží.
    const counter = await callRoute(`/teams/human/offers/${offer.offerId}/counter`, { method: "POST", token: "human-token", body: { amount: counterAt } });
    expect(counter.status).toBe(200);
    await replyToTransferOffers(withAi(ai), "ai-club", new Date(when.getTime() + HOUR), PROFILE);
    expect(ai.calls).toBe(1);
    expect((await offerRow(offer.offerId))?.status).toBe("accepted");
    const log = await decisionFor(offer.offerId);
    expect(log).toMatchObject({ model: null, used_fallback: 0 });
    expect(JSON.parse(log!.actions)).toMatchObject({ kind: "accept", reason: "accept_ask", decidedBy: "guard" });
  });

  it("v režimu shadow model rozhodne a zapíše, nic se neprovede a opakovaný běh se ho znovu neptá", async () => {
    await cacheKv.put("ai_coach_mode", JSON.stringify({ market: "shadow" }));
    const playerId = "ai-fwd4";
    const when = laterInWindow(3);
    const reservation = await reservationOf(playerId, when);
    const ai = fakeAi({ action: "accept", amount: 0, reason: "Good money for a veteran." });
    const offer = await offerFromHuman({ playerId, amount: reservation });
    await replyToTransferOffers(withAi(ai), "ai-club", when, PROFILE);
    expect(ai.calls).toBe(1);
    expect((await offerRow(offer.offerId))?.status).toBe("pending");
    expect(await teamOf(playerId)).toBe("ai-club");
    const log = await decisionFor(offer.offerId);
    expect(log).toMatchObject({ mode: "shadow", model: COACH_MODEL, used_fallback: 0 });
    expect(JSON.parse(log!.executed)).toBe("shadow");
    expect(JSON.parse(log!.actions)).toMatchObject({ kind: "accept", decidedBy: "model" });
    await replyToTransferOffers(withAi(ai), "ai-club", new Date(when.getTime() + HOUR), PROFILE);
    expect(ai.calls).toBe(1);
    expect((await db.prepare("SELECT COUNT(*) AS n FROM ai_coach_decisions WHERE context_ref = ?").bind(offer.offerId).first<{ n: number }>())?.n).toBe(1);
    // Po přepnutí na `on` se model zeptá znovu a přijetí se provede.
    await cacheKv.put("ai_coach_mode", "on");
    await replyToTransferOffers(withAi(ai), "ai-club", new Date(when.getTime() + 2 * HOUR), PROFILE);
    expect(ai.calls).toBe(2);
    expect((await offerRow(offer.offerId))?.status).toBe("accepted");
  });

  it("ani povolný model nepustí hráče pod rezervací: stažení a nová nabídka cenu nesrazí", async () => {
    const playerId = "ai-mid2";
    const when = laterInWindow(10);
    const reservation = await reservationOf(playerId, when);
    // Nejpovolnější model: kde smí, přijme, jinak nabídne nejnižší protinávrh, který schéma dovolí.
    const ai = fakeAi((req: FakeModelInput) => {
      const props = req.response_format!.json_schema.schema.properties;
      if (props.action.enum.includes("accept")) return { action: "accept", amount: 0, reason: "Fine." };
      if (props.action.enum.includes("counter")) return { action: "counter", amount: props.amount.minimum, reason: "Lowest I can go." };
      return { action: "reject", amount: 0, reason: "No." };
    });
    let amount = Math.ceil(reservation * 0.8 / 100) * 100;
    const asks: number[] = [];
    let finalStatus = "";
    for (let round = 0; round < 8; round++) {
      const offer = await offerFromHuman({ playerId, amount });
      if (offer.status !== 200) { finalStatus = `blocked:${offer.status}`; break; }
      await replyToTransferOffers(withAi(ai), "ai-club", new Date(when.getTime() + round * HOUR), PROFILE);
      const row = await offerRow(offer.offerId);
      if (row?.status !== "countered") { finalStatus = row?.status ?? "missing"; break; }
      asks.push(row.counter_amount!);
      const withdraw = await callRoute(`/teams/human/offers/${offer.offerId}`, { method: "DELETE", token: "human-token", body: {} });
      expect(withdraw.status).toBe(200);
      amount += 200;
    }
    expect(finalStatus).toBe("rejected");
    // Povolný model šel hned na rezervaci a níž se nedostal: strop protinávrhu dřívější požadavky jen snižují.
    expect(asks.length).toBeGreaterThan(0);
    expect(asks.every((a) => a === reservation)).toBe(true);
    // Poslední kolo (došla trpělivost, zbylo jen odmítnutí) rozhodl kód, model se už neptal.
    expect(ai.calls).toBe(asks.length);
    expect(await teamOf(playerId)).toBe("ai-club");
  });

  it("hostování: model smí chtít jen požadovaný poplatek a protinávrh odejde přesně na něj", async () => {
    const playerId = "ai-mid4";
    expect((await analysisNow()).importanceOf(playerId)).toBe("rotation");
    const age = AI_SQUAD.find(([id]) => id === playerId)![3];
    const fee = requiredLoanFee({ marketValue: mvOf(playerId), age, importance: "rotation", loanDays: 30 })!;
    const ai = fakeAi({ action: "counter", amount: fee, reason: "Pay the usual fee." });
    const offer = await offerFromHuman({ playerId, amount: 0, offerType: "loan", loanDuration: 30 });
    expect(offer.status).toBe(200);
    await replyToTransferOffers(withAi(ai), "ai-club", later(), PROFILE);
    expect(ai.calls).toBe(1);
    expect(await offerRow(offer.offerId)).toMatchObject({ status: "countered", counter_amount: fee });
    expect(ai.prompts[0]).toContain("loan for 30 days");
  });

  it("v režimu off i při výpadku modelu rozhodne náhradní pravidlo", async () => {
    await cacheKv.put("ai_coach_mode", JSON.stringify({ market: "off" }));
    const ai = fakeAi({ action: "reject", amount: 0, reason: "Never." });
    const when = later();
    const first = await offerFromHuman({ playerId: "ai-mid4", amount: await reservationOf("ai-mid4", when) });
    await replyToTransferOffers(withAi(ai), "ai-club", when, PROFILE);
    expect(ai.calls).toBe(0);
    expect(["accepted", "countered"]).toContain((await offerRow(first.offerId))?.status);
    expect(await decisionFor(first.offerId)).toMatchObject({ mode: "off", model: null, used_fallback: 1 });

    await cacheKv.put("ai_coach_mode", "on");
    const broken = { run: async () => { throw new Error("8005: Internal server error"); } };
    const second = await offerFromHuman({ playerId: "ai-fwd3", amount: await reservationOf("ai-fwd3", when) });
    await replyToTransferOffers(withAi(broken), "ai-club", when, PROFILE);
    expect(["accepted", "countered"]).toContain((await offerRow(second.offerId))?.status);
    const log = await decisionFor(second.offerId);
    expect(log).toMatchObject({ used_fallback: 1, model: COACH_MODEL });
    expect(log!.error).toContain("8005");
  });
});

describe("AI klub jako kupující: model navrhuje, kód hlídá", () => {
  const BUYER_PROFILE: AiCoachProfile = { ...PROFILE, ambition: 80, thrift: 20 };
  const fwdValue = () => marketValue(58, 25, "FWD");
  const num = (s: string) => Number(s.replace(/,/g, ""));

  /** AI klub bez útočníků poslal nabídku na útočníka člověka. */
  async function sendAiOffer(id: string, playerId: string, amount: number) {
    await db.prepare("UPDATE players SET team_id = 'third' WHERE id IN ('ai-fwd1', 'ai-fwd2', 'ai-fwd3', 'ai-fwd4')").run();
    await db.batch([
      db.prepare(`INSERT INTO transfer_offers (id, player_id, from_team_id, to_team_id, offer_amount, status, expires_at, last_action_by)
        VALUES (?, ?, 'ai-club', 'human', ?, 'pending', ?, 'ai-club')`).bind(id, playerId, amount, new Date(Date.now() + 3 * 86_400_000).toISOString()),
      db.prepare("INSERT INTO transfer_offer_events (id, offer_id, team_id, event_type, amount) VALUES (?, ?, 'ai-club', 'offer', ?)").bind(`${id}-e`, id, amount),
    ]);
  }
  const humanCounter = (id: string, body: Record<string, unknown>) =>
    callRoute(`/teams/human/offers/${id}/counter`, { method: "POST", token: "human-token", body });
  const negotiationRow = (id: string) => db.prepare("SELECT status, counter_amount, sell_on_pct, last_action_by FROM transfer_offers WHERE id = ?")
    .bind(id).first<{ status: string; counter_amount: number | null; sell_on_pct: number; last_action_by: string | null }>();
  const counterRange = (prompt: string) => {
    const m = prompt.match(/offer between ([\d,]+) CZK and ([\d,]+) CZK/);
    return m ? { min: num(m[1]), max: num(m[2]) } : null;
  };
  const limitOf = (prompt: string) => num(prompt.match(/your limit for this player is ([\d,]+) CZK/)![1]);
  const kindOf = async (ref: string) => (await db.prepare("SELECT kind FROM ai_coach_decisions WHERE context_ref = ?").bind(ref).first<{ kind: string }>())?.kind;

  it("jednání o nákupu: model přihodí v mezích a protinávrh odejde přesně", async () => {
    const bid = Math.round(fwdValue() * 0.85 / 100) * 100;
    await sendAiOffer("ai-offer", "h-fwd", bid);
    expect((await humanCounter("ai-offer", { amount: Math.round(fwdValue() * 1.3 / 100) * 100 })).status).toBe(200);
    let chosen = 0;
    const ai = fakeAi((req: FakeModelInput) => {
      const range = counterRange(req.messages[1].content)!;
      chosen = Math.floor((range.min + range.max) / 2 / 100) * 100;
      return { action: "counter", amount: chosen, reason: "Meet me halfway." };
    });
    await replyToTransferOffers(withAi(ai), "ai-club", later(), BUYER_PROFILE);
    expect(ai.calls).toBe(1);
    expect(chosen).toBeGreaterThan(bid);
    expect(await negotiationRow("ai-offer")).toMatchObject({ status: "countered", counter_amount: chosen, sell_on_pct: 0, last_action_by: "ai-club" });
    expect(await kindOf("ai-offer")).toBe("transfer_negotiation");
    const log = await decisionFor("ai-offer");
    expect(log).toMatchObject({ mode: "on", model: COACH_MODEL, used_fallback: 0, tokens_in: 10 });
    expect(JSON.parse(log!.actions)).toMatchObject({ kind: "counter", amount: chosen, decidedBy: "model" });
    expect(JSON.parse(log!.executed)).toBe("countered");
  });

  it("jednání o nákupu: protinávrh nad strop ani neznámá akce neprojdou, rozhodne pravidlo a nad strop nejde", async () => {
    for (const [id, answer] of [["over", { action: "counter", amount: 9_000_000, reason: "Whatever it takes." }], ["unknown", { action: "buy", amount: 0, reason: "?" }]] as const) {
      await db.prepare("DELETE FROM transfer_offers").run();
      await db.prepare("DELETE FROM transfer_offer_events").run();
      const bid = Math.round(fwdValue() * 0.85 / 100) * 100;
      const ask = Math.round(fwdValue() * 1.3 / 100) * 100;
      await sendAiOffer(id, "h-fwd", bid);
      expect((await humanCounter(id, { amount: ask })).status).toBe(200);
      let limit = 0;
      const ai = fakeAi((req: FakeModelInput) => { limit = limitOf(req.messages[1].content); return answer; });
      await replyToTransferOffers(withAi(ai), "ai-club", later(), BUYER_PROFILE);
      expect(ai.calls).toBe(1);
      const row = await negotiationRow(id);
      // Pravidlo bere do stropu, přihodí do stropu, nebo jednání ukončí: nad strop nikdy.
      if (row?.status === "accepted") expect(ask).toBeLessThanOrEqual(limit);
      else if (row?.status === "countered") expect(row.counter_amount).toBeLessThanOrEqual(limit);
      else expect(row?.status).toBe("withdrawn");
      const log = await decisionFor(id);
      expect(log).toMatchObject({ used_fallback: 1, error: "neplatná odpověď modelu" });
      expect(JSON.parse(log!.actions).decidedBy).toBe("fallback");
    }
  });

  it("jednání o nákupu v režimu shadow: model rozhodne a zapíše, nic se neprovede", async () => {
    await cacheKv.put("ai_coach_mode", JSON.stringify({ market: "shadow" }));
    const ask = Math.round(fwdValue() * 1.3 / 100) * 100;
    await sendAiOffer("ai-offer", "h-fwd", Math.round(fwdValue() * 0.85 / 100) * 100);
    expect((await humanCounter("ai-offer", { amount: ask })).status).toBe(200);
    const ai = fakeAi({ action: "withdraw", amount: 0, reason: "Too much." });
    await replyToTransferOffers(withAi(ai), "ai-club", later(), BUYER_PROFILE);
    expect(ai.calls).toBe(1);
    expect(await negotiationRow("ai-offer")).toMatchObject({ status: "countered", counter_amount: ask, last_action_by: "human" });
    const log = await decisionFor("ai-offer");
    expect(log).toMatchObject({ mode: "shadow", model: COACH_MODEL, used_fallback: 0 });
    expect(JSON.parse(log!.executed)).toBe("shadow");
    expect(JSON.parse(log!.actions)).toMatchObject({ kind: "withdraw", decidedBy: "model" });
  });

  it("jednání o nákupu: procenta z dalšího prodeje AI nepřijme ani na pokyn modelu a bez prostoru rozhodne kód sám", async () => {
    const bid = Math.round(fwdValue() * 0.85 / 100) * 100;
    await sendAiOffer("sell-on", "h-fwd", bid);
    expect((await humanCounter("sell-on", { amount: bid + 1000, sellOnPct: 15 })).status).toBe(200);
    const ai = fakeAi({ action: "accept", amount: 0, reason: "Deal." });
    await replyToTransferOffers(withAi(ai), "ai-club", later(), BUYER_PROFILE);
    expect(ai.calls).toBe(1);
    const row = await negotiationRow("sell-on");
    expect(row?.status).not.toBe("accepted");
    if (row?.status === "countered") expect(row).toMatchObject({ sell_on_pct: 0, last_action_by: "ai-club" });
    expect((await db.prepare("SELECT team_id FROM players WHERE id = 'h-fwd'").first<{ team_id: string }>())?.team_id).toBe("human");
    expect((await decisionFor("sell-on"))?.used_fallback).toBe(1);

    // AI už nabídla víc, než dnes smí, a člověk chce ještě víc: zbývá jen odejít, model se neptá.
    await db.batch([playerInsert("h-fwd2", "human", "FWD", 55, 26)]);
    const high = marketValue(55, 26, "FWD") * 3;
    await sendAiOffer("only-withdraw", "h-fwd2", high);
    expect((await humanCounter("only-withdraw", { amount: high + 50_000 })).status).toBe(200);
    await replyToTransferOffers(withAi(ai), "ai-club", later(42), BUYER_PROFILE);
    expect(ai.calls).toBe(1);
    expect((await negotiationRow("only-withdraw"))?.status).toBe("withdrawn");
    const log = await decisionFor("only-withdraw");
    expect(log).toMatchObject({ used_fallback: 0, raw_output: null });
    expect(JSON.parse(log!.actions)).toMatchObject({ kind: "withdraw", decidedBy: "guard" });
  });

  /** AI klub bez útočníků hledá útočníka a člověk mu nabídne dva. */
  async function pitchSetup(maxPrice = 200_000): Promise<string> {
    await db.prepare("UPDATE players SET team_id = 'third' WHERE id IN ('ai-fwd1', 'ai-fwd2', 'ai-fwd3', 'ai-fwd4')").run();
    await db.batch([playerInsert("h-fwd2", "human", "FWD", 55, 26)]);
    const { createDemand } = await import("../transfers/demands");
    const demand = await createDemand(db, "ai-club", {
      position: "FWD", ageMin: 18, ageMax: 30, role: "starter", maxPrice, note: null, minRating: 50, skills: [],
    });
    if (!demand.ok) throw new Error(demand.error);
    for (const playerId of ["h-fwd", "h-fwd2"]) {
      const res = await callRoute(`/teams/human/demands/${demand.id}/pitch`, { method: "POST", token: "human-token", body: { playerId } });
      expect(res.status).toBe(200);
    }
    return demand.id;
  }
  const pitchesOf = async (demandId: string) => (await db.prepare(
    "SELECT player_id, status, offer_id, reply FROM transfer_demand_pitches WHERE demand_id = ? ORDER BY player_id",
  ).bind(demandId).all<{ player_id: string; status: string; offer_id: string | null; reply: string | null }>()).results;
  const aiOffers = async () => (await db.prepare(
    "SELECT player_id, offer_amount, status FROM transfer_offers WHERE from_team_id = 'ai-club' ORDER BY player_id",
  ).all<{ player_id: string; offer_amount: number; status: string }>()).results;
  /** Vhodní hráči z popisu pro model: klíč → hodnocení a meze nabídky. */
  const pitchLines = (prompt: string) => {
    const out = new Map<string, { rating: number; min: number; max: number }>();
    for (const m of prompt.matchAll(/- "(P\d+)": \w+, age \d+, rating (\d+), [^;]+; you may offer ([\d,]+) CZK to ([\d,]+) CZK\./g)) {
      out.set(m[1], { rating: Number(m[2]), min: num(m[3]), max: num(m[4]) });
    }
    return out;
  };
  const ratingOf: Record<string, number> = { "h-fwd": 58, "h-fwd2": 55 };

  it("poptávka: model vybere z nabídnutých hráčů, nabídka odejde za zvolenou částku a ostatní dostanou odmítnutí", async () => {
    const demandId = await pitchSetup();
    let chosen = 0;
    const ai = fakeAi((req: FakeModelInput) => {
      const [key, line] = [...pitchLines(req.messages[1].content)].find(([, l]) => l.rating === 55)!;
      chosen = Math.floor((line.min + line.max) / 2 / 100) * 100;
      return { offers: [{ player: key, amount: chosen }], reason: "The 55 is the better value." };
    });
    await replyToTransferOffers(withAi(ai), "ai-club", later(), BUYER_PROFILE);
    expect(ai.calls).toBe(1);
    expect(pitchLines(ai.prompts[0]).size).toBe(2);
    expect(await aiOffers()).toEqual([{ player_id: "h-fwd2", offer_amount: chosen, status: "pending" }]);
    const [first, second] = await pitchesOf(demandId);
    expect(first).toMatchObject({ player_id: "h-fwd", status: "declined", offer_id: null });
    expect(second).toMatchObject({ player_id: "h-fwd2", status: "accepted" });
    for (const p of [first, second]) {
      expect(p.reply).toBeTruthy();
      expect(p.reply).not.toContain("—");
    }
    expect(await kindOf(demandId)).toBe("demand_pitch");
    const log = await decisionFor(demandId);
    expect(log).toMatchObject({ mode: "on", model: COACH_MODEL, used_fallback: 0 });
    expect(JSON.parse(log!.actions)).toMatchObject({
      decidedBy: "model", reasoning: "The 55 is the better value.", offers: [{ playerId: "h-fwd2", amount: chosen }],
    });
  });

  it("poptávka: neznámý hráč v odpovědi modelu neprojde, rozhodne pravidlo s první nabídkou v mezích", async () => {
    const demandId = await pitchSetup();
    let bounds = new Map<string, { rating: number; min: number; max: number }>();
    const ai = fakeAi((req: FakeModelInput) => {
      bounds = pitchLines(req.messages[1].content);
      return { offers: [{ player: "P9", amount: 30_000 }], reason: "Someone else." };
    });
    await replyToTransferOffers(withAi(ai), "ai-club", later(), BUYER_PROFILE);
    expect(ai.calls).toBe(1);
    const offers = await aiOffers();
    expect(offers.length).toBeGreaterThan(0);
    for (const o of offers) {
      const line = [...bounds.values()].find((l) => l.rating === ratingOf[o.player_id])!;
      expect(o.offer_amount).toBeGreaterThanOrEqual(line.min);
      expect(o.offer_amount).toBeLessThanOrEqual(line.max);
    }
    const log = await decisionFor(demandId);
    expect(log).toMatchObject({ used_fallback: 1 });
    expect(log!.error).toContain("neznámý hráč");
  });

  it("poptávka v režimu shadow: model vybere a zapíše, nabídka neodejde a opakovaný běh se ho znovu neptá", async () => {
    await cacheKv.put("ai_coach_mode", JSON.stringify({ market: "shadow" }));
    const demandId = await pitchSetup();
    const ai = fakeAi((req: FakeModelInput) => {
      const [key, line] = [...pitchLines(req.messages[1].content)][0];
      return { offers: [{ player: key, amount: line.min }], reason: "Cheap and good." };
    });
    const when = later();
    await replyToTransferOffers(withAi(ai), "ai-club", when, BUYER_PROFILE);
    expect(ai.calls).toBe(1);
    expect(await aiOffers()).toEqual([]);
    expect((await pitchesOf(demandId)).map((p) => p.status)).toEqual(["pitched", "pitched"]);
    const log = await decisionFor(demandId);
    expect(log).toMatchObject({ mode: "shadow", model: COACH_MODEL, used_fallback: 0 });
    expect(JSON.parse(log!.executed)).toBe("shadow");
    expect(JSON.parse(log!.actions)).toMatchObject({ decidedBy: "model" });
    await replyToTransferOffers(withAi(ai), "ai-club", new Date(when.getTime() + HOUR), BUYER_PROFILE);
    expect(ai.calls).toBe(1);
    expect((await db.prepare("SELECT COUNT(*) AS n FROM ai_coach_decisions WHERE context_ref = ?").bind(demandId).first<{ n: number }>())?.n).toBe(1);
  });

  it("poptávka: meze kódu platí, ať model řekne cokoli; na jedno volné místo jde jedna nabídka a druhý hráč počká", async () => {
    // Neobchodník smí mít rozjetý jen jeden obchod.
    const profile = { ...BUYER_PROFILE, trading: 30 };
    const demandId = await pitchSetup();
    let bounds = new Map<string, { rating: number; min: number; max: number }>();
    const ai = fakeAi((req: FakeModelInput) => {
      bounds = pitchLines(req.messages[1].content);
      return { offers: [...bounds.keys()].map((player) => ({ player, amount: 100 })), reason: "Lowball them all." };
    });
    await replyToTransferOffers(withAi(ai), "ai-club", later(), profile);
    expect(ai.calls).toBe(1);
    const log = await decisionFor(demandId);
    expect(log?.used_fallback).toBe(1);
    expect(log!.error).toContain("mimo meze");
    const offers = await aiOffers();
    expect(offers).toHaveLength(1);
    const line = [...bounds.values()].find((l) => l.rating === ratingOf[offers[0].player_id])!;
    expect(offers[0].offer_amount).toBeGreaterThanOrEqual(line.min);
    expect(offers[0].offer_amount).toBeLessThanOrEqual(line.max);
    const statuses = (await pitchesOf(demandId)).map((p) => p.status).sort();
    expect(statuses).toEqual(["accepted", "pitched"]);
    expect(JSON.parse(log!.actions).deferred).toHaveLength(1);
  });

  it("poptávka bez vhodného hráče (na nikoho AI nemá): odmítne kód, model se neptá", async () => {
    const demandId = await pitchSetup(1000);
    const ai = fakeAi({ offers: [], reason: "x" });
    await replyToTransferOffers(withAi(ai), "ai-club", later(), BUYER_PROFILE);
    expect(ai.calls).toBe(0);
    expect(await aiOffers()).toEqual([]);
    const pitches = await pitchesOf(demandId);
    expect(pitches.map((p) => p.status)).toEqual(["declined", "declined"]);
    expect(pitches.every((p) => !!p.reply)).toBe(true);
    const log = await decisionFor(demandId);
    expect(log).toMatchObject({ model: null, used_fallback: 0, raw_output: null });
    expect(JSON.parse(log!.actions)).toMatchObject({ decidedBy: "guard", offers: [], eligible: [] });
  });
});

describe("AI klub na trhu", () => {
  it("nabídka AI klubu na hráče člověka vypadá jako od kteréhokoli klubu", async () => {
    // AI klub bez útočníků: útok je nejslabší post a jediný útočník v lize patří člověku.
    await db.prepare("DELETE FROM players WHERE id IN ('ai-fwd1', 'ai-fwd2', 'ai-fwd3', 'ai-fwd4')").run();
    const res = await runTransferMarket(env, "ai-club", later(), { profile: { ...PROFILE, ambition: 80, thrift: 20 }, ignoreSchedule: true });
    const sent = res.actions.find((a) => a.kind === "offer" && a.result === "sent");
    expect(sent).toMatchObject({ position: "FWD", playerId: "h-fwd" });
    const offer = await db.prepare("SELECT id, player_id, to_team_id, offer_amount FROM transfer_offers WHERE from_team_id = 'ai-club' AND status = 'pending'")
      .first<{ id: string; player_id: string; to_team_id: string; offer_amount: number }>();
    expect(offer).toMatchObject({ player_id: "h-fwd", to_team_id: "human" });
    // Nabídka nepřesáhne strop (tržní hodnota × potřeba × ambice) a není urážka (aspoň 70 % tržní ceny).
    const mv = marketValue(58, 25, "FWD");
    expect(offer!.offer_amount).toBeGreaterThanOrEqual(mv * 0.7);
    expect(offer!.offer_amount).toBeLessThanOrEqual(mv * 1.4);

    // Člověk ji vidí mezi příchozími jako od kteréhokoli klubu, s trenérem klubu, a dostal SMS.
    const list = await callRoute("/teams/human/offers", { token: "human-token" });
    const { incoming } = await list.json() as { incoming: Array<{ id: string; from_team_name: string; is_virtual: number; on_turn: boolean }> };
    expect(incoming.find((o) => o.id === offer!.id)).toMatchObject({ from_team_name: "Sokol Lhota", is_virtual: 0, on_turn: true });
    const detail = await callRoute(`/teams/human/offers/${offer!.id}`, { token: "human-token" });
    expect(detail.status).toBe(200);
    const body = await detail.json() as { fromTeam: { name: string }; fromManager: { name: string } | null; on_turn: boolean; role: string };
    expect(body).toMatchObject({ role: "seller", on_turn: true, fromTeam: { name: "Sokol Lhota" }, fromManager: { name: "Jan Trenér" } });
    expect((await smsTo("human")).some((b) => b.includes("Sokol Lhota"))).toBe(true);
    const log = await db.prepare("SELECT kind FROM ai_coach_decisions WHERE team_id = 'ai-club' AND kind = 'transfer_market'").first();
    expect(log).not.toBeNull();

    // Člověk nabídku přijme přes routu: peníze i hráč se přesunou jako mezi lidmi.
    const before = { human: await budgetOf("human"), ai: await budgetOf("ai-club") };
    const accept = await callRoute(`/teams/human/offers/${offer!.id}/accept`, { method: "POST", token: "human-token", body: {} });
    expect(accept.status).toBe(200);
    expect(await budgetOf("human")).toBe(before.human + offer!.offer_amount);
    expect(await budgetOf("ai-club")).toBe(before.ai - offer!.offer_amount);
    expect((await db.prepare("SELECT team_id FROM players WHERE id = 'h-fwd'").first<{ team_id: string }>())?.team_id).toBe("ai-club");
  });

  it("na protinávrh člověka AI kupující přistoupí do stropu, jinak jednání ukončí", async () => {
    await db.prepare("UPDATE players SET team_id = 'third' WHERE id IN ('ai-fwd1', 'ai-fwd2', 'ai-fwd3', 'ai-fwd4')").run();
    const mv = marketValue(58, 25, "FWD");
    const send = (id: string, amount: number) => db.batch([
      db.prepare(`INSERT INTO transfer_offers (id, player_id, from_team_id, to_team_id, offer_amount, status, expires_at, last_action_by)
        VALUES (?, 'h-fwd', 'ai-club', 'human', ?, 'pending', ?, 'ai-club')`).bind(id, amount, new Date(Date.now() + 3 * 86_400_000).toISOString()),
      db.prepare("INSERT INTO transfer_offer_events (id, offer_id, team_id, event_type, amount) VALUES (?, ?, 'ai-club', 'offer', ?)").bind(`${id}-e`, id, amount),
    ]);
    await send("ai-offer", Math.round(mv * 0.85 / 100) * 100);
    // Člověk chce čtyřnásobek: AI odejde.
    const counter = await callRoute("/teams/human/offers/ai-offer/counter", { method: "POST", token: "human-token", body: { amount: mv * 4 } });
    expect(counter.status).toBe(200);
    await replyToTransferOffers(env, "ai-club", later(), { ...PROFILE, ambition: 80, thrift: 20 });
    expect((await offerRow("ai-offer"))?.status).toBe("withdrawn");
    expect((await db.prepare("SELECT team_id FROM players WHERE id = 'h-fwd'").first<{ team_id: string }>())?.team_id).toBe("human");
  });

  it("pod minimem kádru AI podepíše volného hráče", async () => {
    await db.prepare("UPDATE players SET team_id = 'third' WHERE id IN ('ai-ext1', 'ai-ext2', 'ai-mid6', 'ai-def6', 'ai-fwd4')").run();
    await db.prepare(`INSERT INTO free_agents (id, district, first_name, last_name, age, position, overall_rating, weekly_wage, village_id, expires_at)
      VALUES ('fa-1', 'Test', 'Volný', 'Hráč', 24, 'FWD', 45, 200, 'village', ?)`).bind(FUTURE).run();
    const res = await runTransferMarket(env, "ai-club", later(), { profile: PROFILE, ignoreSchedule: true });
    expect(res.actions.find((a) => a.kind === "sign_free_agent")?.result).toBe("signed");
    const signed = await db.prepare("SELECT COUNT(*) AS n FROM players WHERE team_id = 'ai-club' AND first_name = 'Volný'").first<{ n: number }>();
    expect(signed?.n).toBe(1);
    expect(await budgetOf("ai-club")).toBe(150_000 - 500);
  });

  it("pondělní kurz „držet“ zastaví nákup na post, kde nic nechybí; kurz nanečisto se nepočítá", async () => {
    // Útok bez dvou nejlepších: potřeba kolem 0,58, kupovalo by se, ale místo v základu není prázdné.
    await db.prepare("UPDATE players SET team_id = 'third' WHERE id IN ('ai-fwd1', 'ai-fwd2')").run();
    const plan = { stance: "hold", focus: [], sellIds: [] };
    await db.prepare("INSERT INTO ai_coach_decisions (id, team_id, kind, mode, actions) VALUES ('weekly-1', 'ai-club', 'weekly', 'on', ?)")
      .bind(JSON.stringify({ transferPlan: plan, at: new Date().toISOString() })).run();
    const profile = { ...PROFILE, ambition: 80, thrift: 20 };
    const bought = (r: Awaited<ReturnType<typeof runTransferMarket>>) => r.actions.some((a) => (a.kind === "offer" || a.kind === "bid") && a.result === "sent");

    expect(bought(await runTransferMarket(env, "ai-club", later(), { profile, ignoreSchedule: true }))).toBe(false);
    await db.prepare("UPDATE ai_coach_decisions SET mode = 'shadow' WHERE id = 'weekly-1'").run();
    const res = await runTransferMarket(env, "ai-club", later(), { profile, ignoreSchedule: true });
    expect(bought(res)).toBe(true);
    expect(res.actions.find((a) => a.kind === "offer")?.position).toBe("FWD");
  });

  it("pondělní kurz „prodávat“ vystaví hráče, kterého trenér vybral, i když kádr není přeplněný", async () => {
    const profile = { ...PROFILE, trading: 40 };
    const listedBy = async () => (await runTransferMarket(env, "ai-club", later(), { profile, ignoreSchedule: true })).actions
      .filter((a) => a.kind === "list" && a.result === "listed").map((a) => a.playerId);
    // 20 hráčů a neobchodník: bez kurzu nikoho nevystaví.
    expect(await listedBy()).toEqual([]);
    await db.prepare("INSERT INTO ai_coach_decisions (id, team_id, kind, mode, actions) VALUES ('weekly-2', 'ai-club', 'weekly', 'on', ?)")
      .bind(JSON.stringify({ transferPlan: { stance: "sell", focus: [], sellIds: ["ai-fwd4"] }, at: new Date().toISOString() })).run();
    const listed = await listedBy();
    // Vybraný útočník jde první, i když nejstarší z přebytku je obránce ai-ext2.
    expect(listed[0]).toBe("ai-fwd4");
    expect(listed).toContain("ai-ext2");
  });

  it("přeplněný kádr vystaví přebytek, ale koho za 30 dní dvakrát nikdo nekoupil, toho znovu nenabízí", async () => {
    // 20 hráčů + 6 navíc = 26, nad cílem 24.
    const extra: Array<[string, string, number, number]> = [
      ["ai-x1", "DEF", 37, 34], ["ai-x2", "MID", 36, 35], ["ai-x3", "FWD", 35, 33],
      ["ai-x4", "DEF", 36, 32], ["ai-x5", "MID", 35, 31], ["ai-x6", "GK", 35, 34],
    ];
    await db.batch(extra.map(([id, pos, rating, age]) => playerInsert(id, "ai-club", pos, rating, age)));
    // Nejstaršího z přebytku (ai-x2) už dvakrát nikdo nekoupil, inzeráty propadly před 8 a 16 dny.
    const endedDaysAgo = (days: number) => new Date(Date.now() - days * 86_400_000).toISOString();
    const oldListing = (n: number, days: number) => db.prepare(
      `INSERT INTO transfer_listings (id, player_id, team_id, asking_price, league_id, status, expires_at)
       VALUES (?, 'ai-x2', 'ai-club', 3000, 'league-a', 'expired', ?)`,
    ).bind(`old-listing-${n}`, endedDaysAgo(days));
    await db.batch([oldListing(1, 8), oldListing(2, 16)]);

    const profile = { ...PROFILE, trading: 40 };
    const listedBy = async () => (await runTransferMarket(env, "ai-club", later(), { profile, ignoreSchedule: true })).actions
      .filter((a) => a.kind === "list" && a.result === "listed").map((a) => a.playerId);
    const first = await listedBy();
    expect(first.length).toBeGreaterThan(0);
    expect(first).not.toContain("ai-x2");

    // Po měsíci ho zkusí znovu.
    await db.prepare("DELETE FROM transfer_listings WHERE status = 'active'").run();
    await db.prepare("UPDATE transfer_listings SET expires_at = ? WHERE player_id = 'ai-x2'").bind(endedDaysAgo(40)).run();
    expect(await listedBy()).toContain("ai-x2");
  });

  it("člověk nabídne hráče k poptávce AI klubu a AI pošle nabídku, nebo slušně odmítne", async () => {
    await db.prepare("UPDATE players SET team_id = 'third' WHERE id IN ('ai-fwd1', 'ai-fwd2', 'ai-fwd3', 'ai-fwd4')").run();
    const { createDemand } = await import("../transfers/demands");
    const demand = await createDemand(db, "ai-club", {
      position: "FWD", ageMin: 18, ageMax: 30, role: "starter", maxPrice: 200_000, note: null, minRating: 50, skills: [],
    });
    expect(demand.ok).toBe(true);
    if (!demand.ok) return;
    const pitch = await callRoute(`/teams/human/demands/${demand.id}/pitch`, { method: "POST", token: "human-token", body: { playerId: "h-fwd" } });
    expect(pitch.status).toBe(200);
    // AI klubu nepřišla SMS o nabídnutém hráči.
    expect(await smsTo("ai-club")).toEqual([]);
    await replyToTransferOffers(env, "ai-club", later(), { ...PROFILE, ambition: 80, thrift: 20 });
    const row = await db.prepare("SELECT status, offer_id, reply FROM transfer_demand_pitches WHERE demand_id = ?").bind(demand.id)
      .first<{ status: string; offer_id: string | null; reply: string }>();
    expect(row?.status).toBe("accepted");
    expect(row?.reply).toBeTruthy();
    expect(row?.reply).not.toContain("—");
    const offer = await db.prepare("SELECT status, from_team_id, to_team_id, player_id FROM transfer_offers WHERE id = ?").bind(row!.offer_id).first();
    expect(offer).toEqual({ status: "pending", from_team_id: "ai-club", to_team_id: "human", player_id: "h-fwd" });

    // Poptávka se stropem, za který hráče nikdo nedá: AI neposílá urážlivou nabídku, slušně odmítne.
    const cheap = await createDemand(db, "ai-club", {
      position: "FWD", ageMin: 18, ageMax: 30, role: "squad", maxPrice: 1000, note: null, minRating: 40, skills: [],
    });
    if (!cheap.ok) throw new Error(cheap.error);
    await db.batch([playerInsert("h-fwd2", "human", "FWD", 55, 26)]);
    const second = await callRoute(`/teams/human/demands/${cheap.id}/pitch`, { method: "POST", token: "human-token", body: { playerId: "h-fwd2" } });
    expect(second.status).toBe(200);
    await replyToTransferOffers(env, "ai-club", later(42), { ...PROFILE, ambition: 80, thrift: 20 });
    const declined = await db.prepare("SELECT status, offer_id, reply FROM transfer_demand_pitches WHERE demand_id = ?").bind(cheap.id)
      .first<{ status: string; offer_id: string | null; reply: string }>();
    expect(declined).toMatchObject({ status: "declined", offer_id: null });
    expect(declined?.reply).toBeTruthy();
    expect(await db.prepare("SELECT 1 FROM transfer_offers WHERE player_id = 'h-fwd2'").first()).toBeNull();
  });
});
