import type { Rng } from "./rng";

export type PositionKind = "GK" | "DEF" | "MID" | "FWD";
export type BodyType = "thin" | "athletic" | "stocky" | "obese" | "normal";

export function generateHeightWeight(
  rng: Rng,
  position: string,
  bodyType: string = "normal",
): { height: number; weight: number } {
  const baseHeight = position === "GK" ? 185 : position === "DEF" ? 180 : position === "FWD" ? 178 : 176;
  const height = baseHeight + rng.int(-8, 8);
  const baseWeight = bodyType === "obese" ? 100 : bodyType === "stocky" ? 88 : bodyType === "thin" ? 68 : bodyType === "athletic" ? 78 : 80;
  const weight = baseWeight + rng.int(-5, 8);
  return { height, weight };
}
