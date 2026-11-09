/**
 * Dvoufázová značka denního ticku a záznamy kroků na skutečné D1 (Miniflare).
 *
 * Pouští se SKUTEČNÝ `executeDailyTick` nad malým světem: jeden klub s tréninkem každý den
 * a přírodním trávníkem. Schéma má jen tabulky pro trénink, opotřebení trávníku a posun
 * herního data; ostatní kroky tu spadnou na chybějící tabulce, což je pro test výhoda:
 * tick musí i tak doběhnout k posunu data a nic neprovést dvakrát.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { Miniflare } from "miniflare";
import { executeDailyTick } from "./daily-tick";
import { decideTick, parseTickMark, tickMarkKey, TICK_RESUME_AFTER_MS, TickSteps } from "./daily-tick-steps";
import { staleGameDateProblem } from "../lib/watchdog";

let miniflare: Miniflare;
let db: D1Database;
let store: Map<string, string>;

const YESTERDAY = "2026-11-09T16:00:00.000Z";
const NOW = new Date("2026-11-10T03:00:00.000Z");
const DAY = "2026-11-10";
const TODAY_GAME_DATE = "2026-11-10T16:00:00.000Z";

function kv(): KVNamespace {
  return {
    get: async (k: string) => store.get(k) ?? null,
    put: async (k: string, v: string) => { store.set(k, v); },
    delete: async (k: string) => { store.delete(k); },
    list: async () => ({ keys: [], list_complete: true, cacheStatus: null }),
  } as unknown as KVNamespace;
}

function env() {
  return { DB: db, CACHE_KV: kv(), SESSION_KV: kv() } as unknown as Parameters<typeof executeDailyTick>[0];
}

/** Tick v ořezaném schématu může za posunem data spadnout (chybí tabulky per-team dne). */
async function tick(options?: Parameters<typeof executeDailyTick>[2]) {
  return executeDailyTick(env(), NOW, options).catch((e: unknown) => {
    console.warn("tick za posunem data spadl na chybějící tabulce:", e instanceof Error ? e.message : e);
    return null;
  });
}

async function state() {
  const team = await db.prepare("SELECT game_date, last_training_at FROM teams WHERE id = 't1'").first<{ game_date: string; last_training_at: string | null }>();
  const pitch = await db.prepare("SELECT pitch_condition FROM stadiums WHERE team_id = 't1'").first<{ pitch_condition: number }>();
  const steps = await db.prepare("SELECT step FROM daily_tick_steps WHERE day = ? ORDER BY step").bind(DAY).all<{ step: string }>();
  return { gameDate: team!.game_date, trainedAt: team!.last_training_at, pitch: pitch!.pitch_condition, steps: steps.results.map((r) => r.step) };
}

beforeAll(async () => {
  miniflare = new Miniflare({
    modules: true, script: "export default { fetch() { return new Response('ok'); } }", d1Databases: ["DB"],
  });
  db = await miniflare.getD1Database("DB");
  for (const sql of [
    "CREATE TABLE game_clock (id INTEGER PRIMARY KEY, offset_days INTEGER NOT NULL)",
    "CREATE TABLE villages (id TEXT PRIMARY KEY, size TEXT, district TEXT, population INTEGER)",
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
    "CREATE TABLE stadiums (team_id TEXT PRIMARY KEY, pitch_condition INTEGER, pitch_type TEXT)",
    "CREATE TABLE equipment (team_id TEXT PRIMARY KEY, mower INTEGER DEFAULT 0)",
  ]) await db.prepare(sql).run();
  await db.exec(readFileSync(new URL("../../migrations/0308_daily_tick_steps.sql", import.meta.url), "utf8").replace(/--[^\n]*/g, "").replace(/\n/g, " "));

  const skills = JSON.stringify({ speed: 40, technique: 40, shooting: 40, passing: 40, heading: 40, defense: 40, goalkeeping: 5 });
  const personality = JSON.stringify({ discipline: 60, patriotism: 50, alcohol: 20, temper: 30 });
  const lifeContext = JSON.stringify({ condition: 100, morale: 60, occupation: "zedník" });
  await db.batch([
    db.prepare("INSERT INTO game_clock (id, offset_days) VALUES (1, 0)"),
    db.prepare(
      `INSERT INTO teams (id, name, user_id, league_id, training_type, training_sessions, training_days, game_date)
       VALUES ('t1', 'Sokol', 'user-1', 'l1', 'conditioning', 5, '[0,1,2,3,4,5,6]', ?)`,
    ).bind(YESTERDAY),
    db.prepare("INSERT INTO stadiums (team_id, pitch_condition, pitch_type) VALUES ('t1', 80, 'natural')"),
    ...["p1", "p2", "p3"].map((id) => db.prepare(
      `INSERT INTO players (id, team_id, first_name, last_name, age, position, overall_rating, skills, physical, personality, life_context)
       VALUES (?, 't1', 'Jan', ?, 25, 'MID', 40, ?, '{}', ?, ?)`,
    ).bind(id, id, skills, personality, lifeContext)),
  ]);
});

afterAll(async () => { await miniflare.dispose(); });

beforeEach(async () => {
  store = new Map();
  await db.batch([
    db.prepare("DELETE FROM daily_tick_steps"),
    db.prepare("UPDATE teams SET game_date = ?, last_training_at = NULL, last_training_result = NULL").bind(YESTERDAY),
    db.prepare("UPDATE stadiums SET pitch_condition = 80"),
  ]);
});

describe("značka denního ticku", () => {
  it("rozhodnutí: čerstvý den, běžící běh, spadlý běh, hotový den, vynucení adminem", () => {
    const now = Date.parse("2026-11-10T03:30:00.000Z");
    const started = (minutesAgo: number) => ({ state: "started" as const, at: new Date(now - minutesAgo * 60_000).toISOString() });
    expect(decideTick(null, now, false)).toBe("fresh");
    expect(decideTick(started(5), now, false)).toBe("skip_running");
    expect(decideTick(started(TICK_RESUME_AFTER_MS / 60_000), now, false)).toBe("resume");
    expect(decideTick({ state: "done", at: "" }, now, false)).toBe("skip_done");
    // Vynucení obejde značku rozběhnutou i hotovou; co se provede, hlídají záznamy kroků.
    expect(decideTick(started(1), now, true)).toBe("resume");
    expect(decideTick({ state: "done", at: "" }, now, true)).toBe("resume");
  });

  it("starý formát značky i nečitelná značka znamenají hotový den", () => {
    expect(parseTickMark(null)).toBeNull();
    expect(parseTickMark("1")).toEqual({ state: "done", at: "" });
    expect(parseTickMark("{rozbité")).toEqual({ state: "done", at: "" });
    expect(parseTickMark(JSON.stringify({ state: "started", at: "2026-11-10T03:00:00.000Z" }))).toEqual({ state: "started", at: "2026-11-10T03:00:00.000Z" });
  });
});

describe("záznamy kroků", () => {
  it("once se provede nejvýš jednou, i když krok spadne; run se po chybě zopakuje", async () => {
    let onceRuns = 0;
    let runRuns = 0;
    const first = await TickSteps.load(db, DAY);
    await first.once("money", async () => { onceRuns++; throw new Error("pád uprostřed"); });
    await first.run("cleanup", async () => { runRuns++; throw new Error("pád uprostřed"); });
    expect(first.failed).toEqual(["money", "cleanup"]);

    const second = await TickSteps.load(db, DAY);
    await second.once("money", async () => { onceRuns++; });
    await second.run("cleanup", async () => { runRuns++; });
    expect(onceRuns).toBe(1);
    expect(runRuns).toBe(2);
    expect(second.skipped).toEqual(["money"]);
    expect(second.failed).toEqual([]);

    // Hotový krok run se při dalším pokračování už nespustí.
    const third = await TickSteps.load(db, DAY);
    await third.run("cleanup", async () => { runRuns++; });
    expect(runRuns).toBe(2);
  });

  it("dva souběžné běhy si krok nezaberou oba", async () => {
    const a = await TickSteps.load(db, DAY);
    const b = await TickSteps.load(db, DAY);
    expect(await a.claim("training:t1")).toBe(true);
    expect(await b.claim("training:t1")).toBe(false);
  });
});

describe("denní tick po pádu", () => {
  it("první běh posune herní datum, odtrénuje a ubere trávník jednou", async () => {
    await tick();
    const s = await state();
    expect(s.gameDate).toBe(TODAY_GAME_DATE);
    expect(s.trainedAt).not.toBeNull();
    expect(s.pitch).toBe(79);
    expect(s.steps).toEqual(expect.arrayContaining(["day-reset", "pitch-wear", "training:t1"]));
  });

  it("druhé spuštění hned po startu čeká (běh může ještě běžet) a nic nezmění", async () => {
    store.set(tickMarkKey(DAY), JSON.stringify({ state: "started", at: new Date().toISOString() }));
    const r = await tick();
    expect(r?.skipped).toBe("running");
    expect(await state()).toMatchObject({ gameDate: YESTERDAY, trainedAt: null, pitch: 80, steps: [] });
  });

  it("spadlý běh starší než 20 minut se dokončí: datum se posune, hotové kroky se neopakují", async () => {
    // Běh ve 3:00 odtrénoval a ubral trávník, pak spadl dřív, než posunul datum.
    store.set(tickMarkKey(DAY), JSON.stringify({ state: "started", at: new Date(Date.now() - TICK_RESUME_AFTER_MS - 1000).toISOString() }));
    await db.batch([
      db.prepare("INSERT INTO daily_tick_steps (day, step, done_at) VALUES (?, 'day-reset', 'x'), (?, 'training:t1', 'x'), (?, 'pitch-wear', 'x')").bind(DAY, DAY, DAY),
      db.prepare("UPDATE stadiums SET pitch_condition = 79"),
      db.prepare("UPDATE teams SET last_training_at = '2026-11-10T03:00:05.000Z'"),
    ]);

    await tick();
    const s = await state();
    expect(s.gameDate).toBe(TODAY_GAME_DATE);
    expect(s.trainedAt).toBe("2026-11-10T03:00:05.000Z");
    expect(s.pitch).toBe(79);
  });

  it("hotový den se přeskočí, vynucení adminem provede jen kroky bez záznamu", async () => {
    await tick();
    const after = await state();
    store.set(tickMarkKey(DAY), JSON.stringify({ state: "done", at: new Date().toISOString() }));

    expect((await tick())?.skipped).toBe("done");
    expect(await state()).toEqual(after);

    await tick({ force: true });
    const forced = await state();
    expect(forced.pitch).toBe(after.pitch);
    expect(forced.trainedAt).toBe(after.trainedAt);
    expect(forced.gameDate).toBe(TODAY_GAME_DATE);
  });

  it("bez tabulky kroků se ve spadlém běhu nepokračuje, jinak by se všechno provedlo znovu", async () => {
    store.set(tickMarkKey(DAY), JSON.stringify({ state: "started", at: new Date(Date.now() - TICK_RESUME_AFTER_MS - 1000).toISOString() }));
    await db.prepare("ALTER TABLE daily_tick_steps RENAME TO daily_tick_steps_hidden").run();
    try {
      const r = await tick();
      expect(r?.skipped).toBe("resume_unavailable");
      const team = await db.prepare("SELECT game_date, last_training_at FROM teams WHERE id = 't1'").first();
      expect(team).toEqual({ game_date: YESTERDAY, last_training_at: null });
    } finally {
      await db.prepare("ALTER TABLE daily_tick_steps_hidden RENAME TO daily_tick_steps").run();
    }
  });
});

describe("hlídač: herní datum", () => {
  it("včerejší herní datum hlásí, dnešní ne", async () => {
    const problem = await staleGameDateProblem(db, new Date("2026-11-10T06:00:00.000Z"));
    expect(problem).toMatchObject({ kod: "herni_datum", hodnota: "2026-11-09 místo 2026-11-10" });
    await db.prepare("UPDATE teams SET game_date = ?").bind(TODAY_GAME_DATE).run();
    expect(await staleGameDateProblem(db, new Date("2026-11-10T06:00:00.000Z"))).toBeNull();
  });

  it("počítá s posunem herních hodin", async () => {
    await db.prepare("UPDATE game_clock SET offset_days = 3").run();
    try {
      await db.prepare("UPDATE teams SET game_date = '2026-11-12T16:00:00.000Z'").run();
      expect(await staleGameDateProblem(db, new Date("2026-11-10T06:00:00.000Z"))).toMatchObject({ hodnota: "2026-11-12 místo 2026-11-13" });
      await db.prepare("UPDATE teams SET game_date = '2026-11-13T16:00:00.000Z'").run();
      expect(await staleGameDateProblem(db, new Date("2026-11-10T06:00:00.000Z"))).toBeNull();
    } finally {
      await db.prepare("UPDATE game_clock SET offset_days = 0").run();
    }
  });
});
