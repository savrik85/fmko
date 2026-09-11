/**
 * Odpověď manažera na SMS od vůdce party.
 *
 * Záměrně bez modelu: postoj se pozná lexikálně (stejně jako u pozápasových
 * rozhovorů) a vůdce odepíše hotovou větou. Dopad je deterministický, takže se
 * dá testovat, nestojí kvótu a funguje i s vypnutou AI.
 *
 * Není tu správná volba — smířlivost sedí vyjednavači a urazí radikála, tvrdost
 * naopak. Mlčet je jediná varianta, která je špatně vždycky.
 */

import { logger } from "../lib/logger";
import { klasifikujOdpoved, dopadOdpovedi } from "../engine/fan-reactions";
import { fanLeaderFullName, type FanLeaderRow } from "./fan-group-generator";

const M = "fan-leader-reply";

interface ThreadState {
  kind?: string;
  leaderId?: string;
  groupId?: string;
  tema?: string | null;
  awaiting?: string;
}

/**
 * Zpracuje trenérovu odpověď v konverzaci s vůdcem.
 *
 * Vrací `false`, když konverzace vůdci nepatří — volající pak nic neřeší.
 * Nikdy nehází: neúspěšná odpověď nesmí shodit odeslání zprávy.
 */
export async function handleFanLeaderReply(
  db: D1Database,
  convId: string,
  odpovedTrenera: string,
): Promise<boolean> {
  try {
    const conv = await db
      .prepare("SELECT team_id, ai_thread_state FROM conversations WHERE id = ? AND ai_thread_active = 1")
      .bind(convId)
      .first<{ team_id: string; ai_thread_state: string | null }>();
    if (!conv?.ai_thread_state) return false;

    let state: ThreadState;
    try { state = JSON.parse(conv.ai_thread_state) as ThreadState; } catch { return false; }
    if (state.kind !== "fan_leader" || !state.leaderId || !state.groupId) return false;

    // Atomicky zavřít thread — dvě rychlé odpovědi za sebou nesmí dopad zdvojit.
    const claim = await db
      .prepare(
        `UPDATE conversations SET ai_thread_active = 0
         WHERE id = ? AND ai_thread_active = 1
           AND json_extract(ai_thread_state, '$.awaiting') = 'coach'`,
      )
      .bind(convId)
      .run();
    if ((claim.meta?.changes ?? 0) === 0) return true;

    const leader = await db
      .prepare("SELECT * FROM fan_leaders WHERE id = ?")
      .bind(state.leaderId)
      .first<FanLeaderRow>();
    if (!leader) return true;

    const postoj = klasifikujOdpoved(odpovedTrenera);
    const dopad = dopadOdpovedi(postoj, {
      vyjednavani: leader.vyjednavani,
      radikalnost: leader.radikalnost,
    });

    await db.batch([
      db.prepare(
        `UPDATE fan_leaders SET sentiment = MAX(-100, MIN(100, sentiment + ?)), duvod = ?,
           updated_at = strftime('%Y-%m-%dT%H:%M:%SZ','now') WHERE id = ?`,
      ).bind(dopad.sentiment, zkratitDuvod(postoj, odpovedTrenera), leader.id),
      db.prepare(
        `UPDATE fan_groups SET mood = MAX(0, MIN(100, mood + ?)), heat = MAX(0, MIN(100, heat + ?)),
           updated_at = strftime('%Y-%m-%dT%H:%M:%SZ','now') WHERE id = ?`,
      ).bind(dopad.mood, dopad.heat, state.groupId),
      db.prepare(
        `INSERT INTO messages (id, conversation_id, sender_type, sender_id, sender_name, body, sent_at)
         VALUES (?, ?, 'system', ?, ?, ?, strftime('%Y-%m-%dT%H:%M:%SZ','now'))`,
      ).bind(crypto.randomUUID(), convId, leader.id, fanLeaderFullName(leader), dopad.odpoved),
      db.prepare(
        `UPDATE conversations SET unread_count = unread_count + 1, last_message_text = ?,
           last_message_at = strftime('%Y-%m-%dT%H:%M:%SZ','now'), ai_thread_state = NULL
         WHERE id = ?`,
      ).bind(dopad.odpoved.slice(0, 100), convId),
    ]);

    logger.info(
      { module: M, teamId: conv.team_id },
      `odpověď vůdci ${leader.id}: ${postoj} → sentiment ${dopad.sentiment > 0 ? "+" : ""}${dopad.sentiment}`,
    );
    return true;
  } catch (e) {
    logger.warn({ module: M }, `odpověď vůdci v konverzaci ${convId}`, e);
    return false;
  }
}

/** Krátký záznam do profilu vůdce — celý text zprávy by se tam nevešel. */
function zkratitDuvod(postoj: string, text: string): string {
  const uvod = postoj === "uklidnit"
    ? "Snažil ses to urovnat"
    : postoj === "postavit_se"
      ? "Postavil ses mu"
      : "Odbyl jsi ho";
  const vyrok = text.trim().replace(/\s+/g, " ").slice(0, 90);
  return `${uvod}: „${vyrok}${text.trim().length > 90 ? "…" : ""}"`;
}
