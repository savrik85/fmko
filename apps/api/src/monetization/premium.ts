/**
 * FMK-24: Monetizace — premium předplatné a kosmetické nákupy.
 */

export type PremiumTier = "free" | "premium";

export interface PremiumFeatures {
  maxTeams: number;
  extendedStats: boolean;
  customNicknames: boolean;
  premiumAvatarParts: boolean;
  detailedMatchAnimation: boolean;
  historicalStats: boolean;
}

const TIER_FEATURES: Record<PremiumTier, PremiumFeatures> = {
  free: {
    maxTeams: 1,
    extendedStats: false,
    customNicknames: false,
    premiumAvatarParts: false,
    detailedMatchAnimation: false,
    historicalStats: false,
  },
  premium: {
    maxTeams: 3,
    extendedStats: true,
    customNicknames: true,
    premiumAvatarParts: true,
    detailedMatchAnimation: true,
    historicalStats: true,
  },
};

export function getFeatures(tier: PremiumTier): PremiumFeatures {
  return TIER_FEATURES[tier];
}

export function canCreateTeam(tier: PremiumTier, currentTeams: number): boolean {
  return currentTeams < TIER_FEATURES[tier].maxTeams;
}

// Kosmetické nákupy
export type CosmeticType = "jersey" | "stadium_banner" | "avatar_accessory" | "celebration";

export interface CosmeticItem {
  id: string;
  type: CosmeticType;
  name: string;
  description: string;
  priceKc: number;
}

export const COSMETIC_CATALOG: CosmeticItem[] = [
  // Dresy
  { id: "jersey_retro", type: "jersey", name: "Retro dres 1985", description: "Nostalgický design z osmdesátek", priceKc: 29 },
  { id: "jersey_xmas", type: "jersey", name: "Vánoční dres", description: "Se sobem a vločkami", priceKc: 19 },
  { id: "jersey_camo", type: "jersey", name: "Maskáčový dres", description: "Pro hráče co se chtějí schovat", priceKc: 29 },

  // Stadion
  { id: "banner_1", type: "stadium_banner", name: "Transparent 'Jdeme na to!'", description: "Za brankou", priceKc: 9 },
  { id: "banner_2", type: "stadium_banner", name: "Plachta s logem", description: "Na plot u hřiště", priceKc: 19 },

  // Avatar doplňky
  { id: "avatar_gold_chain", type: "avatar_accessory", name: "Zlatý řetízek", description: "Pro hráče s ego > 80", priceKc: 19 },
  { id: "avatar_headband", type: "avatar_accessory", name: "Čelenka", description: "Retro styl", priceKc: 9 },
  { id: "avatar_tattoo", type: "avatar_accessory", name: "Tetování na paži", description: "Tribální motiv", priceKc: 19 },

  // Oslavy gólů
  { id: "celeb_slide", type: "celebration", name: "Skluz na kolenou", description: "Klasika po gólu", priceKc: 9 },
  { id: "celeb_robot", type: "celebration", name: "Robot", description: "Taneční pohyby", priceKc: 19 },
];
