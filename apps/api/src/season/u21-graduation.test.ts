import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { Miniflare } from "miniflare";
import { createRng } from "../generators/rng";
import { dorostovyCyklus, oznamDorostovyCyklus, MAX_KADR_ACKA } from "./u21-lifecycle";

let miniflare: Miniflare;
let db: D1Database;

beforeAll(async () => {
  miniflare = new Miniflare({ modules: true, script: "export default { fetch() { return new Response('ok'); } }", d1Databases: ["DB"] });
  db = await miniflare.getD1Database("DB");
});
afterAll(async () => { await miniflare.dispose(); });

const skillsMax = (cap: number) => JSON.stringify(Object.fromEntries(
  ["speed", "technique", "shooting", "passing", "heading", "defense", "vision", "creativity", "setPieces", "stamina", "strength", "goalkeeping", "experience"]
    .map((k) => [k, { maxPotential: cap }]),
));

beforeEach(async () => {
  for (const t of ["messages", "conversations", "players", "teams"]) await db.prepare(`DROP TABLE IF EXISTS ${t}`).run();
  await db.prepare("CREATE TABLE teams (id TEXT PRIMARY KEY, parent_team_id TEXT, league_id TEXT, team_type TEXT, user_id TEXT, village_id TEXT)").run();
  await db.prepare(
    `CREATE TABLE players (id TEXT PRIMARY KEY, team_id TEXT, first_name TEXT, last_name TEXT, age INTEGER, position TEXT,
     overall_rating INTEGER, skills_max TEXT, hidden_talent INTEGER, loan_from_team_id TEXT, status TEXT)`,
  ).run();
  await db.prepare("CREATE TABLE conversations (id TEXT PRIMARY KEY, team_id TEXT, type TEXT, title TEXT, pinned INTEGER, unread_count INTEGER, last_message_text TEXT, last_message_at TEXT, created_at TEXT)").run();
  await db.prepare("CREATE TABLE messages (id TEXT PRIMARY KEY, conversation_id TEXT, sender_type TEXT, sender_name TEXT, body TEXT, sent_at TEXT)").run();
  await db.prepare(
    "INSERT INTO teams VALUES ('H', NULL, 'L', 'senior', 'u1', NULL), ('H21', 'H', 'L21', 'u21', 'u1', NULL), ('A', NULL, 'L', 'senior', 'ai', NULL), ('A21', 'A', 'L21', 'u21', 'ai', NULL)",
  ).run();
  // Oba áčka mají 29 hráčů, tedy místo jen pro jednoho.
  for (const club of ["H", "A"]) {
    for (let i = 0; i < 29; i++) {
      await db.prepare("INSERT INTO players (id, team_id, first_name, last_name, age, position, overall_rating) VALUES (?, ?, 'X', 'Y', 25, 'MID', 50)")
        .bind(`${club}-${i}`, club).run();
    }
    // Tři přerostlí: lepší teď, ale klenot má větší potenciál.
    await db.prepare(
      `INSERT INTO players (id, team_id, first_name, last_name, age, position, overall_rating, skills_max, hidden_talent) VALUES
       (?, ?, 'Jakub', 'Lepší', 22, 'MID', 48, ?, 20), (?, ?, 'Jakub', 'Klenot', 22, 'FWD', 42, ?, 95), (?, ?, 'Filip', 'Slabý', 22, 'FWD', 37, ?, 10)`,
    ).bind(`${club}-a`, `${club}21`, skillsMax(52), `${club}-b`, `${club}21`, skillsMax(70), `${club}-c`, `${club}21`, skillsMax(45)).run();
  }
});

describe("odchod z dorostu", () => {
  it("lidský klub: všichni do áčka i přes strop, manažer dostane upozornění", async () => {
    const v = await dorostovyCyklus(db, "H21", createRng(1));
    expect(v.povyseni.map((p) => p.jmeno).sort()).toEqual(["Filip Slabý", "Jakub Klenot", "Jakub Lepší"]);
    expect(v.propusteni).toHaveLength(0);
    expect(v.seniorSquadSize).toBe(32);
    await oznamDorostovyCyklus(db, "H21", v);
    const sms = await db.prepare("SELECT body FROM messages").first<{ body: string }>();
    expect(sms?.body).toContain("Do áčka jdou");
    expect(sms?.body).toContain(`v áčku je teď 32 hráčů, nad ${MAX_KADR_ACKA} nikoho nekoupíš`);
  });

  it("AI klub: do stropu 30, místo dostane největší potenciál", async () => {
    const v = await dorostovyCyklus(db, "A21", createRng(2));
    expect(v.povyseni.map((p) => p.jmeno)).toEqual(["Jakub Klenot"]);
    expect(v.seniorSquadSize).toBeUndefined();
  });

  it("AI klub s místem v áčku: všichni přerostlí jdou do áčka stejně jako u člověka", async () => {
    await db.prepare("DELETE FROM players WHERE id IN ('A-0', 'A-1', 'A-2')").run();
    const v = await dorostovyCyklus(db, "A21", createRng(3));
    expect(v.povyseni.map((p) => p.jmeno).sort()).toEqual(["Filip Slabý", "Jakub Klenot", "Jakub Lepší"]);
    expect(v.propusteni).toHaveLength(0);
  });
});
