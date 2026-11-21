/**
 * Společná D1 (Miniflare) pro testy vrstvy „kdo co ví“ (src/hearsay/).
 * Tabulky jen v rozsahu, který hearsay čte a zapisuje; migrace 0335 se načítá ze souboru.
 */
import { Miniflare } from "miniflare";
import { readFileSync } from "node:fs";

const SCHEMA = [
  "CREATE TABLE users (id TEXT PRIMARY KEY, last_activity_at TEXT)",
  "CREATE TABLE teams (id TEXT PRIMARY KEY, name TEXT, user_id TEXT, parent_team_id TEXT, team_type TEXT, game_date TEXT, captain_id TEXT)",
  `CREATE TABLE players (id TEXT PRIMARY KEY, team_id TEXT, first_name TEXT, last_name TEXT, nickname TEXT, avatar TEXT,
     nationality TEXT, age INTEGER, position TEXT, overall_rating INTEGER, personality TEXT, life_context TEXT,
     coach_relationship INTEGER, is_celebrity INTEGER DEFAULT 0, status TEXT, loan_from_team_id TEXT, occupation TEXT)`,
  "CREATE TABLE relationships (id TEXT PRIMARY KEY, player_a_id TEXT, player_b_id TEXT, type TEXT, strength INTEGER DEFAULT 50)",
  `CREATE TABLE conversations (id TEXT PRIMARY KEY, team_id TEXT, type TEXT, title TEXT, participant_id TEXT, participant_avatar TEXT,
     last_message_text TEXT, last_message_at TEXT, unread_count INTEGER DEFAULT 0, pinned INTEGER DEFAULT 0, created_at TEXT,
     ai_thread_active INTEGER DEFAULT 0, ai_thread_state TEXT, ai_thread_last_at TEXT)`,
  "CREATE TABLE messages (id TEXT PRIMARY KEY, conversation_id TEXT, sender_type TEXT, sender_id TEXT, sender_name TEXT, body TEXT, metadata TEXT, sent_at TEXT, read INTEGER DEFAULT 0)",
  `CREATE TABLE coach_relation_log (id INTEGER PRIMARY KEY AUTOINCREMENT, player_id TEXT, team_id TEXT, old_value INTEGER, new_value INTEGER,
     delta INTEGER, raw_delta INTEGER, source TEXT, description TEXT, reference_id TEXT, game_date TEXT, created_at TEXT)`,
  `CREATE TABLE injuries (id TEXT PRIMARY KEY, player_id TEXT, team_id TEXT, type TEXT, description TEXT, severity TEXT,
     days_remaining INTEGER, days_total INTEGER, created_at TEXT, osobni_volno INTEGER DEFAULT 0, is_fake INTEGER DEFAULT 0)`,
  "CREATE TABLE pub_sessions (id INTEGER PRIMARY KEY AUTOINCREMENT, team_id TEXT, game_date TEXT, attendees TEXT, incidents TEXT, created_at TEXT)",
];

export const HEARSAY_TABLES = [
  "users", "teams", "players", "relationships", "conversations", "messages", "coach_relation_log", "pub_sessions", "injuries",
  "squad_hearsay", "squad_hearsay_knowledge",
] as const;

/** Nová Miniflare D1 se schématem pro hearsay. Volající ji v `afterAll` uvolní (`miniflare.dispose()`). */
export async function createHearsayDb(): Promise<{ miniflare: Miniflare; db: D1Database }> {
  const miniflare = new Miniflare({
    modules: true,
    script: "export default { fetch() { return new Response('ok'); } }",
    d1Databases: ["DB"],
  });
  const db = await miniflare.getD1Database("DB") as unknown as D1Database;
  for (const sql of SCHEMA) await db.prepare(sql).run();
  const migration = readFileSync(new URL("../../migrations/0335_squad_hearsay.sql", import.meta.url), "utf8")
    .replace(/--[^\n]*/g, "").replace(/\n/g, " ");
  await db.exec(migration);
  return { miniflare, db };
}

/** Vyprázdní všechny tabulky mezi testy. */
export async function resetHearsayDb(db: D1Database): Promise<void> {
  for (const t of HEARSAY_TABLES) await db.prepare(`DELETE FROM ${t}`).run();
}
