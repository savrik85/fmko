/**
 * Proslovy trenéra nad skutečným schématem (všechny migrace, Miniflare), model nahrazený:
 *  - proslov před zápasem: zápis k zápasu, posun formy dne, nálada, podruhé nic,
 *  - proslov po zápase: nálada kabiny, vztah a nálada jmenovaného hráče, jen do 12 hodin,
 *    opakované fráze nezaberou,
 *  - posun formy dne v dalším zápase: proslov před ním + po minulém, po zápase spotřebovaný,
 *  - AI kluby: bez modelu pravidlo +1, pohár bez proslovu, proslov po zápase z hodinové práce.
 */
import { readFileSync, readdirSync } from "node:fs";
import { Miniflare } from "miniflare";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const model = vi.hoisted(() => ({ askModelJson: vi.fn() }));
vi.mock("./ai-player-chat", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./ai-player-chat")>()),
  askModelJson: model.askModelJson,
}));

import { postMatchSpeechHourlyHook, prepareAiPreSpeech } from "../ai-coach/speech";
import type { AiCoachProfile } from "../ai-coach/profile";
import type { Bindings } from "../index";
import { applyPostSpeech, loadMatchSpeeches, loadSpeechShift, markSpeechesApplied } from "./match-speech";
import { applySpeech } from "./squad-talk";

let mf: Miniflare;
let db: D1Database;

const TEAM = "t-speech";
const OPP = "t-opp";
const AI = "t-ai";
const CONV = "conv-kabina";
const PLAYERS = ["p1", "p2", "p3", "p4"];
const env = () => ({ DB: db }) as unknown as Bindings;

const hoursAgo = (h: number) => new Date(Date.now() - h * 3600_000).toISOString();
const inDays = (d: number) => new Date(Date.now() + d * 86400_000).toISOString();

async function morale(id: string): Promise<number> {
  const r = await db.prepare("SELECT json_extract(life_context, '$.morale') AS m FROM players WHERE id = ?").bind(id).first<{ m: number }>();
  return r!.m;
}
async function coachSays(text: string): Promise<void> {
  await db.prepare(
    "INSERT INTO messages (id, conversation_id, sender_type, sender_id, sender_name, body, sent_at, read) VALUES (?, ?, 'user', ?, 'Trenér', ?, strftime('%Y-%m-%dT%H:%M:%fZ','now'), 1)",
  ).bind(crypto.randomUUID(), CONV, TEAM, text).run();
}

beforeAll(async () => {
  mf = new Miniflare({ modules: true, script: "export default { fetch() { return new Response('ok'); } }", d1Databases: ["DB"] });
  db = await mf.getD1Database("DB");
  const dir = new URL("../../migrations/", import.meta.url);
  for (const file of readdirSync(dir).filter((f) => f.endsWith(".sql")).sort()) {
    await db.exec(readFileSync(new URL(file, dir), "utf8").replace(/--[^\n]*/g, "").replace(/\n/g, " "));
  }
}, 180_000);

afterAll(async () => {
  await mf.dispose();
});

const PRE_SPEECH = "Kluci, dneska hrajeme s Lhotou o všechno. Ať to vidí celá vesnice, makejte jeden za druhého a nikdo nesmí vypustit souboj.";
const POST_SPEECH = "Díky za dnešek, Novák to vzadu odmakal za dva a celý tým držel pohromadě. Takhle se hraje vesnický fotbal, příště zas.";

beforeEach(async () => {
  model.askModelJson.mockReset();
  for (const t of ["match_speeches", "coach_relation_log", "messages", "conversations", "matches", "season_calendar", "players", "teams", "leagues", "users", "seasons"]) {
    await db.prepare(`DELETE FROM ${t}`).run();
  }
  await db.batch([
    db.prepare("INSERT INTO users (id, email, password_hash) VALUES ('u-1', 'speech@example.test', 'x'), ('ai', 'ai@example.test', 'x')"),
    db.prepare("INSERT INTO seasons (id, number, status) VALUES ('s-4', 4, 'active')"),
    db.prepare("INSERT INTO leagues (id, season_id, district, name) VALUES ('l-1', 's-4', 'Prachatice', 'Přebor')"),
    db.prepare("INSERT OR IGNORE INTO villages (id, name, district, region, population, size, lat, lng) VALUES ('v-1', 'Dvory', 'Prachatice', 'JC', 600, 'village', 49.0, 14.0)"),
    db.prepare("INSERT INTO teams (id, user_id, name, league_id, game_date, village_id) VALUES (?, 'u-1', 'Sokol Dvory', 'l-1', ?, 'v-1'), (?, 'ai', 'Baník Lhota', 'l-1', ?, 'v-1'), (?, 'ai', 'AI Vimperk', 'l-1', ?, 'v-1')")
      .bind(TEAM, hoursAgo(1), OPP, hoursAgo(1), AI, hoursAgo(1)),
    ...PLAYERS.map((id, i) => db.prepare(
      `INSERT INTO players (id, team_id, first_name, last_name, position, overall_rating, skills, physical, personality, life_context, avatar, weekly_wage, age)
       VALUES (?, ?, 'Jan', ?, 'MID', 50, '{}', '{}', '{}', '{"morale":50}', '{}', 0, 25)`,
    ).bind(id, TEAM, ["Novák", "Dvořák", "Svoboda", "Kučera"][i])),
    db.prepare(`INSERT INTO players (id, team_id, first_name, last_name, position, overall_rating, skills, physical, personality, life_context, avatar, weekly_wage, age)
       VALUES ('ai-1', ?, 'Petr', 'Bílý', 'MID', 50, '{}', '{}', '{}', '{"morale":50}', '{}', 0, 25)`).bind(AI),
    db.prepare("INSERT INTO season_calendar (id, league_id, season_number, game_week, match_day, scheduled_at, status) VALUES ('c-0', 'l-1', 4, 1, 'sunday', ?, 'simulated'), ('c-1', 'l-1', 4, 2, 'sunday', ?, 'scheduled'), ('c-ai', 'l-1', 4, 1, 'sunday', ?, 'simulated')")
      .bind(hoursAgo(3), inDays(1), hoursAgo(3)),
    db.prepare("INSERT INTO matches (id, calendar_id, league_id, home_team_id, away_team_id, status, home_score, away_score, simulated_at) VALUES ('m-0', 'c-0', 'l-1', ?, ?, 'simulated', 2, 1, ?), ('m-1', 'c-1', 'l-1', ?, ?, 'scheduled', NULL, NULL, NULL)")
      .bind(TEAM, OPP, hoursAgo(2), TEAM, OPP),
    db.prepare("INSERT INTO matches (id, calendar_id, league_id, home_team_id, away_team_id, status, home_score, away_score, simulated_at) VALUES ('m-ai', 'c-ai', 'l-1', ?, ?, 'simulated', 0, 0, ?)")
      .bind(AI, OPP, hoursAgo(2)),
    db.prepare("INSERT INTO conversations (id, team_id, type, title, created_at) VALUES (?, ?, 'squad_group', 'Kabina', '2026-11-01')").bind(CONV, TEAM),
  ]);
});

describe("proslov před zápasem", () => {
  it("zapíše se k zápasu s posunem formy dne, pohne náladou, podruhé nic", async () => {
    model.askModelJson.mockResolvedValue({ delta: 3, mood: "Kluci by za trenéra dýchali." });
    await coachSays(PRE_SPEECH);
    const v = await applySpeech(db, {}, { teamId: TEAM, convId: CONV, message: PRE_SPEECH, nextMatch: "zítra s Baník Lhota" });
    expect(v?.delta).toBe(3);
    const row = await db.prepare("SELECT kind, match_key, score, form_shift, author FROM match_speeches WHERE team_id = ?").bind(TEAM).first();
    expect(row).toEqual({ kind: "pre", match_key: "c-1", score: 3, form_shift: 0.36, author: "coach" });
    expect(await morale("p1")).toBe(53);
    expect(await applySpeech(db, {}, { teamId: TEAM, convId: CONV, message: PRE_SPEECH, nextMatch: "zítra s Baník Lhota" })).toBeNull();
    expect(await morale("p1")).toBe(53);
  });
});

describe("proslov po zápase", () => {
  it("do 12 hodin: nálada kabiny, pochválený hráč dostane vztah i náladu, vymyšlené id se ignoruje; podruhé nic", async () => {
    model.askModelJson.mockResolvedValue({ delta: 2, mood: "Kabinu to postavilo na nohy.", named: [{ id: "p1", stance: "praise" }, { id: "ghost", stance: "criticism" }] });
    await coachSays(POST_SPEECH);
    const v = await applyPostSpeech(db, {}, { teamId: TEAM, convId: CONV, message: POST_SPEECH });
    expect(v?.delta).toBe(2);
    expect(v?.named).toEqual([{ id: "p1", stance: "praise" }]);
    const row = await db.prepare("SELECT kind, match_key, score, form_shift, morale_delta FROM match_speeches WHERE team_id = ? AND kind = 'post'").bind(TEAM).first();
    expect(row).toEqual({ kind: "post", match_key: "c-0", score: 2, form_shift: 0.1, morale_delta: 4 });
    expect(await morale("p2")).toBe(54);
    expect(await morale("p1")).toBe(57);
    const rel = await db.prepare("SELECT delta, source FROM coach_relation_log WHERE player_id = 'p1'").first();
    expect(rel).toEqual({ delta: 4, source: "speech" });
    expect(await applyPostSpeech(db, {}, { teamId: TEAM, convId: CONV, message: POST_SPEECH })).toBeNull();
  });

  it("po 12 hodinách od konce zápasu už to proslov po zápase není", async () => {
    model.askModelJson.mockResolvedValue({ delta: 3, mood: "x", named: [] });
    await db.prepare("UPDATE matches SET simulated_at = ? WHERE id = 'm-0'").bind(hoursAgo(13)).run();
    expect(await applyPostSpeech(db, {}, { teamId: TEAM, convId: CONV, message: POST_SPEECH })).toBeNull();
    expect(model.askModelJson).not.toHaveBeenCalled();
  });

  it("stejné fráze jako minule nezaberou", async () => {
    model.askModelJson.mockResolvedValue({ delta: 3, mood: "Super." });
    await coachSays(PRE_SPEECH);
    await applySpeech(db, {}, { teamId: TEAM, convId: CONV, message: PRE_SPEECH, nextMatch: "zítra s Baník Lhota" });
    model.askModelJson.mockResolvedValue({ delta: 3, mood: "Super.", named: [] });
    await coachSays(PRE_SPEECH);
    const v = await applyPostSpeech(db, {}, { teamId: TEAM, convId: CONV, message: PRE_SPEECH });
    expect(v?.delta).toBe(0);
    expect(v?.mood).toMatch(/slyšeli už minule/);
  });
});

describe("posun formy dne v zápase", () => {
  it("proslov před zápasem + po minulém, strop, po zápase spotřebovaný; pozdější proslov se nepočítá", async () => {
    model.askModelJson.mockResolvedValue({ delta: 2, mood: "ok", named: [] });
    await coachSays(POST_SPEECH);
    await applyPostSpeech(db, {}, { teamId: TEAM, convId: CONV, message: POST_SPEECH });
    model.askModelJson.mockResolvedValue({ delta: 3, mood: "ok" });
    await coachSays(PRE_SPEECH);
    await applySpeech(db, {}, { teamId: TEAM, convId: CONV, message: PRE_SPEECH, nextMatch: "zítra s Baník Lhota" });

    const kickoff = new Date().toISOString();
    const s = await loadSpeechShift(db, TEAM, "c-1", kickoff);
    expect(s.shift).toBeCloseTo(0.46);
    expect(s.ids).toHaveLength(2);
    // Před výkopem napsaný proslov po starším zápase se nepočítá, když kickoff je dřív.
    expect((await loadSpeechShift(db, TEAM, "c-1", hoursAgo(5))).shift).toBeCloseTo(0.36);
    await markSpeechesApplied(db, s.ids, "m-1");
    expect((await loadSpeechShift(db, TEAM, "c-1", kickoff)).shift).toBe(0);
    const summaries = await loadMatchSpeeches(db, "m-1");
    expect(summaries.map((x) => x.kind).sort()).toEqual(["post", "pre"]);
    for (const x of summaries) {
      expect(x.summary).not.toMatch(/\d|[—–]/);
      expect(x.teamId).toBe(TEAM);
    }
  });
});

describe("AI kluby", () => {
  it("bez modelu proslov před zápasem pravidlem (+1), pohár bez proslovu", async () => {
    await prepareAiPreSpeech(env(), AI, { calendarId: "c-1", kind: "league" });
    const row = await db.prepare("SELECT author, score, form_shift FROM match_speeches WHERE team_id = ? AND kind = 'pre'").bind(AI).first();
    expect(row).toEqual({ author: "rule", score: 1, form_shift: 0.12 });
    await prepareAiPreSpeech(env(), AI, { calendarId: "cup-1", kind: "cup" });
    expect((await db.prepare("SELECT COUNT(*) AS n FROM match_speeches WHERE team_id = ?").bind(AI).first<{ n: number }>())!.n).toBe(1);
  });

  it("hodinová práce po zápase: proslov pravidlem a nálada, jen jednou, lidskému klubu ne", async () => {
    const hook = postMatchSpeechHourlyHook;
    await hook(env(), AI, {} as AiCoachProfile, new Date());
    await hook(env(), AI, {} as AiCoachProfile, new Date());
    await hook(env(), TEAM, {} as AiCoachProfile, new Date());
    const rows = (await db.prepare("SELECT team_id, author, score, morale_delta FROM match_speeches WHERE kind = 'post'").all()).results;
    expect(rows).toEqual([{ team_id: AI, author: "rule", score: 1, morale_delta: 2 }]);
    expect(await morale("ai-1")).toBe(52);
  });
});
