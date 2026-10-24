/**
 * „Přečteno“: hráč si zprávu od trenéra přečte a neodpoví. Ve WhatsAppu modré fajfky a nic.
 * Nápad uživatele 2026-10-24 („by to mohla být někdy taky forma odpovědi“).
 *
 * Nejčastěji na konci rozhovoru, kdy už není co dodat. Uprostřed rozhovoru, když je hráč
 * na trenéra naštvaný, je zrovna v práci, nebo mu trenér píše už třetí zprávu za sebou.
 * Rozhovor tím končí; další zpráva trenéra začne nový (`startCoachThread`).
 */
import { logger } from "../lib/logger";

const M = "left-on-read";

export interface LeftOnReadInput {
  /** Rozhovor právě končí, hráč by psal poslední repliku. */
  closing: boolean;
  /** Vztah k trenérovi 0–100 (50 = neutrální). */
  relationship: number;
  /** Kolik zpráv trenér napsal za sebou od hráčovy poslední odpovědi, včetně té poslední. */
  coachStreak: number;
  /** Hráč je zrovna v práci. */
  atWork: boolean;
}

/** Šance, že hráč zprávu jen přečte a neodpoví. */
export function leftOnReadChance(i: LeftOnReadInput): number {
  const annoyed = i.relationship < 30 ? 0.2 : i.relationship < 45 ? 0.08 : 0;
  if (i.closing) return Math.min(0.5, 0.25 + annoyed);
  let chance = 0.04 + annoyed;
  if (i.atWork) chance += 0.08;
  // Třetí zpráva bez odpovědi: hráč má pocit, že ho trenér zahlcuje.
  if (i.coachStreak >= 3) chance += 0.3;
  return Math.min(0.5, chance);
}

/** Pauza, než si hráč zprávu přečte: pár vteřin, ne hned po odeslání. */
export function readDelayMs(roll: number): number {
  return Math.round(3000 + Math.max(0, Math.min(1, roll)) * 12000);
}

/** Kolik zpráv trenér napsal za sebou od hráčovy poslední odpovědi (včetně poslední). */
export async function coachStreak(db: D1Database, convId: string): Promise<number> {
  const row = await db.prepare(
    `SELECT COUNT(*) AS n FROM messages
      WHERE conversation_id = ? AND sender_type = 'user'
        AND sent_at > COALESCE((SELECT MAX(sent_at) FROM messages WHERE conversation_id = ? AND sender_type = 'player'), '')`,
  ).bind(convId, convId).first<{ n: number }>()
    .catch((e) => { logger.warn({ module: M }, `zprávy trenéra za sebou ${convId}`, e); return null; });
  return row?.n ?? 0;
}

/**
 * Trenérovy zprávy dostanou „přečteno“ (`metadata.readAt`). Telefon podle toho ukáže modré
 * fajfky i bez odpovědi; dřív byla zpráva přečtená, jen když na ni hráč odepsal.
 */
export async function markCoachMessagesRead(db: D1Database, convId: string, at: string): Promise<void> {
  await db.prepare(
    `UPDATE messages SET metadata = json_set(COALESCE(metadata, '{}'), '$.readAt', ?)
      WHERE conversation_id = ? AND sender_type = 'user'
        AND json_extract(COALESCE(metadata, '{}'), '$.readAt') IS NULL`,
  ).bind(at, convId).run()
    .catch((e) => { logger.warn({ module: M }, `přečteno ${convId}`, e); });
}
