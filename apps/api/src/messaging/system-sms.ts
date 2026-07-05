/**
 * Sdílené SMS helpery pro moduly mimo routes/game.ts (crony, transfers).
 * Stejné chování jako sendPhoneSMS v game.ts — systémová konverzace dle role.
 */

import { logger } from "../lib/logger";

/** Pošle zprávu do systémové konverzace týmu (např. "Sportovní ředitel", "Fyzioterapeut"). */
export async function sendSystemSMS(
  db: D1Database,
  teamId: string,
  roleTitle: string,
  body: string,
): Promise<void> {
  let convId = await db.prepare("SELECT id FROM conversations WHERE team_id = ? AND type = 'system' AND title = ?")
    .bind(teamId, roleTitle).first<{ id: string }>().then((r) => r?.id)
    .catch((e) => { logger.warn({ module: "system-sms" }, "find system conv", e); return null; });
  if (!convId) {
    convId = crypto.randomUUID();
    await db.prepare("INSERT INTO conversations (id, team_id, type, title, pinned, unread_count, last_message_text, last_message_at, created_at) VALUES (?, ?, 'system', ?, 0, 0, '', strftime('%Y-%m-%dT%H:%M:%SZ', 'now'), strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))")
      .bind(convId, teamId, roleTitle).run().catch((e) => logger.warn({ module: "system-sms" }, "create system conv", e));
  }
  await db.prepare("INSERT INTO messages (id, conversation_id, sender_type, sender_name, body, sent_at) VALUES (?, ?, 'system', ?, ?, strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))")
    .bind(crypto.randomUUID(), convId, roleTitle, body).run().catch((e) => logger.warn({ module: "system-sms" }, "insert system msg", e));
  await db.prepare("UPDATE conversations SET unread_count = unread_count + 1, last_message_text = ?, last_message_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now') WHERE id = ?")
    .bind(body.slice(0, 100), convId).run().catch((e) => logger.warn({ module: "system-sms" }, "update system conv", e));
}

/** Pošle zprávu OD HRÁČE do jeho 1:1 konverzace s trenérem (typ 'player'). */
export async function sendPlayerSMS(
  db: D1Database,
  teamId: string,
  player: { id: string; firstName: string; lastName: string; nickname?: string | null; avatar?: string | null },
  body: string,
): Promise<void> {
  const { getOrCreatePlayerConversation } = await import("./ai-player-spawn");
  const convId = await getOrCreatePlayerConversation(db, teamId, player);
  await db.prepare("INSERT INTO messages (id, conversation_id, sender_type, sender_id, sender_name, body, sent_at) VALUES (?, ?, 'player', ?, ?, ?, strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))")
    .bind(crypto.randomUUID(), convId, player.id, `${player.firstName} ${player.lastName}`, body).run()
    .catch((e) => logger.warn({ module: "system-sms" }, "insert player msg", e));
  await db.prepare("UPDATE conversations SET unread_count = unread_count + 1, last_message_text = ?, last_message_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now') WHERE id = ?")
    .bind(body.slice(0, 100), convId).run().catch((e) => logger.warn({ module: "system-sms" }, "update player conv", e));
}
