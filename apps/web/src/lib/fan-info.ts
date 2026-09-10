/**
 * Popisky fanouškovských part — jeden zdroj pro stránku fanoušků, profil vůdce
 * i detail zápasu.
 *
 * Česká čísla se v těchhle větách chovají zrádně: mění se nejen podstatné jméno,
 * ale i sloveso („odešel jeden člověk" / „odešli dva lidé" / „odešlo pět lidí").
 * Proto to má vlastní funkce, ne šablonu s jedním tvarem.
 */

/** Kolik lidí po výtržnosti odešlo — celá věta i se slovesem. */
export function odesloLidi(n: number): string {
  if (n === 1) return "Odešel jeden člověk.";
  if (n >= 2 && n <= 4) return `Odešli ${n} lidé.`;
  return `Odešlo ${n} lidí.`;
}

/** Na kolik zápasů je sektor zavřený. */
export function zavrenoNaZapasy(n: number): string {
  if (n === 1) return "jeden zápas";
  if (n >= 2 && n <= 4) return `${n} zápasy`;
  return `${n} zápasů`;
}

/** Jak je vůdce nakloněný vedení klubu. */
export function sentimentWord(s: number): { text: string; cls: string } {
  if (s >= 50) return { text: "stojí za tebou", cls: "text-pitch-600" };
  if (s >= 15) return { text: "nakloněný", cls: "text-pitch-600" };
  if (s > -15) return { text: "neutrální", cls: "text-muted" };
  if (s > -50) return { text: "nedůvěřuje ti", cls: "text-gold-600" };
  return { text: "je proti tobě", cls: "text-card-red" };
}
