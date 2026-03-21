/**
 * Mládežnická akademie — generování nových hráčů z dorostu.
 */

import type { Rng } from "../generators/rng";
import type { GeneratedPlayer, VillageInfo } from "../generators/player";
import { generatePlayer } from "../generators/player";

export type YouthInvestment = "none" | "minimal" | "medium" | "high";

export interface YouthConfig {
  investment: YouthInvestment;
  villagPopulation: number;
}

export interface YouthGraduate {
  player: GeneratedPlayer;
  description: string;
}

const INVESTMENT_COST: Record<YouthInvestment, number> = {
  none: 0,
  minimal: 500,
  medium: 2000,
  high: 5000,
};

const SKILL_RANGE: Record<YouthInvestment, [number, number]> = {
  none: [0, 0], // No graduates
  minimal: [3, 8],
  medium: [5, 12],
  high: [8, 16],
};

/**
 * Monthly cost of youth academy.
 */
export function youthMonthlyCost(investment: YouthInvestment): number {
  return INVESTMENT_COST[investment];
}

/**
 * Try to graduate a youth player at end of season.
 * Returns a new player or null.
 */
export function tryGraduateYouth(
  rng: Rng,
  config: YouthConfig,
  villageInfo: VillageInfo,
  surnameData: { surnames: Record<string, number>; female_forms: Record<string, string> },
  firstnameData: { male: Record<string, Record<string, number>>; female: Record<string, Record<string, number>> },
): YouthGraduate | null {
  if (config.investment === "none") return null;

  // Probability of graduation
  let prob = 0;
  switch (config.investment) {
    case "minimal": prob = 0.25; break;
    case "medium": prob = 0.5; break;
    case "high": prob = 0.75; break;
  }

  // Bigger village = more kids = higher chance
  const popMod = Math.min(1.5, config.villagPopulation / 3000);
  prob *= Math.max(0.5, popMod);

  if (rng.random() > prob) return null;

  // Generate the youth player
  const positions = ["GK", "DEF", "DEF", "MID", "MID", "MID", "FWD", "FWD"] as const;
  const position = rng.pick([...positions]);
  const age = rng.int(16, 18);

  const player = generatePlayer(rng, villageInfo, position, surnameData, firstnameData);
  player.age = age;

  // Override attributes based on investment quality
  const [minSkill, maxSkill] = SKILL_RANGE[config.investment];
  const attrs: Array<keyof GeneratedPlayer> = [
    "speed", "technique", "shooting", "passing", "heading", "defense",
  ];
  for (const attr of attrs) {
    (player as unknown as Record<string, number>)[attr] = rng.int(minSkill, maxSkill);
  }

  // Youth academy players have higher patriotism
  player.patriotism = Math.min(20, player.patriotism + rng.int(3, 6));

  const descriptions = [
    `${player.firstName} ${player.lastName} (${age}) dorostl z mládeže do áčka. Nadšený mladík!`,
    `Z dorostu postoupil ${player.firstName} ${player.lastName}. Říkají o něm, že má talent.`,
    `${player.firstName} ${player.lastName} (${age}) se připojuje k áčku. Vychovanec klubu.`,
  ];

  return {
    player,
    description: rng.pick(descriptions),
  };
}
