/**
 * Popisky fanouškovských part specifické pro web.
 *
 * Jazykové tvary číslovek („odešli dva lidé") žijí v `@okresni-masina/shared`,
 * protože jsou to čisté funkce a tam na ně běží testy. Tady zůstává jen to,
 * co nese Tailwind třídy a do sdíleného balíčku nepatří.
 */

/** Jak je vůdce nakloněný vedení klubu. */
export function sentimentWord(s: number): { text: string; cls: string } {
  if (s >= 50) return { text: "stojí za tebou", cls: "text-pitch-600" };
  if (s >= 15) return { text: "nakloněný", cls: "text-pitch-600" };
  if (s > -15) return { text: "neutrální", cls: "text-muted" };
  if (s > -50) return { text: "nedůvěřuje ti", cls: "text-gold-600" };
  return { text: "je proti tobě", cls: "text-card-red" };
}
