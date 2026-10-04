/**
 * Co skaut o cizím hráči ví: hodnocení jako rozmezí a názor na potenciál (spec 2026-10-04).
 *
 * Šířka rozmezí: ±max(2, round(rozptyl / √návštěv)), kde rozptyl je tentýž odhad, jakým klub
 * odhaduje strop vlastních hráčů (±18 bez skauta, ±4 se špičkovým). Další návštěva rozmezí
 * zúží, jako když průměrujete víc pozorování. Spodní hranice ±2 odpovídá tomu, že cizí
 * hráče vidí manažer zaokrouhlené na pětky.
 *
 * Rozmezí je stabilní (posun z ID hlášení, ne z náhody) a skutečné hodnocení v něm leží vždy.
 */

import { stableOffset } from "../lib/scout-estimate";
import { teoretickyStropHrace } from "../skills/vyhled-hrace";
import { realneDosazitelnyStrop, tempoPodleVeku } from "../skills/verdikt";
import { youthTrainingTempo } from "./youth-growth";

export interface Range { lo: number; hi: number }

/** Efektivita skauta 1–20 → kvalita 0–1, jak ji bere `estimateSpread`. */
export function scoutQuality(eff: number): number {
  return Math.max(0, Math.min(1, eff / 20));
}

export function ratingHalfWidth(eff: number, visits: number): number {
  // Stejný vzorec jako `estimateSpread`, jen se zaokrouhluje až po dělení návštěvami.
  const spread = 18 - scoutQuality(eff) * 14;
  return Math.max(2, Math.round(spread / Math.sqrt(Math.max(1, visits))));
}

/**
 * Okno kolem skutečné hodnoty posunuté o stabilní kus šířky. Posun je nejvýš 80 % šířky,
 * takže skutečná hodnota leží v okně vždy, jen ne vždy uprostřed.
 */
export function rangeAround(trueValue: number, halfWidth: number, seed: string, min = 1, max = 99): Range {
  const center = trueValue + Math.round(stableOffset(seed) * halfWidth * 0.8);
  return {
    lo: Math.max(min, Math.min(trueValue, center - halfWidth)),
    hi: Math.min(max, Math.max(trueValue, center + halfWidth)),
  };
}

export function ratingRange(trueRating: number, eff: number, visits: number, seed: string): Range {
  return rangeAround(trueRating, ratingHalfWidth(eff, visits), `${seed}:rating`);
}

/** Střed rozmezí — odhad, podle kterého se skaut rozhoduje, jestli hráče vůbec hlásit. */
export function rangeMid(r: Range): number {
  return Math.round((r.lo + r.hi) / 2);
}

/**
 * Skautův názor, kam hráč reálně dojde: reálně dosažitelný strop (stejný výpočet jako výhled
 * vlastních hráčů) a kolem něj rozmezí podle skauta. `null`, když hráč nemá stropy dovedností.
 */
export function potentialRange(
  player: { age: number; rating: number; position: string; talent: number; skillsMax: Record<string, { maxPotential?: number }> },
  eff: number,
  visits: number,
  seed: string,
): Range | null {
  const theoretical = teoretickyStropHrace(player.position, player.skillsMax, player.talent);
  if (theoretical === null) return null;
  const ceiling = Math.max(player.rating, Math.min(100, theoretical));
  // Mladí rostou naměřeným tempem podle talentu (youth-growth.ts), starší podle věku.
  const tempo = player.age <= 21 ? youthTrainingTempo(player.talent) : tempoPodleVeku(player.age);
  const reachable = realneDosazitelnyStrop(player.age, player.rating, ceiling, player.talent, tempo);
  const range = rangeAround(reachable, ratingHalfWidth(eff, visits), `${seed}:potential`, 1, 100);
  // Pod dnešní výkon nikdo nespadne, i kdyby skaut odhadoval sebehůř.
  return { lo: Math.max(range.lo, Math.min(player.rating, range.hi)), hi: range.hi };
}
