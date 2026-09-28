import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Miniflare } from "miniflare";
import { reactToLeftOut } from "./left-out";

let miniflare: Miniflare;
let db: D1Database;

const LIFE = JSON.stringify({ morale: 60 });
const PERS = JSON.stringify({ temper: 90, discipline: 20 });

beforeAll(async () => {
  miniflare = new Miniflare({
    modules: true,
    script: "export default { fetch() { return new Response('ok'); } }",
    d1Databases: ["DB"],
  });
  db = await miniflare.getD1Database("DB");

  await db.exec("CREATE TABLE teams (id TEXT PRIMARY KEY, user_id TEXT, parent_team_id TEXT, team_type TEXT, game_date TEXT)");
  await db.exec("CREATE TABLE managers (team_id TEXT PRIMARY KEY, motivation INTEGER)");
  await db.exec("CREATE TABLE players (id TEXT PRIMARY KEY, team_id TEXT, first_name TEXT, last_name TEXT, nickname TEXT, avatar TEXT, position TEXT, overall_rating INTEGER, personality TEXT, life_context TEXT, status TEXT, coach_relationship INTEGER DEFAULT 50)");
  await db.exec("CREATE TABLE coach_relation_log (id INTEGER PRIMARY KEY AUTOINCREMENT, player_id TEXT, team_id TEXT, old_value INTEGER, new_value INTEGER, delta INTEGER, raw_delta INTEGER, source TEXT, description TEXT, reference_id TEXT, game_date TEXT)");
  await db.exec("CREATE TABLE conversations (id TEXT PRIMARY KEY, team_id TEXT, type TEXT, title TEXT, participant_id TEXT, participant_avatar TEXT, last_message_at TEXT, last_message_text TEXT, unread_count INTEGER DEFAULT 0, created_at TEXT)");
  await db.exec("CREATE TABLE messages (id TEXT PRIMARY KEY, conversation_id TEXT, sender_type TEXT, sender_id TEXT, sender_name TEXT, body TEXT, metadata TEXT, sent_at TEXT)");

  const team = (id: string, type: string, parent: string | null) =>
    db.prepare("INSERT INTO teams VALUES (?, 'user-1', ?, ?, '2026-09-28')").bind(id, parent, type);
  const player = (id: string, teamId: string, last: string, rating: number) =>
    db.prepare("INSERT INTO players (id, team_id, first_name, last_name, position, overall_rating, personality, life_context, status) VALUES (?, ?, 'Jan', ?, 'MID', ?, ?, ?, 'active')")
      .bind(id, teamId, last, rating, PERS, LIFE);
  await db.batch([
    team("a", "senior", null),
    team("u21", "u21", "a"),
    db.prepare("INSERT INTO managers VALUES ('a', 40)"),
    player("a-out", "a", "Doma", 60),
    player("a-bench", "a", "Lavička", 40),
    player("u-out", "u21", "Mladý", 30),
    player("u-bench", "u21", "Náhradník", 20),
  ]);
});

afterAll(async () => {
  await miniflare.dispose();
});

async function lifeOf(id: string): Promise<Record<string, unknown>> {
  const row = await db.prepare("SELECT life_context FROM players WHERE id = ?").bind(id).first<{ life_context: string }>();
  return JSON.parse(row!.life_context);
}

describe("reactToLeftOut", () => {
  it("U21 hráč mimo zápas se nezlobí, sestavu mu skládal automat", async () => {
    await reactToLeftOut(db, "u21", "match-1", { leftOutIds: ["u-out"], benchIds: ["u-bench"], matchSquadIds: ["u-bench"] });
    const life = await lifeOf("u-out");
    expect(life.morale).toBe(60);
    expect(life.leftOutMatch).toBeUndefined();
    const sms = await db.prepare("SELECT COUNT(*) AS n FROM messages").first<{ n: number }>();
    expect(sms!.n).toBe(0);
  });

  it("hráč áčka mimo zápas to nese nelibě", async () => {
    await reactToLeftOut(db, "a", "match-2", { leftOutIds: ["a-out"], benchIds: ["a-bench"], matchSquadIds: ["a-bench"] });
    const life = await lifeOf("a-out");
    expect(life.morale).toBeLessThan(60);
    expect(life.leftOutMatch).toBe("match-2");
  });
});
