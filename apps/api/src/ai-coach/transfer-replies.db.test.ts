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
import { openingAsk, reservationPrice } from "./valuation";
import { analyzeSquad, loadClubSquad } from "./squad";
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
    // Odmítnutí AI klubu nekazí hráči náladu přes zprávy (to je jen u lidí).
    expect(sideEffects.applyOfferRejectionImpact).not.toHaveBeenCalled();
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
