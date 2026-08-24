import type { Weather } from "../engine/types";

/**
 * Vlhkost trávníku 0–100 (50 = normál, 0 = vyprahlý na kost, 100 = rozmáčený).
 *
 * Do 2026-08-25 se vyschlý trávník i kaluže odvozovaly z AKTUÁLNÍHO počasí, takže
 * týden veder skončil v momentě, kdy se zatáhlo — hřiště bylo hned zase zelené.
 * Vlhkost je paměť: v suchu klesá, v dešti stoupá a mezi zápasy se pomalu vrací
 * k normálu, jak se půda vyrovná.
 *
 * Není to totéž co `pitch_condition`. Kondice je kvalita trávníku (drny, nerovnosti,
 * vyšlapaná místa) a opravuje se údržbou. Vlhkost je momentální stav půdy a spraví
 * ji déšť nebo zálivka. Rozorané hřiště může být rozmáčené i vyprahlé.
 */

export const MOISTURE_NORMAL = 50;
export const MOISTURE_MIN = 0;
export const MOISTURE_MAX = 100;

/** Jak zápas v daném počasí pohne vlhkostí. */
const MATCH_SHIFT: Record<Weather, number> = {
  rain: 18,
  snow: 12,
  cloudy: 2,
  wind: -6,   // vítr půdu vysušuje
  sunny: -14,
};

/** Kolik vlhkosti přidá zapnuté zavlažování. */
export const IRRIGATION_MOISTURE_GAIN = 10;

function clamp(n: number): number {
  return Math.max(MOISTURE_MIN, Math.min(MOISTURE_MAX, Math.round(n)));
}

/**
 * Vlhkost po odehraném domácím zápase.
 *
 * Zavlažování půdu dotuje, takže na výhni ji udrží kolem normálu místo propadu.
 * Úklid sněhu vlhkost nemění — sníh se shrne, ale co roztálo, zůstalo.
 */
export function moistureAfterMatch(
  current: number,
  weather: Weather | null | undefined,
  opts: { irrigationRan?: boolean } = {},
): number {
  const base = weather ? (MATCH_SHIFT[weather] ?? 0) : 0;
  const watered = opts.irrigationRan ? IRRIGATION_MOISTURE_GAIN : 0;
  return clamp(current + base + watered);
}

/**
 * Denní drift zpět k normálu — půda se sama vyrovná, ať byla rozmáčená nebo vyprahlá.
 * Pomalu (2 body/den), aby si hřiště stav pár dní pamatovalo.
 */
export function moistureDailyDrift(current: number, step = 2): number {
  if (current === MOISTURE_NORMAL) return current;
  const dir = current > MOISTURE_NORMAL ? -1 : 1;
  const next = current + dir * step;
  // Nepřestřelit přes normál.
  return clamp(dir > 0 ? Math.min(next, MOISTURE_NORMAL) : Math.max(next, MOISTURE_NORMAL));
}

/**
 * Jak moc je hřiště rozmáčené (0–1) — kolik kaluží se na něm drží.
 * Začíná nad 55, plno je při 100.
 */
export function wetnessFromMoisture(moisture: number | null | undefined): number {
  if (moisture == null) return 0;
  return Math.max(0, Math.min(1, (moisture - 55) / 45));
}

/**
 * Jak moc je hřiště vyprahlé (0–1) — kolik trávy zežloutlo.
 * Začíná pod 45, úplně spálené je při 0.
 */
export function drynessFromMoisture(moisture: number | null | undefined): number {
  if (moisture == null) return 0;
  return Math.max(0, Math.min(1, (45 - moisture) / 45));
}
