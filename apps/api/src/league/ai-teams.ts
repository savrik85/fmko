/**
 * Generátor AI týmů ze sousedních obcí v okrese.
 */

import type { Rng } from "../generators/rng";
import type { VillageInfo } from "../generators/player";
import { generateSquad, type GeneratedPlayer } from "../generators/player";
import { generateNickname } from "../generators/nickname";
import { generateRelationships, type GeneratedRelationship } from "../generators/relationships";

const TEAM_PREFIXES = [
  "Slavoj", "SK", "Sokol", "TJ", "FC", "FK", "Spartak",
  "Jiskra", "Baník", "Tatran", "Rapid", "Dynamo", "Slovan",
  "Viktoria", "Hvězda", "Meteor", "Lokomotiva", "Union",
];

const TACTIC_PROFILES = ["offensive", "balanced", "defensive", "long_ball"] as const;

export interface AITeam {
  villageName: string;
  villageCode: string;
  teamName: string;
  primaryColor: string;
  secondaryColor: string;
  tactic: (typeof TACTIC_PROFILES)[number];
  squad: GeneratedPlayer[];
  relationships: GeneratedRelationship[];
}

const JERSEY_COLORS = [
  "#D94032", "#2563EB", "#16A34A", "#F59E0B", "#7C3AED",
  "#0891B2", "#DC2626", "#1D4ED8", "#047857", "#B45309",
  "#6D28D9", "#0E7490", "#9F1239", "#1E40AF", "#065F46",
  "#92400E", "#4C1D95", "#155E75", "#BE123C", "#1E3A8A",
];

/**
 * Generate AI team name from village name.
 */
function generateTeamName(rng: Rng, villageName: string, usedNames: Set<string>): string {
  const shuffled = [...TEAM_PREFIXES];
  rng.shuffle(shuffled);

  for (const prefix of shuffled) {
    const name = `${prefix} ${villageName}`;
    if (!usedNames.has(name)) {
      usedNames.add(name);
      return name;
    }
  }
  return `FK ${villageName}`;
}

/**
 * Generate all AI teams for a league from villages in the district.
 */
export function generateAITeams(
  rng: Rng,
  districtVillages: Array<{ name: string; code: string; region_code: string; category: string; population: number }>,
  count: number,
  surnameData: Record<string, number>,
  firstnameData: { male: Record<string, Record<string, number>> },
  usedNames: Set<string>,
): AITeam[] {
  const teams: AITeam[] = [];
  const availableVillages = [...districtVillages];
  rng.shuffle(availableVillages);

  const colorPool = [...JERSEY_COLORS];
  rng.shuffle(colorPool);

  for (let i = 0; i < count && i < availableVillages.length; i++) {
    const village = availableVillages[i];
    const villageInfo: VillageInfo = {
      region_code: village.region_code,
      category: village.category as VillageInfo["category"],
      population: village.population,
    };

    const surnameWrapped = {
      surnames: surnameData,
      female_forms: {} as Record<string, string>,
    };
    const firstnameWrapped = {
      male: firstnameData.male,
      female: {} as Record<string, Record<string, number>>,
    };

    const squad = generateSquad(rng, villageInfo, surnameWrapped, firstnameWrapped);

    // Assign nicknames
    const usedNicknames = new Set<string>();
    for (const player of squad) {
      (player as GeneratedPlayer & { nickname?: string | null }).nickname =
        generateNickname(rng, player, usedNicknames);
    }

    const relationships = generateRelationships(rng, squad, villageInfo);
    const tactic = rng.pick([...TACTIC_PROFILES]);

    const primaryColor = colorPool[i % colorPool.length];
    const secondaryColor = colorPool[(i + 7) % colorPool.length];

    teams.push({
      villageName: village.name,
      villageCode: village.code,
      teamName: generateTeamName(rng, village.name, usedNames),
      primaryColor,
      secondaryColor,
      tactic,
      squad,
      relationships,
    });
  }

  return teams;
}
