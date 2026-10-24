/**
 * Propuštění sledovaného hráče: zpráva „⭐ X je volný!“ a sledování dál.
 *
 * `removePlayer` mazal `player_watchlist` a teprve potom se posílala zpráva
 * sledujícím, takže ji nedostal nikdo. Volný hráč má navíc nové id, takže
 * sledujícím ze Sledovaných zmizel. Po podpisu volného hráče dostane hráč id
 * znovu nové, i to musí sledování přežít.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { Miniflare } from "miniflare";
import type { Bindings } from "../index";

const pushes = vi.hoisted(() => [] as Array<{ teams: string[]; title: string }>);
vi.mock("../community/web-push", async (importOriginal) => {
  const original = await importOriginal<typeof import("../community/web-push")>();
  return {
    ...original,
    // Komu by zpráva šla: sledující se hledají až v okamžiku odeslání.
    sendWebPushToPlayerWatchers: async (env: { DB: D1Database }, playerId: string, excludeTeamId: string | null, title: string) => {
      const rows = await env.DB.prepare("SELECT DISTINCT team_id FROM player_watchlist WHERE player_id = ?")
        .bind(playerId).all<{ team_id: string }>();
      pushes.push({ teams: rows.results.map((r) => r.team_id).filter((t) => t !== excludeTeamId).sort(), title });
    },
    sendWebPushToTeams: async (_env: unknown, teamIds: string[], title: string) => {
      pushes.push({ teams: [...teamIds].sort(), title });
    },
  };
});
// Podpis volného hráče je los. Tady se zkoumá sledování, ne vyjednávání.
vi.mock("../transfers/player-agency", async (importOriginal) => {
  const original = await importOriginal<typeof import("../transfers/player-agency")>();
  return {
    ...original,
    evaluateSigningChance: () => ({ accepted: true, probability: 100, explanation: "Kývnul.", factors: [] }),
  };
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
      reputation INTEGER NOT NULL DEFAULT 50, game_date TEXT, primary_color TEXT, secondary_color TEXT, badge_pattern TEXT,
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
    CREATE TABLE club_links (team_id TEXT PRIMARY KEY, group_id TEXT NOT NULL, note TEXT, created_at TEXT);
    CREATE TABLE injuries (id TEXT PRIMARY KEY, player_id TEXT NOT NULL, team_id TEXT, type TEXT, days_remaining INTEGER NOT NULL);
    CREATE TABLE sell_on_clauses (id TEXT PRIMARY KEY, player_id TEXT, beneficiary_team_id TEXT, pct INTEGER, status TEXT, resolved_at TEXT);
    CREATE TABLE player_watchlist (
      id TEXT PRIMARY KEY, team_id TEXT NOT NULL, player_id TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')), UNIQUE (team_id, player_id)
    );
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

    INSERT INTO villages (id, name, district, lat, lng) VALUES ('v1', 'Vimperk', 'Prachatice', 49.05, 13.78);
    INSERT INTO seasons VALUES ('season-3', 3, 'active');
    INSERT INTO teams (id, user_id, name, league_id, village_id, budget, game_date) VALUES
      ('seller', 'u-seller', 'SK Vimperk', 'l1', 'v1', 50000, '2026-10-20T16:00:00.000Z'),
      ('scout-a', 'u-a', 'Sokol Lhota', 'l1', 'v1', 50000, '2026-10-20T16:00:00.000Z'),
      ('scout-b', 'u-b', 'TJ Zdíkov', 'l1', 'v1', 50000, '2026-10-20T16:00:00.000Z');
    INSERT INTO players (id, team_id, first_name, last_name, age, position, overall_rating) VALUES
      ('p-watched', 'seller', 'Karel', 'Sledovaný', 26, 'MID', 52),
      ('p-mate', 'seller', 'Pavel', 'Spoluhráč', 24, 'DEF', 45);
    INSERT INTO player_watchlist (id, team_id, player_id, created_at) VALUES
      ('w1', 'scout-a', 'p-watched', '2026-10-01 10:00:00'),
      ('w2', 'scout-b', 'p-watched', '2026-10-02 10:00:00')
  `);

  for (const [token, userId, teamId] of [["seller-token", "u-seller", "seller"], ["a-token", "u-a", "scout-a"]]) {
    await sessionKv.put(`session:${token}`, JSON.stringify({ userId, email: `${userId}@test.local`, teamId, createdAt: FUTURE }));
  }

  env = {
    DB: db, SESSION_KV: sessionKv, CACHE_KV: cacheKv,
    GEMINI_API_KEY: "", VAPID_PUBLIC_KEY: "", VAPID_PRIVATE_KEY: "", VAPID_SUBJECT: "",
  } as unknown as Bindings;
});

afterAll(async () => {
  await miniflare.dispose();
});

async function callRoute(path: string, options: { method?: string; token?: string; body?: Record<string, unknown> } = {}) {
  const headers = new Headers();
  if (options.token) headers.set("Authorization", `Bearer ${options.token}`);
  if (options.body) headers.set("Content-Type", "application/json");
  const ctx = { waitUntil: () => undefined, passThroughOnException: () => undefined } as unknown as ExecutionContext;
  return gameRouter.fetch(new Request(`http://test.local${path}`, {
    method: options.method ?? "GET",
    headers,
    body: options.body ? JSON.stringify(options.body) : undefined,
  }), env, ctx);
}

async function watchedIds(teamId: string): Promise<string[]> {
  const rows = await db.prepare("SELECT player_id FROM player_watchlist WHERE team_id = ?").bind(teamId).all<{ player_id: string }>();
  return rows.results.map((r) => r.player_id);
}

describe("propuštění sledovaného hráče", () => {
  let freeAgentId = "";

  it("sledující dostanou zprávu, že je volný", async () => {
    const res = await callRoute("/teams/seller/players/p-watched/release", { method: "POST", token: "seller-token" });
    expect(res.status).toBe(200);

    const release = pushes.find((p) => p.title.includes("je volný"));
    expect(release?.title).toBe("⭐ Karel Sledovaný je volný!");
    expect(release?.teams).toEqual(["scout-a", "scout-b"]);
  });

  it("sledování se převede na volného hráče a ve Sledovaných zůstane", async () => {
    const fa = await db.prepare("SELECT id FROM free_agents WHERE first_name = 'Karel' AND last_name = 'Sledovaný'")
      .first<{ id: string }>();
    expect(fa).not.toBeNull();
    freeAgentId = fa!.id;
    expect(await watchedIds("scout-a")).toEqual([freeAgentId]);
    expect(await watchedIds("scout-b")).toEqual([freeAgentId]);

    const res = await callRoute("/teams/scout-a/watchlist");
    const { players } = await res.json() as { players: Array<{ id: string; lastName: string; freeAgent?: boolean; teamId: string | null; watchedSince: string }> };
    expect(players).toHaveLength(1);
    expect(players[0]).toMatchObject({ id: freeAgentId, lastName: "Sledovaný", freeAgent: true, teamId: null });
    // Sleduje ho pořád od původního dne, ne od propuštění.
    expect(players[0].watchedSince).toBe("2026-10-01 10:00:00");
  });

  it("po podpisu sleduje dál hráče v novém klubu", async () => {
    const res = await callRoute(`/teams/scout-a/free-agents/${freeAgentId}/sign`, {
      method: "POST", token: "a-token", body: { offeredWage: 300 },
    });
    expect(res.status).toBe(200);
    const { playerId } = await res.json() as { playerId: string };

    expect(await watchedIds("scout-b")).toEqual([playerId]);
    const list = await callRoute("/teams/scout-b/watchlist");
    const { players } = await list.json() as { players: Array<{ id: string; teamId: string | null; freeAgent?: boolean }> };
    expect(players).toHaveLength(1);
    expect(players[0]).toMatchObject({ id: playerId, teamId: "scout-a" });
    expect(players[0].freeAgent ?? false).toBe(false);
  });
});
