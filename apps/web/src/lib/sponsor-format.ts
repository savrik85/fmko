/** Sponzorské částky, délky smluv a změny náklonnosti v textu pro hráče. */

/** Smlouvy drží měsíční částku, hráč vidí týdenní. */
export function weeklyAmount(monthly: number): number {
  return Math.round(monthly / 4.3);
}

/** „1 sezónu“, „3 sezóny“, „5 sezón“ (4. pád, po předložce „na“). */
export function seasonsAccusative(n: number): string {
  return `${n} ${n === 1 ? "sezónu" : n >= 2 && n <= 4 ? "sezóny" : "sezón"}`;
}

/** „1 sezóna“, „3 sezóny“, „5 sezón“ (1. pád, nominativ). */
export function seasonsNominative(n: number): string {
  return `${n} ${n === 1 ? "sezóna" : n >= 2 && n <= 4 ? "sezóny" : "sezón"}`;
}

/** Zbývající sezóny se správnou shodou: „Zbývá 1 sezóna“, „Zbývají 2 sezóny“, „Zbývá 5 sezón“. */
export function remainingSeasonsText(n: number): string {
  const sezonsForm = n === 1 ? "sezóna" : n >= 2 && n <= 4 ? "sezóny" : "sezón";
  const verb = n >= 2 && n <= 4 ? "Zbývají" : "Zbývá";
  return `${verb} ${n} ${sezonsForm}`;
}

/** Sezóny v genitivu po předložce „z“ (2. pád): „z 1 sezóny“, „z 2 sezón“, „z 5 sezón“. */
export function seasonsGenitive(n: number): string {
  return n === 1 ? "sezóny" : "sezón";
}

/** Změna se znaménkem; mínus je obyčejný spojovník, nikdy dlouhá pomlčka. */
export function formatFavorDelta(delta: number): string {
  return delta > 0 ? `+${delta}` : String(delta);
}

/** Herní datum (ISO z teams.game_date) jako „22. 9. 2026“. Neplatné datum = prázdný řetězec. */
export function formatGameDay(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "" : d.toLocaleDateString("cs", { day: "numeric", month: "numeric", year: "numeric" });
}
