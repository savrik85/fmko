/**
 * Jazykové tvary pro hlášení o fanouškovských partách.
 *
 * Česká čísla se v těchhle větách chovají zrádně: u dvou se mění nejen podstatné
 * jméno, ale i sloveso („odešel jeden člověk" / „odešli dva lidé" / „odešlo pět
 * lidí"). Šablona s jedním tvarem tu proto nestačí a věty žijí tady, aby se
 * nerozešly mezi stránkou fanoušků a detailem zápasu.
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

/** Kolik případů bordelu — pro souhrn pokut. */
export function pripadu(n: number): string {
  if (n === 1) return "poslední případ";
  if (n >= 2 && n <= 4) return `poslední ${n} případy`;
  return `posledních ${n} případů`;
}
