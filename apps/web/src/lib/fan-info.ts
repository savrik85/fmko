/**
 * Popisky fanouškovských part specifické pro web.
 *
 * Jazykové tvary číslovek („odešli dva lidé") žijí v `@okresni-masina/shared`,
 * protože jsou to čisté funkce a tam na ně běží testy. Tady zůstává jen to,
 * co nese Tailwind třídy a do sdíleného balíčku nepatří.
 */

/**
 * Jak je vůdce nakloněný vedení klubu.
 *
 * Všechny tvary jsou v rodě neutrální — vůdce může být žena, takže „nakloněný"
 * by u organizátorky bylo špatně. A protože se to vždycky lepí za „Vztah k tobě:",
 * musí každý tvar dávat smysl i v té větě.
 */
export function sentimentWord(s: number): { text: string; cls: string } {
  if (s >= 50) return { text: "stojí za tebou", cls: "text-pitch-600" };
  if (s >= 15) return { text: "spíš ti fandí", cls: "text-pitch-600" };
  if (s > -15) return { text: "ani pro, ani proti", cls: "text-muted" };
  if (s > -50) return { text: "nedůvěřuje ti", cls: "text-card-red" };
  return { text: "je proti tobě", cls: "text-card-red" };
}
