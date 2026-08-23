import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { Miniflare } from "miniflare";
import type { Bindings } from "../index";

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
      virtual_team_data TEXT
    );

    CREATE TABLE transfer_offer_events (
      id TEXT PRIMARY KEY,
      offer_id TEXT NOT NULL,
      team_id TEXT NOT NULL,
      event_type TEXT NOT NULL,
      amount INTEGER,
      message TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
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
      game_date TEXT NOT NULL
    );

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
      VALUES ('buyer-a', 'user-buyer', NULL, 'senior', 'Kupující', 200000, ?, 'league-a', 'village')`).bind(GAME_DATE),
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

describe("nabídka na hráče U21 ovládaná trenérem mateřského klubu", () => {
  it("projde celou cestu vytvoření nabídky a jejího ukončení rodičovským trenérem", async () => {
    await db.prepare("DELETE FROM transfer_offer_events").run();
    await db.prepare("DELETE FROM transfer_offers").run();

    const created = await callRoute("/teams/buyer-a/offers", {
      method: "POST",
      token: "buyer-token",
      body: { playerId: "junior", amount: 50000, message: "Máme zájem" },
    });
    const createdBody = await readJson(created);
    expect(created.status).toBe(200);
    expect(createdBody.offerId).toBeTruthy();

    const stored = await db.prepare(
      "SELECT from_team_id, to_team_id, last_action_by, status FROM transfer_offers WHERE id = ?",
    ).bind(createdBody.offerId).first<{
      from_team_id: string; to_team_id: string; last_action_by: string; status: string;
    }>();
    expect(stored).toEqual({
      from_team_id: "buyer-a",
      to_team_id: "seller-u21",
      last_action_by: "buyer-a",
      status: "pending",
    });

    const sellerList = await callRoute("/teams/seller-a/offers", { token: "seller-token" });
    const sellerListBody = await readJson(sellerList);
    expect(sellerList.status).toBe(200);
    expect(sellerListBody.incoming).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: createdBody.offerId, to_team_id: "seller-u21", on_turn: true }),
    ]));

    const withdrawn = await callRoute(`/teams/seller-a/offers/${createdBody.offerId}`, {
      method: "DELETE",
      token: "seller-token",
    });
    expect(withdrawn.status).toBe(200);
    const finalOffer = await db.prepare("SELECT status FROM transfer_offers WHERE id = ?")
      .bind(createdBody.offerId).first<{ status: string }>();
    expect(finalOffer?.status).toBe("withdrawn");
  });

  it("neprozradí seznam ani detail nabídek bez přihlášení", async () => {
    const [list, detail] = await Promise.all([
      callRoute("/teams/seller-a/offers"),
      callRoute("/teams/seller-a/offers/offer-u21"),
    ]);

    expect(list.status).toBe(401);
    expect(detail.status).toBe(401);
  });

  it("nepovolí trenérovi jiného klubu podvrhnout teamId v URL", async () => {
    const [list, detail, accept] = await Promise.all([
      callRoute("/teams/seller-a/offers", { token: "buyer-token" }),
      callRoute("/teams/seller-a/offers/offer-u21", { token: "buyer-token" }),
      callRoute("/teams/seller-a/offers/offer-u21/accept", {
        method: "POST",
        token: "buyer-token",
      }),
    ]);

    expect([list.status, detail.status, accept.status]).toEqual([403, 403, 403]);
    const offer = await db.prepare("SELECT status FROM transfer_offers WHERE id = 'offer-u21'")
      .first<{ status: string }>();
    expect(offer?.status).toBe("pending");
  });

  it("zpřístupní detail rodičovskému A-týmu jako prodávajícímu na tahu", async () => {
    const response = await callRoute("/teams/seller-a/offers/offer-u21", { token: "seller-token" });
    const body = await readJson(response);

    expect(response.status).toBe(200);
    expect(body.role).toBe("seller");
    expect(body.on_turn).toBe(true);
    expect(body.player).toMatchObject({ id: "junior", team_id: "seller-u21", isOwn: true });
  });

  it("přijetí připíše peníze A-týmu, přesune hráče a správně přepíše smlouvy", async () => {
    // Po odeslání nabídky ho prodávající dočasně poslal do U21 na příští zápas.
    // Přestup musí návratový flag zrušit, jinak by ho cron vrátil původnímu klubu.
    await db.prepare(
      "UPDATE players SET parent_club_id = 'seller-a', next_match_return = 1 WHERE id = 'junior'",
    ).run();
    // Interní přesun A → U21 dnes mění soupisku, ale historická smlouva zůstává
    // na A-týmu. Přestup musí uzavřít smlouvu v celém klubovém scope.
    await db.prepare("UPDATE player_contracts SET team_id = 'seller-a' WHERE id = 'contract-old'").run();

    const response = await callRoute("/teams/seller-a/offers/offer-u21/accept", {
      method: "POST",
      token: "seller-token",
      body: { message: "Souhlasíme" },
    });
    const body = await readJson(response);

    expect(response.status).toBe(200);
    expect(body).toMatchObject({ ok: true });

    const offer = await db.prepare("SELECT status, resolved_at FROM transfer_offers WHERE id = 'offer-u21'")
      .first<{ status: string; resolved_at: string | null }>();
    expect(offer?.status).toBe("accepted");
    expect(offer?.resolved_at).toBeTruthy();

    const player = await db.prepare("SELECT team_id, parent_club_id, next_match_return FROM players WHERE id = 'junior'")
      .first<{ team_id: string; parent_club_id: string | null; next_match_return: number }>();
    expect(player).toEqual({ team_id: "buyer-a", parent_club_id: null, next_match_return: 0 });

    const budgets = await db.prepare("SELECT id, budget FROM teams WHERE id IN ('buyer-a','seller-a','seller-u21')")
      .all<{ id: string; budget: number }>();
    expect(Object.fromEntries(budgets.results.map((row) => [row.id, row.budget]))).toEqual({
      "buyer-a": 150000,
      "seller-a": 60000,
      "seller-u21": 0,
    });

    const transactions = await db.prepare(
      "SELECT team_id, type, amount, balance_after FROM transactions ORDER BY team_id, type",
    ).all<{ team_id: string; type: string; amount: number; balance_after: number }>();
    expect(transactions.results).toEqual(expect.arrayContaining([
      { team_id: "buyer-a", type: "transfer_fee", amount: -50000, balance_after: 150000 },
      { team_id: "seller-a", type: "transfer_income", amount: 50000, balance_after: 60000 },
    ]));
    expect(transactions.results.some((row) => row.type === "transfer_admin_fee")).toBe(false);
    expect(transactions.results.some((row) => row.team_id === "seller-u21")).toBe(false);

    const contracts = await db.prepare(
      "SELECT team_id, join_type, leave_type, is_active FROM player_contracts WHERE player_id = 'junior' ORDER BY is_active, team_id",
    ).all<{ team_id: string; join_type: string; leave_type: string | null; is_active: number }>();
    expect(contracts.results).toEqual(expect.arrayContaining([
      { team_id: "seller-a", join_type: "generated", leave_type: "transfer", is_active: 0 },
      { team_id: "buyer-a", join_type: "transfer", leave_type: null, is_active: 1 },
    ]));

    const event = await db.prepare(
      "SELECT team_id, event_type, amount, message FROM transfer_offer_events WHERE event_type = 'accept'",
    ).first<{ team_id: string; event_type: string; amount: number; message: string }>();
    expect(event).toEqual({ team_id: "seller-a", event_type: "accept", amount: 50000, message: "Souhlasíme" });

    // Po dokončení už bývalý prodávající nesmí vidět interní data hráče;
    // nový vlastník naopak dostane přesný profil i přes klubovou normalizaci.
    const [formerSellerDetail, newOwnerDetail] = await Promise.all([
      callRoute("/teams/seller-a/offers/offer-u21", { token: "seller-token" }),
      callRoute("/teams/buyer-a/offers/offer-u21", { token: "buyer-token" }),
    ]);
    expect(formerSellerDetail.status).toBe(200);
    expect(newOwnerDetail.status).toBe(200);
    const formerSellerBody = await readJson(formerSellerDetail);
    const newOwnerBody = await readJson(newOwnerDetail);
    expect(formerSellerBody).toMatchObject({
      role: "seller",
      on_turn: false,
      offer: { status: "accepted", from_team_id: "buyer-a", to_team_id: "seller-a" },
      player: { team_id: "buyer-a", isOwn: false, weekly_wage: null, squad_number: null, skills: { passing: 40 } },
    });
    expect(newOwnerBody.player).toMatchObject({ isOwn: true, weekly_wage: 500, skills: { passing: 42 } });
  });

  it("uzavře U21 smlouvu i po interním povýšení hráče do A-týmu", async () => {
    // Obrácená varianta: hráč byl při nabídce v U21, pak se přesunul do A,
    // smluvní záznam ale zůstal na U21.
    await db.prepare("UPDATE players SET team_id = 'seller-a' WHERE id = 'junior'").run();

    const response = await callRoute("/teams/seller-a/offers/offer-u21/accept", {
      method: "POST",
      token: "seller-token",
    });
    expect(response.status).toBe(200);

    const player = await db.prepare("SELECT team_id FROM players WHERE id = 'junior'")
      .first<{ team_id: string }>();
    expect(player?.team_id).toBe("buyer-a");
    const contracts = await db.prepare(
      "SELECT id, team_id, is_active, leave_type FROM player_contracts WHERE player_id = 'junior' ORDER BY id",
    ).all<{ id: string; team_id: string; is_active: number; leave_type: string | null }>();
    expect(contracts.results).toHaveLength(2);
    expect(contracts.results).toEqual(expect.arrayContaining([
      { id: "contract-old", team_id: "seller-u21", is_active: 0, leave_type: "transfer" },
      expect.objectContaining({ team_id: "buyer-a", is_active: 1 }),
    ]));
  });

  it("rodičovský A-tým může nabídku odmítnout jako vlastník hráče", async () => {
    const response = await callRoute("/teams/seller-a/offers/offer-u21/reject", {
      method: "POST",
      token: "seller-token",
      body: { message: "Hráče nepustíme" },
    });
    const body = await readJson(response);

    expect(response.status).toBe(200);
    expect(body).toMatchObject({ ok: true });

    const offer = await db.prepare(
      "SELECT status, reject_message, resolved_at FROM transfer_offers WHERE id = 'offer-u21'",
    ).first<{ status: string; reject_message: string | null; resolved_at: string | null }>();
    expect(offer).toMatchObject({ status: "rejected", reject_message: "Hráče nepustíme" });
    expect(offer?.resolved_at).toBeTruthy();

    const player = await db.prepare("SELECT team_id FROM players WHERE id = 'junior'")
      .first<{ team_id: string }>();
    expect(player?.team_id).toBe("seller-u21");

    const budgets = await db.prepare("SELECT id, budget FROM teams WHERE id IN ('buyer-a','seller-a','seller-u21')")
      .all<{ id: string; budget: number }>();
    expect(Object.fromEntries(budgets.results.map((row) => [row.id, row.budget]))).toEqual({
      "buyer-a": 200000,
      "seller-a": 10000,
      "seller-u21": 0,
    });

    expect(sideEffects.applyOfferRejectionImpact).toHaveBeenCalledTimes(1);
    expect(sideEffects.applyOfferRejectionImpact.mock.calls[0]?.[1]).toMatchObject({
      id: "offer-u21",
      player_id: "junior",
      to_team_id: "seller-u21",
    });

    const event = await db.prepare(
      "SELECT team_id, event_type, message FROM transfer_offer_events WHERE event_type = 'reject'",
    ).first<{ team_id: string; event_type: string; message: string }>();
    expect(event).toEqual({ team_id: "seller-a", event_type: "reject", message: "Hráče nepustíme" });
  });

  it("dva souběžné pokusy o přijetí zaúčtují obchod jen jednou", async () => {
    const responses = await Promise.all([
      callRoute("/teams/seller-a/offers/offer-u21/accept", { method: "POST", token: "seller-token" }),
      callRoute("/teams/seller-a/offers/offer-u21/accept", { method: "POST", token: "seller-token" }),
    ]);

    expect(responses.map((response) => response.status).sort()).toEqual([200, 409]);
    const budgets = await db.prepare("SELECT id, budget FROM teams WHERE id IN ('buyer-a','seller-a','seller-u21')")
      .all<{ id: string; budget: number }>();
    expect(Object.fromEntries(budgets.results.map((row) => [row.id, row.budget]))).toEqual({
      "buyer-a": 150000,
      "seller-a": 60000,
      "seller-u21": 0,
    });
    const acceptedEvents = await db.prepare(
      "SELECT COUNT(*) AS n FROM transfer_offer_events WHERE offer_id = 'offer-u21' AND event_type = 'accept'",
    ).first<{ n: number }>();
    expect(acceptedEvents?.n).toBe(1);
  });

  it("dvě různé souběžné nabídky na stejného juniora dokončí právě jeden obchod", async () => {
    await db.batch([
      db.prepare(`INSERT INTO teams (id, user_id, parent_team_id, team_type, name, budget, game_date, league_id, village_id)
        VALUES ('buyer-b', 'user-buyer-b', NULL, 'senior', 'Druhý kupující', 200000, ?, 'league-a', 'village')`).bind(GAME_DATE),
      db.prepare(`INSERT INTO transfer_offers (
        id, player_id, from_team_id, to_team_id, offer_amount, status, expires_at,
        offer_type, last_action_by, target_squad, player_interest
      ) VALUES (
        'offer-u21-b', 'junior', 'buyer-b', 'seller-u21', 60000, 'pending', ?,
        'transfer', 'buyer-b', 'senior', 1
      )`).bind(FUTURE),
    ]);

    const responses = await Promise.all([
      callRoute("/teams/seller-a/offers/offer-u21/accept", { method: "POST", token: "seller-token" }),
      callRoute("/teams/seller-a/offers/offer-u21-b/accept", { method: "POST", token: "seller-token" }),
    ]);
    expect(responses.map((response) => response.status).sort()).toEqual([200, 409]);

    const offers = await db.prepare(
      "SELECT id, from_team_id, offer_amount, status FROM transfer_offers WHERE player_id = 'junior' ORDER BY id",
    ).all<{ id: string; from_team_id: string; offer_amount: number; status: string }>();
    expect(offers.results.map((offer) => offer.status).sort()).toEqual(["accepted", "withdrawn"]);
    const winner = offers.results.find((offer) => offer.status === "accepted");
    expect(winner).toBeTruthy();

    const player = await db.prepare("SELECT team_id FROM players WHERE id = 'junior'")
      .first<{ team_id: string }>();
    expect(player?.team_id).toBe(winner?.from_team_id);

    const budgets = await db.prepare(
      "SELECT id, budget FROM teams WHERE id IN ('buyer-a','buyer-b','seller-a','seller-u21')",
    ).all<{ id: string; budget: number }>();
    const budgetByTeam = Object.fromEntries(budgets.results.map((row) => [row.id, row.budget]));
    const loserTeamId = winner?.from_team_id === "buyer-a" ? "buyer-b" : "buyer-a";
    expect(budgetByTeam[winner!.from_team_id]).toBe(200000 - winner!.offer_amount);
    expect(budgetByTeam[loserTeamId]).toBe(200000);
    expect(budgetByTeam["seller-a"]).toBe(10000 + winner!.offer_amount);
    expect(budgetByTeam["seller-u21"]).toBe(0);

    const transactions = await db.prepare("SELECT team_id, type, amount FROM transactions")
      .all<{ team_id: string; type: string; amount: number }>();
    expect(transactions.results).toHaveLength(2);
    expect(transactions.results).toEqual(expect.arrayContaining([
      { team_id: winner!.from_team_id, type: "transfer_fee", amount: -winner!.offer_amount },
      { team_id: "seller-a", type: "transfer_income", amount: winner!.offer_amount },
    ]));

    const contracts = await db.prepare(
      "SELECT team_id, is_active FROM player_contracts WHERE player_id = 'junior' ORDER BY is_active",
    ).all<{ team_id: string; is_active: number }>();
    expect(contracts.results).toHaveLength(2);
    expect(contracts.results.filter((contract) => contract.is_active === 1)).toEqual([
      { team_id: winner!.from_team_id, is_active: 1 },
    ]);
  });

  it("odkup hostujícího juniora uzavře hostovací i původní U21 smlouvu", async () => {
    await db.prepare(
      "UPDATE players SET team_id = 'buyer-a', loan_from_team_id = 'seller-u21', loan_until = ? WHERE id = 'junior'",
    ).bind(FUTURE).run();
    await db.prepare(
      `INSERT INTO player_contracts (id, player_id, team_id, season_id, joined_at, join_type, fee, is_active)
       VALUES ('contract-loan', 'junior', 'buyer-a', 'season', ?, 'loan', 0, 1)`,
    ).bind(GAME_DATE).run();

    const ownerDetail = await callRoute("/teams/seller-a/offers/offer-u21", { token: "seller-token" });
    const ownerBody = await readJson(ownerDetail);
    expect(ownerDetail.status).toBe(200);
    expect(ownerBody.player).toMatchObject({
      isOwn: false,
      isParentClub: true,
      weekly_wage: 500,
      skills: { passing: 42 },
    });

    const response = await callRoute("/teams/seller-a/offers/offer-u21/accept", {
      method: "POST",
      token: "seller-token",
    });
    expect(response.status).toBe(200);

    const player = await db.prepare(
      "SELECT team_id, loan_from_team_id, loan_until FROM players WHERE id = 'junior'",
    ).first<{ team_id: string; loan_from_team_id: string | null; loan_until: string | null }>();
    expect(player).toEqual({ team_id: "buyer-a", loan_from_team_id: null, loan_until: null });

    const contracts = await db.prepare(
      "SELECT id, team_id, join_type, leave_type, is_active FROM player_contracts WHERE player_id = 'junior' ORDER BY id",
    ).all<{ id: string; team_id: string; join_type: string; leave_type: string | null; is_active: number }>();
    expect(contracts.results).toEqual(expect.arrayContaining([
      { id: "contract-old", team_id: "seller-u21", join_type: "generated", leave_type: "transfer", is_active: 0 },
      { id: "contract-loan", team_id: "buyer-a", join_type: "loan", leave_type: "loan_bought", is_active: 0 },
      expect.objectContaining({ team_id: "buyer-a", join_type: "transfer", is_active: 1 }),
    ]));
    expect(contracts.results.filter((contract) => contract.is_active === 1)).toHaveLength(1);
  });

  it("rodičovský A-tým může poslat protinabídku a předá tah kupujícímu", async () => {
    const response = await callRoute("/teams/seller-a/offers/offer-u21/counter", {
      method: "POST",
      token: "seller-token",
      body: { amount: 60000, message: "Za šedesát" },
    });

    expect(response.status).toBe(200);
    expect(await readJson(response)).toMatchObject({ ok: true });

    const offer = await db.prepare(
      "SELECT status, counter_amount, last_action_by FROM transfer_offers WHERE id = 'offer-u21'",
    ).first<{ status: string; counter_amount: number; last_action_by: string }>();
    expect(offer).toEqual({ status: "countered", counter_amount: 60000, last_action_by: "seller-a" });

    const event = await db.prepare(
      "SELECT team_id, event_type, amount, message FROM transfer_offer_events WHERE event_type = 'counter'",
    ).first<{ team_id: string; event_type: string; amount: number; message: string }>();
    expect(event).toEqual({ team_id: "seller-a", event_type: "counter", amount: 60000, message: "Za šedesát" });

    const buyerDetail = await callRoute("/teams/buyer-a/offers/offer-u21", { token: "buyer-token" });
    const buyerBody = await readJson(buyerDetail);
    expect(buyerDetail.status).toBe(200);
    expect(buyerBody.role).toBe("buyer");
    expect(buyerBody.on_turn).toBe(true);
  });

  it("prodávající A-tým může jednání ukončit a nabídka zůstane v jeho historii", async () => {
    const response = await callRoute("/teams/seller-a/offers/offer-u21", {
      method: "DELETE",
      token: "seller-token",
      body: { message: "Jednání končí" },
    });

    expect(response.status).toBe(200);
    expect(await readJson(response)).toMatchObject({ ok: true });

    const offer = await db.prepare("SELECT status, resolved_at FROM transfer_offers WHERE id = 'offer-u21'")
      .first<{ status: string; resolved_at: string | null }>();
    expect(offer?.status).toBe("withdrawn");
    expect(offer?.resolved_at).toBeTruthy();

    const event = await db.prepare(
      "SELECT team_id, event_type, message FROM transfer_offer_events WHERE event_type = 'withdraw'",
    ).first<{ team_id: string; event_type: string; message: string }>();
    expect(event).toEqual({ team_id: "seller-a", event_type: "withdraw", message: "Jednání končí" });

    const historyResponse = await callRoute("/teams/seller-a/offers", { token: "seller-token" });
    const historyBody = await readJson(historyResponse);
    expect(historyResponse.status).toBe(200);
    expect(historyBody.history).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: "offer-u21", status: "withdrawn", my_role: "seller" }),
    ]));
  });

  it("u legacy nabídky bez last_action_by určí tah podle stavu a klubové role", async () => {
    await db.prepare("UPDATE transfer_offers SET last_action_by = NULL WHERE id = 'offer-u21'").run();

    const sellerDetail = await callRoute("/teams/seller-a/offers/offer-u21", { token: "seller-token" });
    const sellerBody = await readJson(sellerDetail);
    expect(sellerDetail.status).toBe(200);
    expect(sellerBody.role).toBe("seller");
    expect(sellerBody.on_turn).toBe(true);

    await db.prepare(
      "UPDATE transfer_offers SET status = 'countered', counter_amount = 60000, last_action_by = NULL WHERE id = 'offer-u21'",
    ).run();

    const buyerDetail = await callRoute("/teams/buyer-a/offers/offer-u21", { token: "buyer-token" });
    const buyerBody = await readJson(buyerDetail);
    expect(buyerDetail.status).toBe(200);
    expect(buyerBody.role).toBe("buyer");
    expect(buyerBody.on_turn).toBe(true);
  });
});
