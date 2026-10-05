import { logger } from "../lib/logger";

/** Systémová zpráva týmu od zaměstnance (vzor roleSenders v index.ts). */
export async function sendStaffSystemMessage(
  db: D1Database, teamId: string, senderName: string, convTitle: string, body: string,
): Promise<void> {
  let convId = await db.prepare("SELECT id FROM conversations WHERE team_id = ? AND type = 'system' AND title = ?")
    .bind(teamId, convTitle).first<{ id: string }>().then((r) => r?.id)
    .catch((e) => { logger.warn({ module: "staff-messages" }, "msg find conversation", e); return null; });
  if (!convId) {
    convId = crypto.randomUUID();
    await db.prepare("INSERT INTO conversations (id, team_id, type, title, pinned, unread_count, last_message_text, last_message_at, created_at) VALUES (?, ?, 'system', ?, 0, 0, '', strftime('%Y-%m-%dT%H:%M:%SZ', 'now'), strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))")
      .bind(convId, teamId, convTitle).run().catch((e) => logger.warn({ module: "staff-messages" }, "msg create conversation", e));
  }
  await db.prepare("INSERT INTO messages (id, conversation_id, sender_type, sender_name, body, metadata, sent_at) VALUES (?, ?, 'system', ?, ?, ?, strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))")
    .bind(crypto.randomUUID(), convId, senderName, body, JSON.stringify({ type: "staff" }))
    .run().catch((e) => logger.warn({ module: "staff-messages" }, "msg insert", e));
  await db.prepare("UPDATE conversations SET unread_count = unread_count + 1, last_message_text = ?, last_message_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now') WHERE id = ?")
    .bind(body, convId).run().catch((e) => logger.warn({ module: "staff-messages" }, "msg update conversation", e));
}
