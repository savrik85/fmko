import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Miniflare } from "miniflare";
import { processDailyBodyDrift } from "./body-drift";

let miniflare: Miniflare;
let db: D1Database;

const TODAY = "2026-10-12"; // pondělí

async function weightOf(id: string): Promise<number> {
  const row = await db.prepare("SELECT json_extract(physical, '$.weight') AS w FROM players WHERE id = ?").bind(id).first<{ w: number }>();
  return row!.w;
}

beforeAll(async () => {
  miniflare = new Miniflare({
    modules: true,
    script: "export default { fetch() { return new Response('ok'); } }",
    d1Databases: ["DB"],
  });
  db = await miniflare.getD1Database("DB");
  for (const sql of [
    `CREATE TABLE teams (id TEXT PRIMARY KEY, user_id TEXT, team_type TEXT DEFAULT 'senior', parent_team_id TEXT)`,
    `CREATE TABLE players (id TEXT PRIMARY KEY, team_id TEXT, first_name TEXT, last_name TEXT, age INTEGER,
      physical TEXT, personality TEXT, life_context TEXT, status TEXT)`,
    `CREATE TABLE pub_sessions (id INTEGER PRIMARY KEY AUTOINCREMENT, team_id TEXT, game_date TEXT, attendees TEXT, incidents TEXT)`,
    `CREATE TABLE injuries (id TEXT PRIMARY KEY, player_id TEXT, team_id TEXT, days_remaining INTEGER, osobni_volno INTEGER DEFAULT 0)`,
    `CREATE TABLE weight_log (id INTEGER PRIMARY KEY AUTOINCREMENT, player_id TEXT NOT NULL, team_id TEXT NOT NULL,
      game_date TEXT NOT NULL, weight REAL NOT NULL, source TEXT NOT NULL, created_at TEXT DEFAULT (datetime('now')))`,
    `CREATE TABLE staff_members (id TEXT PRIMARY KEY, team_id TEXT, role TEXT)`,
    `CREATE TABLE conversations (id TEXT PRIMARY KEY, team_id TEXT, type TEXT, title TEXT, pinned INTEGER,
      unread_count INTEGER, last_message_text TEXT, last_message_at TEXT, created_at TEXT)`,
    `CREATE TABLE messages (id TEXT PRIMARY KEY, conversation_id TEXT, sender_type TEXT, sender_id TEXT,
      sender_name TEXT, body TEXT, metadata TEXT, sent_at TEXT)`,
  ]) await db.prepare(sql).run();

  const player = (id: string, physical: Record<string, unknown>, alcohol = 50) => db.prepare(
    "INSERT INTO players (id, team_id, first_name, last_name, age, physical, personality, life_context) VALUES (?, 't1', 'Jan', ?, 25, ?, ?, '{}')",
  ).bind(id, id, JSON.stringify(physical), JSON.stringify({ alcohol }));
  const natural = { height: 180, weight: 76.14, bodyType: "athletic" };
  await db.batch([
    db.prepare("INSERT INTO teams (id, user_id) VALUES ('t1', 'user-1')"),
    db.prepare("INSERT INTO staff_members (id, team_id, role) VALUES ('s1', 't1', 'kondicni_trener')"),
    player("drinker", natural, 80),
    player("runner", natural),
    player("injured", natural),
    player("no-height", { weight: 90 }),
    player("gainer", { height: 180, weight: 84, bodyType: "athletic" }),
    db.prepare("INSERT INTO pub_sessions (team_id, game_date, attendees, incidents) VALUES ('t1', ?, ?, '[]')")
      .bind(TODAY, JSON.stringify([{ playerId: "drinker" }, { playerId: "no-height" }])),
    db.prepare("INSERT INTO injuries (id, player_id, team_id, days_remaining) VALUES ('i1', 'injured', 't1', 5)"),
    db.prepare("INSERT INTO weight_log (player_id, team_id, game_date, weight, source) VALUES ('gainer', 't1', '2026-09-14', 80, 'weekly')"),
    db.prepare("INSERT INTO weight_log (player_id, team_id, game_date, weight, source) VALUES ('gainer', 't1', '2025-01-01', 70, 'weekly')"),
  ]);
});

afterAll(async () => {
  await miniflare.dispose();
});

describe("processDailyBodyDrift", () => {
  it("hospoda přidá, kondiční trénink ubere, zranění přidá; bez výšky jen hospoda", async () => {
    const r = await processDailyBodyDrift(db, {
      teamIds: ["t1"], trainedToday: new Map([["runner", "conditioning"]]), gameDate: TODAY, isMonday: true,
    });
    expect(await weightOf("drinker")).toBeCloseTo(76.24, 2);
    expect(await weightOf("runner")).toBeCloseTo(76.07, 2);
    expect(await weightOf("injured")).toBeCloseTo(76.17, 2);
    expect(await weightOf("no-height")).toBeCloseTo(90.08, 2);
    expect(r.updated).toBe(5);
  });

  it("pondělní záznam vznikne jednou, staré záznamy nad rok zmizí", async () => {
    const weekly = await db.prepare("SELECT COUNT(*) AS n FROM weight_log WHERE game_date = ? AND source = 'weekly'").bind(TODAY).first<{ n: number }>();
    expect(weekly!.n).toBe(5);
    const old = await db.prepare("SELECT COUNT(*) AS n FROM weight_log WHERE game_date = '2025-01-01'").first<{ n: number }>();
    expect(old!.n).toBe(0);
  });

  it("kondiční trenér napíše o hráči, který za 4 týdny přibral 3 kg a víc", async () => {
    const msgs = await db.prepare("SELECT sender_name, body FROM messages").all<{ sender_name: string; body: string }>();
    expect(msgs.results).toHaveLength(1);
    expect(msgs.results[0].sender_name).toBe("Kondiční trenér");
    expect(msgs.results[0].body).toContain("gainer");
    const lc = await db.prepare("SELECT life_context FROM players WHERE id = 'gainer'").first<{ life_context: string }>();
    expect(JSON.parse(lc!.life_context).weightSmsAt).toBe(TODAY);
  });

  it("druhý běh téhož dne nezaloží druhý záznam ani druhou SMS", async () => {
    await processDailyBodyDrift(db, { teamIds: ["t1"], trainedToday: new Map(), gameDate: TODAY, isMonday: true });
    const weekly = await db.prepare("SELECT COUNT(*) AS n FROM weight_log WHERE game_date = ? AND source = 'weekly'").bind(TODAY).first<{ n: number }>();
    expect(weekly!.n).toBe(5);
    const msgs = await db.prepare("SELECT COUNT(*) AS n FROM messages").first<{ n: number }>();
    expect(msgs!.n).toBe(1);
  });
});
