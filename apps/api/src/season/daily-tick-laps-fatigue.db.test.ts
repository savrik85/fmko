/**
 * Trestná kolečka v SKUTEČNÉM denním ticku (Miniflare): kondice za kolečka se musí odečíst
 * až po všech přírůstcích kondice v ticku, tedy i po bonusu ze sprch a posilovny.
 *
 * E2E 22. 11. (Koh-i-noor): Vojtěch Fiala 85 → 100 (regenerace) → 95 (kolečka) → 100 (sprchy),
 * 10 z 11 odběhaných hráčů skončilo na stovce a trest neměl na kondici žádný dopad.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { Miniflare } from "miniflare";
import { executeDailyTick } from "./daily-tick";
import { LAPS_CONDITION } from "../messaging/coach-rules";

let miniflare: Miniflare;
let db: D1Database;

const NOW = new Date("2026-11-22T03:00:00.000Z");
const DAY = "2026-11-22";

function kv(): KVNamespace {
  const store = new Map<string, string>();
  return {
    get: async (k: string) => store.get(k) ?? null,
    put: async (k: string, v: string) => { store.set(k, v); },
    delete: async (k: string) => { store.delete(k); },
    list: async () => ({ keys: [], list_complete: true, cacheStatus: null }),
  } as unknown as KVNamespace;
}

const migration = (name: string) =>
  readFileSync(new URL(`../../migrations/${name}`, import.meta.url), "utf8").replace(/--[^\n]*/g, "").replace(/\n/g, " ");

beforeAll(async () => {
  miniflare = new Miniflare({
    modules: true, script: "export default { fetch() { return new Response('ok'); } }", d1Databases: ["DB"],
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
      weekly_wage INTEGER DEFAULT 0, status TEXT DEFAULT 'active', nickname TEXT, avatar TEXT)`,
    "CREATE TABLE injuries (id TEXT PRIMARY KEY, player_id TEXT, team_id TEXT, days_remaining INTEGER, days_total INTEGER, is_fake INTEGER, osobni_volno INTEGER, description TEXT)",
    `CREATE TABLE stadiums (team_id TEXT PRIMARY KEY, pitch_condition INTEGER, pitch_type TEXT,
      changing_rooms INTEGER DEFAULT 0, showers INTEGER DEFAULT 0, refreshments INTEGER DEFAULT 0,
      stands INTEGER DEFAULT 0, parking INTEGER DEFAULT 0, fence INTEGER DEFAULT 0)`,
    "CREATE TABLE equipment (team_id TEXT PRIMARY KEY, mower INTEGER DEFAULT 0, gym_corner INTEGER DEFAULT 0, gym_corner_condition INTEGER DEFAULT 100)",
  ]) await db.prepare(sql).run();
  await db.exec(migration("0082_condition_log.sql"));
  await db.exec(migration("0316_coach_commitments.sql"));
  await db.exec(migration("0308_daily_tick_steps.sql"));

  // Stamina 80 → regenerace +20, věk 25 → +0. Sprchy úrovně 3 (+9), posilovna 3 na 100 % (+3).
  const skills = JSON.stringify({ speed: 40, technique: 40, shooting: 40, passing: 40, heading: 40, defense: 40, goalkeeping: 5 });
  const physical = JSON.stringify({ stamina: 80 });
  const personality = JSON.stringify({ discipline: 60, patriotism: 50, alcohol: 20, temper: 30 });
  await db.batch([
    db.prepare("INSERT INTO game_clock (id, offset_days) VALUES (1, 0)"),
    // Bez tréninku dnes: kolečka už jsou odběhaná (záznam „fatigue: pending“), měří se jen pořadí kroků.
    db.prepare(
      `INSERT INTO teams (id, name, user_id, league_id, training_type, training_sessions, training_days, game_date)
       VALUES ('t1', 'Koh-i-noor', 'user-1', 'l1', 'conditioning', 0, '[]', '2026-11-21T16:00:00.000Z')`,
    ),
    db.prepare("INSERT INTO stadiums (team_id, pitch_condition, pitch_type, showers) VALUES ('t1', 80, 'natural', 3)"),
    db.prepare("INSERT INTO equipment (team_id, gym_corner, gym_corner_condition) VALUES ('t1', 3, 100)"),
    ...[["fiala", 85], ["janecek", 85]].map(([id, cond]) => db.prepare(
      `INSERT INTO players (id, team_id, first_name, last_name, age, position, overall_rating, skills, physical, personality, life_context)
       VALUES (?, 't1', 'Vojtěch', ?, 25, 'MID', 40, ?, ?, ?, ?)`,
    ).bind(id, id, skills, physical, personality, JSON.stringify({ condition: cond, morale: 60, occupation: "zedník" }))),
    db.prepare(
      `INSERT INTO coach_commitments (id, team_id, player_id, conversation_id, kind, status, made_at, due_at, details)
       VALUES ('laps', 't1', 'fiala', 'kab', 'laps_penalty', 'active', '2026-11-21T19:00:00Z', '2026-11-28T19:00:00Z', ?)`,
    ).bind(JSON.stringify({ target: "team", squad: true, done: [{ playerId: "fiala", outcome: "ran", day: DAY, fatigue: "pending" }] })),
  ]);
});

afterAll(async () => { await miniflare.dispose(); });

describe("trestná kolečka v denním ticku", () => {
  it("kondice za kolečka zůstane i po bonusu ze sprch a posilovny (Fiala 85 → 95, ne zpět na 100)", async () => {
    const env = { DB: db, CACHE_KV: kv(), SESSION_KV: kv() } as unknown as Parameters<typeof executeDailyTick>[0];
    // Kroky ticku, které tu nemají tabulky, spadnou a tick pokračuje (TickSteps).
    await executeDailyTick(env, NOW).catch((e: unknown) => {
      console.warn("tick za kondicí spadl na chybějící tabulce:", e instanceof Error ? e.message : e);
    });

    const cond = async (id: string) => JSON.parse((await db.prepare("SELECT life_context FROM players WHERE id = ?")
      .bind(id).first<{ life_context: string }>())!.life_context).condition as number;
    // Kontrola, že sprchy i posilovna v ticku opravdu běžely: hráč bez trestu je na stropu.
    expect(await cond("janecek")).toBe(100);
    expect(await cond("fiala")).toBe(100 - LAPS_CONDITION);

    const log = await db.prepare("SELECT source, description, new_value FROM condition_log WHERE player_id = 'fiala' ORDER BY id")
      .all<{ source: string; description: string; new_value: number }>();
    expect(log.results.map((r) => r.description)).toEqual(["Denní regenerace", "Trestná kolečka"]);
    expect(log.results.at(-1)?.new_value).toBe(95);
    const details = JSON.parse((await db.prepare("SELECT details FROM coach_commitments WHERE id = 'laps'").first<{ details: string }>())!.details);
    expect(details.done[0].fatigue).toBe("applied");
  }, 60_000);
});
