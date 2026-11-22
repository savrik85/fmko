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
  /** Trenér se od hráčovy poslední odpovědi na něco zeptal (`coachAskedSinceReply`). */
  coachAsked?: boolean;
}

/** Vztah, pod kterým je hráč na trenéra naštvaný: na přečteno ho nechá i s otázkou. */
export const HOSTILE_RELATIONSHIP = 30;

/**
 * Šance, že hráč zprávu jen přečte a neodpoví.
 *
 * Na otázku trenéra hráč odpoví, jen naštvaný (vztah pod 30) ji občas nechá na přečteno.
 * E2E 22. 11.: na konci vlákna se zahodila hotová odpověď s pravděpodobností 25–45 %, i když
 * se trenér ptal. Kovalčuk na „A kolik tě stály?“ 2× ze 3 neodpověděl, ráno po hospodě
 * 4 z 9 posledních tahů („A kdo podle tebe u nás nejvíc maká?“) a Zíka uprostřed vlákna.
 */
export function leftOnReadChance(i: LeftOnReadInput): number {
  const annoyed = i.relationship < HOSTILE_RELATIONSHIP ? 0.2 : i.relationship < 45 ? 0.08 : 0;
  if (i.coachAsked) return i.relationship < HOSTILE_RELATIONSHIP ? Math.min(0.5, annoyed + (i.coachStreak >= 3 ? 0.3 : 0)) : 0;
  if (i.closing) return Math.min(0.5, 0.25 + annoyed);
  let chance = 0.04 + annoyed;
  if (i.atWork) chance += 0.08;
  // Třetí zpráva bez odpovědi: hráč má pocit, že ho trenér zahlcuje.
  if (i.coachStreak >= 3) chance += 0.3;
  return Math.min(0.5, chance);
}

/**
 * Trenér se od hráčovy poslední odpovědi na něco zeptal: otazník v některé z jeho zpráv na konci
 * historie (stejně jako `coachQuestion` v ai-player-chat.ts, podle kterého model dostane pokyn
 * „nejdřív mu na to odpověz“).
 */
export function coachAskedSinceReply(history: readonly { sender: string; body: string }[]): boolean {
  for (let i = history.length - 1; i >= 0 && history[i].sender === "coach"; i--) {
    if (history[i].body.includes("?")) return true;
  }
  return false;
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
