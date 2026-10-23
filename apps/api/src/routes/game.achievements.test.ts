/**
 * Kořaly za propuštění a za podpis celebrity ve skutečných cestách.
 *
 * `checkReleaseAchievements` dřív nikdo nevolal a celebrita se do týmu dostane
 * prakticky jen jako volný hráč, kde se kořaly nekontrolovaly. Obě trofeje šly
 * získat jen ručním zpětným přepočtem.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { Miniflare } from "miniflare";
import type { Bindings } from "../index";

// Podpis volného hráče je los. Tady se zkoumají kořaly, ne vyjednávání.
vi.mock("../transfers/player-agency", async (importOriginal) => {
  const original = await importOriginal<typeof import("../transfers/player-agency")>();
  return {
    ...original,
    evaluateSigningChance: () => ({ accepted: true, probability: 100, explanation: "Kývnul.", factors: [] }),
  };
});
// Podpis celebrity hýbe reputací přes vlastní tabulky, ty tu nejsou potřeba.
vi.mock("../lib/reputation", async (importOriginal) => {
  const original = await importOriginal<typeof import("../lib/reputation")>();
  return { ...original, applyReputationDelta: async () => null };
});

import { gameRouter } from "./game";

let miniflare: Miniflare;
let db: D1Database;
let env: Bindings;

const FUTURE = "2099-08-30T12:00:00.000Z";

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
  const cacheKv = await miniflare.getKVNamespace("CACHE_KV") as unknown as KVNamespace;

  await executeStatements(`
    CREATE TABLE villages (id TEXT PRIMARY KEY, name TEXT NOT NULL, district TEXT NOT NULL, lat REAL NOT NULL, lng REAL NOT NULL, size TEXT DEFAULT 'vesnice');
    CREATE TABLE teams (
      id TEXT PRIMARY KEY, user_id TEXT NOT NULL, name TEXT NOT NULL, league_id TEXT, village_id TEXT,
      parent_team_id TEXT, team_type TEXT NOT NULL DEFAULT 'senior', budget INTEGER NOT NULL DEFAULT 0,
      reputation INTEGER NOT NULL DEFAULT 50, game_date TEXT,
      captain_id TEXT, penalty_taker_id TEXT, freekick_taker_id TEXT
    );
    CREATE TABLE players (
      id TEXT PRIMARY KEY, team_id TEXT NOT NULL, first_name TEXT NOT NULL, last_name TEXT NOT NULL, nickname TEXT,
      age INTEGER NOT NULL, position TEXT NOT NULL, overall_rating INTEGER NOT NULL, skills TEXT NOT NULL DEFAULT '{}',
      physical TEXT NOT NULL DEFAULT '{}', personality TEXT NOT NULL DEFAULT '{}', life_context TEXT NOT NULL DEFAULT '{}',
      avatar TEXT NOT NULL DEFAULT '{}', hidden_talent INTEGER DEFAULT 0, weekly_wage INTEGER DEFAULT 0,
      is_celebrity INTEGER DEFAULT 0, nationality TEXT DEFAULT 'CZ', skills_max TEXT DEFAULT '{}', status TEXT DEFAULT 'active',
      loan_from_team_id TEXT, residence TEXT, commute_km REAL, squad_number INTEGER, coach_relationship INTEGER
    );
    CREATE TABLE sell_on_clauses (id TEXT PRIMARY KEY, player_id TEXT, beneficiary_team_id TEXT, pct INTEGER, status TEXT, resolved_at TEXT);
    CREATE TABLE player_watchlist (id TEXT PRIMARY KEY, team_id TEXT NOT NULL, player_id TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT (datetime('now')));
    CREATE TABLE free_agents (
      id TEXT PRIMARY KEY, district TEXT NOT NULL, first_name TEXT NOT NULL, last_name TEXT NOT NULL, nickname TEXT,
      age INTEGER NOT NULL, position TEXT NOT NULL, overall_rating INTEGER NOT NULL DEFAULT 50,
      skills TEXT NOT NULL DEFAULT '{}', physical TEXT NOT NULL DEFAULT '{}', personality TEXT NOT NULL DEFAULT '{}',
      life_context TEXT NOT NULL DEFAULT '{}', avatar TEXT NOT NULL DEFAULT '{}', hidden_talent REAL DEFAULT 0,
      weekly_wage INTEGER NOT NULL DEFAULT 0, source TEXT NOT NULL DEFAULT 'generated', released_from_team_id TEXT,
      village_id TEXT, rejected_by TEXT NOT NULL DEFAULT '[]', expires_at TEXT NOT NULL, is_celebrity INTEGER DEFAULT 0,
      nationality TEXT NOT NULL DEFAULT 'CZ', skills_max TEXT DEFAULT '{}', created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE departed_players (
      id TEXT PRIMARY KEY, first_name TEXT NOT NULL, last_name TEXT NOT NULL, nickname TEXT, position TEXT NOT NULL,
      age INTEGER, overall_rating INTEGER, team_id TEXT, team_name TEXT, league_id TEXT, leave_type TEXT,
      season_number INTEGER, avatar TEXT, left_at TEXT NOT NULL
    );
    CREATE TABLE player_contracts (
      id TEXT PRIMARY KEY, player_id TEXT NOT NULL, team_id TEXT NOT NULL, season_id TEXT, join_type TEXT, fee INTEGER,
      is_active INTEGER, leave_type TEXT, left_at TEXT
    );
    CREATE TABLE seasons (id TEXT PRIMARY KEY, number INTEGER NOT NULL, status TEXT NOT NULL);
    CREATE TABLE transactions (
      id TEXT PRIMARY KEY, team_id TEXT, type TEXT, amount INTEGER, balance_after INTEGER, description TEXT,
      reference_id TEXT, game_date TEXT
    );
    CREATE TABLE team_achievements (
      team_id TEXT NOT NULL, achievement_key TEXT NOT NULL, earned_at TEXT NOT NULL, tier TEXT, meta TEXT,
      PRIMARY KEY (team_id, achievement_key)
    );

    INSERT INTO villages (id, name, district, lat, lng) VALUES ('v1', 'Vimperk', 'Prachatice', 49.05, 13.78);
    INSERT INTO seasons VALUES ('season-3', 3, 'active');
    INSERT INTO teams (id, user_id, name, league_id, village_id, budget, game_date) VALUES
      ('club', 'u-club', 'SK Vimperk', 'l1', 'v1', 50000, '2026-10-20T16:00:00.000Z');
    INSERT INTO players (id, team_id, first_name, last_name, age, position, overall_rating) VALUES
      ('p1', 'club', 'Karel', 'První', 26, 'MID', 52),
      ('p2', 'club', 'Pavel', 'Druhý', 24, 'DEF', 45);
    INSERT INTO free_agents (id, district, first_name, last_name, age, position, overall_rating, personality, is_celebrity, village_id, expires_at) VALUES
      ('fa-star', 'Prachatice', 'Jan', 'Hvězda', 33, 'FWD', 70, '{"celebrityType":"legend","celebrityTier":"B"}', 1, 'v1', '${FUTURE}'),
      ('fa-plain', 'Prachatice', 'Josef', 'Obyčejný', 23, 'DEF', 40, '{}', 0, 'v1', '${FUTURE}')
  `);

  await sessionKv.put("session:club-token", JSON.stringify({ userId: "u-club", email: "club@test.local", teamId: "club", createdAt: FUTURE }));

  env = {
    DB: db, SESSION_KV: sessionKv, CACHE_KV: cacheKv,
    GEMINI_API_KEY: "", VAPID_PUBLIC_KEY: "", VAPID_PRIVATE_KEY: "", VAPID_SUBJECT: "",
  } as unknown as Bindings;
});

afterAll(async () => {
  await miniflare.dispose();
});

async function callRoute(path: string, options: { method?: string; body?: Record<string, unknown> } = {}) {
  const headers = new Headers({ Authorization: "Bearer club-token" });
  if (options.body) headers.set("Content-Type", "application/json");
  const ctx = { waitUntil: () => undefined, passThroughOnException: () => undefined } as unknown as ExecutionContext;
  return gameRouter.fetch(new Request(`http://test.local${path}`, {
    method: options.method ?? "GET",
    headers,
    body: options.body ? JSON.stringify(options.body) : undefined,
  }), env, ctx);
}

async function achievements(): Promise<string[]> {
  const rows = await db.prepare("SELECT achievement_key FROM team_achievements WHERE team_id = 'club' ORDER BY achievement_key")
    .all<{ achievement_key: string }>();
  return rows.results.map((r) => r.achievement_key);
}

describe("kořaly v cestách propuštění a podpisu", () => {
  it("propuštění dá klubu Reformu kádru, druhé už nic navíc", async () => {
    expect((await callRoute("/teams/club/players/p1/release", { method: "POST" })).status).toBe(200);
    expect(await achievements()).toEqual(["released_first"]);

    expect((await callRoute("/teams/club/players/p2/release", { method: "POST" })).status).toBe(200);
    expect(await achievements()).toEqual(["released_first"]);
  });

  it("podpis obyčejného volného hráče kořaly nedá, koupě to není", async () => {
    const res = await callRoute("/teams/club/free-agents/fa-plain/sign", { method: "POST", body: { offeredWage: 300 } });
    expect(res.status).toBe(200);
    expect(await achievements()).toEqual(["released_first"]);
  });

  it("podpis celebrity mezi volnými hráči dá Showmana", async () => {
    const res = await callRoute("/teams/club/free-agents/fa-star/sign", { method: "POST", body: { offeredWage: 900 } });
    expect(res.status).toBe(200);
    expect(await achievements()).toEqual(["celebrity_signing", "released_first"]);
  });
});
