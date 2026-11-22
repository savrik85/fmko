/**
 * Časový rozpočet práce na pozadí.
 *
 * Zprávy hráčů po trenérově akci (reakce na trest, SMS po odmítnuté nabídce, odpověď
 * v chatu, kabina) běží ve `waitUntil`, který worker zhruba 30 s po odeslání odpovědi
 * ukončí bez chyby. Jedno volání modelu má strop 25 s a hlídání opakování
 * (messaging/repetition.ts) může zavolat model podruhé: druhé volání se pak do limitu
 * nevešlo, worker ho uřízl a hráč neposlal nic, ani předem napsanou variantu.
 *
 * Rozpočet je okamžik (`Date.now()` v ms), do kterého musí být text hotový. Přegenerování
 * se zkouší jen s dostatečnou rezervou, volání modelu dostane nejvýš zbývající čas a po
 * rozpočtu jde rovnou předem napsaná varianta. Zbytek do 30 s patří zápisu zprávy.
 */

/** Na text zprávy od začátku práce na pozadí (limit `waitUntil` je ~30 s). */
export const BACKGROUND_BUDGET_MS = 20_000;
/**
 * Po rozpočtu ještě na krátké dovyhodnocení (výsledek rozhovoru), než worker práci utne.
 * Odpověď hráče je v tu chvíli hotová a uloží se i bez něj.
 */
export const WRAP_UP_MS = 6_000;
/** Druhý pokus modelu (přegenerování kvůli opakování) jen s takovou rezervou. */
export const RETRY_MIN_MS = 6_000;
/** Míň než tohle na volání modelu nestojí za to: odpověď by nestihla dojít. */
export const MIN_MODEL_CALL_MS = 1_500;

/** Rozpočet za `ms` od `now`. */
export function deadlineIn(ms: number = BACKGROUND_BUDGET_MS, now: number = Date.now()): number {
  return now + ms;
}

/** Kolik ms zbývá do rozpočtu. Bez rozpočtu nekonečno. */
export function remainingMs(deadline: number | undefined, now: number = Date.now()): number {
  return deadline === undefined ? Number.POSITIVE_INFINITY : deadline - now;
}

/**
 * Výsledek práce, nebo `onLate()`, když práce do rozpočtu nedoběhne. Práce běží dál a její
 * pozdní výsledek (i pozdní chyba) se zahodí. Bez rozpočtu se čeká na práci.
 */
export async function beforeDeadline<T>(work: Promise<T>, deadline: number | undefined, onLate: () => T): Promise<T> {
  const left = remainingMs(deadline);
  if (!Number.isFinite(left)) return work;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const late = new Promise<T>((resolve) => { timer = setTimeout(() => resolve(onLate()), Math.max(0, left)); });
  try {
    return await Promise.race([work, late]);
  } finally {
    clearTimeout(timer);
  }
}
