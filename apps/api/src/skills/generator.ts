/**
 * FMK-53: Generátor skillů pro nového hráče (0-100 stupnice).
 */

import type { Rng } from "../generators/rng";
import type { FieldSkills, GoalkeeperSkills, SkillValue, LeagueLevelRange } from "./types";
import { SKILL_RANGES_BY_LEVEL } from "./types";
// Váhy hodnocení žijí ve sdíleném balíku — používá je i web pro zvýraznění atributů v profilu.
import { ratingWeightsFor } from "@okresni-masina/shared";

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
  isAi?: boolean,
): FieldSkills {
  const base = SKILL_RANGES_BY_LEVEL[villageSize] ?? SKILL_RANGES_BY_LEVEL.village;
  // AI teams are weaker: lower averages and caps
  const penalty = isAi ? rng.int(6, 12) : 0;
  const range: LeagueLevelRange = {
    avgMin: Math.max(1, base.avgMin - penalty),
    avgMax: Math.max(5, base.avgMax - penalty),
    capMin: Math.max(5, base.capMin - Math.round(penalty * 0.7)),
    capMax: Math.max(10, base.capMax - Math.round(penalty * 0.7)),
  };

  // Position-specific bonuses
  const bonuses: Record<string, Record<string, number>> = {
    DEF: { defense: 10, heading: 8, strength: 5, speed: 0, technique: -5, shooting: -8, passing: 0, vision: 3, stamina: 3, creativity: -5, setPieces: -5 },
    MID: { passing: 10, vision: 8, technique: 5, stamina: 5, defense: 0, heading: -3, shooting: 0, speed: 0, strength: -3, creativity: 15, setPieces: 10 },
    FWD: { shooting: 10, speed: 8, technique: 5, heading: 3, passing: 0, defense: -8, vision: 0, stamina: 0, strength: 0, creativity: 10, setPieces: 5 },
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
    creativity: applyAgeCurve(generateSkillValue(rng, range, b.creativity ?? 0), age),
    setPieces: (() => {
      const base = applyAgeCurve(generateSkillValue(rng, range, b.setPieces ?? 0), age);
      // 5% chance of set-piece specialist (+30 bonus)
      if (rng.int(0, 100) < 5) {
        base.current = Math.min(100, base.current + 30);
        base.maxPotential = Math.min(100, base.maxPotential + 20);
      }
      return base;
    })(),
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
  isAi?: boolean,
): GoalkeeperSkills {
  const base = SKILL_RANGES_BY_LEVEL[villageSize] ?? SKILL_RANGES_BY_LEVEL.village;
  const penalty = isAi ? rng.int(6, 12) : 0;
  const range: LeagueLevelRange = {
    avgMin: Math.max(1, base.avgMin - penalty),
    avgMax: Math.max(5, base.avgMax - penalty),
    capMin: Math.max(5, base.capMin - Math.round(penalty * 0.7)),
    capMax: Math.max(10, base.capMax - Math.round(penalty * 0.7)),
  };
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
  const weights = ratingWeightsFor(position);

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

/**
 * Překlad brankářských dovedností na ploché atributy.
 *
 * Brankářské dovednosti (reflexes, positioning, …) žijí jen ve `skills_max`, který se po
 * vzniku hráče nikdy neaktualizuje. Trénink zapisuje do plochého `goalkeeping` a spol.,
 * takže bez tohohle překladu se brankáři hodnocení po tréninku vůbec nehnulo — natrénované
 * body brankářské dovednosti se do ratingu nepromítly ani jednou.
 *
 * Mapování je obrácené k tomu, jak se ploché `skills` u brankáře vyrábějí
 * (`routes/teams.ts`, `league/u21-generator.ts`, `league/insert-ai-teams.ts` — všude stejně).
 * `catching` se do plochých atributů nikdy nepromítlo; bere reflexy, protože z pohledu
 * plochého modelu jsou to tytéž ruce a jinak by ta váha zůstala navždy zamrzlá.
 */
const GK_FLAT_ALIAS: Record<string, string> = {
  reflexes: "goalkeeping",
  catching: "goalkeeping",
  positioning: "defense",
  rushing: "speed",
  kicking: "technique",
  distribution: "passing",
  reach: "heading",
  communication: "creativity",
};

/**
 * Celkové hodnocení z plochých atributů, jak jsou uložené v DB.
 *
 * `calculateOverallRating` čte strukturu `{ skill: { current, maxPotential } }`, tedy sloupec
 * `skills_max`. Ten se ale po vzniku hráče už neaktualizuje — trénink zapisuje do plochého
 * `skills` (a u stamina/strength i do `physical`). Pro přepočet aktuálního hodnocení je proto
 * potřeba číst ploché hodnoty; `fallback` (typicky `skills_max`) doplní atributy, které
 * v `skills` u části hráčů vůbec nejsou (stamina, strength, vision, experience).
 */
export function overallRatingFromFlat(
  position: string,
  skills: Record<string, unknown>,
  physical: Record<string, unknown>,
  hiddenTalent: number,
  fallback?: Record<string, unknown>,
): number | null {
  const weights = ratingWeightsFor(position);
  const fullWeight = Object.values(weights).reduce((a, b) => a + b, 0);

  let weightedSum = 0;
  let totalWeight = 0;

  for (const [key, weight] of Object.entries(weights)) {
    let value: number | undefined;

    if (typeof skills[key] === "number") value = skills[key] as number;
    // Brankář: dovednost pod svým jménem v plochém `skills` není, sáhnout na její protějšek
    if (value === undefined && position === "GK") {
      const alias = GK_FLAT_ALIAS[key];
      if (alias && typeof skills[alias] === "number") value = skills[alias] as number;
    }
    // stamina/strength drží pravdu v physical (read path ho preferuje)
    if (value === undefined && typeof physical[key] === "number") value = physical[key] as number;
    if (value === undefined && fallback) {
      const entry = fallback[key];
      if (typeof entry === "number") value = entry;
      else if (entry && typeof entry === "object" && typeof (entry as { current?: unknown }).current === "number") {
        value = (entry as { current: number }).current;
      }
    }

    if (value === undefined) continue; // atribut chybí → vynechat z průměru (shodně s calculateOverallRating)
    weightedSum += value * weight;
    totalWeight += weight;
  }

  // Když chybí většina atributů (část brankářů nemá vyplněné brankářské dovednosti nikde),
  // je zbylý průměr nereprezentativní — vrátit null a nechat volajícího hodnocení nesahat,
  // ať se z pár náhodných atributů nespočítá nesmysl.
  if (totalWeight < fullWeight / 2) return null;

  return Math.round(weightedSum / totalWeight + hiddenTalent * 0.15);
}
