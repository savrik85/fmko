/**
 * FMK-53: Tréninkový systém — gain a decay skillů.
 */

import type { SkillValue } from "./types";

export type TrainingFocus = "speed" | "stamina" | "strength" | "technique" | "shooting" | "passing" | "heading" | "defense" | "vision" | "auto";

interface TrainingConfig {
  baseGain: number;       // 0.3–0.8 per tick
  trainerQuality: number; // 0.5–1.5
  focusedSkill: TrainingFocus;
}

/** Age modifier for training speed */
function ageTrainMod(age: number): number {
  if (age < 20) return 0.7;
  if (age < 25) return 1.2;
  if (age < 30) return 1.0;
  if (age < 35) return 0.7;
  if (age < 40) return 0.4;
  return 0.2;
}

/** Age modifier for decay rate */
function ageDecayMod(age: number): number {
  if (age < 25) return 0.5;
  if (age < 30) return 1.0;
  if (age < 35) return 1.5;
  if (age < 40) return 2.5;
  return 4.0;
}

/** Base daily decay rates by skill category */
const DECAY_RATES: Record<string, number> = {
  // Physical — decay fast
  speed: 0.15, stamina: 0.15, strength: 0.15,
  reflexes: 0.15, rushing: 0.15, reach: 0.1,
  // Technical — decay slow
  technique: 0.05, shooting: 0.05, passing: 0.05,
  catching: 0.05, kicking: 0.05, distribution: 0.05,
  // Mental — barely decay
  vision: 0.02, defense: 0.05, heading: 0.08,
  positioning: 0.03, communication: 0.03,
  // Experience never decays
  experience: 0,
};

/**
 * Apply one training tick to a skill.
 * Returns the new current value.
 */
export function trainSkill(
  skill: SkillValue,
  skillName: string,
  config: TrainingConfig,
  age: number,
  attended: boolean,
): number {
  if (!attended) {
    // Decay only
    return applyDecay(skill, skillName, age);
  }

  const isFocused = config.focusedSkill === skillName || config.focusedSkill === "auto";
  const focusMod = isFocused ? 1.5 : 0.15;

  const gain = config.baseGain * config.trainerQuality * ageTrainMod(age) * focusMod;

  // Miracle training (1% chance for double gain)
  const miracleBonus = Math.random() < 0.01 ? gain : 0;

  const newValue = Math.min(skill.maxPotential, skill.current + gain + miracleBonus);
  return Math.round(newValue * 100) / 100;
}

/**
 * Apply daily decay to a skill (when not trained).
 */
export function applyDecay(
  skill: SkillValue,
  skillName: string,
  age: number,
): number {
  const baseDecay = DECAY_RATES[skillName] ?? 0.05;
  if (baseDecay === 0) return skill.current;

  const decay = baseDecay * ageDecayMod(age);
  const newValue = Math.max(1, skill.current - decay);
  return Math.round(newValue * 100) / 100;
}

/**
 * Add experience from a match.
 */
export function gainExperience(
  current: number,
  minutesPlayed: number,
  matchImportance: number,
  age: number,
): number {
  const ageFactor = age < 25 ? 1.5 : age < 35 ? 1.0 : 0.5;
  const gain = (minutesPlayed / 90) * matchImportance * ageFactor * 0.5;
  return Math.min(100, current + gain);
}
