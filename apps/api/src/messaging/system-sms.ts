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
  /** Data zprávy pro telefon, např. `{ type: "incident", incidentId }` pro tlačítko „Otevřít incident". */
  metadata?: Record<string, unknown>,
): Promise<void> {
  let convId = await db.prepare("SELECT id FROM conversations WHERE team_id = ? AND type = 'system' AND title = ?")
    .bind(teamId, roleTitle).first<{ id: string }>().then((r) => r?.id)
    .catch((e) => { logger.warn({ module: "system-sms" }, "find system conv", e); return null; });
  if (!convId) {
    convId = crypto.randomUUID();
    await db.prepare("INSERT INTO conversations (id, team_id, type, title, pinned, unread_count, last_message_text, last_message_at, created_at) VALUES (?, ?, 'system', ?, 0, 0, '', strftime('%Y-%m-%dT%H:%M:%SZ', 'now'), strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))")
      .bind(convId, teamId, roleTitle).run().catch((e) => logger.warn({ module: "system-sms" }, "create system conv", e));
  }
  await db.prepare("INSERT INTO messages (id, conversation_id, sender_type, sender_name, body, metadata, sent_at) VALUES (?, ?, 'system', ?, ?, ?, strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))")
    .bind(crypto.randomUUID(), convId, roleTitle, body, metadata ? JSON.stringify(metadata) : null).run().catch((e) => logger.warn({ module: "system-sms" }, "insert system msg", e));
  await db.prepare("UPDATE conversations SET unread_count = unread_count + 1, last_message_text = ?, last_message_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now') WHERE id = ?")
    .bind(body.slice(0, 100), convId).run().catch((e) => logger.warn({ module: "system-sms" }, "update system conv", e));
}

/** Pošle zprávu OD HRÁČE do jeho 1:1 konverzace s trenérem (typ 'player'). Vrací id konverzace. */
export async function sendPlayerSMS(
  db: D1Database,
  teamId: string,
  player: { id: string; firstName: string; lastName: string; nickname?: string | null; avatar?: string | null },
  body: string,
  metadata?: Record<string, unknown>,
): Promise<string> {
  const { getOrCreatePlayerConversation } = await import("./ai-player-spawn");
  const convId = await getOrCreatePlayerConversation(db, teamId, player);
  await db.prepare("INSERT INTO messages (id, conversation_id, sender_type, sender_id, sender_name, body, metadata, sent_at) VALUES (?, ?, 'player', ?, ?, ?, ?, strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))")
    .bind(crypto.randomUUID(), convId, player.id, `${player.firstName} ${player.lastName}`, body, metadata ? JSON.stringify(metadata) : null).run()
    .catch((e) => logger.warn({ module: "system-sms" }, "insert player msg", e));
  await db.prepare("UPDATE conversations SET unread_count = unread_count + 1, last_message_text = ?, last_message_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now') WHERE id = ?")
    .bind(body.slice(0, 100), convId).run().catch((e) => logger.warn({ module: "system-sms" }, "update player conv", e));
  return convId;
}

/**
 * Pošle zprávu OD VŮDCE fanouškovské party.
 *
 * Vlastní helper, protože `sendSystemSMS` konverzaci klíčuje názvem role
 * a hlavně jí NENASTAVUJE avatar — vůdce by pak v telefonu vypadal jako úřad,
 * ne jako člověk. `participant_avatar` je volný JSON a frontend ho vykresluje
 * nezávisle na typu konverzace, takže obličej stačí uložit při zakládání.
 *
 * `ceka = true` nechá konverzaci otevřenou pro odpověď trenéra — zpracuje ji
 * `handleFanLeaderReply`. Používá stejné sloupce jako AI thready hráčů
 * (`ai_thread_active` / `ai_thread_state`), odlišené klíčem `kind`.
 */
export async function sendLeaderSMS(
  db: D1Database,
  teamId: string,
  leader: { id: string; name: string; avatar: string | null; groupId: string },
  body: string,
  opts: { ceka?: boolean; tema?: string } = {},
): Promise<string | null> {
  try {
    let convId = await db
      .prepare("SELECT id FROM conversations WHERE team_id = ? AND type = 'system' AND participant_id = ?")
      .bind(teamId, leader.id).first<{ id: string }>().then((r) => r?.id);

    if (!convId) {
      convId = crypto.randomUUID();
      await db.prepare(
        `INSERT INTO conversations
          (id, team_id, type, title, participant_id, participant_avatar, pinned, unread_count,
           last_message_text, last_message_at, created_at)
         VALUES (?, ?, 'system', ?, ?, ?, 0, 0, '', strftime('%Y-%m-%dT%H:%M:%SZ','now'), strftime('%Y-%m-%dT%H:%M:%SZ','now'))`,
      ).bind(convId, teamId, leader.name, leader.id, leader.avatar).run();
    }

    await db.prepare(
      `INSERT INTO messages (id, conversation_id, sender_type, sender_id, sender_name, body, sent_at)
       VALUES (?, ?, 'system', ?, ?, ?, strftime('%Y-%m-%dT%H:%M:%SZ','now'))`,
    ).bind(crypto.randomUUID(), convId, leader.id, leader.name, body).run();

    await db.prepare(
      `UPDATE conversations SET unread_count = unread_count + 1, last_message_text = ?,
         last_message_at = strftime('%Y-%m-%dT%H:%M:%SZ','now'),
         ai_thread_active = ?, ai_thread_state = ?
       WHERE id = ?`,
    ).bind(
      body.slice(0, 100),
      opts.ceka ? 1 : 0,
      opts.ceka
        ? JSON.stringify({ kind: "fan_leader", leaderId: leader.id, groupId: leader.groupId,
            tema: opts.tema ?? null, awaiting: "coach" })
        : null,
      convId,
    ).run();

    return convId;
  } catch (e) {
    logger.warn({ module: "system-sms" }, `SMS od vůdce ${leader.id}`, e);
    return null;
  }
}

export interface OwnerIdentity { sponsorId: number; name: string; firmName: string | null; avatar: string }

/** Konverzace s majitelem firmy (`participant_id = so-{sponsorId}`); založí ji, když chybí. */
async function ownerConversationId(db: D1Database, teamId: string, owner: OwnerIdentity): Promise<string> {
  const participantId = `so-${owner.sponsorId}`;
  const title = owner.firmName ? `${owner.name} (${owner.firmName})` : owner.name;
  const existing = await db
    .prepare("SELECT id FROM conversations WHERE team_id = ? AND type = 'system' AND participant_id = ?")
    .bind(teamId, participantId).first<{ id: string }>().then((r) => r?.id);
  if (existing) return existing;
  const convId = crypto.randomUUID();
  await db.prepare(
    `INSERT INTO conversations
      (id, team_id, type, title, participant_id, participant_avatar, pinned, unread_count,
       last_message_text, last_message_at, created_at)
     VALUES (?, ?, 'system', ?, ?, ?, 0, 0, '', strftime('%Y-%m-%dT%H:%M:%SZ','now'), strftime('%Y-%m-%dT%H:%M:%SZ','now'))`,
  ).bind(convId, teamId, title, participantId, owner.avatar).run();
  return convId;
}

/**
 * Pošle zprávu OD MAJITELE FIRMY (sponzora) a otevře vlákno pro odpověď.
 *
 * Stejný princip jako `sendLeaderSMS`: konverzace klíčovaná `participant_id`
 * (`so-{sponsorId}`), avatar z obličeje majitele, odpověď zpracuje
 * `handleOwnerSmsReply` bez modelu (iMessage, zdarma). Nabídka odpovědí jde do
 * `messages.metadata`, telefon z ní dělá tlačítka.
 */
export async function sendOwnerSMS(
  db: D1Database,
  teamId: string,
  owner: OwnerIdentity,
  body: string,
  opts: { smsId: string; options: Array<{ id: string; label: string; text: string }> },
): Promise<string | null> {
  const participantId = `so-${owner.sponsorId}`;
  const title = owner.firmName ? `${owner.name} (${owner.firmName})` : owner.name;
  try {
    const convId = await ownerConversationId(db, teamId, owner);

    await db.prepare(
      `INSERT INTO messages (id, conversation_id, sender_type, sender_id, sender_name, body, metadata, sent_at)
       VALUES (?, ?, 'system', ?, ?, ?, ?, strftime('%Y-%m-%dT%H:%M:%SZ','now'))`,
    ).bind(crypto.randomUUID(), convId, participantId, owner.name, body,
      JSON.stringify({ type: "sponsor_owner", smsId: opts.smsId, options: opts.options })).run();

    await db.prepare(
      `UPDATE conversations SET unread_count = unread_count + 1, last_message_text = ?, title = ?,
         last_message_at = strftime('%Y-%m-%dT%H:%M:%SZ','now'),
         ai_thread_active = 1, ai_thread_state = ?
       WHERE id = ?`,
    ).bind(
      body.slice(0, 100), title,
      JSON.stringify({ kind: "sponsor_owner", smsId: opts.smsId, sponsorId: owner.sponsorId, awaiting: "coach" }),
      convId,
    ).run();

    return convId;
  } catch (e) {
    logger.warn({ module: "system-sms", teamId }, `SMS od majitele firmy ${owner.sponsorId}`, e);
    return null;
  }
}

/** Čas zprávy ve formátu, jaký používá strftime v ostatních zápisech (řazení podle sent_at je textové). */
function messageTime(ms: number): string {
  return new Date(ms).toISOString().replace(/\.\d{3}Z$/, "Z");
}

/**
 * Zprávy ve vlákně s majitelem firmy BEZ čekání na odpověď (prosba o příspěvek a její
 * vyhodnocení). Rozepsané vlákno čekající SMS (ai_thread_state) nechává být, aby o
 * nabídku odpovědí nepřišla. `coach` = zpráva trenéra, `owner` = odpověď majitele.
 */
export async function postOwnerMessages(
  db: D1Database,
  teamId: string,
  owner: OwnerIdentity,
  messages: Array<{ from: "coach" | "owner"; body: string }>,
  opts: { coachName: string; unread: boolean },
): Promise<string | null> {
  if (messages.length === 0) return null;
  try {
    const convId = await ownerConversationId(db, teamId, owner);
    const start = Date.now();
    const stmts = messages.map((m, i) => m.from === "coach"
      ? db.prepare(
        `INSERT INTO messages (id, conversation_id, sender_type, sender_id, sender_name, body, sent_at, read)
         VALUES (?, ?, 'user', ?, ?, ?, ?, 1)`,
      ).bind(crypto.randomUUID(), convId, teamId, opts.coachName, m.body, messageTime(start + i * 1000))
      : db.prepare(
        `INSERT INTO messages (id, conversation_id, sender_type, sender_id, sender_name, body, metadata, sent_at)
         VALUES (?, ?, 'system', ?, ?, ?, ?, ?)`,
      ).bind(crypto.randomUUID(), convId, `so-${owner.sponsorId}`, owner.name, m.body,
        JSON.stringify({ type: "sponsor_owner_note" }), messageTime(start + i * 1000)));
    const last = messages[messages.length - 1];
    const unreadAdd = opts.unread ? messages.filter((m) => m.from === "owner").length : 0;
    stmts.push(db.prepare(
      "UPDATE conversations SET unread_count = unread_count + ?, last_message_text = ?, last_message_at = ? WHERE id = ?",
    ).bind(unreadAdd, last.body.slice(0, 100), messageTime(start + (messages.length - 1) * 1000), convId));
    await db.batch(stmts);
    return convId;
  } catch (e) {
    logger.warn({ module: "system-sms", teamId }, `zprávy s majitelem firmy ${owner.sponsorId}`, e);
    return null;
  }
}
