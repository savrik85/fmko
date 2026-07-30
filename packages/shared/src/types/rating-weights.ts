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
  GK: { reflexes: 3, positioning: 3, rushing: 2, catching: 3, kicking: 1, distribution: 1, strength: 1, reach: 2, communication: 2, experience: 2 },
  DEF: { speed: 1, stamina: 2, strength: 3, technique: 1, shooting: 0.5, passing: 2, heading: 3, defense: 3, vision: 2, experience: 2 },
  MID: { speed: 2, stamina: 3, strength: 1, technique: 2, shooting: 1.5, passing: 3, heading: 1, defense: 1.5, vision: 3, experience: 2 },
  FWD: { speed: 3, stamina: 1.5, strength: 1.5, technique: 3, shooting: 3, passing: 2, heading: 2, defense: 0.5, vision: 2, experience: 1.5 },
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
