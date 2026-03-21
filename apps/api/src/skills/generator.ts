/**
 * FMK-53: Generátor skillů pro nového hráče (0-100 stupnice).
 */

import type { Rng } from "../generators/rng";
import type { FieldSkills, GoalkeeperSkills, SkillValue, LeagueLevelRange } from "./types";
import { SKILL_RANGES_BY_LEVEL } from "./types";

function generateSkillValue(rng: Rng, range: LeagueLevelRange, positionBonus: number): SkillValue {
  const cap = rng.int(range.capMin + positionBonus, range.capMax + positionBonus);
  const clampedCap = Math.min(100, Math.max(1, cap));
  const current = rng.int(
    Math.max(1, range.avgMin + positionBonus - 5),
    Math.min(clampedCap, range.avgMax + positionBonus),
  );
  return { current: Math.max(1, current), maxPotential: clampedCap };
}

function applyAgeCurve(skill: SkillValue, age: number): SkillValue {
  let mod = 1.0;
  if (age < 20) mod = 0.7;
  else if (age < 28) mod = 1.0;
  else if (age < 34) mod = 0.9;
  else if (age < 40) mod = 0.75;
  else mod = 0.5;

  return {
    current: Math.max(1, Math.round(skill.current * mod)),
    maxPotential: skill.maxPotential,
  };
}

/**
 * Generate field player skills.
 */
export function generateFieldSkills(
  rng: Rng,
  position: "DEF" | "MID" | "FWD",
  villageSize: string,
  age: number,
): FieldSkills {
  const range = SKILL_RANGES_BY_LEVEL[villageSize] ?? SKILL_RANGES_BY_LEVEL.village;

  // Position-specific bonuses
  const bonuses: Record<string, Record<string, number>> = {
    DEF: { defense: 10, heading: 8, strength: 5, speed: 0, technique: -5, shooting: -8, passing: 0, vision: 3, stamina: 3 },
    MID: { passing: 10, vision: 8, technique: 5, stamina: 5, defense: 0, heading: -3, shooting: 0, speed: 0, strength: -3 },
    FWD: { shooting: 10, speed: 8, technique: 5, heading: 3, passing: 0, defense: -8, vision: 0, stamina: 0, strength: 0 },
  };
  const b = bonuses[position];

  const skills: FieldSkills = {
    speed: applyAgeCurve(generateSkillValue(rng, range, b.speed), age),
    stamina: applyAgeCurve(generateSkillValue(rng, range, b.stamina), age),
    strength: applyAgeCurve(generateSkillValue(rng, range, b.strength), age),
    technique: applyAgeCurve(generateSkillValue(rng, range, b.technique), age),
    shooting: applyAgeCurve(generateSkillValue(rng, range, b.shooting), age),
    passing: applyAgeCurve(generateSkillValue(rng, range, b.passing), age),
    heading: applyAgeCurve(generateSkillValue(rng, range, b.heading), age),
    defense: applyAgeCurve(generateSkillValue(rng, range, b.defense), age),
    vision: applyAgeCurve(generateSkillValue(rng, range, b.vision ?? 0), age),
    experience: {
      current: Math.min(100, Math.max(0, (age - 16) * rng.int(3, 6))),
      maxPotential: 100,
    },
  };

  return skills;
}

/**
 * Generate goalkeeper skills.
 */
export function generateGKSkills(
  rng: Rng,
  villageSize: string,
  age: number,
): GoalkeeperSkills {
  const range = SKILL_RANGES_BY_LEVEL[villageSize] ?? SKILL_RANGES_BY_LEVEL.village;
  const gkBonus = 5;

  return {
    reflexes: applyAgeCurve(generateSkillValue(rng, range, gkBonus + 5), age),
    positioning: applyAgeCurve(generateSkillValue(rng, range, gkBonus + 3), age),
    rushing: applyAgeCurve(generateSkillValue(rng, range, gkBonus), age),
    catching: applyAgeCurve(generateSkillValue(rng, range, gkBonus + 5), age),
    kicking: applyAgeCurve(generateSkillValue(rng, range, gkBonus - 3), age),
    distribution: applyAgeCurve(generateSkillValue(rng, range, gkBonus - 5), age),
    strength: applyAgeCurve(generateSkillValue(rng, range, 0), age),
    reach: applyAgeCurve(generateSkillValue(rng, range, gkBonus + 2), age),
    communication: applyAgeCurve(generateSkillValue(rng, range, gkBonus), age),
    experience: {
      current: Math.min(100, Math.max(0, (age - 16) * rng.int(3, 6))),
      maxPotential: 100,
    },
  };
}

/**
 * Generate hidden talent value (0-100).
 */
export function generateHiddenTalent(rng: Rng, villageSize: string): number {
  const base = villageSize === "city" ? 25 : villageSize === "small_city" ? 20 : villageSize === "town" ? 15 : 10;
  return rng.int(0, base + 30);
}

/**
 * Calculate overall rating from skills and position.
 */
export function calculateOverallRating(
  position: string,
  skills: FieldSkills | GoalkeeperSkills,
  hiddenTalent: number,
): number {
  const weights: Record<string, number> = position === "GK"
    ? { reflexes: 3, positioning: 3, rushing: 2, catching: 3, kicking: 1, distribution: 1, strength: 1, reach: 2, communication: 2, experience: 2 }
    : position === "DEF"
      ? { speed: 1, stamina: 2, strength: 3, technique: 1, shooting: 0.5, passing: 2, heading: 3, defense: 3, vision: 2, experience: 2 }
      : position === "MID"
        ? { speed: 2, stamina: 3, strength: 1, technique: 2, shooting: 1.5, passing: 3, heading: 1, defense: 1.5, vision: 3, experience: 2 }
        : { speed: 3, stamina: 1.5, strength: 1.5, technique: 3, shooting: 3, passing: 2, heading: 2, defense: 0.5, vision: 2, experience: 1.5 };

  let weightedSum = 0;
  let totalWeight = 0;
  const skillsRecord = skills as unknown as Record<string, SkillValue>;

  for (const [key, weight] of Object.entries(weights)) {
    const sv = skillsRecord[key];
    if (sv) {
      weightedSum += sv.current * weight;
      totalWeight += weight;
    }
  }

  const baseRating = totalWeight > 0 ? weightedSum / totalWeight : 0;
  const bonus = hiddenTalent * 0.15;
  return Math.round(baseRating + bonus);
}
