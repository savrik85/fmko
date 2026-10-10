import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Miniflare } from "miniflare";
import type { Bindings } from "../index";
import { squadAnalysisRouter } from "./squad-analysis";

let miniflare: Miniflare;
let env: Bindings;

const SLOTS = ["GK", "DEF", "DEF", "DEF", "DEF", "MID", "MID", "MID", "MID", "FWD", "FWD", "MID", "DEF"];

function skills(level: number, gk: boolean) {
  return {
    speed: level, technique: level, shooting: level, passing: level, heading: level, defense: level,
    goalkeeping: gk ? level : 10, vision: level, creativity: level, setPieces: level, experience: level,
  };
}

beforeAll(async () => {
  miniflare = new Miniflare({
    modules: true,
    script: "export default { fetch() { return new Response('ok'); } }",
    d1Databases: ["DB"],
    kvNamespaces: ["SESSION_KV", "CACHE_KV"],
  });
  const db = await miniflare.getD1Database("DB");
  const sessionKv = await miniflare.getKVNamespace("SESSION_KV") as unknown as KVNamespace;

  for (const sql of [
    `CREATE TABLE teams (id TEXT PRIMARY KEY, user_id TEXT NOT NULL, name TEXT NOT NULL, league_id TEXT,
      team_type TEXT DEFAULT 'senior', parent_team_id TEXT, game_date TEXT, formation_familiarity TEXT DEFAULT '{}')`,
    `CREATE TABLE staff_members (id TEXT PRIMARY KEY, team_id TEXT, role TEXT, first_name TEXT, last_name TEXT,
      gender TEXT DEFAULT 'm', avatar TEXT, coaching INTEGER, medicine INTEGER, maintenance INTEGER, judgement INTEGER,
      communication INTEGER, work_rate INTEGER, charm INTEGER)`,
    `CREATE TABLE players (id TEXT PRIMARY KEY, team_id TEXT, first_name TEXT, last_name TEXT, nickname TEXT,
      age INTEGER, position TEXT, overall_rating INTEGER, skills TEXT, physical TEXT, personality TEXT,
      life_context TEXT, status TEXT)`,
    `CREATE TABLE injuries (id TEXT PRIMARY KEY, player_id TEXT, team_id TEXT, days_remaining INTEGER, osobni_volno INTEGER DEFAULT 0)`,
    `CREATE TABLE lineups (id TEXT PRIMARY KEY, team_id TEXT NOT NULL, calendar_id TEXT, formation TEXT DEFAULT '4-4-2',
      tactic TEXT DEFAULT 'balanced', players_data TEXT DEFAULT '[]', submitted_at TEXT, is_auto INTEGER DEFAULT 0)`,
  ]) await db.prepare(sql).run();

  const statements = [
    db.prepare("INSERT INTO teams (id, user_id, name, league_id, game_date, formation_familiarity) VALUES ('my-a', 'user-me', 'Můj klub', 'lg', '2026-10-08T16:00:00.000Z', '{\"4-4-2\":70}')"),
    db.prepare("INSERT INTO teams (id, user_id, name, league_id, team_type, parent_team_id) VALUES ('my-u21', 'user-me', 'Můj klub U21', 'lg21', 'u21', 'my-a')"),
    db.prepare("INSERT INTO teams (id, user_id, name, league_id) VALUES ('rival-a', 'user-rival', 'Soupeř A', 'lg')"),
    db.prepare("INSERT INTO teams (id, user_id, name, league_id) VALUES ('rival-b', 'user-rival2', 'Soupeř B', 'lg')"),
    db.prepare("INSERT INTO teams (id, user_id, name, league_id) VALUES ('lonely', 'user-lonely', 'Bez ligy', NULL)"),
    db.prepare(`INSERT INTO staff_members (id, team_id, role, first_name, last_name, gender, avatar, coaching, medicine, maintenance, judgement, communication, work_rate, charm)
      VALUES ('asst', 'my-a', 'asistent', 'Marek', 'Mikeš', 'm', '{}', 19, 5, 5, 8, 15, 8, 5)`),
    db.prepare(`INSERT INTO staff_members (id, team_id, role, first_name, last_name, gender, avatar, coaching, medicine, maintenance, judgement, communication, work_rate, charm)
      VALUES ('lonely-asst', 'lonely', 'asistent', 'Jana', 'Nová', 'f', '{}', 8, 5, 5, 5, 6, 5, 5)`),
  ];
  const addSquad = (teamId: string, level: number, count = SLOTS.length) => {
    SLOTS.slice(0, count).forEach((slot, i) => {
      statements.push(db.prepare(
        `INSERT INTO players (id, team_id, first_name, last_name, age, position, overall_rating, skills, physical, personality, life_context)
         VALUES (?, ?, 'Jan', ?, 25, ?, ?, ?, ?, '{}', ?)`,
      ).bind(`${teamId}-${i}`, teamId, `Hráč${i}`, slot, level + i, JSON.stringify(skills(level, slot === "GK")),
        JSON.stringify({ stamina: level, strength: level, height: 180, weight: 76 }), JSON.stringify({ condition: 95, morale: 60 })));
    });
  };
  addSquad("my-a", 45);
  // Hodnoty mimo pětky: rozbor je musí vidět zaokrouhlené jako profil cizího hráče (35 a 50).
  addSquad("rival-a", 37);
  addSquad("rival-b", 52);
  addSquad("my-u21", 30, 8);
  addSquad("lonely", 40);
  statements.push(db.prepare("INSERT INTO injuries (id, player_id, team_id, days_remaining) VALUES ('inj', 'my-a-1', 'my-a', 5)"));
  statements.push(db.prepare(
    "INSERT INTO lineups (id, team_id, calendar_id, formation, players_data, submitted_at, is_auto) VALUES ('l1', 'my-a', 'c1', '4-4-2', ?, '2026-10-08T10:00:00Z', 0)",
  ).bind(JSON.stringify(SLOTS.slice(0, 11).map((slot, i) => ({ playerId: `my-a-${i}`, matchPosition: i === 10 ? "MID" : slot })))));
  await db.batch(statements);

  for (const [token, userId] of [["token-me", "user-me"], ["token-lonely", "user-lonely"]]) {
    await sessionKv.put(`session:${token}`, JSON.stringify({ userId, email: `${userId}@test.local`, teamId: "x", createdAt: "2026-10-08T10:00:00.000Z" }));
  }

  env = { DB: db, SESSION_KV: sessionKv } as unknown as Bindings;
});

afterAll(async () => {
  await miniflare.dispose();
});

async function call(path: string, token: string | null = "token-me") {
  const headers = new Headers(token ? { Authorization: `Bearer ${token}` } : {});
  return squadAnalysisRouter.fetch(new Request(`http://test.local/teams/${path}/squad-analysis`, { headers }), env);
}

describe("GET /teams/:teamId/squad-analysis", () => {
  it("bez přihlášení 401, cizí tým 403", async () => {
    expect((await call("my-a", null)).status).toBe(401);
    expect((await call("rival-a")).status).toBe(403);
  });

  it("vlastní tým s asistentem: rozbor celého kádru podle nejlepší jedenáctky, ne podle uložené sestavy", async () => {
    const response = await call("my-a");
    expect(response.status).toBe(200);
    const r = await response.json() as any;
    expect(r.status).toBe("ready");
    expect(r.assistant).toMatchObject({ name: "Marek Mikeš", female: false, level: "excellent" });
    // Rozestavění z uložené sestavy, hráči ne: kdo hraje, se mění zápas od zápasu.
    expect(r.basis).toEqual({ source: "best11", formation: "4-4-2" });
    expect(r.lines.map((l: { line: string }) => l.line)).toEqual(["GK", "DEF", "MID", "FWD"]);
    expect(r.style.tactics).toHaveLength(6);
    // Zraněný z uložené sestavy do nejlepší jedenáctky nepatří, varování o sestavě nejsou.
    const starters = r.lineTables.flatMap((t: { players: Array<{ id: string; starter: boolean }> }) => t.players.filter((p) => p.starter).map((p) => p.id));
    expect(starters).toHaveLength(11);
    expect(starters).not.toContain("my-a-1");
    const kinds = r.warnings.map((w: { kind: string }) => w.kind);
    expect(kinds).not.toContain("injured");
    expect(kinds).not.toContain("outOfPosition");
    // Soupeře asistent zná jen jako manažer: vlastnosti na pětky (35 a 50), průměr 42,5,
    // ne přesných 44,5. Výborný asistent k tomu nic nepřidává.
    const fwd = r.lineTables.find((t: { line: string }) => t.line === "FWD");
    expect(fwd.attributes.find((a: { skill: string }) => a.skill === "shooting").league).toBe(43);
    // Skutečná čísla modelu (hodnocení, vlivy) ven nejdou.
    expect(JSON.stringify(r)).not.toMatch(/"effect"|"gain"|"quality"/);
  });

  it("U21 radí asistent áčka; s osmi hráči na rozbor nestačí", async () => {
    const r = await (await call("my-u21")).json() as any;
    expect(r.status).toBe("shortSquad");
    expect(r.assistant.name).toBe("Marek Mikeš");
  });

  it("bez asistenta je záložka zamčená", async () => {
    const db = env.DB;
    await db.prepare("UPDATE staff_members SET role = 'skaut' WHERE id = 'asst'").run();
    try {
      const r = await (await call("my-a")).json() as any;
      expect(r).toEqual({ status: "locked" });
    } finally {
      await db.prepare("UPDATE staff_members SET role = 'asistent' WHERE id = 'asst'").run();
    }
  });

  it("tým bez ligy: není s kým srovnávat", async () => {
    const r = await (await call("lonely", "token-lonely")).json() as any;
    expect(r.status).toBe("noLeague");
    expect(r.assistant.female).toBe(true);
  });
});
