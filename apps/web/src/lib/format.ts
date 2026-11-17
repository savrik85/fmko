/**
 * Částky v Kč. Jediné místo, kde se skládá „1 200 Kč“: dřív si to každá stránka
 * psala sama a mezera před „Kč“ byla obyčejná, takže „Kč“ spadlo na další řádek samo.
 */

const NBSP = " ";

/** „1 200 Kč“. Mezera před Kč je nezlomitelná, „Kč“ nikdy nezůstane na řádku samo. */
export function formatKc(amount: number): string {
  return `${amount.toLocaleString("cs")}${NBSP}Kč`;
}

/** „+8 175 Kč“ / „−3 995 Kč“ / „0 Kč“. Minus je matematický znak, ne spojovník. */
export function formatSigned(amount: number): string {
  const sign = amount > 0 ? "+" : amount < 0 ? "−" : "";
  return `${sign}${formatKc(Math.abs(amount))}`;
}
