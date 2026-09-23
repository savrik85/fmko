/**
 * Náklonnost majitele firmy ke klubu — čisté vzorce bez DB.
 * Pozvání kopíruje logiku zastupitelů obce (routes/villages.ts), jen povahy jsou sponzorské.
 */
import type { OwnerPersonality } from "./owners";
import { SKALY } from "../stadium/stadium-generator";

export const DEFAULT_FAVOR = 40;
export const SEASON_PARTNERSHIP_FAVOR = 5;
export const PUB_BEER_FAVOR = 2;

export function clampFavor(v: number): number {
  return Math.max(0, Math.min(100, Math.round(v)));
}

/** Dárek k pozvání: lepší vztah = levnější, minimum 300 Kč. */
export function invitationGiftCost(favor: number): number {
  return Math.max(300, 500 + (50 - favor) * 10);
}

/** Úroveň lóže 0–3 z čehokoli, co přijde z DB (null, desetinné, mimo rozsah). */
function vipLevel(level: number): number {
  return Math.max(0, Math.min(3, Math.round(level || 0)));
}

/** VIP lóže: o kolik náklonnosti navíc majitel po zápase přidá, když seděl v lóži. */
export function vipBoxFavorBonus(level: number): number {
  return SKALY.vip_box.sponsorFavor[vipLevel(level)];
}

/** VIP lóže: o kolik (podíl 0–1) vzroste šance, že majitel pozvání přijme. */
export function vipBoxAcceptanceBonus(level: number): number {
  return SKALY.vip_box.sponsorAcceptance[vipLevel(level)];
}

/** Šance, že majitel pozvání na domácí zápas přijme. `noise` je v rozmezí -0,1 až 0,1. */
export function invitationAcceptance(i: {
  favor: number; personality: OwnerPersonality; recentLosses: number; noise: number; vipBoxLevel?: number;
}): number {
  let p = 0.40 + 0.008 * (i.favor - 50);
  if (i.personality === "fan") {
    if (i.recentLosses >= 3) p -= 0.15;
    else if (i.recentLosses === 0) p += 0.05;
  }
  if (i.personality === "patriot") p += 0.05;
  if (i.personality === "cautious") p -= 0.05;
  // Pozvání do lóže je lákavější než lavička na tribuně.
  p += vipBoxAcceptanceBonus(i.vipBoxLevel ?? 0);
  p += i.noise;
  return Math.max(0.05, Math.min(0.95, p));
}

/** Přijaté pozvání potěší hned; patriotovi na domácím hřišti nejvíc. */
export function invitationAcceptedDelta(personality: OwnerPersonality): number {
  return personality === "patriot" ? 5 : 3;
}

/** Jak zápas, na kterém majitel seděl, pohne náklonností. Fanoušek prožívá dvojnásob. */
export function postMatchFavorDelta(personality: OwnerPersonality, ourGoals: number, theirGoals: number): number {
  const base = ourGoals > theirGoals ? 4 : ourGoals === theirGoals ? 1 : -1;
  return personality === "fan" ? base * 2 : base;
}

/** Výtržnost fanoušků klubu. Opatrného majitele to odradí dvojnásob. */
export function riotFavorDelta(personality: OwnerPersonality): number {
  return personality === "cautious" ? -4 : -2;
}

export function pubBeerCost(personality: OwnerPersonality): number {
  return personality === "fan" || personality === "patriot" ? 300 : 400;
}

/** Důvody změn náklonnosti, jak je hráč uvidí v záložce Oblíbenost. */
export const FAVOR_REASONS = {
  invitationAccepted: "přijal pozvání na zápas",
  pubBeer: "pivo v hospodě",
  riot: "výtržnost fanoušků",
  seasonPartnership: "sezóna spolupráce s hlavním sponzorem",
  smsReply: "odpověď na SMS",
  smsDismissed: "odbytá SMS",
  smsIgnored: "bez odpovědi na SMS",
} as const;

/** Důvod změny po zápase, na kterém majitel seděl: výsledek a skóre z pohledu domácích. */
export function postMatchFavorReason(ourGoals: number, theirGoals: number): string {
  const score = `${ourGoals}:${theirGoals}`;
  if (ourGoals > theirGoals) return `viděl výhru ${score}`;
  if (ourGoals === theirGoals) return `viděl remízu ${score}`;
  return `viděl prohru ${score}`;
}
