/**
 * Váhy atributů pro celkové hodnocení hráče, podle pozice.
 *
 * Jediný zdroj pravdy pro celou hru:
 *  - API z nich počítá `overall_rating` (`calculateOverallRating`, `overallRatingFromFlat`)
 *  - web podle nich v profilu hráče zvýrazňuje, na čem u dané pozice záleží
 *
 * Atribut, který tu pro pozici není, do hodnocení nevstupuje vůbec (např. kreativita
 * a standardky u obránce). Naopak `vision` a `experience` váhu mají, i když je hráč
 * nemá vždy vyplněné v plochém `skills` — dohledávají se ze `skills_max`.
 */

export type RatingPosition = "GK" | "DEF" | "MID" | "FWD";

export const RATING_WEIGHTS: Record<RatingPosition, Record<string, number>> = {
  // Brankář používá TYTÉŽ ploché názvy jako hráči v poli. Dřív měl vlastní sadu
  // (reflexes, catching, positioning…), která žila jen v `skills_max` a ve vahách, zatímco
  // trénink, zápasový engine i celé UI pracovaly s plochými atributy. Ty dvě sady se
  // opakovaně rozcházely: hodnocení brankáře se po tréninku nehýbalo, karta potenciálu mu
  // ukazovala jediný řádek a profil se seznamem si odporovaly o pár bodů.
  //
  // Váhy vznikly sloučením původních: goalkeeping nese reflexy i chytání (3+3), obrana
  // postavení, rychlost vybíhání, technika kopací techniku, přihrávka rozehrávku,
  // hlavičky dosah, kreativita komunikaci. Součet zůstal 20, takže hodnocení nepřeskočí.
  // Kreativita a standardky se dřív nepočítaly nikomu kromě brankáře (kreativita) —
  // standardky neměly váhu u ŽÁDNÉ pozice. Hráč je přitom trénoval, dovednost mu rostla
  // a hodnocení se nehnulo. Trénovat standardky nebo tvořivou hru je pro záložníka
  // naprosto legitimní, takže se to napravuje tady ve vahách, ne tím, že by hra
  // takový trénink obcházela.
  GK: { goalkeeping: 6, defense: 3, speed: 2, technique: 1, passing: 1, strength: 1, stamina: 1, heading: 2, creativity: 2, experience: 2 },
  DEF: { speed: 1, stamina: 2, strength: 3, technique: 1, shooting: 0.5, passing: 2, heading: 3, defense: 3, vision: 2, creativity: 1, setPieces: 0.5, experience: 2 },
  MID: { speed: 2, stamina: 3, strength: 1, technique: 2, shooting: 1.5, passing: 3, heading: 1, defense: 1.5, vision: 3, creativity: 2, setPieces: 1, experience: 2 },
  FWD: { speed: 3, stamina: 1.5, strength: 1.5, technique: 3, shooting: 3, passing: 2, heading: 2, defense: 0.5, vision: 2, creativity: 2, setPieces: 1, experience: 1.5 },
};

/** Váhy pro pozici; neznámá pozice spadne na útočníka (stejně jako dřív v API). */
export function ratingWeightsFor(position: string): Record<string, number> {
  return RATING_WEIGHTS[position as RatingPosition] ?? RATING_WEIGHTS.FWD;
}

/** Jak moc atribut rozhoduje o hodnocení na dané pozici. */
export type AttrImportance = "key" | "useful" | "minor" | "none";

/**
 * Zařadí atribut podle jeho váhy na dané pozici.
 * Prahy vychází z rozsahu vah (0–3): 2+ klíčový, 1–1,9 užitečný, pod 1 okrajový.
 */
export function attributeImportance(position: string, attribute: string): AttrImportance {
  const weight = RATING_WEIGHTS[position as RatingPosition]?.[attribute];
  if (weight === undefined || weight === 0) return "none";
  if (weight >= 2) return "key";
  if (weight >= 1) return "useful";
  return "minor";
}
