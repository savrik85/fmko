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
import { POTENTIAL_HORIZON_SEASONS, projectRating } from "./youth-growth";

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
  // Do 21 let naměřené tempo podle talentu a dospívání tak, jak ho hra opravdu dělá,
  // pak tempo podle věku (youth-growth.ts). Nikdy přes strop dovedností.
  const reachable = projectRating(player, POTENTIAL_HORIZON_SEASONS);
  const range = rangeAround(reachable, ratingHalfWidth(eff, visits), `${seed}:potential`, 1, 100);
  // Pod dnešní výkon nikdo nespadne, i kdyby skaut odhadoval sebehůř.
  return { lo: Math.max(range.lo, Math.min(player.rating, range.hi)), hi: range.hi };
}

/**
 * Jak moc se skaut může plést (0–1): stejný základ jako šířka rozmezí hodnocení, tedy
 * (18 − 14·kvalita) / 18, a každá další návštěva chybu zmenší (÷ √návštěv).
 * Mizerný skaut (5) ~0,8, průměrný (13,5) ~0,47, špičkový (20) ~0,22.
 */
export function scoutError(eff: number, visits: number): number {
  return (18 - scoutQuality(eff) * 14) / 18 / Math.sqrt(Math.max(1, visits));
}

/**
 * Nejvyšší chyba odhadu ceny při chybě skauta 1: ±40 %. Odhad, ne data — u mizerného
 * skauta vyjde zhruba ±32 %, u špičkového ±9 %.
 */
export const ASK_HINT_MAX_ERROR = 0.4;

/** Kolik si podle skauta klub řekne: skutečný první požadavek zkreslený podle skauta, na tisíce. */
export function blurredAskHint(ask: number, eff: number, visits: number, seed: string): number {
  const off = stableOffset(`${seed}:ask`) * ASK_HINT_MAX_ERROR * scoutError(eff, visits);
  return Math.max(1000, Math.round((ask * (1 + off)) / 1000) * 1000);
}

/**
 * Ochota hráče, jak ji vidí skaut (0–3). Mizerný skaut se splete až o stupeň, špičkový
 * prakticky ne. Posun ±1,5 stupně při chybě 1 je odhad.
 */
export function blurredWillingness(level: number, eff: number, visits: number, seed: string): 0 | 1 | 2 | 3 {
  const shift = Math.round(stableOffset(`${seed}:will`) * 1.5 * scoutError(eff, visits));
  return Math.max(0, Math.min(3, level + shift)) as 0 | 1 | 2 | 3;
}
