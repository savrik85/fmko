/**
 * Kritika rozhodčího na Sockách nad SQLite (Miniflare): stejná tabulka dopadů jako
 * pozápasový rozhovor, jeden příspěvek = jedny dopady, opakovaná ostrá kritika = distanc
 * na lavičce právě na příští kolo, bez sudího se nic nepočítá jinak.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { Miniflare } from "miniflare";
import { effectsFor } from "../news/post-match-context";
import { applySocialRefereeEffects, fallbackStance, hasBenchBan, mentionsReferee, type RefereeStanceClassifier } from "./referee-criticism";

let miniflare: Miniflare;
let db: D1Database;
const now = Date.now();
const recent = new Date(now - 2 * 86400_000).toISOString();

const SCHEMA = [
  "CREATE TABLE teams (id TEXT PRIMARY KEY, name TEXT, league_id TEXT, game_date TEXT, budget INTEGER, user_id TEXT, parent_team_id TEXT, team_type TEXT)",
  "CREATE TABLE matches (id TEXT PRIMARY KEY, league_id TEXT, home_team_id TEXT, away_team_id TEXT, status TEXT, referee_id TEXT, simulated_at TEXT)",
  "CREATE TABLE season_calendar (id TEXT PRIMARY KEY, league_id TEXT, season_number INTEGER, game_week INTEGER, status TEXT)",
  "CREATE TABLE referee_team_relations (id TEXT PRIMARY KEY, referee_id TEXT, team_id TEXT, sentiment INTEGER, duvod TEXT, updated_at TEXT, UNIQUE(referee_id, team_id))",
  "CREATE TABLE coach_interviews (id TEXT PRIMARY KEY, team_id TEXT, kind TEXT, analysis TEXT, created_at TEXT)",
  `CREATE TABLE competition_sanctions (id TEXT PRIMARY KEY, league_id TEXT, season_number INTEGER, team_id TEXT, kind TEXT, amount INTEGER,
     reason TEXT, evidence TEXT, issued_by TEXT, issued_by_team_id TEXT, proposal_id TEXT, status TEXT NOT NULL DEFAULT 'issued',
     appeal_deadline_gd TEXT, game_date TEXT, reference_id TEXT UNIQUE)`,
  "CREATE TABLE team_fanbase (team_id TEXT PRIMARY KEY, casual_count INTEGER, updated_at TEXT)",
  "CREATE TABLE transactions (id TEXT PRIMARY KEY, team_id TEXT, type TEXT, amount INTEGER, balance_after INTEGER, description TEXT, reference_id TEXT, game_date TEXT)",
  "CREATE TABLE conversations (id TEXT PRIMARY KEY, team_id TEXT, type TEXT, title TEXT, pinned INTEGER, unread_count INTEGER DEFAULT 0, last_message_text TEXT, last_message_at TEXT, created_at TEXT)",
  "CREATE TABLE messages (id TEXT PRIMARY KEY, conversation_id TEXT, sender_type TEXT, sender_name TEXT, body TEXT, metadata TEXT, sent_at TEXT)",
];

beforeAll(async () => {
  miniflare = new Miniflare({ modules: true, script: "export default { fetch() { return new Response('ok'); } }", d1Databases: ["DB"] });
  db = await miniflare.getD1Database("DB");
  for (const sql of SCHEMA) await db.prepare(sql).run();
  const migration = readFileSync(join(__dirname, "../../migrations/0330_social_referee.sql"), "utf8")
    .replace(/--.*$/gm, "").split(";").map((s) => s.trim()).filter(Boolean);
  for (const sql of migration) await db.prepare(sql).run();
  await db.batch([
    db.prepare("INSERT INTO teams VALUES ('t1', 'Volary', 'l1', '2026-11-20', 50000, 'u1', NULL, 'senior'), ('t2', 'Lhenice', 'l1', '2026-11-20', 50000, 'u2', NULL, 'senior')"),
    db.prepare("INSERT INTO matches VALUES ('m1', 'l1', 't1', 't2', 'simulated', 'ref-1', ?)").bind(recent),
    db.prepare("INSERT INTO season_calendar VALUES ('c20', 'l1', 3, 20, 'simulated'), ('c21', 'l1', 3, 21, 'scheduled'), ('c22', 'l1', 3, 22, 'scheduled')"),
    db.prepare("INSERT INTO team_fanbase VALUES ('t1', 100, NULL)"),
  ]);
});

afterAll(async () => {
  await miniflare.dispose();
});

const fixed = (postoj: "kritika" | "obhajoba" | "neutral", sila: number): RefereeStanceClassifier => async () => ({ postoj, sila });

describe("kritika sudího na Sockách: síto a pravidlo", () => {
  it.each([
    ["Ten sudí nás dneska vykradl, zloděj jeden", true],
    ["rozhodčí měl brýle na nose a stejně nic neviděl", true],
    ["Pískal to jak pro Lhenice", true],
    ["Gratuluju klukům k výhře, hospoda je naše!", false],
  ])("%s → o sudím: %s", (text, expected) => {
    expect(mentionsReferee(text)).toBe(expected);
  });

  it("pravidlo bez modelu: nadávka ostrá kritika, úplatek nejostřejší, uznání obhajoba", () => {
    expect(fallbackStance("sudí je zloděj")).toEqual({ postoj: "kritika", sila: 2 });
    expect(fallbackStance("sudí byl podplacenej, to je jasný")).toEqual({ postoj: "kritika", sila: 3 });
    expect(fallbackStance("sudí dobře odpískal, chyba byla na nás")).toEqual({ postoj: "obhajoba", sila: 1 });
  });
});

describe("kritika sudího na Sockách v databázi", () => {
  it("dopad podle tabulky rozhovoru: paměť sudího, kabina, fanoušci; jeden příspěvek = jedny dopady", async () => {
    const r1 = await applySocialRefereeEffects(db, fixed("kritika", 2), { postKey: "post:a", authorTeamId: "t1", text: "Sudí nás vykradl" });
    const r2 = await applySocialRefereeEffects(db, fixed("kritika", 2), { postKey: "post:a", authorTeamId: "t1", text: "Sudí nás vykradl" });
    expect(r1?.refereeId).toBe("ref-1");
    expect(r1?.benchBan).toBe(false);
    expect(r2).toBeNull();
    const rel = await db.prepare("SELECT sentiment FROM referee_team_relations WHERE referee_id = 'ref-1' AND team_id = 't1'").first<{ sentiment: number }>();
    expect(rel?.sentiment).toBe(effectsFor("kritika", 2, false).refereeRespect);
    const fans = await db.prepare("SELECT casual_count FROM team_fanbase WHERE team_id = 't1'").first<{ casual_count: number }>();
    expect(fans?.casual_count).toBe(100 + effectsFor("kritika", 2, false).fans);
  });

  it("text bez sudího ani neutrální postoj nic nedělá", async () => {
    expect(await applySocialRefereeEffects(db, fixed("kritika", 3), { postKey: "post:b", authorTeamId: "t1", text: "Kluci, v neděli hospoda" })).toBeNull();
    expect(await applySocialRefereeEffects(db, fixed("neutral", 0), { postKey: "post:c", authorTeamId: "t1", text: "Sudí přijel včas" })).toBeNull();
  });

  it("opakovaná ostrá kritika do 14 dní: distanc na příští kolo (21), ne na další, a pokuta jen jednou", async () => {
    const fineCount = () => db.prepare("SELECT COUNT(*) AS n, COALESCE(SUM(amount), 0) AS s FROM transactions WHERE team_id = 't1' AND type = 'disciplinary_fine'").first<{ n: number; s: number }>();
    const before = await fineCount();
    const r = await applySocialRefereeEffects(db, fixed("kritika", 3), { postKey: "post:d", authorTeamId: "t1", text: "Sudí je podplacenej zmetek" });
    expect(r?.benchBan).toBe(true);
    expect(r!.fine).toBeGreaterThan(0);
    expect(await hasBenchBan(db, "t1", 21, 3)).toBe(true);
    expect(await hasBenchBan(db, "t1", 22, 3)).toBe(false);
    expect(await hasBenchBan(db, "t1", 21, 4)).toBe(false);
    expect(await hasBenchBan(db, "t2", 21, 3)).toBe(false);
    // Pokutu strhla sankce s distancem, samostatná pokuta se k ní nepřidá.
    const after = await fineCount();
    expect(after!.n - before!.n).toBe(1);
    expect(after!.s - before!.s).toBe(-r!.fine);
    const sms = await db.prepare("SELECT body FROM messages ORDER BY rowid DESC LIMIT 1").first<{ body: string }>();
    expect(sms?.body).toContain("distanc na lavičce na příští kolo");
    expect(sms?.body).not.toMatch(/[—–]/);
  });

  it("obhajoba sudího zlepší jeho paměť", async () => {
    await applySocialRefereeEffects(db, fixed("obhajoba", 2), { postKey: "post:e", authorTeamId: "t2", text: "Sudí to odpískal férově" });
    const rel = await db.prepare("SELECT sentiment FROM referee_team_relations WHERE referee_id = 'ref-1' AND team_id = 't2'").first<{ sentiment: number }>();
    expect(rel?.sentiment).toBe(effectsFor("obhajoba", 2, false).refereeRespect);
    // Druhá pochvala téhož sudího do týdne už nic nepřidá.
    expect(await applySocialRefereeEffects(db, fixed("obhajoba", 3), { postKey: "comment:f", authorTeamId: "t2", text: "Sudí byl výborný" })).toBeNull();
    const again = await db.prepare("SELECT sentiment FROM referee_team_relations WHERE referee_id = 'ref-1' AND team_id = 't2'").first<{ sentiment: number }>();
    expect(again?.sentiment).toBe(rel?.sentiment);
  });
});
