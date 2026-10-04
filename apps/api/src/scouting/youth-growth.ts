/**
 * Kolik mladý hráč doopravdy naroste a kolik za něj proto chce jeho klub (spec 2026-10-04).
 *
 * Tempo tréninku je NAMĚŘENÉ na produkci 2026-10-04: hráči do 21 let, součet bodů
 * z `training_log` za posledních 120 dní (bez dospívání) × 0,087 bodu hodnocení na bod:
 *
 *   talent < 30   434 hráčů   2,58 bodu hodnocení
 *   talent 30–49  282 hráčů   3,11
 *   talent 50–69   18 hráčů   4,28
 *   talent 70+     33 hráčů   5,87
 *
 * Odhad podle věku (`tempoPodleVeku`) talent nezná a talentovaným klukům ubíral. K tréninku
 * se na konci sezóny přičítá dospívání (`bodyDospivani`), stejně jako to dělá hra.
 */

import { marketValue } from "@okresni-masina/shared";
import { bodyDospivani, DOSPIVANI_DO_VEKU } from "../season/dospivani";
import { teoretickyStropHrace } from "../skills/vyhled-hrace";

/** Naměřené tempo tréninku mladých (body hodnocení za sezónu) podle skrytého talentu. */
export function youthTrainingTempo(talent: number): number {
  if (talent >= 70) return 5.87;
  if (talent >= 50) return 4.28;
  if (talent >= 30) return 3.11;
  return 2.58;
}

export interface YouthSubject {
  age: number;
  rating: number;
  position: string;
  talent: number;
  skillsMax: Record<string, { maxPotential?: number }>;
}

/** Hodnocení za `seasons` sezón: trénink naměřeným tempem + dospívání, nikdy přes strop dovedností. */
export function projectRating(p: YouthSubject, seasons: number): number {
  const ceiling = teoretickyStropHrace(p.position, p.skillsMax, p.talent) ?? 100;
  let rating = p.rating;
  for (let i = 0; i < seasons; i++) {
    const age = p.age + i;
    rating += youthTrainingTempo(p.talent);
    if (age <= DOSPIVANI_DO_VEKU) rating += bodyDospivani(age, p.talent);
    if (rating >= ceiling) return Math.max(p.rating, ceiling);
  }
  return Math.round(rating);
}

/**
 * Klub zná svého kluka: mladíka do 21 let nepustí za cenu podle dnešního hodnocení, ale za
 * tržní cenu hráče, kterým bude za sezónu (rok tréninku a dospívání). Talentovaný kluk tak
 * stojí víc než netalentovaný se stejným dnešním hodnocením. Horizont jedné sezóny je odhad,
 * ne data: lidé talent nevidí, takže ho v cenách skutečných přestupů naměřit nejde.
 */
export const CLUB_VALUATION_SEASONS = 1;

export function clubValuation(p: YouthSubject): number {
  if (p.age > DOSPIVANI_DO_VEKU) return marketValue(p.rating, p.age, p.position);
  const projected = projectRating(p, CLUB_VALUATION_SEASONS);
  return Math.max(
    marketValue(p.rating, p.age, p.position),
    marketValue(projected, p.age + CLUB_VALUATION_SEASONS, p.position),
  );
}
