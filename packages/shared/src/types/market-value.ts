/**
 * Tržní hodnota hráče (Kč) — JEDINÝ vzorec pro API i web.
 *
 * Nafitováno na skutečných přestupech mezi lidskými kluby v Okresním přeboru Prachatice
 * (113 obchodů, duben–říjen 2026, cena z přijetí nabídky). Hodnocení i věk jsou ty
 * z DNE PRODEJE: dnešní dovednosti se vrátily přes `training_log` na stav k datu přijetí.
 * Prachatice jsou jediná liga s dost obchody (Praha 4, ČB 0), proto platí všude.
 *
 *   ln(cena) = 4,4246 + 0,10893 · hodnocení   (každý bod +11,5 %, dvojnásobek za ~6,4 bodu)
 *   věk:    16–21 ×2,87 | 22–25 ×0,98 | 26–29 ×1 | 30–33 ×0,79 | 34+ ×0,29
 *   pozice: ZÁL ×1 | ÚTO ×0,80 | OBR ×0,74 | BRA ×0,32 (brankáři mají nafouknuté hodnocení)
 *
 * Strop 150 000: nejdražší skutečný obchod byl za 100 000 a mladí s hodnocením 50+
 * v datech nejsou, model je tam jen dopočítaný.
 */
export const MARKET_VALUE_MIN = 500;
export const MARKET_VALUE_MAX = 150_000;

const LN_BASE = 4.4246;
const PER_RATING_POINT = 0.10893;

export function marketValueAgeFactor(age: number): number {
  if (age <= 21) return 2.87;
  if (age <= 25) return 0.98;
  if (age <= 29) return 1;
  if (age <= 33) return 0.79;
  return 0.29;
}

const POSITION_FACTOR: Record<string, number> = { GK: 0.32, DEF: 0.74, MID: 1, FWD: 0.8 };

export function marketValue(overallRating: number, age: number, position?: string | null): number {
  const value = Math.exp(LN_BASE + PER_RATING_POINT * overallRating)
    * marketValueAgeFactor(age)
    * (position ? POSITION_FACTOR[position] ?? 1 : 1);
  return Math.min(MARKET_VALUE_MAX, Math.max(MARKET_VALUE_MIN, Math.round(value / 100) * 100));
}

/**
 * Nejvyšší částka, kterou jde v přestupu zadat (nabídka, protinávrh, přihoz, inzerát).
 * Bez stropu ležely v DB nabídky na 1,25·10²⁶ Kč — `Number.isInteger` je propustil.
 */
export const MAX_TRANSFER_AMOUNT = 10_000_000;
