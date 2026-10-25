/**
 * Konec sezóny na skutečné D1 (Miniflare, všechny migrace): AI klub dostane stejné souboje
 * „kdo zůstane" jako lidský a AI trenér je v nové sezóně rozhodne stejnou službou jako člověk.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { Miniflare } from "miniflare";
import { Hono } from "hono";
import { createSession } from "../auth/session";
import type { Bindings } from "../index";
import { gameRouter } from "../routes/game";
import { processTeamDepartures } from "../season/season-departures";
import { loadPendingSeasonDuels, type SeasonDuel } from "../season/season-duels";
import { ROLLOVER_KEY } from "../season/season-progress";
import { captureDepartures } from "../season/season-recap";
import { generateAiProfile, type AiCoachProfile } from "./profile";
import { resolveAiSeasonDuels } from "./season-duels";

const app = new Hono<{ Bindings: Bindings }>();
app.route("/api", gameRouter);

let mf: Miniflare;
let db: D1Database;
let kv: KVNamespace;
let sessions: KVNamespace;
let villages: string[] = [];

const AI = "ai-club";
const HUMAN = "human-club";
const LEAGUE = "l-1";
const GAME_DATE = "2026-11-02T16:00:00.000Z";
/** 12:30 v Praze. */
const NOON = new Date("2026-11-02T11:30:00.000Z");
const POSITIONS = ["GK", "GK", "DEF", "DEF", "DEF", "DEF", "DEF", "MID", "MID", "MID", "MID", "MID", "FWD", "FWD", "FWD", "FWD"];

function profile(over: Partial<AiCoachProfile> = {}): AiCoachProfile {
  return { ...generateAiProfile(AI, null), youthFocus: 50, ...over };
}

function env(): Bindings {
  return { DB: db, CACHE_KV: kv, SESSION_KV: sessions } as unknown as Bindings;
}

function fakeAi(answer: unknown) {
  const prompts: string[] = [];
  return {
    prompts,
    binding: {
      AI: {
        run: async (_model: string, input: { messages: Array<{ content: string }> }) => {
          prompts.push(input.messages[1]?.content ?? "");
          return { choices: [{ message: { content: JSON.stringify(answer) } }], usage: { prompt_tokens: 10, completion_tokens: 5 } };
        },
      },
    } as unknown as Pick<Bindings, "AI">,
  };
}

async function count(sql: string, ...binds: unknown[]): Promise<number> {
  return (await db.prepare(sql).bind(...binds).first<{ n: number }>())?.n ?? 0;
}

async function inTeam(teamId: string, ids: string[]): Promise<number> {
  return count(`SELECT COUNT(*) AS n FROM players WHERE team_id = ? AND id IN (${ids.map(() => "?").join(", ")})`, teamId, ...ids);
}

async function recap(teamId: string, seasonNumber = 1) {
  const row = await db.prepare("SELECT seen, data FROM season_recap WHERE team_id = ? AND season_number = ?").bind(teamId, seasonNumber)
    .first<{ seen: number; data: string }>();
  return row ? { seen: row.seen, data: JSON.parse(row.data) as { decision: { duels: SeasonDuel[] } | null; departures?: unknown[] } } : null;
}

async function playerInfo(id: string) {
  const r = await db.prepare("SELECT id, first_name, last_name, position, age, overall_rating FROM players WHERE id = ?").bind(id)
    .first<{ id: string; first_name: string; last_name: string; position: string; age: number; overall_rating: number }>();
  return { playerId: r!.id, name: `${r!.first_name} ${r!.last_name}`, position: r!.position, age: r!.age, overallRating: r!.overall_rating };
}

async function insertRecap(teamId: string, seasonNumber: number, pairs: Array<[string, string]>): Promise<void> {
  const duels: SeasonDuel[] = [];
  for (const [a, b] of pairs) duels.push({ a: await playerInfo(a), b: await playerInfo(b), story: "Místo v kádru zbylo jen pro jednoho." });
  await db.prepare("INSERT INTO season_recap (team_id, season_number, data, seen) VALUES (?, ?, ?, 0)")
    .bind(teamId, seasonNumber, JSON.stringify({ departures: [], decision: { duels } })).run();
}

async function wipe(): Promise<void> {
  const linked = (await db.prepare(
    `SELECT DISTINCT m.name FROM sqlite_master m WHERE m.type = 'table' AND m.name NOT LIKE 'sqlite_%' AND m.name NOT LIKE '_cf_%'
       AND (EXISTS (SELECT 1 FROM pragma_table_info(m.name) p WHERE p.name IN ('team_id', 'player_id', 'conversation_id'))
         OR EXISTS (SELECT 1 FROM pragma_foreign_key_list(m.name) f WHERE f."table" IN ('teams', 'players', 'leagues', 'seasons', 'managers')))`,
  ).all<{ name: string }>()).results.map((r) => r.name);
  const tables = [...new Set([...linked, "season_end_progress", "players", "managers", "teams", "leagues", "seasons"])];
  let lastError = "";
  for (let pass = 0; pass < 6; pass++) {
    const failed: string[] = [];
    for (const t of tables) {
      try {
        await db.prepare(`DELETE FROM ${t}`).run();
      } catch (e) {
        failed.push(t);
        lastError = `${t}: ${String(e)}`;
      }
    }
    if (failed.length === 0) return;
  }
  throw new Error(`úklid testovací databáze se nepovedl: ${lastError}`);
}

beforeAll(async () => {
  mf = new Miniflare({
    modules: true,
    script: "export default { fetch() { return new Response('ok'); } }",
    d1Databases: ["DB"],
    kvNamespaces: ["CACHE_KV", "SESSION_KV"],
  });
  db = await mf.getD1Database("DB");
  kv = await mf.getKVNamespace("CACHE_KV") as unknown as KVNamespace;
  sessions = await mf.getKVNamespace("SESSION_KV") as unknown as KVNamespace;
  const dir = new URL("../../migrations/", import.meta.url);
  for (const file of readdirSync(dir).filter((f) => f.endsWith(".sql")).sort()) {
    const source = readFileSync(new URL(file, dir), "utf8").replace(/--[^\n]*/g, "").replace(/\n/g, " ");
    await db.exec(source);
  }
  villages = (await db.prepare("SELECT id FROM villages WHERE district = 'Prachatice' ORDER BY id LIMIT 2").all<{ id: string }>()).results.map((r) => r.id);
}, 120_000);

afterAll(async () => {
  await mf.dispose();
});

beforeEach(async () => {
  await wipe();
  await db.batch([
    db.prepare("INSERT OR IGNORE INTO users (id, email, password_hash) VALUES ('ai', 'ai@system.local', 'none'), ('u-human', 'human@example.test', 'x')"),
    db.prepare("INSERT INTO seasons (id, number, status) VALUES ('s-1', 1, 'finished'), ('s-2', 2, 'active')"),
    db.prepare("INSERT INTO leagues (id, season_id, district, name, level) VALUES (?, 's-2', 'Prachatice', 'Okresní přebor', 'okresni_prebor')").bind(LEAGUE),
    db.prepare("INSERT INTO teams (id, user_id, village_id, name, budget, league_id, team_type, game_date) VALUES (?, 'ai', ?, 'TJ Netolice', 80000, ?, 'senior', ?)")
      .bind(AI, villages[0], LEAGUE, GAME_DATE),
    db.prepare("INSERT INTO teams (id, user_id, village_id, name, budget, league_id, team_type, game_date) VALUES (?, 'u-human', ?, 'Jiskra Husinec', 80000, ?, 'senior', ?)")
      .bind(HUMAN, villages[1], LEAGUE, GAME_DATE),
  ]);
  const insert = db.prepare(
    `INSERT INTO players (id, team_id, first_name, last_name, age, position, overall_rating, skills, physical, personality, life_context, avatar, weekly_wage, status)
     VALUES (?, ?, 'Jan', ?, ?, ?, ?, '{}', '{}', '{}', ?, '{}', 500, 'active')`,
  );
  const lifeContext = JSON.stringify({ morale: 50, condition: 100 });
  await db.batch([
    ...POSITIONS.map((pos, i) => insert.bind(`ai-p${i}`, AI, `Hráč${i}`, 22 + i, pos, 30 + i, lifeContext)),
    ...POSITIONS.map((pos, i) => insert.bind(`hu-p${i}`, HUMAN, `Člověk${i}`, 22 + i, pos, 30 + i, lifeContext)),
  ]);
});

describe("konec sezóny: AI klub a souboje kdo zůstane", () => {
  it("AI klub dostane stejné souboje jako člověk a nikdo neodejde automaticky", async () => {
    const res = await processTeamDepartures(db, LEAGUE, AI, 1);
    expect(res.departures).toEqual([]);
    expect(res.duels).toHaveLength(3);
    expect(await count("SELECT COUNT(*) AS n FROM players WHERE team_id = ?", AI)).toBe(16);

    await captureDepartures(db, AI, 1, res);
    const pending = await loadPendingSeasonDuels(db, AI);
    expect(pending?.seasonNumber).toBe(1);
    expect(pending?.duels.map((d) => [d.a.playerId, d.b.playerId])).toEqual(res.duels.map((d) => [d.a.playerId, d.b.playerId]));
  }, 60_000);

  it("v nové sezóně rozhodne model, odejdou poražení a přehled je vyřízený", async () => {
    await insertRecap(AI, 1, [["ai-p8", "ai-p9"], ["ai-p13", "ai-p14"]]);
    const ai = fakeAi({ duel_1: "B", duel_2: "A", reason: "Keep the better forward." });

    const res = await resolveAiSeasonDuels(env(), AI, profile(), NOON, { mode: "on", ai: ai.binding });

    expect(res).toEqual({ skipped: null, decidedBy: "model", leaving: ["ai-p8", "ai-p14"], executed: true });
    expect(ai.prompts[0]).toContain("duel_1:\n- A: Jan Hráč8 (MID");
    expect(await inTeam(AI, ["ai-p8", "ai-p14"])).toBe(0);
    expect(await inTeam(AI, ["ai-p9", "ai-p13"])).toBe(2);
    const r = await recap(AI);
    expect(r?.seen).toBe(1);
    expect(r?.data.decision).toBeNull();
    expect(r?.data.departures).toHaveLength(2);
    const log = await db.prepare("SELECT kind, mode, context_ref, used_fallback FROM ai_coach_decisions WHERE team_id = ?").bind(AI).all();
    expect(log.results).toEqual([{ kind: "season_duels", mode: "on", context_ref: "season-1", used_fallback: 0 }]);

    // Vyřízené souboje už nic nespustí.
    expect((await resolveAiSeasonDuels(env(), AI, profile(), NOON, { mode: "on", ai: ai.binding })).skipped).toBe("nothing");
  }, 60_000);

  it("neplatná odpověď modelu: náhradní pravidlo nechá lepšího hráče", async () => {
    await insertRecap(AI, 1, [["ai-p8", "ai-p9"]]);
    const res = await resolveAiSeasonDuels(env(), AI, profile(), NOON, { mode: "on", ai: fakeAi({ duel_1: "both", reason: "?" }).binding });
    // ai-p9 má hodnocení 39, ai-p8 38: zůstane ai-p9.
    expect(res).toMatchObject({ decidedBy: "fallback", leaving: ["ai-p8"], executed: true });
    const log = await db.prepare("SELECT used_fallback, error FROM ai_coach_decisions WHERE team_id = ?").bind(AI).first<{ used_fallback: number; error: string }>();
    expect(log).toEqual({ used_fallback: 1, error: "neplatná odpověď modelu" });
  }, 60_000);

  it("posledního brankáře model poslat pryč nesmí", async () => {
    await db.prepare("UPDATE players SET position = 'DEF' WHERE id = 'ai-p1'").run();
    await insertRecap(AI, 1, [["ai-p0", "ai-p9"]]);
    const res = await resolveAiSeasonDuels(env(), AI, profile(), NOON, { mode: "on", ai: fakeAi({ duel_1: "B", reason: "x" }).binding });
    // Jediný brankář (ai-p0) je daný, model se ani neptá; odchází druhý z dvojice.
    expect(res).toMatchObject({ decidedBy: "fallback", leaving: ["ai-p9"], executed: true });
    expect(await inTeam(AI, ["ai-p0"])).toBe(1);
  }, 60_000);

  it("dokud běží sezóna nebo rollover, souboje čekají", async () => {
    await insertRecap(AI, 2, [["ai-p8", "ai-p9"]]);
    expect((await resolveAiSeasonDuels(env(), AI, profile(), NOON)).skipped).toBe("season_running");
    await db.prepare("DELETE FROM season_recap").run();
    await insertRecap(AI, 1, [["ai-p8", "ai-p9"]]);
    await db.prepare("INSERT INTO season_end_progress (league_id, season_number, phase, status) VALUES (?, 1, 'rollover', 'in_progress')").bind(ROLLOVER_KEY).run();
    expect((await resolveAiSeasonDuels(env(), AI, profile(), NOON)).skipped).toBe("season_running");
    expect((await resolveAiSeasonDuels(env(), AI, profile(), new Date("2026-11-02T01:30:00.000Z"))).skipped).toBe("night");
    expect(await count("SELECT COUNT(*) AS n FROM ai_coach_claims WHERE team_id = ?", AI)).toBe(0);
  }, 60_000);

  it("režim shadow rozhodne a zapíše, nic neprovede; po zapnutí provede", async () => {
    await insertRecap(AI, 1, [["ai-p8", "ai-p9"]]);
    const ai = fakeAi({ duel_1: "A", reason: "Younger." });
    const shadow = await resolveAiSeasonDuels(env(), AI, profile(), NOON, { mode: "shadow", ai: ai.binding });
    expect(shadow).toEqual({ skipped: null, decidedBy: "model", leaving: ["ai-p9"], executed: false });
    expect(await inTeam(AI, ["ai-p9"])).toBe(1);
    expect((await recap(AI))?.seen).toBe(0);
    expect((await resolveAiSeasonDuels(env(), AI, profile(), NOON, { mode: "shadow", ai: ai.binding })).skipped).toBe("done");

    const on = await resolveAiSeasonDuels(env(), AI, profile(), NOON, { mode: "on", ai: ai.binding });
    expect(on).toMatchObject({ leaving: ["ai-p9"], executed: true });
    expect(await inTeam(AI, ["ai-p9"])).toBe(0);
  }, 60_000);
});

describe("konec sezóny: lidský klub beze změny", () => {
  it("routa rozhodne souboje stejně jako dřív a AI trenér na lidský klub nesahá", async () => {
    await insertRecap(HUMAN, 1, [["hu-p8", "hu-p9"], ["hu-p13", "hu-p14"]]);
    expect((await resolveAiSeasonDuels(env(), HUMAN, profile(), NOON)).skipped).toBe("not_ai");

    const token = await createSession(sessions, "u-human", "human@example.test", HUMAN);
    const res = await app.request(`/api/teams/${HUMAN}/season-recap/decide`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ leaving: ["hu-p9", "hu-p13", "foreign-id"] }),
    }, env());
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    expect(await inTeam(HUMAN, ["hu-p9", "hu-p13"])).toBe(0);
    expect(await inTeam(HUMAN, ["hu-p8", "hu-p14"])).toBe(2);
    const r = await recap(HUMAN);
    expect(r?.seen).toBe(1);
    expect(r?.data.decision).toBeNull();

    const again = await app.request(`/api/teams/${HUMAN}/season-recap/decide`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ leaving: [] }),
    }, env());
    expect(again.status).toBe(404);
  }, 60_000);
});
