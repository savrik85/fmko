/**
 * Chyby z nasazení nové verze: prohlížeč pořád drží stránku ze staré verze, soubory
 * staré verze už na serveru nejsou nebo nový kus kódu nesedí ke starému jádru.
 * Pomůže jen stránku načíst znovu, proto ji error.tsx / global-error.tsx načtou samy.
 *
 * `e[o] is not a function` je skutečné hlášení z PostHogu (říjen 2026, hned po nasazení,
 * stránky liga, vice, telefon, prehled, prestupy, zapas): webpack nenašel modul, protože
 * kód stránky z nové verze běžel se starým jádrem. Jména jsou minifikovaná, proto vzor.
 */
const MODULE_LOAD_PATTERNS = [
  // __webpack_modules__[id](...) bez modulu (Chrome; Safari přidá vysvětlení za tečkou)
  /^[\w$]{1,3}\[[\w$]{1,3}\] is not a function/,
  // Totéž ve tvaru __webpack_modules__[id].call(...)
  /\(reading 'call'\)|evaluating '[\w$]{1,3}\[[\w$]{1,3}\]\.call'/,
  /Loading (CSS )?chunk [\w/.-]+ failed/i,
  /Failed to load chunk/i,
  /Failed to fetch dynamically imported module/i,
  /error loading dynamically imported module/i,
  /Importing a module script failed/i,
];

/** Klíč v sessionStorage: kdy se stránka naposled sama načetla kvůli chybě modulu. */
const RELOAD_STORAGE_KEY = "prales_module_reload_at";
/** Do té doby se další taková chyba jen ukáže, ať se stránka nenačítá dokola. */
const RELOAD_GUARD_MS = 5 * 60_000;

export function isModuleLoadError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const { name, message } = error as { name?: unknown; message?: unknown };
  if (name === "ChunkLoadError") return true;
  return typeof message === "string" && MODULE_LOAD_PATTERNS.some((pattern) => pattern.test(message));
}

/**
 * Smí se stránka teď sama načíst znovu? Zapíše čas, takže se to v jedné záložce
 * nestane dvakrát za sebou. Bez sessionStorage (soukromý režim, zakázané úložiště)
 * vrací false: smyčku by pak nebylo čím ohlídat.
 */
export function claimModuleReload(now = Date.now()): boolean {
  try {
    const last = Number(window.sessionStorage.getItem(RELOAD_STORAGE_KEY) ?? 0);
    if (Number.isFinite(last) && now - last < RELOAD_GUARD_MS) return false;
    window.sessionStorage.setItem(RELOAD_STORAGE_KEY, String(now));
    return true;
  } catch (e) {
    console.warn("pojistka automatického načtení stránky nefunguje:", e);
    return false;
  }
}
