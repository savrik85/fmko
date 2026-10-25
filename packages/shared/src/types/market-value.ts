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
 * Úroveň cen 25. 10. 2026 (uživatel: „cena hráčů stoupá, starší data budou zkreslovat“):
 * 128 přestupů mezi lidmi od začátku 2. sezóny, hodnocení a věk ze dne prodeje (noční zálohy
 * z R2 + `training_log`). Tvar výše drží: přefitovaný sklon hodnocení ani plynulý věk předpověď
 * nezlepšily (leave-one-out), skok mezi 21 a 22 lety je v cenách skutečný. Ceny ale rostou, hlavně
 * u mladých: za posledních 30 dní lidé platili za hráče do 21 let medián 2,21× vzorce (11 obchodů),
 * za starší 1,13× (16 obchodů). Proto úroveň ×1,13 pro všechny a věk do 21 let ×5,61 (= 2,87 · 2,21 / 1,13).
 * Přeměření: `apps/api/scripts/market-fit/collect-sales.py` (postup v hlavičce). Po úpravě má okno
 * posledních 30 dní vycházet kolem ×1,00 (25. 10.: ×1,00 do 21 let, ×1,02 starší).
 *
 * Strop 190 000 = 1,5× nejdražšího skutečného obchodu (125 000), stejně jako dřív (100 000 → 150 000).
 * Mladí s hodnocením nad 53 v datech nejsou, model je tam jen dopočítaný; se starým stropem by po
 * zdražení mladých stála většina dobrých mladíků stejně.
 */
export const MARKET_VALUE_MIN = 500;
export const MARKET_VALUE_MAX = 190_000;

/** Úroveň cen proti tvaru z 3. 10.: medián posledních 30 dní k 25. 10. u hráčů od 22 let. */
const PRICE_LEVEL = 1.13;
const LN_BASE = 4.4246 + Math.log(PRICE_LEVEL);
const PER_RATING_POINT = 0.10893;

export function marketValueAgeFactor(age: number): number {
  if (age <= 21) return 5.61;
  if (age <= 25) return 0.98;
  if (age <= 29) return 1;
  if (age <= 33) return 0.79;
  return 0.29;
}

const POSITION_FACTOR: Record<string, number> = { GK: 0.32, DEF: 0.74, MID: 1, FWD: 0.8 };

export function marketValue(overallRating: number, age: number, position?: string | null): number {
  return Math.min(MARKET_VALUE_MAX, marketValueUncapped(overallRating, age, position));
}

/**
 * Tentýž vzorec bez stropu. Jen pro ocenění budoucího hráče (cizí klub cení klenot
 * podle toho, kým bude): hráč s hodnocením 80+ v datech přestupů není, strop by ho uřízl
 * na cenu průměrného talentu.
 */
export function marketValueUncapped(overallRating: number, age: number, position?: string | null): number {
  const value = Math.exp(LN_BASE + PER_RATING_POINT * overallRating)
    * marketValueAgeFactor(age)
    * (position ? POSITION_FACTOR[position] ?? 1 : 1);
  return Math.max(MARKET_VALUE_MIN, Math.round(value / 100) * 100);
}

/**
 * Nejvyšší částka, kterou jde v přestupu zadat (nabídka, protinávrh, přihoz, inzerát).
 * Bez stropu ležely v DB nabídky na 1,25·10²⁶ Kč — `Number.isInteger` je propustil.
 */
export const MAX_TRANSFER_AMOUNT = 10_000_000;

/**
 * Tržní cena cizího hráče jako odhad: zaokrouhlená na tisíce, stejně jako jeho dovednosti
 * vidí cizí klub jen zaokrouhlené na pětky. Nabídky a inzeráty počítají s přesnou hodnotou.
 */
export function marketValueEstimate(value: number): number {
  return Math.max(1000, Math.round(value / 1000) * 1000);
}
