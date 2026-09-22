/**
 * Majitel firmy (sponzora): postava s povahou, podle které se chová při pozvání
 * a později při jednání o smlouvě. Deterministický podle id sponzora, takže je
 * stejný na testu i na produkci.
 */
import { createRng } from "../generators/rng";
import { generateOfficialFace, hashSeed, LAST_NAMES_M, MALE_FIRST_NAMES } from "../villages/officials-generator";
import type { SponsorType } from "./types";

export const OWNER_PERSONALITIES = ["patriot", "businessman", "fan", "cautious"] as const;
export type OwnerPersonality = (typeof OWNER_PERSONALITIES)[number];

export function isOwnerPersonality(v: unknown): v is OwnerPersonality {
  return typeof v === "string" && (OWNER_PERSONALITIES as readonly string[]).includes(v);
}

export interface GeneratedOwner {
  firstName: string;
  lastName: string;
  age: number;
  faceConfig: Record<string, unknown>;
  personality: OwnerPersonality;
}

type Weights = Record<OwnerPersonality, number>;
const DEFAULT_WEIGHTS: Weights = { patriot: 2, businessman: 2, fan: 2, cautious: 2 };

// Hospodský spíš fandí, velká firma spíš počítá, stavař spíš hlídá riziko.
const TYPE_WEIGHTS: Record<SponsorType, Weights> = {
  pub: { patriot: 3, businessman: 1, fan: 4, cautious: 1 },
  restaurant: { patriot: 2, businessman: 2, fan: 3, cautious: 1 },
  fast_food: { patriot: 1, businessman: 3, fan: 3, cautious: 1 },
  cafe: { patriot: 2, businessman: 2, fan: 3, cautious: 1 },
  bakery: { patriot: 3, businessman: 1, fan: 2, cautious: 2 },
  butcher: { patriot: 3, businessman: 1, fan: 3, cautious: 1 },
  grocery: { patriot: 3, businessman: 2, fan: 1, cautious: 2 },
  shop: { patriot: 2, businessman: 3, fan: 1, cautious: 2 },
  brewery: { patriot: 2, businessman: 3, fan: 3, cautious: 1 },
  farm: { patriot: 4, businessman: 1, fan: 2, cautious: 2 },
  gardening: { patriot: 3, businessman: 1, fan: 1, cautious: 3 },
  construction: { patriot: 2, businessman: 2, fan: 1, cautious: 4 },
  woodwork: { patriot: 3, businessman: 1, fan: 2, cautious: 2 },
  car_service: { patriot: 2, businessman: 2, fan: 3, cautious: 1 },
  car_dealer: { patriot: 1, businessman: 4, fan: 2, cautious: 1 },
  electro: { patriot: 2, businessman: 2, fan: 2, cautious: 2 },
  it: { patriot: 1, businessman: 4, fan: 2, cautious: 2 },
  ecommerce: { patriot: 1, businessman: 5, fan: 1, cautious: 2 },
  company: { patriot: 1, businessman: 4, fan: 1, cautious: 3 },
  industry: { patriot: 1, businessman: 3, fan: 1, cautious: 4 },
  services: { patriot: 1, businessman: 3, fan: 1, cautious: 3 },
  hospitality: { patriot: 1, businessman: 4, fan: 1, cautious: 2 },
  municipality: { patriot: 5, businessman: 1, fan: 1, cautious: 2 },
  club: { patriot: 3, businessman: 1, fan: 4, cautious: 1 },
};

export function generateSponsorOwner(sponsorId: number, sponsorType: string): GeneratedOwner {
  const rng = createRng(hashSeed(`sponsor-owner|${sponsorId}|v1`));
  const personality = rng.weighted(TYPE_WEIGHTS[sponsorType as SponsorType] ?? DEFAULT_WEIGHTS) as OwnerPersonality;
  const firstName = MALE_FIRST_NAMES[rng.int(0, MALE_FIRST_NAMES.length - 1)];
  const lastName = LAST_NAMES_M[rng.int(0, LAST_NAMES_M.length - 1)];
  const age = rng.int(32, 68);
  const faceConfig = generateOfficialFace(rng, false);
  return { firstName, lastName, age, faceConfig, personality };
}
