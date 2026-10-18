/**
 * Hráči z německého okresu (Freyung-Grafenau, za Šumavou), kam může jezdit skaut (2026-10-18).
 *
 * Rozhodnutí uživatele: německý hráč stojí dvakrát tolik a chce půldruhého platu, do Česka
 * se mu nechce (ochotu snižuje faktor „Zahraničí“ v `evaluateSigningChance`).
 */

import { GERMAN_FIRSTNAMES } from "../data/german-names";

/** Kolikrát víc chce německý klub za hráče než český klub stejné velikosti. */
export const FOREIGN_PRICE_FACTOR = 2;
/** Kolikrát vyšší plat chce hráč z Německa. */
export const FOREIGN_WAGE_FACTOR = 1.5;
/**
 * O kolik je bavorský klub silnější než český klub stejně velké obce. Za dvojnásobnou cenu
 * musí být lepší hráči: na kopii produkce (2026-10-18) měly i Freyung, Grafenau a Waldkirchen
 * nejlepší hráče jen 54 a skaut silného týmu by Němce nehlásil vůbec. Herní rozhodnutí,
 * ne statistika: za hranicí jsou lepší hráči, ale za víc peněz a hůř se jim chce.
 */
export const FOREIGN_CLUB_BONUS = 5;

/** Křestní jména německých hráčů ve tvaru, který bere `pickFirstName`. */
export const GERMAN_FIRSTNAME_DATA = { male: GERMAN_FIRSTNAMES, female: {} as Record<string, Record<string, number>> };

/** Je hráč z klubu v cizině? */
export function isFromAbroad(p: { fromCountry?: string | null }): boolean {
  return !!p.fromCountry && p.fromCountry !== "CZ";
}

/** Násobek ceny klubu: u hráče z ciziny `FOREIGN_PRICE_FACTOR`, jinak 1. */
export function foreignPriceFactor(p: { fromCountry?: string | null }): number {
  return isFromAbroad(p) ? FOREIGN_PRICE_FACTOR : 1;
}
