/** Obory sponzorů — pevné klíče, české popisky jsou na webu (apps/web/src/lib/sponsor-types.ts). */
export const SPONSOR_TYPES = [
  "pub", "restaurant", "fast_food", "cafe", "bakery", "butcher", "grocery", "shop", "brewery",
  "farm", "gardening", "construction", "woodwork", "car_service", "car_dealer", "electro", "it",
  "ecommerce", "company", "industry", "services", "hospitality", "municipality", "club",
] as const;

export type SponsorType = (typeof SPONSOR_TYPES)[number];

export function isSponsorType(v: unknown): v is SponsorType {
  return typeof v === "string" && (SPONSOR_TYPES as readonly string[]).includes(v);
}
