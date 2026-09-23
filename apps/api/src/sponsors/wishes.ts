/**
 * Co majitel firmy při jednání chce (spec, tabulka povah) a jak moc mu na slibu záleží.
 * Přání se losují deterministicky pro (sponzor, klub, sezóna, kategorie), takže se
 * při znovuotevření jednání v téže sezóně nemění.
 */
import { createRng } from "../generators/rng";
import { hashSeed } from "../villages/officials-generator";
import type { OwnerPersonality } from "./owners";
import { RESULT_KINDS, type PromiseKind } from "./promise-kinds";
import type { SponsorType } from "./types";

export const PERSONALITY_WISHES: Record<OwnerPersonality, readonly PromiseKind[]> = {
  patriot: ["youth", "no_riots", "reputation"],
  businessman: ["attendance", "jersey_logo", "sector_exclusivity"],
  fan: ["league_position", "promotion", "cup_round"],
  cautious: ["no_relegation", "reputation", "no_riots"],
};

/** Obor přidá jedno přání: hospody návštěvu, stavaři modernizaci, IT výsledky. */
export const SECTOR_WISH: Partial<Record<SponsorType, PromiseKind>> = {
  brewery: "attendance",
  pub: "attendance",
  restaurant: "attendance",
  construction: "stadium_upgrade",
  woodwork: "stadium_upgrade",
  it: "league_position",
  ecommerce: "league_position",
};

export const WISH_INTEREST = 1.5;
export const NEUTRAL_INTEREST = 1;
export const INDIFFERENT_INTEREST = 0.5;

/** Logo na rukávu dresu dává smysl jen u sponzora stadionu (hlavní sponzor je v názvu klubu). */
export function kindAllowedForCategory(kind: PromiseKind, category: "main" | "stadium"): boolean {
  return kind !== "jersey_logo" || category === "stadium";
}

export function ownerWishes(i: {
  sponsorId: number; teamId: string; season: number; personality: OwnerPersonality; sponsorType: string;
  category: "main" | "stadium";
}): PromiseKind[] {
  const rng = createRng(hashSeed(`sponsor-wishes|${i.sponsorId}|${i.teamId}|${i.season}|${i.category}`));
  const pool = PERSONALITY_WISHES[i.personality].filter((k) => kindAllowedForCategory(k, i.category));
  const shuffled = [...pool];
  for (let j = shuffled.length - 1; j > 0; j--) {
    const k = Math.floor(rng.random() * (j + 1));
    [shuffled[j], shuffled[k]] = [shuffled[k], shuffled[j]];
  }
  const out = shuffled.slice(0, 2);
  const sector = SECTOR_WISH[i.sponsorType as SponsorType];
  if (sector && kindAllowedForCategory(sector, i.category) && !out.includes(sector)) out.push(sector);
  return out;
}

/** Zájem o slib: přání 1,5, povaze lhostejné 0,5 (opatrný a výsledky nad nesestup, obchodník a mladí), jinak 1. */
export function promiseInterest(kind: PromiseKind, personality: OwnerPersonality, wishes: readonly PromiseKind[]): number {
  if (wishes.includes(kind)) return WISH_INTEREST;
  if (personality === "cautious" && RESULT_KINDS.has(kind)) return INDIFFERENT_INTEREST;
  if (personality === "businessman" && kind === "youth") return INDIFFERENT_INTEREST;
  return NEUTRAL_INTEREST;
}
