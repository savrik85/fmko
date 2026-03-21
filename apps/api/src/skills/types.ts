/**
 * FMK-53: Skill systém v2 — typy pro 0-100 stupnici.
 */

export interface SkillValue {
  current: number;       // 0-100, viditelné hráči
  maxPotential: number;  // 0-100, skryté
}

/** Terénní hráč — 10 skillů */
export interface FieldSkills {
  speed: SkillValue;
  stamina: SkillValue;
  strength: SkillValue;
  technique: SkillValue;
  shooting: SkillValue;
  passing: SkillValue;
  heading: SkillValue;
  defense: SkillValue;
  vision: SkillValue;
  experience: SkillValue;
}

/** Brankář — 10 skillů */
export interface GoalkeeperSkills {
  reflexes: SkillValue;
  positioning: SkillValue;
  rushing: SkillValue;
  catching: SkillValue;
  kicking: SkillValue;
  distribution: SkillValue;
  strength: SkillValue;
  reach: SkillValue;
  communication: SkillValue;
  experience: SkillValue;
}

export type SkillTrend = "rising" | "stable" | "declining";

/** What the player sees */
export interface VisibleSkill {
  name: string;
  current: number;
  isMaxed: boolean;
  trend: SkillTrend;
}

/** Position weights for overall rating */
export const POSITION_WEIGHTS: Record<string, Record<string, number>> = {
  GK: { reflexes: 3, positioning: 3, rushing: 2, catching: 3, kicking: 1, distribution: 1, strength: 1, reach: 2, communication: 2, experience: 2 },
  DEF: { speed: 1, stamina: 2, strength: 3, technique: 1, shooting: 0.5, passing: 2, heading: 3, defense: 3, vision: 2, experience: 2 },
  MID: { speed: 2, stamina: 3, strength: 1, technique: 2, shooting: 1.5, passing: 3, heading: 1, defense: 1.5, vision: 3, experience: 2 },
  FWD: { speed: 3, stamina: 1.5, strength: 1.5, technique: 3, shooting: 3, passing: 2, heading: 2, defense: 0.5, vision: 2, experience: 1.5 },
};

/** Skill level ranges by league level */
export interface LeagueLevelRange {
  avgMin: number;
  avgMax: number;
  capMin: number;
  capMax: number;
}

export const SKILL_RANGES_BY_LEVEL: Record<string, LeagueLevelRange> = {
  hamlet: { avgMin: 15, avgMax: 35, capMin: 30, capMax: 50 },
  village: { avgMin: 20, avgMax: 40, capMin: 35, capMax: 55 },
  town: { avgMin: 25, avgMax: 45, capMin: 40, capMax: 60 },
  small_city: { avgMin: 30, avgMax: 50, capMin: 45, capMax: 70 },
  city: { avgMin: 35, avgMax: 55, capMin: 50, capMax: 75 },
};
