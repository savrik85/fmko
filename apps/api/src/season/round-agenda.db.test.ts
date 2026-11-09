/**
 * Agenda po kole (oznámení, přehled výsledků, úklid) musí jít doběhnout po pádu běhu
 * a nesmí se zopakovat na kole, které ji má hotovou. 2026-11-09: převzaté kolo poslalo
 * oznámení jen klubům ze zápasů, které samo dohrálo, a ruční dokončení šlo pustit i
 * na zdravé kolo (oznámení podruhé).
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { Miniflare } from "miniflare";

const notified: string[] = [];
vi.mock("../community/notifications", () => ({
  createNotification: async (_db: unknown, teamId: string) => { notified.push(teamId); },
}));

import { AGENDA_BUSY, claimRoundAgenda, finishRecoveredRound } from "./league-round";
import { normalizeMatchPosition } from "../multiplayer/match-runner";

let miniflare: Miniflare;
let db: D1Database;
const store = new Map<string, string>();
const kv = {
  get: async (key: string, type?: string) => { const v = store.get(key); return v === undefined ? null : type === "json" ? JSON.parse(v) : v; },
  put: async (key: string, value: string) => { store.set(key, value); },
};
const env = () => ({ DB: db, CACHE_KV: kv, VAPID_PUBLIC_KEY: "", VAPID_PRIVATE_KEY: "", VAPID_SUBJECT: "" }) as never;
const CAL = "cal-1";

beforeAll(async () => {
  miniflare = new Miniflare({ modules: true, script: "export default { fetch() { return new Response('ok'); } }", d1Databases: ["DB"] });
  db = await miniflare.getD1Database("DB");
  for (const sql of [
    "CREATE TABLE season_calendar (id TEXT PRIMARY KEY, league_id TEXT, scheduled_at TEXT, status TEXT, locked_at TEXT, season_number INTEGER, game_week INTEGER)",
    "CREATE TABLE leagues (id TEXT PRIMARY KEY, league_type TEXT)",
    "CREATE TABLE teams (id TEXT PRIMARY KEY, name TEXT, user_id TEXT)",
    "CREATE TABLE matches (id TEXT PRIMARY KEY, calendar_id TEXT, home_team_id TEXT, away_team_id TEXT, home_score INTEGER, away_score INTEGER, status TEXT)",
    "CREATE TABLE news (id TEXT PRIMARY KEY, league_id TEXT, type TEXT, headline TEXT, body TEXT, game_week INTEGER, created_at TEXT)",
    "CREATE TABLE coach_interviews (id TEXT PRIMARY KEY, match_calendar_id TEXT, status TEXT, kind TEXT)",
  ]) await db.prepare(sql).run();
});

afterAll(async () => { await miniflare.dispose(); });

/** Kolo U21 (bez článků a událostí mezi koly): tři odehrané zápasy, lidé v t1, t3 a t5. */
beforeEach(async () => {
  store.clear();
  notified.length = 0;
  for (const t of ["season_calendar", "leagues", "teams", "matches", "news", "coach_interviews"]) await db.prepare(`DELETE FROM ${t}`).run();
  const stale = new Date(Date.now() - 30 * 60_000).toISOString();
  await db.batch([
    db.prepare("INSERT INTO leagues VALUES ('lg', 'u21')"),
    db.prepare("INSERT INTO season_calendar VALUES (?, 'lg', ?, 'simulated', ?, 3, 7)").bind(CAL, new Date().toISOString(), stale),
    ...["t1", "t2", "t3", "t4", "t5", "t6"].map((id, i) => db.prepare("INSERT INTO teams VALUES (?, ?, ?)").bind(id, `Klub ${id}`, i % 2 === 0 ? `user-${id}` : "ai")),
    db.prepare("INSERT INTO matches VALUES ('m1', ?, 't1', 't2', 2, 1, 'simulated')").bind(CAL),
    db.prepare("INSERT INTO matches VALUES ('m2', ?, 't3', 't4', 0, 0, 'simulated')").bind(CAL),
    db.prepare("INSERT INTO matches VALUES ('m3', ?, 't6', 't5', 1, 3, 'simulated')").bind(CAL),
  ]);
});

const newsCount = async () => (await db.prepare("SELECT COUNT(*) AS n FROM news WHERE type = 'round_results'").first<{ n: number }>())?.n;

describe("agenda po kole", () => {
  it("dohrané kolo: oznámení dostanou kluby ze VŠECH zápasů kola a přehled vznikne jednou", async () => {
    expect(await finishRecoveredRound(env(), CAL)).toEqual({ ok: true, matches: 3 });
    expect(notified.sort()).toEqual(["t1", "t3", "t5"]);
    expect(await newsCount()).toBe(1);
  });

  it("druhé volání na hotové kolo nic neudělá (ani na zdravém kole)", async () => {
    await finishRecoveredRound(env(), CAL);
    notified.length = 0;
    expect(await finishRecoveredRound(env(), CAL)).toEqual({ ok: false, reason: "kolo už je dokončené" });
    expect(notified).toEqual([]);
    expect(await newsCount()).toBe(1);
  });

  it("po pádu uprostřed agendy se hotové kroky neopakují", async () => {
    // Předchozí běh stihl přehled výsledků a oznámení, pak spadl.
    store.set(`round-agenda:${CAL}`, JSON.stringify({ done: ["zpravodaj", "notifikace"] }));
    expect(await finishRecoveredRound(env(), CAL)).toEqual({ ok: true, matches: 3 });
    expect(notified).toEqual([]);
    expect(await newsCount()).toBe(0);
    expect(store.has(`round-finished:${CAL}`)).toBe(true);
  });

  it("přehled výsledků od pojistky se nezdvojí", async () => {
    await db.prepare("INSERT INTO news VALUES ('n1', 'lg', 'round_results', 'x', 'y', 7, ?)").bind(new Date().toISOString().replace("T", " ").slice(0, 19)).run();
    await finishRecoveredRound(env(), CAL);
    expect(await newsCount()).toBe(1);
  });

  it("agendu s čerstvým pulsem dělá jiný běh: odmítne a nic nepošle", async () => {
    await db.prepare("UPDATE season_calendar SET locked_at = ? WHERE id = ?").bind(new Date().toISOString(), CAL).run();
    expect(await finishRecoveredRound(env(), CAL)).toEqual({ ok: false, reason: AGENDA_BUSY });
    expect(notified).toEqual([]);
    // Běh, který kolo sám dohrál, puls vlastní a agendu udělat smí.
    expect(await finishRecoveredRound(env(), CAL, { owner: true })).toEqual({ ok: true, matches: 3 });
  });

  it("dva souběžné pokusy o agendu: zabere ji jen jeden", async () => {
    const [a, b] = await Promise.all([claimRoundAgenda(db, CAL), claimRoundAgenda(db, CAL)]);
    expect([a, b].sort()).toEqual([false, true]);
  });

  it("neodehrané kolo se nedokončuje", async () => {
    await db.prepare("UPDATE season_calendar SET status = 'lineup_locked' WHERE id = ?").bind(CAL).run();
    expect((await finishRecoveredRound(env(), CAL)).ok).toBe(false);
    expect(notified).toEqual([]);
  });
});

describe("pozice ze sestavy", () => {
  it("engine dostane jen čtyři řady, cokoli jiného se zahodí", () => {
    expect(normalizeMatchPosition("GK")).toBe("GK");
    expect(normalizeMatchPosition("FWD")).toBe("FWD");
    expect(normalizeMatchPosition("LW")).toBeUndefined();
    expect(normalizeMatchPosition("")).toBeUndefined();
    expect(normalizeMatchPosition(null)).toBeUndefined();
    expect(normalizeMatchPosition(7)).toBeUndefined();
  });
});
