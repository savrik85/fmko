/**
 * D1 občas na chvíli odmítne dotazy, aniž by byla chyba v kódu: během exportu databáze
 * (záloha) a při přetížení, typicky když v 18 h běží kolo. Klient má takový požadavek
 * zkusit znovu, proto ho API hlásí jako 503, ne jako „Interní chybu serveru".
 *
 * Texty chyb jsou z produkce (PostHog `api_server_error`) a z dokumentace D1.
 */
const TRANSIENT_DB_ERROR_PATTERNS: RegExp[] = [
  /D1 DB is overloaded/i,
  /long-running export/i,
  /Network connection lost/i,
  /caused object to be reset/i,
];

export function isTransientDbError(err: unknown): boolean {
  const message = err instanceof Error ? err.message : String(err ?? "");
  return TRANSIENT_DB_ERROR_PATTERNS.some((pattern) => pattern.test(message));
}

/** Hláška pro hráče; čeká se pár vteřin, web zkouší načtení sám znovu. */
export const TRANSIENT_DB_ERROR_MESSAGE = "Databáze je teď chvíli zaneprázdněná, zkus to prosím za pár vteřin.";

/** Za kolik sekund má klient zkusit požadavek znovu (hlavička Retry-After). */
export const TRANSIENT_DB_RETRY_AFTER_SECONDS = 5;
