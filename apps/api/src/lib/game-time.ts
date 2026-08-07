/**
 * Herní čas — expirace nabídek, petic a dalších časovaných věcí.
 *
 * Herní datum není reálné datum: `game_clock.offset_days` ho posouvá dopředu
 * (v testovacím prostředí to bylo 49 dní). Když se `expires_at` spočítá z reálného
 * `new Date()`, ale porovnává se s herním datem, nabídka vyprší dřív, než ji hráč
 * vůbec uvidí — a ještě za to dostane postih.
 *
 * Přesně to se stalo peticím obce: 47 jich skončilo jako "zůstala bez odezvy",
 * ani jedna nebyla splnitelná. Proto: obě strany porovnání vždy v herním čase.
 */

/** Herní expirace: `gameDate` + N dní. Nikdy nepoužívej `new Date()`. */
export function gameExpiry(gameDate: string, days: number): string {
  const d = new Date(gameDate);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString();
}

/** Vypršelo už to? Obě strany se porovnávají v herním čase. */
export function isGameExpired(expiresAt: string, gameDate: string): boolean {
  return new Date(expiresAt).getTime() < new Date(gameDate).getTime();
}
