import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Miniflare } from "miniflare";
import type { Bindings } from "../index";
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
    CREATE TABLE villages (id TEXT PRIMARY KEY, name TEXT NOT NULL, district TEXT NOT NULL, lat REAL NOT NULL, lng REAL NOT NULL);
    CREATE TABLE leagues (id TEXT PRIMARY KEY, name TEXT NOT NULL, district TEXT NOT NULL);
    CREATE TABLE teams (
      id TEXT PRIMARY KEY, user_id TEXT NOT NULL, name TEXT NOT NULL, league_id TEXT, village_id TEXT,
      parent_team_id TEXT, team_type TEXT NOT NULL DEFAULT 'senior', budget INTEGER NOT NULL DEFAULT 0, reputation INTEGER NOT NULL DEFAULT 50
    );
    CREATE TABLE players (
      id TEXT PRIMARY KEY, team_id TEXT NOT NULL, first_name TEXT NOT NULL, last_name TEXT NOT NULL, age INTEGER NOT NULL,
      position TEXT NOT NULL, overall_rating INTEGER NOT NULL, skills TEXT NOT NULL DEFAULT '{}', avatar TEXT NOT NULL DEFAULT '{}',
      nationality TEXT NOT NULL DEFAULT 'CZ'
    );
    CREATE TABLE injuries (id TEXT PRIMARY KEY, player_id TEXT NOT NULL, days_remaining INTEGER NOT NULL);
    CREATE TABLE free_agents (
      id TEXT PRIMARY KEY, district TEXT NOT NULL, first_name TEXT NOT NULL, last_name TEXT NOT NULL, nickname TEXT,
      age INTEGER NOT NULL, position TEXT NOT NULL, overall_rating INTEGER NOT NULL DEFAULT 50,
      skills TEXT NOT NULL DEFAULT '{}', physical TEXT NOT NULL DEFAULT '{}', personality TEXT NOT NULL DEFAULT '{}',
      life_context TEXT NOT NULL DEFAULT '{}', avatar TEXT NOT NULL DEFAULT '{}', weekly_wage INTEGER NOT NULL DEFAULT 0,
      source TEXT NOT NULL DEFAULT 'generated', released_from_team_id TEXT, village_id TEXT,
      rejected_by TEXT NOT NULL DEFAULT '[]', expires_at TEXT NOT NULL, is_celebrity INTEGER DEFAULT 0,
      nationality TEXT NOT NULL DEFAULT 'CZ'
    );
    CREATE TABLE transfer_listings (
      id TEXT PRIMARY KEY, player_id TEXT NOT NULL, team_id TEXT NOT NULL, asking_price INTEGER NOT NULL,
      league_id TEXT NOT NULL, status TEXT NOT NULL, expires_at TEXT NOT NULL, is_ai_listing INTEGER NOT NULL DEFAULT 0,
      ai_player_data TEXT, rejected_by TEXT NOT NULL DEFAULT '[]', created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE transfer_bids (id TEXT PRIMARY KEY, listing_id TEXT NOT NULL, team_id TEXT NOT NULL, amount INTEGER NOT NULL, status TEXT NOT NULL);
    CREATE TABLE transfer_offers (
      id TEXT PRIMARY KEY, player_id TEXT NOT NULL, from_team_id TEXT NOT NULL, offer_amount INTEGER NOT NULL,
      counter_amount INTEGER, status TEXT NOT NULL
    );
    CREATE TABLE ai_negotiations (id TEXT PRIMARY KEY, team_id TEXT NOT NULL, listing_id TEXT, status TEXT NOT NULL);

    INSERT INTO villages VALUES ('v-praha', 'Břevnov', 'Praha', 50.08, 14.36), ('v-pt', 'Vimperk', 'Prachatice', 49.05, 13.78);
    INSERT INTO leagues VALUES ('l-praha', 'Přebor Prahy', 'Praha'), ('l-pt', 'Okresní přebor Prachatice', 'Prachatice'),
      ('l-pt-lower', 'III. třída Prachatice', 'Prachatice');
    INSERT INTO teams (id, user_id, name, league_id, village_id) VALUES
      ('praha-human', 'user-praha', 'FK Břevnov', 'l-praha', 'v-praha'),
      ('pt-human', 'user-pt', 'SK Vimperk', 'l-pt', 'v-pt'),
      ('pt-ai', 'ai', 'Sokol Lhota', 'l-pt', 'v-pt'),
      ('pt-same-owner', 'user-praha', 'TJ Druhý klub', 'l-pt', 'v-pt'),
      ('pt-lower', 'user-lower', 'Sokol Dolní', 'l-pt-lower', 'v-pt');
    INSERT INTO players (id, team_id, first_name, last_name, age, position, overall_rating) VALUES
      ('p-human', 'pt-human', 'Karel', 'Lidský', 24, 'MID', 55);
    INSERT INTO transfer_listings (id, player_id, team_id, asking_price, league_id, status, expires_at, is_ai_listing, ai_player_data) VALUES
      ('listing-human', 'p-human', 'pt-human', 5000, 'l-pt', 'active', '${FUTURE}', 0, NULL),
      ('listing-ai', 'virtual_ai', 'virtual_ai', 800, 'l-pt', 'active', '${FUTURE}', 1, '{"firstName":"Virtuální","lastName":"Hráč","age":30,"position":"DEF","overallRating":40}');
    INSERT INTO free_agents (id, district, first_name, last_name, age, position, source, released_from_team_id, village_id, expires_at) VALUES
      ('fa-home', 'Praha', 'Domácí', 'Generovaný', 22, 'FWD', 'generated', NULL, 'v-praha', '${FUTURE}'),
      ('fa-generated', 'Prachatice', 'Cizí', 'Generovaný', 22, 'FWD', 'generated', NULL, 'v-pt', '${FUTURE}'),
      ('fa-released-human', 'Prachatice', 'Propuštěný', 'Člověkem', 27, 'DEF', 'released', 'pt-human', 'v-pt', '${FUTURE}'),
      ('fa-released-ai', 'Prachatice', 'Propuštěný', 'Automatem', 27, 'DEF', 'released', 'pt-ai', 'v-pt', '${FUTURE}'),
      ('fa-same-owner', 'Prachatice', 'Vlastní', 'Klub', 27, 'GK', 'released', 'pt-same-owner', 'v-pt', '${FUTURE}')
  `);

  await sessionKv.put("session:praha-token", JSON.stringify({
    userId: "user-praha", email: "praha@test.local", teamId: "praha-human", createdAt: FUTURE,
  }));

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

describe("trh napříč ligami", () => {
  it("volní hráči: z cizího okresu jen propuštění lidským klubem jiného majitele", async () => {
    const res = await callRoute("/teams/praha-human/free-agents");
    expect(res.status).toBe(200);
    const { freeAgents } = await res.json() as { freeAgents: Array<{ id: string; origin: string | null }> };
    expect(freeAgents.map((fa) => fa.id).sort()).toEqual(["fa-home", "fa-released-human"]);
    expect(freeAgents.find((fa) => fa.id === "fa-home")?.origin).toBeNull();
    expect(freeAgents.find((fa) => fa.id === "fa-released-human")?.origin).toBe("Prachatice");
  });

  it("na prodej: z cizí ligy jen inzeráty lidských klubů, se štítkem okresu", async () => {
    const res = await callRoute("/teams/praha-human/market");
    expect(res.status).toBe(200);
    const { listings } = await res.json() as { listings: Array<{ id: string; origin: string | null }> };
    expect(listings.map((l) => l.id)).toEqual(["listing-human"]);
    expect(listings[0].origin).toBe("Prachatice");
  });

  it("jiná soutěž v tomtéž okrese má štítek se soutěží", async () => {
    const res = await callRoute("/teams/pt-lower/market");
    const { listings } = await res.json() as { listings: Array<{ id: string; origin: string | null }> };
    expect(listings.find((l) => l.id === "listing-human")?.origin).toBe("Okresní přebor Prachatice");
  });

  it("vlastní liga dál vidí i inzeráty cizích klubů", async () => {
    const res = await callRoute("/teams/pt-human/market");
    const { listings } = await res.json() as { listings: Array<{ id: string; origin: string | null }> };
    expect(listings.map((l) => l.id)).toEqual(["listing-ai"]);
    expect(listings[0].origin ?? null).toBeNull();
  });

  it("hráče propuštěného z jiného vlastního klubu v jiném okrese podepsat nejde", async () => {
    const res = await callRoute("/teams/praha-human/free-agents/fa-same-owner/sign", {
      method: "POST", token: "praha-token", body: { offeredWage: 100 },
    });
    expect(res.status).toBe(400);
    expect((await res.json() as { error: string }).error).toContain("jiného tvého klubu");
  });
});
