import type { MatchPlayer } from "./types";

/**
 * Forma hráče a týmu z posledních zápasů.
 *
 * Dřív byla forma jen kostka 0,75–1,25 na útok týmu, větší rozptyl, než měla taktika
 * (~10 %) i morálka (±6 %). Skutečná hodnocení z odehraných zápasů ležela nevyužitá.
 * Teď je kostka užší a zbytek dělá to, jak hráči v posledních zápasech opravdu hráli.
 */

/** Kolik posledních zápasů je „forma". */
export const FORM_RECENT = 5;
/** Kolik zápasů tvoří hráčův běžný standard, proti kterému se forma měří. */
export const FORM_BASELINE = 20;
/** Bez tolika zápasů v posledních pěti se forma neurčuje. */
const FORM_MIN_RECENT = 3;
/**
 * Odchylka průměru, která znamená plnou formu. Hodnocení mají na produkci směrodatnou
 * odchylku 0,85 (2026-10), průměr pěti zápasů tedy kolem 0,38. Plná forma je zhruba dvojnásobek.
 */
const FORM_FULL_DEVIATION = 0.8;
/** O kolik nejvýš forma sestavy pohne útokem týmu. */
export const TEAM_FORM_WEIGHT = 0.1;
/** Náhodný výkyv dne: 1 ± tato hodnota. Dřív ±0,25 a byl to jediný zdroj formy. */
export const MATCH_DAY_SWING = 0.15;

/**
 * Forma hráče −1 (krize) až +1 (forma života) z hodnocení, nejnovější první.
 * Měří se proti hráčovu vlastnímu průměru, ne proti lize. Jinak by kvalitní hráč měl
 * „formu" trvale a kvalita by se do síly týmu započítala dvakrát.
 */
export function playerFormFromRatings(ratingsNewestFirst: readonly number[]): number {
  const recent = ratingsNewestFirst.slice(0, FORM_RECENT);
  if (recent.length < FORM_MIN_RECENT) return 0;
  const baseline = ratingsNewestFirst.slice(0, FORM_BASELINE);
  const avg = (xs: readonly number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
  const deviation = avg(recent) - avg(baseline);
  return Math.max(-1, Math.min(1, deviation / FORM_FULL_DEVIATION));
}

/** Násobek útoku z formy sestavy: 0,9 až 1,1. Hráč bez formy (nováček) je neutrální. */
export function teamFormFactor(lineup: readonly MatchPlayer[]): number {
  if (lineup.length === 0) return 1;
  const mean = lineup.reduce((s, p) => s + (p.form ?? 0), 0) / lineup.length;
  return 1 + TEAM_FORM_WEIGHT * mean;
}
