/**
 * Systémová SMS do herního telefonu týmu (find-or-create konverzace podle role).
 * Sdílená verze helperu z routes/game.ts (sendPhoneSMS) pro použití mimo routy.
 */
import { logger } from "./logger";

export async function sendSystemSMS(db: D1Database, teamId: string, senderName: string, roleTitle: string, body: string): Promise<void> {
  let convId = await db.prepare("SELECT id FROM conversations WHERE team_id = ? AND type = 'system' AND title = ?")
    .bind(teamId, roleTitle).first<{ id: string }>().then((r) => r?.id).catch((e) => { logger.warn({ module: "sms" }, "find conversation", e); return null; });
  if (!convId) {
    convId = crypto.randomUUID();
    await db.prepare("INSERT INTO conversations (id, team_id, type, title, pinned, unread_count, last_message_text, last_message_at, created_at) VALUES (?, ?, 'system', ?, 0, 0, '', strftime('%Y-%m-%dT%H:%M:%SZ', 'now'), strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))")
      .bind(convId, teamId, roleTitle).run().catch((e) => logger.warn({ module: "sms" }, "create conversation", e));
  }
  await db.prepare("INSERT INTO messages (id, conversation_id, sender_type, sender_name, body, sent_at) VALUES (?, ?, 'system', ?, ?, strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))")
    .bind(crypto.randomUUID(), convId, senderName, body).run().catch((e) => logger.warn({ module: "sms" }, "insert message", e));
  await db.prepare("UPDATE conversations SET unread_count = unread_count + 1, last_message_text = ?, last_message_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now') WHERE id = ?")
    .bind(body.slice(0, 100), convId).run().catch((e) => logger.warn({ module: "sms" }, "update conversation", e));
}
