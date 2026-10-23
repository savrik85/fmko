/**
 * Počasí na tréninku v SKUTEČNÉM denním ticku.
 *
 * `simulateTraining` počasí umí (`training-weather.test.ts`), jenže tick mu ho
 * nedával: dotaz na týmy nenačítal `game_date`, takže `resolveWeatherForDate`
 * dostal undefined, vrátil null a déšť ani sníh docházku nikdy nesrazily.
 *
 * Test proto pouští `executeDailyTick` nad skutečnou D1 (Miniflare) a dívá se,
 * s jakým počasím tick trénink zavolal. Počasí musí být to z herního dne ticku,
 * ne včerejší z `teams.game_date` (ten se posouvá až později v ticku).
 */
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { Miniflare } from "miniflare";
import type { Weather } from "../engine/types";

const trainingCalls = vi.hoisted(() => [] as unknown[][]);
vi.mock("./training", async (importOriginal) => {
  const original = await importOriginal<typeof import("./training")>();
  return {
    ...original,
    simulateTraining: (...args: Parameters<typeof original.simulateTraining>) => {
      trainingCalls.push(args);
      return original.simulateTraining(...args);
    },
  };
});

import { executeDailyTick } from "./daily-tick";
import { resolveWeatherForDate } from "./season-weather";

let miniflare: Miniflare;
let db: D1Database;

const SEASON_START = "2026-08-17T16:00:00.000Z";
const SEASON_END = "2027-01-28T16:00:00.000Z";

function kv(): KVNamespace {
  const store = new Map<string, string>();
  return {
    get: async (k: string) => store.get(k) ?? null,
    put: async (k: string, v: string) => { store.set(k, v); },
    delete: async (k: string) => { store.delete(k); },
    list: async () => ({ keys: [], list_complete: true, cacheStatus: null }),
  } as unknown as KVNamespace;
}

/** První den sezóny, kdy je jiné počasí než den předtím. Jinak by test nerozlišil dnešek od včerejška. */
async function dayWithChangedWeather(): Promise<{ today: Date; yesterday: Date; weather: Weather }> {
  for (let i = 1; i < 120; i++) {
    const today = new Date(Date.parse(SEASON_START) + i * 86_400_000);
    const yesterday = new Date(today.getTime() - 86_400_000);
    const w = await resolveWeatherForDate(db, today.toISOString());
    const wy = await resolveWeatherForDate(db, yesterday.toISOString());
    if (w && wy && w.weather !== wy.weather) return { today, yesterday, weather: w.weather };
  }
  throw new Error("v sezóně se nenašel den se změnou počasí");
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
      game_date TEXT, season_start TEXT, season_end TEXT, last_training_at TEXT, last_training_result TEXT)`,
    `CREATE TABLE players (id TEXT PRIMARY KEY, team_id TEXT, first_name TEXT, last_name TEXT, age INTEGER,
      position TEXT, overall_rating INTEGER, skills TEXT, skills_max TEXT, physical TEXT, personality TEXT,
      life_context TEXT, hidden_talent INTEGER DEFAULT 0, is_celebrity INTEGER DEFAULT 0, commute_km REAL DEFAULT 0,
      weekly_wage INTEGER DEFAULT 0, status TEXT DEFAULT 'active')`,
    "CREATE TABLE injuries (id TEXT PRIMARY KEY, player_id TEXT, team_id TEXT, days_remaining INTEGER)",
  ]) await db.prepare(sql).run();
});

afterAll(async () => {
  await miniflare.dispose();
});

describe("počasí na tréninku v denním ticku", () => {
  it("trénink dostane počasí herního dne ticku", async () => {
    // Sezóna je jen u týmu: z ní se počítá počasí každého dne.
    await db.prepare("INSERT INTO teams (id, name, user_id, season_start, season_end) VALUES ('seed', 'Hranice', 'ai', ?, ?)")
      .bind(SEASON_START, SEASON_END).run();
    const { today, yesterday, weather } = await dayWithChangedWeather();

    const skills = JSON.stringify({ speed: 40, technique: 40, shooting: 40, passing: 40, heading: 40, defense: 40, goalkeeping: 5 });
    const personality = JSON.stringify({ discipline: 60, patriotism: 50, alcohol: 20, temper: 30 });
    const lifeContext = JSON.stringify({ condition: 100, morale: 60, occupation: "zedník" });
    await db.batch([
      db.prepare("INSERT INTO game_clock (id, offset_days) VALUES (1, 0)"),
      // Trénink každý den, ať den v týdnu nerozhoduje. V teams.game_date sedí ještě včerejšek,
      // stejně jako na produkci v tomhle místě ticku.
      db.prepare(
        `INSERT INTO teams (id, name, user_id, league_id, training_type, training_sessions, training_days, game_date, season_start, season_end)
         VALUES ('t1', 'Sokol', 'user-1', 'l1', 'conditioning', 5, '[0,1,2,3,4,5,6]', ?, ?, ?)`,
      ).bind(yesterday.toISOString(), SEASON_START, SEASON_END),
      ...["p1", "p2", "p3"].map((id) => db.prepare(
        `INSERT INTO players (id, team_id, first_name, last_name, age, position, overall_rating, skills, physical, personality, life_context)
         VALUES (?, 't1', 'Jan', ?, 25, 'MID', 40, ?, '{}', ?, ?)`,
      ).bind(id, id, skills, personality, lifeContext)),
    ]);

    const env = { DB: db, CACHE_KV: kv(), SESSION_KV: kv() } as unknown as Parameters<typeof executeDailyTick>[0];
    // Zbytek ticku po tréninku tu nemá svoje tabulky a smí spadnout. Měří se jen trénink.
    const tickError = await executeDailyTick(env, today).then(() => null, (e: unknown) => e);
    if (tickError) {
      console.warn("denní tick po tréninku skončil chybou (chybí tabulky):", tickError instanceof Error ? tickError.message : tickError);
    }

    expect(trainingCalls.length, "tick tým vůbec netrénoval").toBe(1);
    expect(trainingCalls[0][7]).toBe(weather);
  });
});
