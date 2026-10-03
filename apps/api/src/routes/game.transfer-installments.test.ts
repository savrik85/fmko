import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { Miniflare } from "miniflare";
import type { Bindings } from "../index";
import { marketValue } from "@okresni-masina/shared";

const sideEffects = vi.hoisted(() => ({
  attachNewcomerRelations: vi.fn(async () => 0),
  createTransferNews: vi.fn(async () => undefined),
  createNotification: vi.fn(async () => undefined),
  sendWebPushToPlayerWatchers: vi.fn(async () => undefined),
  applyOfferRejectionImpact: vi.fn(async (
    _db: unknown,
    _offer: unknown,
    _trigger: unknown,
    _env: unknown,
  ) => undefined),
  computeInterestForOffer: vi.fn(async () => null),
}));

vi.mock("../transfers/attach-relations", () => ({
  attachNewcomerRelations: sideEffects.attachNewcomerRelations,
}));

vi.mock("../transfers/transfer-news", () => ({
  createTransferNews: sideEffects.createTransferNews,
}));

vi.mock("../community/notifications", () => ({
  createNotification: sideEffects.createNotification,
}));

vi.mock("../community/web-push", () => ({
  sendWebPushToPlayerWatchers: sideEffects.sendWebPushToPlayerWatchers,
}));

vi.mock("../transfers/offer-rejection-impact", () => ({
  applyOfferRejectionImpact: sideEffects.applyOfferRejectionImpact,
}));

vi.mock("../transfers/player-interest", () => ({
  INTEREST_LABELS: ["Bez zájmu", "Spíš ne", "Spíš ano", "Chce odejít"],
  computeInterestForOffer: sideEffects.computeInterestForOffer,
}));

import { gameRouter } from "./game";
import { obligationsRouter } from "./obligations";

let miniflare: Miniflare;
let db: D1Database;
let sessionKv: KVNamespace;
let cacheKv: KVNamespace;
let env: Bindings;

const FUTURE = "2099-08-30T12:00:00.000Z";
const GAME_DATE = "2026-08-23T12:00:00.000Z";

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
  sessionKv = await miniflare.getKVNamespace("SESSION_KV") as unknown as KVNamespace;
  cacheKv = await miniflare.getKVNamespace("CACHE_KV") as unknown as KVNamespace;

  await executeStatements(`
    CREATE TABLE villages (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      district TEXT NOT NULL,
      lat REAL NOT NULL,
      lng REAL NOT NULL
    );

    CREATE TABLE leagues (
      id TEXT PRIMARY KEY,
      district TEXT NOT NULL,
      league_type TEXT NOT NULL DEFAULT 'senior'
    );

    CREATE TABLE teams (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      parent_team_id TEXT,
      team_type TEXT NOT NULL DEFAULT 'senior',
      name TEXT NOT NULL,
      budget INTEGER NOT NULL DEFAULT 0,
      game_date TEXT,
      league_id TEXT,
      village_id TEXT,
      primary_color TEXT NOT NULL DEFAULT '#225522',
      secondary_color TEXT NOT NULL DEFAULT '#ffffff',
      badge_pattern TEXT,
      badge_symbol TEXT,
      badge_initials TEXT,
      badge_primary_color TEXT,
      badge_secondary_color TEXT,
      reputation INTEGER NOT NULL DEFAULT 50
    );

    CREATE TABLE managers (
      id TEXT PRIMARY KEY,
      team_id TEXT NOT NULL,
      name TEXT NOT NULL,
      backstory TEXT,
      avatar TEXT,
      age INTEGER,
      coaching INTEGER,
      motivation INTEGER,
      tactics INTEGER,
      youth_development INTEGER,
      discipline INTEGER,
      reputation INTEGER
    );

    CREATE TABLE players (
      id TEXT PRIMARY KEY,
      team_id TEXT NOT NULL,
      first_name TEXT NOT NULL,
      last_name TEXT NOT NULL,
      nickname TEXT,
      age INTEGER NOT NULL,
      position TEXT NOT NULL,
      overall_rating INTEGER NOT NULL,
      skills TEXT NOT NULL DEFAULT '{}',
      physical TEXT NOT NULL DEFAULT '{}',
      personality TEXT NOT NULL DEFAULT '{}',
      life_context TEXT NOT NULL DEFAULT '{}',
      avatar TEXT NOT NULL DEFAULT '{}',
      weekly_wage INTEGER NOT NULL DEFAULT 0,
      squad_number INTEGER,
      loan_from_team_id TEXT,
      loan_until TEXT,
      parent_club_id TEXT,
      next_match_return INTEGER NOT NULL DEFAULT 0,
      residence TEXT,
      commute_km INTEGER NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'active'
    );

    CREATE TABLE transfer_offers (
      id TEXT PRIMARY KEY,
      player_id TEXT NOT NULL,
      from_team_id TEXT NOT NULL,
      to_team_id TEXT NOT NULL,
      offer_amount INTEGER NOT NULL,
      counter_amount INTEGER,
      message TEXT,
      reject_message TEXT,
      status TEXT NOT NULL DEFAULT 'pending',
      expires_at TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      resolved_at TEXT,
      offer_type TEXT NOT NULL DEFAULT 'transfer',
      loan_duration INTEGER,
      last_action_by TEXT,
      offered_player_id TEXT,
      target_squad TEXT NOT NULL DEFAULT 'senior',
      player_interest INTEGER,
      virtual_team_data TEXT,
      upfront_pct INTEGER NOT NULL DEFAULT 100,
      installments INTEGER NOT NULL DEFAULT 0,
      sell_on_pct INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE transfer_offer_events (
      id TEXT PRIMARY KEY,
      offer_id TEXT NOT NULL,
      team_id TEXT NOT NULL,
      event_type TEXT NOT NULL,
      amount INTEGER,
      message TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      upfront_pct INTEGER,
      installments INTEGER,
      sell_on_pct INTEGER
    );

    CREATE TABLE player_contracts (
      id TEXT PRIMARY KEY,
      player_id TEXT NOT NULL,
      team_id TEXT NOT NULL,
      season_id TEXT,
      joined_at TEXT NOT NULL DEFAULT (datetime('now')),
      left_at TEXT,
      join_type TEXT NOT NULL,
      leave_type TEXT,
      fee INTEGER NOT NULL DEFAULT 0,
      is_active INTEGER NOT NULL DEFAULT 1
    );

    CREATE TABLE transactions (
      id TEXT PRIMARY KEY,
      team_id TEXT NOT NULL,
      type TEXT NOT NULL,
      amount INTEGER NOT NULL,
      balance_after INTEGER NOT NULL,
      description TEXT NOT NULL,
      reference_id TEXT,
      game_date TEXT NOT NULL
    );

    CREATE TABLE transfer_installments (
      id TEXT PRIMARY KEY, offer_id TEXT NOT NULL, player_id TEXT NOT NULL, player_name TEXT NOT NULL,
      buyer_team_id TEXT NOT NULL, seller_team_id TEXT NOT NULL, total_amount INTEGER NOT NULL,
      upfront_amount INTEGER NOT NULL, installment_amount INTEGER NOT NULL, installments_total INTEGER NOT NULL,
      installments_paid INTEGER NOT NULL DEFAULT 0, remaining INTEGER NOT NULL,
      status TEXT NOT NULL DEFAULT 'active', created_game_date TEXT, last_paid_game_date TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')), closed_at TEXT
    );

    CREATE TABLE sell_on_clauses (
      id TEXT PRIMARY KEY, offer_id TEXT NOT NULL, player_id TEXT NOT NULL, player_name TEXT NOT NULL,
      beneficiary_team_id TEXT NOT NULL, owner_team_id TEXT NOT NULL, pct INTEGER NOT NULL,
      status TEXT NOT NULL DEFAULT 'active', paid_amount INTEGER, paid_offer_id TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')), resolved_at TEXT
    );

    CREATE TABLE injuries (id TEXT PRIMARY KEY, player_id TEXT NOT NULL, days_remaining INTEGER NOT NULL DEFAULT 0);

    CREATE TABLE transfer_listings (
      id TEXT PRIMARY KEY,
      player_id TEXT NOT NULL,
      team_id TEXT NOT NULL,
      asking_price INTEGER NOT NULL,
      league_id TEXT NOT NULL,
      status TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE transfer_bids (
      id TEXT PRIMARY KEY,
      listing_id TEXT NOT NULL,
      team_id TEXT NOT NULL,
      amount INTEGER NOT NULL,
      counter_amount INTEGER,
      last_action_by TEXT,
      status TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE seasons (
      id TEXT PRIMARY KEY,
      number INTEGER NOT NULL,
      status TEXT NOT NULL
    );

    CREATE TABLE season_calendar (
      id TEXT PRIMARY KEY,
      league_id TEXT NOT NULL,
      season_number INTEGER NOT NULL
    );

    CREATE TABLE conversations (
      id TEXT PRIMARY KEY,
      team_id TEXT NOT NULL,
      type TEXT NOT NULL,
      title TEXT NOT NULL,
      pinned INTEGER NOT NULL DEFAULT 0,
      unread_count INTEGER NOT NULL DEFAULT 0,
      last_message_text TEXT,
      last_message_at TEXT,
      created_at TEXT
    );

    CREATE TABLE messages (
      id TEXT PRIMARY KEY,
      conversation_id TEXT NOT NULL,
      sender_type TEXT NOT NULL,
      sender_name TEXT NOT NULL,
      body TEXT NOT NULL,
      sent_at TEXT
    );

    CREATE TABLE departed_players (
      id TEXT PRIMARY KEY,
      first_name TEXT,
      last_name TEXT,
      age INTEGER,
      position TEXT,
      overall_rating INTEGER
    );
  `);

  await sessionKv.put("session:seller-token", JSON.stringify({
    userId: "user-seller",
    email: "seller@test.local",
    teamId: "seller-a",
    createdAt: GAME_DATE,
  }));
  await sessionKv.put("session:third-token", JSON.stringify({
    userId: "user-third",
    email: "third@test.local",
    teamId: "third-a",
    createdAt: GAME_DATE,
  }));
  await sessionKv.put("session:buyer-token", JSON.stringify({
    userId: "user-buyer",
    email: "buyer@test.local",
    teamId: "buyer-a",
    createdAt: GAME_DATE,
  }));

  env = {
    DB: db,
    SESSION_KV: sessionKv,
    CACHE_KV: cacheKv,
    GEMINI_API_KEY: "",
    VAPID_PUBLIC_KEY: "",
    VAPID_PRIVATE_KEY: "",
    VAPID_SUBJECT: "",
  } as unknown as Bindings;
});

beforeEach(async () => {
  vi.clearAllMocks();

  await executeStatements(`
    DELETE FROM messages;
    DELETE FROM transfer_installments;
    DELETE FROM sell_on_clauses;
    DELETE FROM conversations;
    DELETE FROM transactions;
    DELETE FROM transfer_offer_events;
    DELETE FROM transfer_bids;
    DELETE FROM transfer_listings;
    DELETE FROM player_contracts;
    DELETE FROM transfer_offers;
    DELETE FROM players;
    DELETE FROM managers;
    DELETE FROM teams;
    DELETE FROM villages;
    DELETE FROM leagues;
    DELETE FROM seasons;
    DELETE FROM season_calendar;
    DELETE FROM departed_players;
  `);

  await db.batch([
    db.prepare("INSERT INTO villages (id, name, district, lat, lng) VALUES ('village', 'Testov', 'Test', 49.0, 14.0)"),
    db.prepare("INSERT INTO leagues (id, district, league_type) VALUES ('league-a', 'Test', 'senior')"),
    db.prepare("INSERT INTO leagues (id, district, league_type) VALUES ('league-u21', 'Test U21', 'u21')"),
    db.prepare("INSERT INTO seasons (id, number, status) VALUES ('season', 1, 'active')"),
    db.prepare(`INSERT INTO teams (id, user_id, parent_team_id, team_type, name, budget, game_date, league_id, village_id)
      VALUES ('buyer-a', 'user-buyer', NULL, 'senior', 'Kupující', 30000, ?, 'league-a', 'village')`).bind(GAME_DATE),
    db.prepare(`INSERT INTO teams (id, user_id, parent_team_id, team_type, name, budget, game_date, league_id, village_id)
      VALUES ('third-a', 'user-third', NULL, 'senior', 'Třetí klub', 500000, ?, 'league-a', 'village')`).bind(GAME_DATE),
    db.prepare("INSERT INTO managers (id, team_id, name, avatar) VALUES ('manager-third', 'third-a', 'Trenér třetího', '{}')"),
    db.prepare(`INSERT INTO players (
      id, team_id, first_name, last_name, age, position, overall_rating,
      skills, physical, personality, life_context, avatar, weekly_wage,
      squad_number, residence, commute_km
    ) VALUES (
      'star', 'seller-a', 'Petr', 'Hvězda', 24, 'MID', 55,
      '{"passing":55}', '{"stamina":60}', '{"discipline":50}',
      '{"condition":100,"morale":50}', '{}', 300, 10, 'Testov', 0
    )`),
    db.prepare(`INSERT INTO player_contracts (
      id, player_id, team_id, season_id, joined_at, join_type, fee, is_active
    ) VALUES ('contract-star', 'star', 'seller-a', 'season', ?, 'generated', 0, 1)`).bind(GAME_DATE),
    db.prepare(`INSERT INTO teams (id, user_id, parent_team_id, team_type, name, budget, game_date, league_id, village_id)
      VALUES ('buyer-u21', 'user-buyer', 'buyer-a', 'u21', 'Kupující U21', 0, ?, 'league-u21', 'village')`).bind(GAME_DATE),
    db.prepare(`INSERT INTO teams (id, user_id, parent_team_id, team_type, name, budget, game_date, league_id, village_id)
      VALUES ('seller-a', 'user-seller', NULL, 'senior', 'Prodávající', 10000, ?, 'league-a', 'village')`).bind(GAME_DATE),
    db.prepare(`INSERT INTO teams (id, user_id, parent_team_id, team_type, name, budget, game_date, league_id, village_id)
      VALUES ('seller-u21', 'user-seller', 'seller-a', 'u21', 'Prodávající U21', 0, ?, 'league-u21', 'village')`).bind(GAME_DATE),
    db.prepare("INSERT INTO managers (id, team_id, name, avatar) VALUES ('manager-buyer', 'buyer-a', 'Trenér kupujícího', '{}')"),
    db.prepare("INSERT INTO managers (id, team_id, name, avatar) VALUES ('manager-seller', 'seller-a', 'Trenér prodávajícího', '{}')"),
    db.prepare(`INSERT INTO players (
      id, team_id, first_name, last_name, age, position, overall_rating,
      skills, physical, personality, life_context, avatar, weekly_wage,
      squad_number, residence, commute_km
    ) VALUES (
      'junior', 'seller-u21', 'Jan', 'Junior', 18, 'MID', 42,
      '{"passing":42}', '{"stamina":45}', '{"discipline":50}',
      '{"condition":100,"morale":50}', '{}', 500, 8, 'Testov', 0
    )`),
    db.prepare(`INSERT INTO player_contracts (
      id, player_id, team_id, season_id, joined_at, join_type, fee, is_active
    ) VALUES ('contract-old', 'junior', 'seller-u21', 'season', ?, 'generated', 0, 1)`).bind(GAME_DATE),
    db.prepare(`INSERT INTO transfer_offers (
      id, player_id, from_team_id, to_team_id, offer_amount, status, expires_at,
      offer_type, last_action_by, target_squad, player_interest
    ) VALUES (
      'offer-u21', 'junior', 'buyer-a', 'seller-u21', 50000, 'pending', ?,
      'transfer', 'buyer-a', 'senior', 1
    )`).bind(FUTURE),
    db.prepare(`INSERT INTO transfer_offer_events (
      id, offer_id, team_id, event_type, amount, message
    ) VALUES ('event-offer', 'offer-u21', 'buyer-a', 'offer', 50000, NULL)`),
  ]);
});

afterAll(async () => {
  await miniflare.dispose();
});

function executionContext() {
  const pending: Promise<unknown>[] = [];
  const ctx = {
    waitUntil(promise: Promise<unknown>) {
      pending.push(promise);
    },
    passThroughOnException() {},
  } as unknown as ExecutionContext;
  return { ctx, pending };
}

async function callRoute(
  path: string,
  options: { method?: string; token?: string; body?: Record<string, unknown> } = {},
) {
  const headers = new Headers();
  if (options.token) headers.set("Authorization", `Bearer ${options.token}`);
  if (options.body) headers.set("Content-Type", "application/json");

  const { ctx, pending } = executionContext();
  const response = await gameRouter.fetch(new Request(`http://test.local${path}`, {
    method: options.method ?? "GET",
    headers,
    body: options.body ? JSON.stringify(options.body) : undefined,
  }), env, ctx);
  await Promise.all(pending);
  return response;
}

async function readJson(response: Response) {
  return response.json() as Promise<Record<string, any>>;
}

async function budgets(): Promise<Record<string, number>> {
  const rows = await db.prepare("SELECT id, budget FROM teams").all<{ id: string; budget: number }>();
  return Object.fromEntries(rows.results.map((r) => [r.id, r.budget]));
}

async function makeOffer(body: Record<string, unknown>, token = "buyer-token", team = "buyer-a") {
  const r = await callRoute(`/teams/${team}/offers`, { method: "POST", token, body: { playerId: "star", ...body } });
  const json = await readJson(r);
  return { status: r.status, id: json.offerId as string, json };
}

describe("přestup na splátky a procenta z příštího přestupu", () => {
  it("nabídka na splátky potřebuje peníze jen na zálohu a ukládá podmínky", async () => {
    const r = await makeOffer({ amount: 60_000, upfrontPct: 30, installments: 4, sellOnPct: 10 });
    expect(r.status).toBe(200);
    expect(await db.prepare("SELECT upfront_pct, installments, sell_on_pct FROM transfer_offers WHERE id = ?").bind(r.id).first())
      .toEqual({ upfront_pct: 30, installments: 4, sell_on_pct: 10 });
    expect(await db.prepare("SELECT upfront_pct, installments, sell_on_pct FROM transfer_offer_events WHERE offer_id = ? AND event_type = 'offer'").bind(r.id).first())
      .toEqual({ upfront_pct: 30, installments: 4, sell_on_pct: 10 });
  });

  it("odmítne zálohu pod 10 % a splátky u hostování", async () => {
    expect((await makeOffer({ amount: 60_000, upfrontPct: 5, installments: 4 })).status).toBe(400);
    expect((await makeOffer({ amount: 1_000, offerType: "loan", loanDuration: 30, upfrontPct: 30, installments: 3 })).status).toBe(400);
  });

  it("bez podmínek je to jednorázová platba (starší klient)", async () => {
    const r = await makeOffer({ amount: 20_000 });
    expect(r.status).toBe(200);
    expect(await db.prepare("SELECT upfront_pct, installments, sell_on_pct FROM transfer_offers WHERE id = ?").bind(r.id).first())
      .toEqual({ upfront_pct: 100, installments: 0, sell_on_pct: 0 });
  });

  it("protinávrh mění podmínky; bez podmínek je ponechá", async () => {
    const { id } = await makeOffer({ amount: 60_000, upfrontPct: 30, installments: 4, sellOnPct: 10 });
    const c1 = await callRoute(`/teams/seller-a/offers/${id}/counter`, { method: "POST", token: "seller-token",
      body: { amount: 70_000, upfrontPct: 50, installments: 2, sellOnPct: 20 } });
    expect(c1.status).toBe(200);
    expect(await db.prepare("SELECT counter_amount, upfront_pct, installments, sell_on_pct FROM transfer_offers WHERE id = ?").bind(id).first())
      .toEqual({ counter_amount: 70_000, upfront_pct: 50, installments: 2, sell_on_pct: 20 });
    // Záloha 50 % z 65 000 = 32 500 > rozpočet kupujícího 30 000 → odmítnuto.
    const tooMuch = await callRoute(`/teams/buyer-a/offers/${id}/counter`, { method: "POST", token: "buyer-token", body: { amount: 65_000 } });
    expect(tooMuch.status).toBe(400);
    const c2 = await callRoute(`/teams/buyer-a/offers/${id}/counter`, { method: "POST", token: "buyer-token", body: { amount: 55_000 } });
    expect(c2.status).toBe(200);
    expect(await db.prepare("SELECT counter_amount, upfront_pct, installments, sell_on_pct FROM transfer_offers WHERE id = ?").bind(id).first())
      .toEqual({ counter_amount: 55_000, upfront_pct: 50, installments: 2, sell_on_pct: 20 });
  });

  it("limit 3 rozjetých splátkových přestupů", async () => {
    for (const i of [1, 2, 3]) {
      await db.prepare(`INSERT INTO transfer_installments (id, offer_id, player_id, player_name, buyer_team_id, seller_team_id,
        total_amount, upfront_amount, installment_amount, installments_total, remaining) VALUES (?, 'o', 'p', 'X', 'buyer-a', 'seller-a', 1000, 300, 350, 2, 700)`).bind(`d${i}`).run();
    }
    expect((await makeOffer({ amount: 60_000, upfrontPct: 30, installments: 4 })).status).toBe(400);
  });

  it("přijetí strhne jen zálohu, vytvoří dohodu a doložku, smlouva má celou cenu", async () => {
    const { id } = await makeOffer({ amount: 60_000, upfrontPct: 30, installments: 4, sellOnPct: 10 });
    const r = await callRoute(`/teams/seller-a/offers/${id}/accept`, { method: "POST", token: "seller-token", body: {} });
    expect(r.status).toBe(200);
    const b = await budgets();
    expect(b["buyer-a"]).toBe(30_000 - 18_000);
    expect(b["seller-a"]).toBe(10_000 + 18_000);
    expect(await db.prepare("SELECT total_amount, upfront_amount, installment_amount, installments_total, remaining, status FROM transfer_installments").first())
      .toEqual({ total_amount: 60_000, upfront_amount: 18_000, installment_amount: 10_500, installments_total: 4, remaining: 42_000, status: "active" });
    expect(await db.prepare("SELECT beneficiary_team_id, owner_team_id, pct, status FROM sell_on_clauses").first())
      .toEqual({ beneficiary_team_id: "seller-a", owner_team_id: "buyer-a", pct: 10, status: "active" });
    expect((await db.prepare("SELECT fee FROM player_contracts WHERE player_id = 'star' AND is_active = 1").first<{ fee: number }>())!.fee).toBe(60_000);
  });

  it("přijetí při plném limitu dohod se odmítne a nic se nestrhne", async () => {
    const { id } = await makeOffer({ amount: 60_000, upfrontPct: 30, installments: 4 });
    for (const i of [1, 2, 3]) {
      await db.prepare(`INSERT INTO transfer_installments (id, offer_id, player_id, player_name, buyer_team_id, seller_team_id,
        total_amount, upfront_amount, installment_amount, installments_total, remaining) VALUES (?, 'o', 'p', 'X', 'buyer-a', 'seller-a', 1000, 300, 350, 2, 700)`).bind(`d${i}`).run();
    }
    const r = await callRoute(`/teams/seller-a/offers/${id}/accept`, { method: "POST", token: "seller-token", body: {} });
    expect(r.status).toBe(400);
    expect((await budgets())["buyer-a"]).toBe(30_000);
    expect((await db.prepare("SELECT status FROM transfer_offers WHERE id = ?").bind(id).first<{ status: string }>())!.status).toBe("pending");
  });

  it("prodej dál doplatí zbytek dluhu a vyplatí procenta původnímu klubu", async () => {
    const first = await makeOffer({ amount: 60_000, upfrontPct: 30, installments: 4, sellOnPct: 10 });
    expect((await callRoute(`/teams/seller-a/offers/${first.id}/accept`, { method: "POST", token: "seller-token", body: {} })).status).toBe(200);
    const before = await budgets();

    // třetí klub kupuje hráče od kupujícího za 80 000 jednorázově
    const second = await makeOffer({ amount: 80_000 }, "third-token", "third-a");
    expect(second.status).toBe(200);
    expect((await callRoute(`/teams/buyer-a/offers/${second.id}/accept`, { method: "POST", token: "buyer-token", body: {} })).status).toBe(200);

    const after = await budgets();
    // kupující (teď prodávající): +80 000 za prodej, −42 000 doplacení, −8 000 procenta
    expect(after["buyer-a"] - before["buyer-a"]).toBe(80_000 - 42_000 - 8_000);
    // původní prodávající: +42 000 doplacení + 8 000 procenta
    expect(after["seller-a"] - before["seller-a"]).toBe(42_000 + 8_000);
    expect((await db.prepare("SELECT status FROM transfer_installments").first<{ status: string }>())!.status).toBe("settled");
    expect(await db.prepare("SELECT status, paid_amount FROM sell_on_clauses WHERE owner_team_id = 'buyer-a'").first()).toEqual({ status: "paid", paid_amount: 8_000 });
  });
});

describe("doložku o procentech nejde obejít", () => {
  async function buyWithSellOn() {
    const { id } = await makeOffer({ amount: 60_000, upfrontPct: 30, installments: 4, sellOnPct: 10 });
    expect((await callRoute(`/teams/seller-a/offers/${id}/accept`, { method: "POST", token: "seller-token", body: {} })).status).toBe(200);
  }

  it("hráče s doložkou nejde propustit (podepsal by se zpátky jako volný bez ní)", async () => {
    await buyWithSellOn();
    const r = await callRoute("/teams/buyer-a/players/star/release", { method: "POST", token: "buyer-token" });
    expect(r.status).toBe(400);
    expect((await readJson(r)).error).toContain("10 % z příštího přestupu pro Prodávající");
    expect((await db.prepare("SELECT team_id FROM players WHERE id = 'star'").first<{ team_id: string }>())!.team_id).toBe("buyer-a");
    expect((await db.prepare("SELECT status FROM sell_on_clauses").first<{ status: string }>())!.status).toBe("active");
  });

  it("u výměny se procenta počítají z doplatku i z tržní ceny hráče, který jde opačně", async () => {
    await buyWithSellOn();
    await db.prepare(`INSERT INTO players (id, team_id, first_name, last_name, age, position, overall_rating,
      skills, physical, personality, life_context, avatar, weekly_wage, squad_number, residence, commute_km)
      VALUES ('swap', 'third-a', 'Karel', 'Výměna', 24, 'MID', 40, '{}', '{}', '{}', '{"condition":100}', '{}', 200, 11, 'Testov', 0)`).run();
    const offer = await makeOffer({ amount: 1_000, offeredPlayerId: "swap" }, "third-token", "third-a");
    expect(offer.status).toBe(200);
    expect((await callRoute(`/teams/buyer-a/offers/${offer.id}/accept`, { method: "POST", token: "buyer-token", body: {} })).status).toBe(200);
    const paid = (await db.prepare("SELECT paid_amount FROM sell_on_clauses WHERE owner_team_id = 'buyer-a'").first<{ paid_amount: number }>())!.paid_amount;
    expect(paid).toBe(Math.round((1_000 + marketValue(40, 24, "MID")) * 0.1));
    expect(paid).toBeGreaterThan(100);
  });

  it("starý přijatý bid z inzerátu doplatí splátky a procenta jako nabídka", async () => {
    await buyWithSellOn();
    await db.batch([
      db.prepare("INSERT INTO transfer_listings (id, player_id, team_id, asking_price, league_id, status, expires_at) VALUES ('listing', 'star', 'buyer-a', 70000, 'league-a', 'active', ?)").bind(FUTURE),
      db.prepare("INSERT INTO transfer_bids (id, listing_id, team_id, amount, last_action_by, status) VALUES ('bid', 'listing', 'third-a', 70000, 'third-a', 'pending')"),
    ]);
    const before = await budgets();
    const r = await callRoute("/teams/buyer-a/bids/bid/accept", { method: "POST", token: "buyer-token" });
    expect(r.status).toBe(200);
    const after = await budgets();
    expect(after["seller-a"] - before["seller-a"]).toBe(42_000 + 7_000);
    expect((await db.prepare("SELECT status FROM transfer_installments").first<{ status: string }>())!.status).toBe("settled");
    expect((await db.prepare("SELECT status FROM sell_on_clauses").first<{ status: string }>())!.status).toBe("paid");
  });
});

async function getObligations(path: string, token: string) {
  const headers = new Headers({ Authorization: `Bearer ${token}` });
  const { ctx } = executionContext();
  const r = await obligationsRouter.fetch(new Request(`http://test.local${path}`, { headers }), env, ctx);
  return { status: r.status, json: r.status === 200 ? await r.json() as Record<string, any> : null };
}

describe("závazky klubu a hráče", () => {
  it("kupující vidí, co splácí, prodávající, co mu chodí; cizí klub nic", async () => {
    const { id } = await makeOffer({ amount: 60_000, upfrontPct: 30, installments: 4, sellOnPct: 10 });
    expect((await callRoute(`/teams/seller-a/offers/${id}/accept`, { method: "POST", token: "seller-token", body: {} })).status).toBe(200);

    const buyer = await getObligations("/teams/buyer-a/obligations", "buyer-token");
    expect(buyer.status).toBe(200);
    expect(buyer.json!.paying[0]).toMatchObject({ playerName: "Petr Hvězda", remaining: 42_000, nextPayment: 10_500, installmentsTotal: 4, otherTeamName: "Prodávající" });
    expect(buyer.json!.paying[0].nextDue).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(buyer.json!.sellOnOwed[0]).toMatchObject({ pct: 10, otherTeamName: "Prodávající" });
    expect(buyer.json!.totals).toEqual({ payThisWeek: 10_500, receiveThisWeek: 0, owedTotal: 42_000, receivableTotal: 0 });

    const seller = await getObligations("/teams/seller-a/obligations", "seller-token");
    expect(seller.json!.receiving[0]).toMatchObject({ remaining: 42_000, otherTeamName: "Kupující" });
    expect(seller.json!.sellOnClaims[0]).toMatchObject({ pct: 10 });

    expect((await getObligations("/teams/buyer-a/obligations", "third-token")).status).toBe(403);
    const third = await getObligations("/teams/third-a/players/star/obligations", "third-token");
    expect(third.json).toEqual({ paying: null, receiving: null, sellOnOwed: null, sellOnClaim: null });
    const mine = await getObligations("/teams/buyer-a/players/star/obligations", "buyer-token");
    expect(mine.json!.paying).toMatchObject({ remaining: 42_000 });
  });
});
