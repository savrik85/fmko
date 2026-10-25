/**
 * Systémová SMS do telefonu klubu (konverzace podle role, např. „Sportovní ředitel").
 *
 * Vytaženo z `routes/game.ts`, aby ji routy i služby (přestupy pro lidi i AI trenéra)
 * volaly stejně. Na rozdíl od `sendSystemSMS` nezapisuje metadata zprávy.
 */

import { logger } from "../lib/logger";

/** Send a system SMS to a team's phone (find-or-create conversation by role title). */
export async function sendPhoneSMS(db: D1Database, teamId: string, senderName: string, roleTitle: string, body: string) {
  let convId = await db.prepare("SELECT id FROM conversations WHERE team_id = ? AND type = 'system' AND title = ?")
    .bind(teamId, roleTitle).first<{ id: string }>().then((r) => r?.id).catch((e) => { logger.warn({ module: "game" }, "db op failed", e); return null; });
  if (!convId) {
    convId = crypto.randomUUID();
    await db.prepare("INSERT INTO conversations (id, team_id, type, title, pinned, unread_count, last_message_text, last_message_at, created_at) VALUES (?, ?, 'system', ?, 0, 0, '', strftime('%Y-%m-%dT%H:%M:%SZ', 'now'), strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))")
      .bind(convId, teamId, roleTitle).run().catch((e) => logger.warn({ module: "game" }, "db op failed", e));
  }
  await db.prepare("INSERT INTO messages (id, conversation_id, sender_type, sender_name, body, sent_at) VALUES (?, ?, 'system', ?, ?, strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))")
    .bind(crypto.randomUUID(), convId, senderName, body).run().catch((e) => logger.warn({ module: "game" }, "db op failed", e));
  await db.prepare("UPDATE conversations SET unread_count = unread_count + 1, last_message_text = ?, last_message_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now') WHERE id = ?")
    .bind(body.slice(0, 100), convId).run().catch((e) => logger.warn({ module: "game" }, "db op failed", e));
}
