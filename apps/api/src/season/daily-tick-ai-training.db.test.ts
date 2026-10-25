/**
 * AI kluby trénují v denním ticku podle stejných pravidel jako lidské.
 *
 * Dřív tick načítal jen `user_id != 'ai'`, takže AI kluby za celou sezónu nenatrénovaly nic.
 * AI klub bez vlastního nastavení trénuje výchozí plán (kondice dvakrát týdně, úterý a čtvrtek),
 * lidský klub bez nastaveného tréninku netrénuje dál, jako dosud.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Miniflare } from "miniflare";
import { executeDailyTick } from "./daily-tick";
import { teamTrainingType } from "./training";

let miniflare: Miniflare;
let db: D1Database;

/** Úterý: výchozí plán (2 tréninky týdně) trénuje v úterý a ve čtvrtek. */
const TUESDAY = new Date("2026-10-27T03:00:00.000Z");

function kv(): KVNamespace {
  const store = new Map<string, string>();
  return {
    get: async (k: string) => store.get(k) ?? null,
    put: async (k: string, v: string) => { store.set(k, v); },
    delete: async (k: string) => { store.delete(k); },
    list: async () => ({ keys: [], list_complete: true, cacheStatus: null }),
  } as unknown as KVNamespace;
}

beforeAll(async () => {
  miniflare = new Miniflare({
    modules: true,
    script: "export default { fetch() { return new Response('ok'); } }",
    d1Databases: ["DB"],
  });
  db = await miniflare.getD1Database("DB");
  for (const sql of [
    "CREATE TABLE game_clock (id INTEGER PRIMARY KEY, offset_days INTEGER NOT NULL)",
    `CREATE TABLE teams (id TEXT PRIMARY KEY, name TEXT, user_id TEXT, league_id TEXT, parent_team_id TEXT,
      team_type TEXT DEFAULT 'senior', village_id TEXT, budget INTEGER DEFAULT 0,
      training_type TEXT, training_approach TEXT, training_sessions INTEGER, training_days TEXT, training_plan TEXT,
      game_date TEXT, season_start TEXT, season_end TEXT, last_training_at TEXT, last_training_result TEXT,
      training_attendance TEXT)`,
    `CREATE TABLE players (id TEXT PRIMARY KEY, team_id TEXT, first_name TEXT, last_name TEXT, age INTEGER,
      position TEXT, overall_rating INTEGER, skills TEXT, skills_max TEXT, physical TEXT, personality TEXT,
      life_context TEXT, hidden_talent INTEGER DEFAULT 0, is_celebrity INTEGER DEFAULT 0, commute_km REAL DEFAULT 0,
      weekly_wage INTEGER DEFAULT 0, status TEXT DEFAULT 'active')`,
    "CREATE TABLE injuries (id TEXT PRIMARY KEY, player_id TEXT, team_id TEXT, days_remaining INTEGER)",
  ]) await db.prepare(sql).run();

  const skills = JSON.stringify({ speed: 40, technique: 40, shooting: 40, passing: 40, heading: 40, defense: 40, goalkeeping: 5 });
  const personality = JSON.stringify({ discipline: 60, patriotism: 50, alcohol: 20, temper: 30 });
  const lifeContext = JSON.stringify({ condition: 100, morale: 60, occupation: "zedník" });
  const player = (id: string, team: string) => db.prepare(
    `INSERT INTO players (id, team_id, first_name, last_name, age, position, overall_rating, skills, physical, personality, life_context)
     VALUES (?, ?, 'Jan', ?, 25, 'MID', 40, ?, '{}', ?, ?)`,
  ).bind(id, team, id, skills, personality, lifeContext);
  await db.batch([
    db.prepare("INSERT INTO game_clock (id, offset_days) VALUES (1, 0)"),
    // AI klub bez nastavení tréninku (typ NULL): trénuje výchozí plán.
    db.prepare("INSERT INTO teams (id, name, user_id, league_id, game_date) VALUES ('ai-club', 'Sokol AI', 'ai', 'l1', '2026-10-26T16:00:00.000Z')"),
    // Jeho U21 dědí plán áčka.
    db.prepare("INSERT INTO teams (id, name, user_id, league_id, parent_team_id, team_type, game_date) VALUES ('ai-u21', 'Sokol AI U21', 'ai', 'l2', 'ai-club', 'u21', '2026-10-26T16:00:00.000Z')"),
    // Lidský klub, který si trénink nikdy nenastavil (typ NULL): netrénuje, jako dosud.
    db.prepare("INSERT INTO teams (id, name, user_id, league_id, game_date) VALUES ('human-idle', 'Jiskra', 'user-1', 'l1', '2026-10-26T16:00:00.000Z')"),
    ...["a1", "a2", "a3"].map((id) => player(id, "ai-club")),
    ...["y1", "y2"].map((id) => player(id, "ai-u21")),
    ...["h1", "h2"].map((id) => player(id, "human-idle")),
  ]);
});

afterAll(async () => {
  await miniflare.dispose();
});

describe("trénink AI klubů v denním ticku", () => {
  it("výchozí typ tréninku má jen AI klub bez vlastního nastavení", () => {
    expect(teamTrainingType(null, "ai")).toBe("conditioning");
    expect(teamTrainingType("tactics", "ai")).toBe("tactics");
    expect(teamTrainingType(null, "user-1")).toBeNull();
    expect(teamTrainingType("technique", "user-1")).toBe("technique");
  });

  it("AI klub i jeho U21 v úterý odtrénují výchozí plán, lidský klub bez plánu ne", async () => {
    const env = { DB: db, CACHE_KV: kv(), SESSION_KV: kv() } as unknown as Parameters<typeof executeDailyTick>[0];
    // Zbytek ticku po tréninku tu nemá svoje tabulky a smí spadnout. Měří se jen trénink.
    const tickError = await executeDailyTick(env, TUESDAY).then(() => null, (e: unknown) => e);
    if (tickError) {
      console.warn("denní tick po tréninku skončil chybou (chybí tabulky):", tickError instanceof Error ? tickError.message : tickError);
    }

    const rows = await db.prepare("SELECT id, last_training_at, last_training_result FROM teams ORDER BY id")
      .all<{ id: string; last_training_at: string | null; last_training_result: string | null }>();
    const byId = new Map(rows.results.map((r) => [r.id, r]));

    const ai = byId.get("ai-club")!;
    expect(ai.last_training_at, "AI klub netrénoval").not.toBeNull();
    expect(JSON.parse(ai.last_training_result!).totalCount).toBe(3);

    const u21 = byId.get("ai-u21")!;
    expect(u21.last_training_at, "U21 AI klubu netrénovala").not.toBeNull();
    expect(JSON.parse(u21.last_training_result!).totalCount).toBe(2);

    expect(byId.get("human-idle")!.last_training_at).toBeNull();
  });
});
