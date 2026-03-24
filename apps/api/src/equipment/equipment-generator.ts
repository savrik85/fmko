/**
 * Vybavení týmu v2 — kategorie, progression, reálné efekty.
 * Unlock podmínky: reputace, odehrané zápasy, sezóna.
 */

import type { Rng } from "../generators/rng";

// ── Categories ──

export const CATEGORIES = [
  "balls", "jerseys", "training_cones", "first_aid",
  "boots_stock", "bibs", "goalkeeper_gear", "water_bottles", "tactics_board",
] as const;
export type EquipmentCategory = typeof CATEGORIES[number];

export const CATEGORY_LABELS: Record<string, string> = {
  balls: "Míče",
  jerseys: "Dresy",
  training_cones: "Tréninkové pomůcky",
  first_aid: "Lékárnička",
  boots_stock: "Sklad kopaček",
  bibs: "Rozlišováky",
  goalkeeper_gear: "Brankářské vybavení",
  water_bottles: "Láhve a občerstvení",
  tactics_board: "Taktická tabule",
};

// ── Level descriptions (Czech village humor) ──

const LEVEL_DESCRIPTIONS: Record<string, string[]> = {
  balls: [
    "3 prasklé Adidasy z 90. let",
    "5 použitelných míčů Gala",
    "10 slušných Select",
    "Sada profi míčů Adidas",
  ],
  jerseys: [
    "Každý v čem přišel z domu",
    "Sada z bazaru, víceméně stejná barva",
    "Nové dresy s čísly",
    "Profi dresy se jmény a sponzorem",
  ],
  training_cones: [
    "Kameny a větve místo kuželů",
    "10 kuželů a pár tyčí",
    "Kompletní sada s žebříky a kloboučky",
    "Profi tréninkový set s překážkami",
  ],
  first_aid: [
    "Panáky slivovice a staré obvazy",
    "Základní lékárnička z lékárny",
    "Obvazy, tejpy, chladící spray, led",
    "Komplet zdravotnický set s nosítky",
  ],
  boots_stock: [
    "Každý si nosí své, kdo nemá hraje v tesakách",
    "Pár náhradních kopaček ve skladu",
    "Kolíky, turfy i halu — základ pro každý povrch",
    "Komplet sklad obuvi všech velikostí",
  ],
  bibs: [
    "Tričko vs. holý hrudník",
    "Sada rozlišováků ve dvou barvách",
    "Rozlišováky + kapitánská páska + píšťalka",
    "Komplet příslušenství pro tréninky i zápasy",
  ],
  goalkeeper_gear: [
    "Brankář chytá v čem má",
    "Jedny brankářské rukavice a chrániče",
    "2 páry rukavic + chránič hrudi",
    "Komplet GK výbava — rukavice, chrániče, dres",
  ],
  water_bottles: [
    "Kdo má žízeň, napije se z kohoutku",
    "5 lahví a kyblík s houbou",
    "Sada lahví se stojánkem + izotonik",
    "Komplet pitný režim + energetické tyčinky",
  ],
  tactics_board: [
    "Trenér kreslí klackem do hlíny",
    "Magnetická tabule z bazaru",
    "Flipchart + sada magnetů se jmény",
    "Profi taktická tabule + video analýza",
  ],
};

// ── Upgrade effects (actual game modifiers) ──

export interface EquipmentEffects {
  trainingMultiplier: number;   // training improvement chance multiplier (1.0 = base)
  tacticsTrainingBonus: number; // extra bonus for tactics training type
  matchTechniqueMod: number;    // technique modifier in matches
  moraleMod: number;            // morale bonus
  injurySeverityMod: number;    // injury severity reduction (0.0 = none, 0.3 = 30% less severe)
  conditionDrainMod: number;    // condition drain reduction in matches
  teamChemistryMod: number;     // team chemistry bonus per tactics training
  gkBonus: number;              // goalkeeper performance bonus
}

/** Calculate actual game effects from equipment levels + conditions */
export function calculateEffects(levels: Record<string, number>, conditions: Record<string, number>): EquipmentEffects {
  const eff = (cat: string) => {
    const lv = levels[cat] ?? 0;
    const cond = conditions[`${cat}_condition`] ?? 50;
    return lv * (cond / 100);
  };

  return {
    trainingMultiplier: 1.0 + eff("balls") * 0.05 + eff("training_cones") * 0.07,
    tacticsTrainingBonus: eff("bibs") * 0.05 + eff("tactics_board") * 0.06,
    matchTechniqueMod: Math.round(eff("balls") * 1.5),
    moraleMod: Math.round(eff("jerseys") * 2.5),
    injurySeverityMod: eff("first_aid") * 0.10,
    conditionDrainMod: eff("boots_stock") * 0.05 + eff("water_bottles") * 0.03,
    teamChemistryMod: Math.round(eff("bibs") * 1.0 + eff("tactics_board") * 1.5),
    gkBonus: Math.round(eff("goalkeeper_gear") * 1.5),
  };
}

// ── Upgrade costs (significantly higher for progression) ──

const UPGRADE_COSTS: Record<string, number[]> = {
  balls:           [0, 3000, 12000, 35000],
  jerseys:         [0, 5000, 18000, 45000],
  training_cones:  [0, 2000, 8000, 25000],
  first_aid:       [0, 1500, 6000, 20000],
  boots_stock:     [0, 4000, 15000, 40000],
  bibs:            [0, 1000, 5000, 15000],
  goalkeeper_gear: [0, 3000, 10000, 30000],
  water_bottles:   [0, 800, 3000, 10000],
  tactics_board:   [0, 2000, 8000, 25000],
};

// ── Unlock requirements per level ──

interface UnlockReq {
  reputation?: number;
  matchesPlayed?: number;
  season?: number;
}

const UNLOCK_REQUIREMENTS: Record<number, UnlockReq> = {
  1: {},                                                   // Always available
  2: { reputation: 40, matchesPlayed: 5 },                 // Need some progress
  3: { reputation: 60, matchesPlayed: 15, season: 2 },     // Need serious progress + season 2
};

/** Cooldown in days per upgrade target level */
export const EQUIPMENT_COOLDOWN_DAYS: Record<number, number> = {
  1: 7,    // L0→L1: 1 week
  2: 21,   // L1→L2: 3 weeks
  3: 42,   // L2→L3: 6 weeks
};

const UPGRADE_EFFECT_LABELS: Record<string, string[]> = {
  balls:           ["", "+5% trénink", "+10% trénink, +1 technika v zápase", "+20% trénink, +4 technika"],
  jerseys:         ["", "+2 morálka", "+5 morálka", "+8 morálka, zájem sponzorů"],
  training_cones:  ["", "+7% trénink efektivita", "+14% trénink", "+21% trénink"],
  first_aid:       ["", "Zranění -10% závažnost", "-20% závažnost, rychlejší zotavení", "-30% závažnost"],
  boots_stock:     ["", "-5% kondice ztráta", "-10% kondice", "-15% kondice"],
  bibs:            ["", "+5% taktický trénink, +1 chemie", "+10%, +2 chemie", "+15%, +3 chemie"],
  goalkeeper_gear: ["", "+1 brankář bonus", "+3 brankář", "+5 brankář výkon"],
  water_bottles:   ["", "-3% kondice ztráta", "-6% kondice", "-9% kondice"],
  tactics_board:   ["", "+6% taktický trénink, +1 chemie", "+12%, +3 chemie", "+18%, +5 chemie"],
};

// ── Starting equipment by village size ──

export interface EquipmentConfig {
  [key: string]: number;
}

const BASE_BY_SIZE: Record<string, EquipmentConfig> = {
  hamlet:     { balls: 0, jerseys: 0, training_cones: 0, first_aid: 0, boots_stock: 0, bibs: 0, goalkeeper_gear: 0, water_bottles: 0, tactics_board: 0 },
  vesnice:    { balls: 0, jerseys: 1, training_cones: 0, first_aid: 0, boots_stock: 0, bibs: 0, goalkeeper_gear: 0, water_bottles: 0, tactics_board: 0 },
  obec:       { balls: 1, jerseys: 1, training_cones: 0, first_aid: 0, boots_stock: 0, bibs: 0, goalkeeper_gear: 0, water_bottles: 1, tactics_board: 0 },
  mestys:     { balls: 1, jerseys: 1, training_cones: 1, first_aid: 0, boots_stock: 0, bibs: 1, goalkeeper_gear: 0, water_bottles: 1, tactics_board: 0 },
  mesto:      { balls: 1, jerseys: 1, training_cones: 1, first_aid: 1, boots_stock: 0, bibs: 1, goalkeeper_gear: 1, water_bottles: 1, tactics_board: 1 },
  small_city: { balls: 1, jerseys: 1, training_cones: 1, first_aid: 1, boots_stock: 1, bibs: 1, goalkeeper_gear: 1, water_bottles: 1, tactics_board: 1 },
  city:       { balls: 2, jerseys: 2, training_cones: 1, first_aid: 1, boots_stock: 1, bibs: 1, goalkeeper_gear: 1, water_bottles: 1, tactics_board: 1 },
};

export function generateEquipment(rng: Rng, villageSize: string): EquipmentConfig {
  const base = BASE_BY_SIZE[villageSize] ?? BASE_BY_SIZE.obec;
  const condRange = villageSize === "hamlet" || villageSize === "vesnice" ? [30, 60] : [40, 75];
  const result: EquipmentConfig = {};

  for (const cat of CATEGORIES) {
    result[cat] = base[cat] ?? 0;
    result[`${cat}_condition`] = rng.int(condRange[0], condRange[1]);
  }

  return result;
}

// ── Upgrade/Repair options ──

export interface UpgradeOption {
  category: string;
  label: string;
  currentLevel: number;
  nextLevel: number;
  cost: number;
  effect: string;
  description: string;
  locked: boolean;
  lockReason?: string;
}

export interface RepairOption {
  category: string;
  label: string;
  level: number;
  condition: number;
  cost: number;
}

export function getUpgradeOptions(
  levels: Record<string, number>,
  teamReputation: number,
  matchesPlayed: number,
  currentSeason: number = 1,
): UpgradeOption[] {
  const options: UpgradeOption[] = [];

  for (const cat of CATEGORIES) {
    const current = levels[cat] ?? 0;
    if (current >= 3) continue;
    const next = current + 1;
    const costs = UPGRADE_COSTS[cat];
    const req = UNLOCK_REQUIREMENTS[next] ?? {};

    let locked = false;
    let lockReason: string | undefined;

    if (req.reputation && teamReputation < req.reputation) {
      locked = true;
      lockReason = `Potřeba reputace ${req.reputation}+ (máš ${teamReputation})`;
    }
    if (req.matchesPlayed && matchesPlayed < req.matchesPlayed) {
      locked = true;
      lockReason = `Potřeba ${req.matchesPlayed}+ odehraných zápasů (máš ${matchesPlayed})`;
    }
    if (req.season && currentSeason < req.season) {
      locked = true;
      lockReason = `Dostupné od sezóny ${req.season} (aktuální: ${currentSeason})`;
    }

    options.push({
      category: cat,
      label: CATEGORY_LABELS[cat],
      currentLevel: current,
      nextLevel: next,
      cost: costs[next] ?? 99999,
      effect: UPGRADE_EFFECT_LABELS[cat]?.[next] ?? "",
      description: LEVEL_DESCRIPTIONS[cat]?.[next] ?? "",
      locked,
      lockReason,
    });
  }

  return options;
}

export function getRepairOptions(levels: Record<string, number>, conditions: Record<string, number>): RepairOption[] {
  const options: RepairOption[] = [];
  for (const cat of CATEGORIES) {
    const level = levels[cat] ?? 0;
    const cond = conditions[`${cat}_condition`] ?? 50;
    if (level === 0 || cond >= 60) continue;
    options.push({
      category: cat,
      label: CATEGORY_LABELS[cat],
      level,
      condition: cond,
      cost: level * 500, // Slightly higher repair cost
    });
  }
  return options;
}

export function getLevelDescription(category: string, level: number): string {
  return LEVEL_DESCRIPTIONS[category]?.[level] ?? "";
}
