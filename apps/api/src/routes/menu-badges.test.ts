import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Miniflare } from "miniflare";
import type { Bindings } from "../index";
import { menuBadgesRouter } from "./menu-badges";
import { gameRouter } from "./game";

let miniflare: Miniflare;
let db: D1Database;
let env: Bindings;

const FUTURE = "2099-08-30T12:00:00.000Z";
const LISTS = ["incoming", "outgoing", "incomingBids", "outgoingBids"] as const;

type Row = Record<string, unknown>;
type Payload = Record<(typeof LISTS)[number], Row[]>;

async function executeStatements(sql: string) {
  for (const statement of sql.split(";").map((part) => part.trim()).filter(Boolean)) {
    await db.prepare(statement).run();
  }
}

function offer(id: string, o: {
  player: string; from: string; to: string; amount: number; counter?: number | null;
  status: string; lastActionBy: string | null; virtual?: string;
}) {
  return db.prepare(
    `INSERT INTO transfer_offers (id, player_id, from_team_id, to_team_id, offer_amount, counter_amount, status,
      expires_at, last_action_by, virtual_team_data, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, '2026-10-20T10:00:00.000Z')`,
  ).bind(id, o.player, o.from, o.to, o.amount, o.counter ?? null, o.status, FUTURE, o.lastActionBy, o.virtual ?? null);
}

function bid(id: string, o: {
  listing: string; team: string; amount: number; counter?: number | null; status: string; lastActionBy: string | null;
}) {
  return db.prepare(
    `INSERT INTO transfer_bids (id, listing_id, team_id, amount, counter_amount, last_action_by, status, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, '2026-10-20T10:00:00.000Z')`,
  ).bind(id, o.listing, o.team, o.amount, o.counter ?? null, o.lastActionBy, o.status);
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

  // Tabulky, které čte plné GET /teams/:teamId/offers. Odznak se s ním porovnává.
  await executeStatements(`
    CREATE TABLE teams (
      id TEXT PRIMARY KEY, user_id TEXT NOT NULL, parent_team_id TEXT, name TEXT NOT NULL,
      league_id TEXT, game_date TEXT
    );
    CREATE TABLE players (
      id TEXT PRIMARY KEY, team_id TEXT NOT NULL, first_name TEXT NOT NULL, last_name TEXT NOT NULL,
      age INTEGER NOT NULL DEFAULT 24, position TEXT NOT NULL DEFAULT 'MID', overall_rating INTEGER NOT NULL DEFAULT 40,
      skills TEXT NOT NULL DEFAULT '{}', avatar TEXT NOT NULL DEFAULT '{}', loan_from_team_id TEXT, loan_until TEXT
    );
    CREATE TABLE transfer_offers (
      id TEXT PRIMARY KEY, player_id TEXT NOT NULL, from_team_id TEXT NOT NULL, to_team_id TEXT NOT NULL,
      offer_amount INTEGER NOT NULL, counter_amount INTEGER, message TEXT, reject_message TEXT,
      status TEXT NOT NULL DEFAULT 'pending', expires_at TEXT NOT NULL, created_at TEXT, resolved_at TEXT,
      offer_type TEXT NOT NULL DEFAULT 'transfer', loan_duration INTEGER, last_action_by TEXT,
      offered_player_id TEXT, target_squad TEXT NOT NULL DEFAULT 'senior', player_interest INTEGER,
      virtual_team_data TEXT, upfront_pct INTEGER NOT NULL DEFAULT 100, installments INTEGER NOT NULL DEFAULT 0,
      sell_on_pct INTEGER NOT NULL DEFAULT 0
    );
    CREATE TABLE transfer_listings (
      id TEXT PRIMARY KEY, player_id TEXT NOT NULL, team_id TEXT NOT NULL, asking_price INTEGER NOT NULL,
      league_id TEXT NOT NULL DEFAULT 'lg', status TEXT NOT NULL, expires_at TEXT NOT NULL DEFAULT '2099-01-01',
      created_at TEXT
    );
    CREATE TABLE transfer_bids (
      id TEXT PRIMARY KEY, listing_id TEXT NOT NULL, team_id TEXT NOT NULL, amount INTEGER NOT NULL,
      counter_amount INTEGER, last_action_by TEXT, message TEXT, status TEXT NOT NULL, created_at TEXT
    );
    CREATE TABLE player_contracts (
      id TEXT PRIMARY KEY, player_id TEXT NOT NULL, team_id TEXT NOT NULL, join_type TEXT NOT NULL,
      fee INTEGER NOT NULL DEFAULT 0, is_active INTEGER NOT NULL DEFAULT 1
    );
    CREATE TABLE departed_players (
      id TEXT PRIMARY KEY, first_name TEXT, last_name TEXT, age INTEGER, position TEXT,
      overall_rating INTEGER, avatar TEXT
    );
    CREATE TABLE transfer_offer_swap_players (
      offer_id TEXT NOT NULL, player_id TEXT NOT NULL, sort_order INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (offer_id, player_id)
    )
  `);

  await db.batch([
    db.prepare("INSERT INTO teams (id, user_id, parent_team_id, name, game_date) VALUES ('my-a', 'user-me', NULL, 'Můj klub', '2026-10-24T12:00:00.000Z')"),
    db.prepare("INSERT INTO teams (id, user_id, parent_team_id, name) VALUES ('my-u21', 'user-me', 'my-a', 'Můj klub U21')"),
    db.prepare("INSERT INTO teams (id, user_id, parent_team_id, name) VALUES ('rival-a', 'user-rival', NULL, 'Soupeř')"),
    db.prepare("INSERT INTO teams (id, user_id, parent_team_id, name) VALUES ('rival-u21', 'user-rival', 'rival-a', 'Soupeř U21')"),
    db.prepare("INSERT INTO teams (id, user_id, parent_team_id, name) VALUES ('third-a', 'user-third', NULL, 'Třetí')"),
    db.prepare("INSERT INTO players (id, team_id, first_name, last_name) VALUES ('p-mine', 'my-a', 'Karel', 'Domácí')"),
    db.prepare("INSERT INTO players (id, team_id, first_name, last_name) VALUES ('p-young', 'my-u21', 'Jan', 'Mladý')"),
    db.prepare("INSERT INTO players (id, team_id, first_name, last_name) VALUES ('p-rival', 'rival-a', 'Petr', 'Cizí')"),
    db.prepare("INSERT INTO players (id, team_id, first_name, last_name) VALUES ('p-third', 'third-a', 'Tomáš', 'Třetí')"),

    // Příchozí: kupující táhl, protinávrh vlastní U21 (tah za klub), soupeřova U21,
    // staré nabídky bez last_action_by, cizí klub, hráč mezitím zmizel, uzavřená nabídka.
    offer("in-pending", { player: "p-mine", from: "rival-a", to: "my-a", amount: 10000, status: "pending", lastActionBy: "rival-a" }),
    offer("in-countered-by-u21", { player: "p-young", from: "rival-a", to: "my-u21", amount: 8000, counter: 12000, status: "countered", lastActionBy: "my-u21" }),
    offer("in-from-rival-u21", { player: "p-young", from: "rival-u21", to: "my-u21", amount: 5000, status: "pending", lastActionBy: "rival-u21" }),
    offer("in-legacy", { player: "p-mine", from: "third-a", to: "my-a", amount: 7000, status: "pending", lastActionBy: null }),
    offer("in-legacy-countered", { player: "p-mine", from: "third-a", to: "my-a", amount: 7000, counter: 9000, status: "countered", lastActionBy: null }),
    offer("in-virtual", { player: "p-mine", from: "virtual_ai", to: "my-a", amount: 20000, status: "pending", lastActionBy: "virtual_ai", virtual: '{"name":"Slavoj Výšlap"}' }),
    offer("in-gone-player", { player: "p-gone", from: "rival-a", to: "my-a", amount: 1000, status: "pending", lastActionBy: "rival-a" }),
    offer("in-accepted", { player: "p-mine", from: "rival-a", to: "my-a", amount: 1000, status: "accepted", lastActionBy: "my-a" }),

    // Odchozí: protinávrh prodávajícího, vlastní poslední tah, nabídka z U21,
    // stará protinabídka bez last_action_by, klub, který už neexistuje.
    offer("out-countered", { player: "p-rival", from: "my-a", to: "rival-a", amount: 15000, counter: 18000, status: "countered", lastActionBy: "rival-a" }),
    offer("out-pending", { player: "p-rival", from: "my-a", to: "rival-a", amount: 15000, status: "pending", lastActionBy: "my-a" }),
    offer("out-from-u21", { player: "p-third", from: "my-u21", to: "third-a", amount: 3000, counter: 4000, status: "countered", lastActionBy: "third-a" }),
    offer("out-legacy-countered", { player: "p-third", from: "my-a", to: "third-a", amount: 3000, counter: 3500, status: "countered", lastActionBy: null }),
    offer("out-ghost-team", { player: "p-third", from: "my-a", to: "ghost-team", amount: 3000, status: "pending", lastActionBy: "my-a" }),

    db.prepare("INSERT INTO transfer_listings (id, player_id, team_id, asking_price, status) VALUES ('l-mine', 'p-mine', 'my-a', 9000, 'active')"),
    db.prepare("INSERT INTO transfer_listings (id, player_id, team_id, asking_price, status) VALUES ('l-mine-sold', 'p-mine', 'my-a', 9000, 'sold')"),
    db.prepare("INSERT INTO transfer_listings (id, player_id, team_id, asking_price, status) VALUES ('l-rival', 'p-rival', 'rival-a', 9000, 'active')"),
    bid("b-in", { listing: "l-mine", team: "rival-a", amount: 5000, status: "pending", lastActionBy: "rival-a" }),
    bid("b-in-legacy", { listing: "l-mine", team: "third-a", amount: 5500, status: "pending", lastActionBy: null }),
    bid("b-in-sold", { listing: "l-mine-sold", team: "rival-a", amount: 5000, status: "pending", lastActionBy: "rival-a" }),
    bid("b-out", { listing: "l-rival", team: "my-a", amount: 6000, counter: 7000, status: "countered", lastActionBy: "rival-a" }),
    bid("b-out-mine", { listing: "l-rival", team: "my-a", amount: 6500, status: "pending", lastActionBy: "my-a" }),
    bid("b-out-u21", { listing: "l-rival", team: "my-u21", amount: 4000, status: "pending", lastActionBy: "my-u21" }),
  ]);

  for (const [token, userId] of [["token-me", "user-me"], ["token-rival", "user-rival"]]) {
    await sessionKv.put(`session:${token}`, JSON.stringify({ userId, email: `${userId}@test.local`, teamId: "x", createdAt: "2026-10-24T10:00:00.000Z" }));
  }

  env = { DB: db, SESSION_KV: sessionKv } as unknown as Bindings;
});

afterAll(async () => {
  await miniflare.dispose();
});

function request(path: string, token: string | null) {
  const headers = new Headers(token ? { Authorization: `Bearer ${token}` } : {});
  return new Request(`http://test.local${path}`, { headers });
}

async function badges(teamId: string, token: string | null = "token-me", bindings: Bindings = env) {
  return menuBadgesRouter.fetch(request(`/teams/${teamId}/menu-badges/offers`, token), bindings);
}

async function fullOffers(teamId: string): Promise<Payload> {
  const res = await gameRouter.fetch(request(`/teams/${teamId}/offers`, "token-me"), env);
  expect(res.status).toBe(200);
  return res.json() as Promise<Payload>;
}

/** Přesně to, z čeho web skládá otisk nabídky (getOfferFingerprint) a podle čeho počítá odznak. */
function badgeView(payload: Payload) {
  return Object.fromEntries(LISTS.map((key) => [key, (payload[key] ?? [])
    .map((r) => ({
      id: r.id,
      status: r.status,
      amount: r.counter_amount ?? r.offer_amount ?? r.amount ?? 0,
      lastAction: r.last_action_club_id ?? r.last_action_by ?? "",
      onTurn: r.on_turn,
    }))
    .sort((a, b) => String(a.id).localeCompare(String(b.id)))]));
}

function onTurnById(rows: Row[]) {
  return Object.fromEntries(rows.map((r) => [r.id, r.on_turn]));
}

describe("GET /teams/:teamId/menu-badges/offers", () => {
  it("bez přihlášení 401, cizí tým 403", async () => {
    expect((await badges("my-a", null)).status).toBe(401);
    expect((await badges("rival-a")).status).toBe(403);
    expect((await badges("my-a", "token-rival")).status).toBe(403);
  });

  it("aplikace ji obslouží pod /api, žádná dřív připojená cesta ji nepřebije", async () => {
    const { default: worker } = await import("../index");
    const ctx = { waitUntil() {}, passThroughOnException() {} } as unknown as ExecutionContext;
    const res = await worker.fetch(request("/api/teams/my-a/menu-badges/offers", "token-me"), env, ctx);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual(await (await badges("my-a")).json());
  });

  it("A-tým i U21: stejný otisk a tah jako plný přehled nabídek, jinak by odznak po zhlédnutí svítil dál", async () => {
    for (const teamId of ["my-a", "my-u21"]) {
      const res = await badges(teamId);
      expect(res.status).toBe(200);
      const light = await res.json() as Payload;
      expect(badgeView(light)).toEqual(badgeView(await fullOffers(teamId)));
    }
  });

  it("na tahu je klub, ne soupiska; staré nabídky bez posledního tahu podle stavu", async () => {
    const light = await (await badges("my-a")).json() as Payload;
    expect(onTurnById(light.incoming)).toEqual({
      "in-pending": true,
      "in-countered-by-u21": false,
      "in-from-rival-u21": true,
      "in-legacy": true,
      "in-legacy-countered": false,
      "in-virtual": true,
    });
    expect(onTurnById(light.outgoing)).toEqual({
      "out-countered": true,
      "out-pending": false,
      "out-from-u21": true,
      "out-legacy-countered": true,
    });
    expect(onTurnById(light.incomingBids)).toEqual({ "b-in": true, "b-in-legacy": true });
    expect(onTurnById(light.outgoingBids)).toEqual({ "b-out": true, "b-out-mine": false });

    const u21 = await (await badges("my-u21")).json() as Payload;
    expect(onTurnById(u21.incomingBids)).toEqual({});
    expect(onTurnById(u21.outgoingBids)).toEqual({ "b-out-u21": false });
  });

  it("vrací jen pole pro odznak, žádná jména, poplatky ani hráče na výměnu", async () => {
    const light = await (await badges("my-a")).json() as Payload;
    for (const row of [...light.incoming, ...light.outgoing]) {
      expect(Object.keys(row).sort()).toEqual(["counter_amount", "id", "last_action_club_id", "offer_amount", "on_turn", "status"]);
    }
    for (const row of [...light.incomingBids, ...light.outgoingBids]) {
      expect(Object.keys(row).sort()).toEqual(["amount", "counter_amount", "id", "last_action_by", "on_turn", "status"]);
    }
  });

  it("počet dotazů nezávisí na počtu nabídek a data jdou jedním balíkem", async () => {
    const counted = () => {
      const calls = { prepare: 0, batch: 0 };
      const wrapped = {
        prepare: (sql: string) => { calls.prepare++; return db.prepare(sql); },
        batch: (statements: D1PreparedStatement[]) => { calls.batch++; return db.batch(statements); },
      } as unknown as D1Database;
      return { calls, bindings: { ...env, DB: wrapped } as Bindings };
    };

    const before = counted();
    expect((await badges("my-a", "token-me", before.bindings)).status).toBe(200);

    await db.batch(Array.from({ length: 6 }, (_, i) =>
      offer(`in-extra-${i}`, { player: "p-mine", from: "rival-a", to: "my-a", amount: 1000 + i, status: "pending", lastActionBy: "rival-a" })));
    const after = counted();
    const res = await badges("my-a", "token-me", after.bindings);
    expect(res.status).toBe(200);
    expect(((await res.json()) as Payload).incoming).toHaveLength(12);

    expect(after.calls).toEqual(before.calls);
    expect(after.calls.batch).toBe(1);
    await db.prepare("DELETE FROM transfer_offers WHERE id LIKE 'in-extra-%'").run();
  });
});
