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

import { marketValue, marketValueUncapped } from "@okresni-masina/shared";
import { bodyDospivani, DOSPIVANI_DO_VEKU } from "../season/dospivani";
import { teoretickyStropHrace } from "../skills/vyhled-hrace";
import { tempoPodleVeku } from "../skills/verdikt";
import { youthTrainingTempo } from "../skills/youth-tempo";

// Tempo tréninku žije v skills/youth-tempo.ts (používá ho i generátor hráčů).
export { youthTrainingTempo };

export interface YouthSubject {
  age: number;
  rating: number;
  position: string;
  talent: number;
  skillsMax: Record<string, { maxPotential?: number }>;
}

/**
 * Hodnocení za `seasons` sezón, nikdy přes strop dovedností.
 *
 * Trénink: do 21 let naměřené tempo podle talentu, pak odhad podle věku (`tempoPodleVeku`).
 * Dospívání: hra na konci sezóny NEJDŘÍV přidá rok a teprve pak dospějí hráči, kterým je
 * nově nejvýš 21 (season-departures.ts, season-rollover.ts). Dvacetiletý tak dospěje ještě
 * jednou, jednadvacetiletý už ne.
 */
export function projectRating(p: YouthSubject, seasons: number): number {
  const ceiling = teoretickyStropHrace(p.position, p.skillsMax, p.talent) ?? 100;
  let rating = p.rating;
  for (let i = 0; i < seasons; i++) {
    const age = p.age + i;
    rating += age <= DOSPIVANI_DO_VEKU ? youthTrainingTempo(p.talent) : tempoPodleVeku(age);
    if (age + 1 <= DOSPIVANI_DO_VEKU) rating += bodyDospivani(age + 1, p.talent);
    if (rating >= ceiling) return Math.max(p.rating, ceiling);
  }
  return Math.round(rating);
}

/** Jak daleko dopředu skaut odhaduje, kam to hráč dotáhne (stejně jako výhled vlastních hráčů). */
export const POTENTIAL_HORIZON_SEASONS = 8;

/**
 * Kolik si cizí klub řekne za svého hráče: podle talentu (rozhodnutí 2026-10-18). Klub ví,
 * jak rychle jeho kluk poroste, a přirazí si za to, o kolik ho talent za `TALENT_PREMIUM_SEASONS`
 * sezóny posune před běžného kluka stejného věku a hodnocení (talent `TYPICAL_TALENT`). Cena je
 * pak tržní cena hráče s tímto hodnocením navíc, ve stejném věku; nikdy pod dnešní tržní cenu.
 *
 * Proč ne podle reálného stropu z výhledu: model růstu je optimistický pro všechny, podle něj
 * doroste skoro každý teenager na 77–85, a obyčejný osmnáctiletý s talentem 29 vycházel na
 * 322 000 Kč. Lidé přitom teenagery s hodnocením 40–49 prodávají za medián 17 600 Kč. Rozdíl
 * proti běžnému klukovi oceňuje jen to, co je na hráči opravdu zvláštní: talent.
 *
 * Dřív (do 2026-10-18) klub cenil podle jedné sezóny dopředu včetně dospívání: netalentovaný
 * osmnáctiletý s hodnocením 46 za 145 000 Kč, klenot s talentem 90 za 87 000.
 */
export const TALENT_PREMIUM_SEASONS = 3;
/** Běžný talent kluka z obce (střed losování `generateHiddenTalent` na vesnici). */
export const TYPICAL_TALENT = 20;
/** Nejvyšší ocenění klubu: 2,5× nejdražší skutečný přestup (120 000 Kč, říjen 2026). */
export const CLUB_VALUATION_MAX = 300_000;

export function clubValuation(p: YouthSubject): number {
  const today = marketValue(p.rating, p.age, p.position);
  if (p.age > DOSPIVANI_DO_VEKU) return today;
  const advantage = projectRating(p, TALENT_PREMIUM_SEASONS) - projectRating({ ...p, talent: TYPICAL_TALENT }, TALENT_PREMIUM_SEASONS);
  if (advantage <= 0) return today;
  return Math.min(CLUB_VALUATION_MAX, Math.max(today, marketValueUncapped(p.rating + advantage, p.age, p.position)));
}
