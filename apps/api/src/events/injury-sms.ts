/**
 * SMS hráče, který na zápas nemůže kvůli zranění nebo stopce (náhled sestavy).
 *
 * Dřív byl text jeden pro všechny a s chybami: „ještě 1 dní", typ zranění tak, jak leží
 * v databázi („kotnik", „drobne"). Dva zranění pak poslali úplně stejnou zprávu.
 */

/** Typ zranění z `injuries.type` lidsky. */
const INJURY_LABELS: Record<string, string> = {
  sval: "natažený sval",
  kotnik: "kotník",
  koleno: "koleno",
  zebra: "naražené žebro",
  obecne: "naraženina",
  drobne: "drobné zranění",
};

/** „den", „2 dny", „5 dní" */
export function daysPhrase(days: number): string {
  if (days === 1) return "den";
  return days >= 2 && days <= 4 ? `${days} dny` : `${days} dní`;
}

/** „1 zápas", „2 zápasy", „5 zápasů" */
export function matchesPhrase(n: number): string {
  if (n === 1) return "1 zápas";
  return n >= 2 && n <= 4 ? `${n} zápasy` : `${n} zápasů`;
}

/** Stabilní volba varianty podle hráče: stejný hráč má pořád stejný text, různí hráči různé. */
function variantIndex(playerId: string, count: number): number {
  let h = 0;
  for (let i = 0; i < playerId.length; i++) h = (h * 31 + playerId.charCodeAt(i)) | 0;
  return Math.abs(h) % count;
}

export function injurySms(playerId: string, type: string | null | undefined, days: number): string {
  const label = INJURY_LABELS[type ?? ""] ?? "zranění";
  const span = daysPhrase(days);
  const variants = [
    `Jsem zraněný (${label}), potrvá to ještě ${span}.`,
    `Pořád to bolí, ${label}. Doktor říká ještě ${span}.`,
    `S tím, co mám (${label}), nemám šanci. Počítej se mnou až za ${span}.`,
  ];
  return variants[variantIndex(playerId, variants.length)];
}

export function suspensionSms(matches: number): string {
  return `Mám stopku, nesmím hrát ještě ${matchesPhrase(matches)}.`;
}
