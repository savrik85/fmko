import type { Rng } from "./rng";
import type { MatchPlayer } from "../engine/types";

export type PositionKind = "GK" | "DEF" | "MID" | "FWD";
export type BodyType = "thin" | "athletic" | "stocky" | "obese" | "normal";

/**
 * Postava hráče: jak výška a váha mění vlastnosti v zápase a v profilu.
 * Spec: docs/superpowers/specs/2026-10-08-player-body-design.md
 *
 * Hodnocení, cena, mzda ani trénink se postavou neřídí. Úpravy se přičítají jen
 * k vlastnostem hráče pro engine (buildMatchPlayers, mapRowToMatchPlayer) a ukazují
 * se v profilu (detail hráče v API).
 */

/** BMI, při kterém je hráč „v normě“. 180 cm → 76 kg, 190 cm → 85 kg. */
export const IDEAL_BMI = 23.5;
/** Kolik kg od ideálu se ještě nic neděje. */
export const WEIGHT_TOLERANCE_KG = 4;
const OVERWEIGHT_CAP = 12;
const MASS_STRENGTH_CAP = 4;
const UNDERWEIGHT_CAP = 6;
const HEADING_REFERENCE_CM = 180;
const HEADING_PER_CM = 0.4;
const HEADING_CAP = 5;
const GK_REFERENCE_CM = 185;
const GK_REACH_PER_CM = 0.008;

const BODY_TYPES: readonly BodyType[] = ["thin", "athletic", "stocky", "obese", "normal"];

export function isBodyType(v: unknown): v is BodyType {
  return typeof v === "string" && (BODY_TYPES as readonly string[]).includes(v);
}

export interface BodyEffects {
  speed: number;
  stamina: number;
  strength: number;
  heading: number;
  /** Násobek brankářského chytání u vysokých míčů (0,9–1,1). */
  gkReach: number;
}

const NO_EFFECTS: BodyEffects = { speed: 0, stamina: 0, strength: 0, heading: 0, gkReach: 1 };

/** Kladné konečné číslo, jinak null. Text („180“) a nula jsou chybějící údaj. */
function positive(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) && v > 0 ? v : null;
}

/** `-0` → `0`. Math.round(-0,4) i 0 − 0 při záporu dávají zápornou nulu. */
function noNegativeZero(v: number): number {
  return v === 0 ? 0 : v;
}

export function idealWeight(heightCm: number): number {
  return IDEAL_BMI * (heightCm / 100) ** 2;
}

export function gkReachFactor(heightCm: number | undefined): number {
  const h = positive(heightCm);
  if (h === null) return 1;
  return Math.max(0.9, Math.min(1.1, 1 + (h - GK_REFERENCE_CM) * GK_REACH_PER_CM));
}

export function bodyEffects(physical: Record<string, unknown> | null | undefined): BodyEffects {
  const height = positive(physical?.height);
  if (height === null) return { ...NO_EFFECTS };
  const heading = noNegativeZero(Math.max(-HEADING_CAP, Math.min(HEADING_CAP,
    Math.round((height - HEADING_REFERENCE_CM) * HEADING_PER_CM))));
  const gkReach = gkReachFactor(height);

  const weight = positive(physical?.weight);
  if (weight === null) return { speed: 0, stamina: 0, strength: 0, heading, gkReach };

  const excess = weight - idealWeight(height);
  let speed = 0;
  let strength = 0;
  if (excess > WEIGHT_TOLERANCE_KG) {
    speed = noNegativeZero(-Math.min(OVERWEIGHT_CAP, Math.round((excess - WEIGHT_TOLERANCE_KG) / 2)));
    strength = Math.min(MASS_STRENGTH_CAP, Math.floor(excess / 4));
  } else if (excess < -WEIGHT_TOLERANCE_KG) {
    strength = noNegativeZero(-Math.min(UNDERWEIGHT_CAP, Math.round((-excess - WEIGHT_TOLERANCE_KG) / 2)));
  }
  return { speed, stamina: speed, strength, heading, gkReach };
}

export interface PlayerBodyView {
  bodyType: BodyType | null;
  /** Ideální váha v celých kg, null bez výšky. */
  idealWeight: number | null;
  effects: { speed: number; stamina: number; strength: number; heading: number };
}

/** Co o postavě ukazuje profil hráče (detail hráče v API). */
export function playerBodyView(physical: Record<string, unknown> | null | undefined): PlayerBodyView {
  const height = positive(physical?.height);
  const e = bodyEffects(physical);
  return {
    bodyType: isBodyType(physical?.bodyType) ? physical!.bodyType as BodyType : null,
    idealWeight: height === null ? null : Math.round(idealWeight(height)),
    effects: { speed: e.speed, stamina: e.stamina, strength: e.strength, heading: e.heading },
  };
}

/** Váha k ideálu podle výšky. BMI: hubený ~21, atletický 23,5, normální ~25, zavalitý ~27, obézní ~31. */
const BODY_WEIGHT_FACTOR: Record<BodyType, number> = {
  thin: 0.88, athletic: 1.0, normal: 1.05, stocky: 1.15, obese: 1.32,
};

/**
 * Výška podle postu ±8 cm, váha z výšky a postavy ±3 kg. Dřív se váha losovala
 * nezávisle na výšce (170 cm i 194 cm kolem 80 kg) a postava se po vzniku hráče zahodila.
 */
export function generateHeightWeight(
  rng: Rng,
  position: string,
  bodyType: string = "normal",
): { height: number; weight: number; bodyType: BodyType } {
  const type: BodyType = isBodyType(bodyType) ? bodyType : "normal";
  const baseHeight = position === "GK" ? 185 : position === "DEF" ? 180 : position === "FWD" ? 178 : 176;
  const height = baseHeight + rng.int(-8, 8);
  const weight = Math.round(idealWeight(height) * BODY_WEIGHT_FACTOR[type]) + rng.int(-3, 3);
  return { height, weight, bodyType: type };
}

/**
 * Přičte úpravy postavou k vlastnostem hráče pro engine. Volá se jen při stavbě
 * hráčů pro zápas a náhled, nikdy nad uloženými dovednostmi. Vlastnost bez úpravy
 * se nemění (ani nula), upravená neklesne pod 1.
 */
export function applyBodyEffects(player: MatchPlayer, physical: Record<string, unknown> | null | undefined): void {
  const e = bodyEffects(physical);
  if (e.speed !== 0) player.speed = Math.max(1, player.speed + e.speed);
  if (e.stamina !== 0) player.stamina = Math.max(1, player.stamina + e.stamina);
  if (e.strength !== 0) player.strength = Math.max(1, player.strength + e.strength);
  if (e.heading !== 0) player.heading = Math.max(1, player.heading + e.heading);
  const height = positive(physical?.height);
  if (height !== null) player.height = height;
}
