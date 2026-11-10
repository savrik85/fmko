/**
 * Meze zpráv v Telefonu (SMS hráčům, kabina, trenéři, ligový a globální chat).
 *
 * Dřív se hlídal jen prázdný text: zpráva mohla mít libovolnou délku (a celá šla do
 * promptu hráče), `limit` z adresy šel rovnou do SQL a bezplatné chaty neměly strop.
 */

/** Nejdelší zpráva. Stejné číslo má formulář na webu (telefon/[id]/page.tsx). */
export const PHONE_MESSAGE_MAX = 500;

/** Kolik zpráv najednou vrátí výpis konverzace nebo chatu. */
export const PAGE_LIMIT_DEFAULT = 50;
export const PAGE_LIMIT_MAX = 100;

/** Bezplatné kanály (ligový a globální chat): strop zpráv za hodinu na klub. */
export const FREE_CHAT_PER_HOUR = 30;

/** `limit` z adresy: celé číslo 1 až 100, cokoli jiného je výchozích 50. */
export function pageLimit(raw: string | undefined | null): number {
  const n = Math.floor(Number(raw));
  if (!Number.isFinite(n) || n < 1) return PAGE_LIMIT_DEFAULT;
  return Math.min(PAGE_LIMIT_MAX, n);
}

/**
 * Text zprávy od trenéra: oříznuté okraje, bez řídicích znaků. null = prázdná,
 * `tooLong` = přes limit (odmítá se, potichu se neusekává, ať hráč ví, co odešlo).
 */
export function cleanPhoneMessage(raw: unknown): { text: string } | { error: "empty" | "too_long" } {
  if (typeof raw !== "string") return { error: "empty" };
  // eslint-disable-next-line no-control-regex
  const text = raw.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "").replace(/\r\n?/g, "\n").trim();
  if (!text) return { error: "empty" };
  if (text.length > PHONE_MESSAGE_MAX) return { error: "too_long" };
  return { text };
}

export const TOO_LONG_ERROR = `Zpráva je moc dlouhá, vejde se nejvýš ${PHONE_MESSAGE_MAX} znaků.`;
