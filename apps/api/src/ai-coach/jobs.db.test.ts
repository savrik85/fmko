/**
 * AI trenér nad skutečnou D1 (Miniflare): sestava přes stejnou službu jako člověk,
 * duplicitní zpráva z fronty, režim shadow a výpadek modelu.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { Miniflare } from "miniflare";
import type { Bindings } from "../index";
import type { AiCoachQueueMessage } from "../queue/messages";
import { enqueueAiCoachJobs, handleAiCoachMessage, isGameMonday } from "./jobs";
import { COACH_MODE_KEY } from "./mode";

let miniflare: Miniflare;
let db: D1Database;
let kv: KVNamespace;

const TEAM = "ai-team";
const DAY = "2026-11-02";

function player(i: number, position: string, rating: number, teamId = TEAM): unknown[] {
  const skills = {
    speed: rating, technique: rating, shooting: rating, passing: rating, heading: rating, defense: rating,
    goalkeeping: position === "GK" ? rating + 10 : 10, vision: rating, creativity: rating, setPieces: rating, experience: 40,
  };
  return [
    `p${i}`, teamId, `Jan${i}`, `Hráč${i}`, "", 18 + (i % 16), position, rating,
    JSON.stringify(skills), JSON.stringify({ stamina: rating, strength: rating }),
    JSON.stringify({ discipline: 50, leadership: 30 + i, aggression: 50, workRate: 50 }),
    JSON.stringify({ condition: 100, morale: 50 }), "{}", 500, "active", 0,
  ];
}

const POSITIONS = ["GK", "GK", "DEF", "DEF", "DEF", "DEF", "DEF", "DEF", "MID", "MID", "MID", "MID", "MID", "MID", "FWD", "FWD", "FWD", "FWD"];

beforeAll(async () => {
  miniflare = new Miniflare({
    modules: true,
    script: "export default { fetch() { return new Response('ok'); } }",
    d1Databases: ["DB"],
    kvNamespaces: ["CACHE_KV"],
  });
  db = await miniflare.getD1Database("DB");
  kv = (await miniflare.getKVNamespace("CACHE_KV")) as unknown as KVNamespace;
  const schema = [
    "CREATE TABLE seasons (id TEXT PRIMARY KEY, number INTEGER, status TEXT)",
    "CREATE TABLE villages (id TEXT PRIMARY KEY, name TEXT, size TEXT, district TEXT, population INTEGER)",
    "CREATE TABLE leagues (id TEXT PRIMARY KEY, name TEXT, district TEXT, league_type TEXT, level TEXT, match_weekdays TEXT)",
    `CREATE TABLE teams (id TEXT PRIMARY KEY, name TEXT, user_id TEXT, parent_team_id TEXT, league_id TEXT, team_type TEXT,
      village_id TEXT, game_date TEXT, budget INTEGER, reputation INTEGER, penalty_taker_id TEXT, freekick_taker_id TEXT,
      captain_id TEXT, formation_familiarity TEXT, training_type TEXT, training_approach TEXT, training_sessions INTEGER,
      training_days TEXT, training_plan TEXT, youth_investment TEXT, stadium_name TEXT)`,
    `CREATE TABLE managers (id TEXT PRIMARY KEY, user_id TEXT, team_id TEXT UNIQUE, name TEXT, backstory TEXT, avatar TEXT, age INTEGER,
      coaching INTEGER, motivation INTEGER, tactics INTEGER, youth_development INTEGER, discipline INTEGER, reputation INTEGER,
      bio TEXT, birthplace TEXT, licence_level INTEGER, ai_profile TEXT, created_at TEXT DEFAULT (datetime('now')))`,
    `CREATE TABLE players (id TEXT PRIMARY KEY, team_id TEXT, first_name TEXT, last_name TEXT, nickname TEXT, age INTEGER, position TEXT,
      overall_rating INTEGER, skills TEXT, physical TEXT, personality TEXT, life_context TEXT, avatar TEXT, weekly_wage INTEGER,
      status TEXT, suspended_matches INTEGER DEFAULT 0, loan_from_team_id TEXT, next_match_return INTEGER DEFAULT 0, squad_number INTEGER,
      parent_club_id TEXT)`,
    "CREATE TABLE injuries (id TEXT PRIMARY KEY, player_id TEXT, team_id TEXT, type TEXT, description TEXT, days_remaining INTEGER, osobni_volno INTEGER DEFAULT 0)",
    "CREATE TABLE player_stats (id TEXT PRIMARY KEY, player_id TEXT, team_id TEXT, season_id TEXT, appearances INTEGER, yellow_cards INTEGER, avg_rating REAL)",
    "CREATE TABLE match_player_stats (id TEXT PRIMARY KEY, match_id TEXT, player_id TEXT, team_id TEXT, rating REAL, minutes_played INTEGER, created_at TEXT)",
    "CREATE TABLE season_calendar (id TEXT PRIMARY KEY, league_id TEXT, season_number INTEGER, scheduled_at TEXT, status TEXT, game_week INTEGER)",
    `CREATE TABLE matches (id TEXT PRIMARY KEY, calendar_id TEXT, league_id TEXT, home_team_id TEXT, away_team_id TEXT, status TEXT,
      home_score INTEGER, away_score INTEGER, simulated_at TEXT, created_at TEXT, referee_id TEXT)`,
    `CREATE TABLE lineups (id TEXT PRIMARY KEY, team_id TEXT NOT NULL, calendar_id TEXT NOT NULL, formation TEXT NOT NULL DEFAULT '4-4-2',
      tactic TEXT NOT NULL DEFAULT 'balanced', players_data TEXT NOT NULL DEFAULT '[]', submitted_at TEXT, is_auto INTEGER NOT NULL DEFAULT 0,
      captain_id TEXT, preset_slot TEXT, hardness TEXT NOT NULL DEFAULT 'normal', match_plan TEXT NOT NULL DEFAULT '[]', bench_data TEXT)`,
    "CREATE TABLE tournament_matches (id TEXT PRIMARY KEY, tournament_id TEXT, home_team_id TEXT, away_team_id TEXT, scheduled_at TEXT)",
    "CREATE TABLE stadiums (id TEXT PRIMARY KEY, team_id TEXT, pitch_condition INTEGER, pitch_type TEXT, pitch_care_mode TEXT)",
  ];
  for (const sql of schema) await db.prepare(sql).run();
  // Deník a nároky přesně z migrace 0276.
  const migration = readFileSync(resolve(__dirname, "../../migrations/0276_ai_clubs.sql"), "utf8");
  for (const stmt of migration.split(";").map((x) => x.trim()).filter((x) => /^CREATE/i.test(x.replace(/^--.*$/gm, "").trim()))) {
    await db.prepare(stmt.replace(/^--.*$/gm, "").trim()).run();
  }
  await db.batch([
    db.prepare("INSERT INTO seasons VALUES ('s3', 3, 'active')"),
    db.prepare("INSERT INTO villages VALUES ('v1', 'Lhota', 'village', 'Praha', 600), ('v2', 'Ves', 'village', 'Praha', 500)"),
    db.prepare("INSERT INTO leagues VALUES ('lg1', 'Přebor', 'Praha', 'senior', 'okresni_prebor', NULL)"),
    db.prepare(`INSERT INTO teams (id, name, user_id, league_id, team_type, village_id, game_date, budget, reputation) VALUES
      ('ai-team', 'Sokol Lhota', 'ai', 'lg1', 'senior', 'v1', '${DAY}T16:00:00.000Z', 120000, 50),
      ('human-team', 'Slavoj Ves', 'user-1', 'lg1', 'senior', 'v2', '${DAY}T16:00:00.000Z', 90000, 50)`),
    db.prepare(`INSERT INTO season_calendar VALUES ('cal-1', 'lg1', 3, '${DAY}T17:00:00.000Z', 'scheduled', 5)`),
    db.prepare("INSERT INTO matches (id, calendar_id, league_id, home_team_id, away_team_id, status) VALUES ('m-1', 'cal-1', 'lg1', 'ai-team', 'human-team', 'scheduled')"),
  ]);
  const insert = db.prepare(
    `INSERT INTO players (id, team_id, first_name, last_name, nickname, age, position, overall_rating, skills, physical, personality,
      life_context, avatar, weekly_wage, status, suspended_matches) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  );
  await db.batch(POSITIONS.map((pos, i) => insert.bind(...player(i + 1, pos, 60 - i))));
  await db.batch(POSITIONS.map((pos, i) => insert.bind(...player(100 + i, pos, 50, "human-team"))));
  // Zraněný hráč nesmí do sestavy.
  await db.prepare("INSERT INTO injuries VALUES ('i1', 'p3', 'ai-team', 'muscle', 'natažený sval', 5, 0)").run();
});

afterAll(async () => {
  await miniflare.dispose();
});

beforeEach(async () => {
  await db.batch([
    db.prepare("DELETE FROM lineups"),
    db.prepare("DELETE FROM ai_coach_decisions"),
    db.prepare("DELETE FROM ai_coach_claims"),
  ]);
  await kv.delete(COACH_MODE_KEY);
});

function env(ai?: unknown): Bindings {
  return { DB: db, CACHE_KV: kv, AI: ai } as unknown as Bindings;
}

const matchMsg: AiCoachQueueMessage = { kind: "ai_coach", teamId: TEAM, task: "match", day: DAY, enqueuedAt: `${DAY}T12:45:00.000Z` };

function aiReturning(decision: unknown) {
  return { run: async () => ({ choices: [{ message: { content: JSON.stringify(decision) } }], usage: { prompt_tokens: 100, completion_tokens: 20 } }) };
}

async function savedLineup() {
  return db.prepare("SELECT formation, tactic, hardness, players_data, bench_data, is_auto, captain_id FROM lineups WHERE team_id = ? AND calendar_id = 'cal-1'")
    .bind(TEAM).first<{ formation: string; tactic: string; hardness: string; players_data: string; bench_data: string | null; is_auto: number; captain_id: string | null }>();
}

describe("AI trenér: sestava na dnešní zápas", () => {
  it("platné rozhodnutí modelu uloží sestavu stejnou službou jako člověk", async () => {
    const res = await handleAiCoachMessage(env(aiReturning({
      formation: "4-3-3", tactic: "pressing", hardness: "fair", captain: "P1", rest: [], mustStart: [],
      penaltyTaker: "P15", freekickTaker: "P15", plan: [], reasoning: "press",
    })), matchMsg);
    expect(res.status).toBe("done");
    const l = await savedLineup();
    expect(l).not.toBeNull();
    expect(l!.formation).toBe("4-3-3");
    expect(l!.tactic).toBe("pressing");
    expect(l!.hardness).toBe("fair");
    expect(l!.is_auto).toBe(0);
    const players = JSON.parse(l!.players_data) as Array<{ playerId: string; matchPosition: string }>;
    expect(players).toHaveLength(11);
    expect(players.filter((p) => p.matchPosition === "GK")).toHaveLength(1);
    expect(players.some((p) => p.playerId === "p3")).toBe(false);
    const bench = JSON.parse(l!.bench_data ?? "[]") as string[];
    expect(bench.length).toBeLessThanOrEqual(7);
    const log = await db.prepare("SELECT kind, mode, used_fallback, executed FROM ai_coach_decisions WHERE team_id = ?").bind(TEAM).all<{ kind: string; mode: string; used_fallback: number; executed: string | null }>();
    expect(log.results).toHaveLength(1);
    expect(log.results[0].used_fallback).toBe(0);
    expect(log.results[0].executed).not.toBeNull();
  });

  it("neexistující hráč v odpovědi: rozhodne náhradní pravidlo a sestava je platná", async () => {
    await handleAiCoachMessage(env(aiReturning({
      formation: "4-4-2", tactic: "balanced", hardness: "normal", captain: "P77", rest: [], mustStart: [], plan: [], reasoning: "x",
    })), matchMsg);
    const l = await savedLineup();
    const players = JSON.parse(l!.players_data) as Array<{ matchPosition: string }>;
    expect(players).toHaveLength(11);
    expect(players.filter((p) => p.matchPosition === "GK")).toHaveLength(1);
    const log = await db.prepare("SELECT used_fallback, error FROM ai_coach_decisions WHERE team_id = ?").bind(TEAM).first<{ used_fallback: number; error: string }>();
    expect(log!.used_fallback).toBe(1);
    expect(log!.error).toContain("P77");
  });

  it("výpadek modelu: náhradní pravidlo, zápas má sestavu", async () => {
    await handleAiCoachMessage(env({ run: async () => { throw new Error("8005: Internal server error"); } }), matchMsg);
    expect(await savedLineup()).not.toBeNull();
  });

  it("duplicitní zpráva z fronty: druhá nic neudělá", async () => {
    const e = env(aiReturning({ formation: "4-4-2", tactic: "balanced", hardness: "normal", captain: "P1", rest: [], mustStart: [], plan: [], reasoning: "x" }));
    const first = await handleAiCoachMessage(e, matchMsg);
    const second = await handleAiCoachMessage(e, matchMsg);
    expect(first.status).toBe("done");
    expect(second.status).toBe("duplicate");
    const count = await db.prepare("SELECT COUNT(*) AS n FROM ai_coach_decisions").first<{ n: number }>();
    expect(count!.n).toBe(1);
  });

  it("režim shadow jen zapíše deník, sestava se neuloží", async () => {
    await kv.put(COACH_MODE_KEY, "shadow");
    await handleAiCoachMessage(env(aiReturning({ formation: "4-4-2", tactic: "balanced", hardness: "normal", captain: "P1", rest: [], mustStart: [], plan: [], reasoning: "x" })), matchMsg);
    expect(await savedLineup()).toBeNull();
    const log = await db.prepare("SELECT mode, executed FROM ai_coach_decisions WHERE team_id = ?").bind(TEAM).first<{ mode: string; executed: string | null }>();
    expect(log!.mode).toBe("shadow");
    expect(log!.executed).toBeNull();
  });

  it("režim off: bez modelu rozhodne a provede náhradní pravidlo", async () => {
    await kv.put(COACH_MODE_KEY, JSON.stringify({ match: "off" }));
    let called = false;
    await handleAiCoachMessage(env({ run: async () => { called = true; return {}; } }), matchMsg);
    expect(called).toBe(false);
    expect(await savedLineup()).not.toBeNull();
  });

  it("zastaralá zpráva (jiný herní den) se zahodí", async () => {
    const res = await handleAiCoachMessage(env(), { ...matchMsg, day: "2026-11-01" });
    expect(res.status).toBe("stale");
    expect(await savedLineup()).toBeNull();
  });

  it("cron bez fronty připraví sestavu hned a podruhé už klub nezařadí", async () => {
    await kv.put(COACH_MODE_KEY, "off");
    const now = new Date(`${DAY}T12:45:00.000Z`);
    const first = await enqueueAiCoachJobs(env(), "match", now);
    expect(first.teams).toBe(1);
    expect(first.inline).toBe(1);
    expect(await savedLineup()).not.toBeNull();
    const second = await enqueueAiCoachJobs(env(), "match", now);
    expect(second.teams).toBe(0);
  });

  it("týdenní správa se mimo herní pondělí nezařadí", async () => {
    const res = await enqueueAiCoachJobs(env(), "weekly", new Date(`${DAY}T07:00:00.000Z`));
    // 2. 11. 2026 je pondělí: zařadí se (bez fronty hned). Úterý by se přeskočilo.
    expect(res.skipped).toBeNull();
    expect(isGameMonday("2026-11-02")).toBe(true);
    expect(isGameMonday("2026-11-03")).toBe(false);
  });

  it("lidský klub AI trenér nespravuje", async () => {
    const res = await handleAiCoachMessage(env(), { ...matchMsg, teamId: "human-team" });
    expect(res.status).toBe("not_ai");
  });
});

describe("AI trenér: týdenní správa", () => {
  const weeklyMsg: AiCoachQueueMessage = { ...matchMsg, task: "weekly", enqueuedAt: `${DAY}T07:00:00.000Z` };

  it("duplicitní pondělní zpráva: správa proběhne jen jednou", async () => {
    const first = await handleAiCoachMessage(env(), weeklyMsg);
    const second = await handleAiCoachMessage(env(), weeklyMsg);
    expect(first.status).toBe("done");
    expect(second.status).toBe("duplicate");
    const log = await db.prepare("SELECT COUNT(*) AS n FROM ai_coach_decisions WHERE kind = 'weekly'").first<{ n: number }>();
    expect(log!.n).toBe(1);
  });

  it("režim shadow nic neprovede", async () => {
    await kv.put(COACH_MODE_KEY, JSON.stringify({ weekly: "shadow" }));
    const before = await db.prepare("SELECT training_plan, budget FROM teams WHERE id = ?").bind(TEAM).first<{ training_plan: string | null; budget: number }>();
    await handleAiCoachMessage(env(), weeklyMsg);
    const after = await db.prepare("SELECT training_plan, budget FROM teams WHERE id = ?").bind(TEAM).first<{ training_plan: string | null; budget: number }>();
    expect(after).toEqual(before);
    const log = await db.prepare("SELECT mode, executed FROM ai_coach_decisions WHERE kind = 'weekly'").first<{ mode: string; executed: string | null }>();
    expect(log!.mode).toBe("shadow");
    expect(log!.executed).toBeNull();
  });

  it("bez modelu provede náhradní pravidlo (trénink se nastaví)", async () => {
    await kv.put(COACH_MODE_KEY, "off");
    await db.prepare("UPDATE teams SET training_plan = NULL WHERE id = ?").bind(TEAM).run();
    await handleAiCoachMessage(env(), weeklyMsg);
    const team = await db.prepare("SELECT training_plan FROM teams WHERE id = ?").bind(TEAM).first<{ training_plan: string | null }>();
    expect(team!.training_plan).not.toBeNull();
    const plan = JSON.parse(team!.training_plan!) as Record<string, unknown>;
    expect(plan["1"]).toBeUndefined();
    expect(plan["4"]).toBeUndefined();
  });
});
