/**
 * Hlavní generátor ligy — vytvoří kompletní ligovou sezónu
 * při založení nového týmu.
 */

import type { Rng } from "../generators/rng";
import { generateAITeams, type AITeam } from "./ai-teams";
import { generateSchedule, totalRounds, type ScheduledMatch } from "./schedule";

export interface LeagueSetup {
  name: string;
  district: string;
  season: string;
  level: number;
  totalRounds: number;
  teams: LeagueTeam[];
  schedule: ScheduledMatch[];
}

export interface LeagueTeam {
  teamName: string;
  villageName: string;
  villageCode: string;
  primaryColor: string;
  secondaryColor: string;
  isPlayer: boolean;
  aiTeam?: AITeam;
}

/**
 * Generate a complete league for a player's district.
 *
 * @param playerTeamName - Name of the player's team
 * @param playerVillage - Player's village info
 * @param districtVillages - All villages in the district (excluding player's)
 * @param surnameData - Surname weights for the region
 * @param firstnameData - Firstname weights by decade
 * @param season - Season string (e.g. "2024/2025")
 */
export function generateLeague(
  rng: Rng,
  playerTeamName: string,
  playerVillage: { name: string; code: string; region_code: string; category: string; population: number },
  districtVillages: Array<{ name: string; code: string; region_code: string; category: string; population: number }>,
  surnameData: Record<string, number>,
  firstnameData: { male: Record<string, Record<string, number>> },
  district: string,
  season: string = "2024/2025",
): LeagueSetup {
  // League size: 12-16 teams depending on available villages
  const targetSize = Math.min(14, Math.max(12, districtVillages.length + 1));
  const aiCount = targetSize - 1;

  // Filter out player's village from AI pool
  const aiVillagePool = districtVillages.filter(
    (v) => v.code !== playerVillage.code,
  );

  const usedNames = new Set<string>();
  usedNames.add(playerTeamName);

  const aiTeams = generateAITeams(
    rng, aiVillagePool, aiCount,
    surnameData, firstnameData, usedNames,
  );

  // Build team list (player first, then AI)
  const teams: LeagueTeam[] = [
    {
      teamName: playerTeamName,
      villageName: playerVillage.name,
      villageCode: playerVillage.code,
      primaryColor: "#2D5F2D",
      secondaryColor: "#FFFFFF",
      isPlayer: true,
    },
    ...aiTeams.map((ai) => ({
      teamName: ai.teamName,
      villageName: ai.villageName,
      villageCode: ai.villageCode,
      primaryColor: ai.primaryColor,
      secondaryColor: ai.secondaryColor,
      isPlayer: false,
      aiTeam: ai,
    })),
  ];

  // Ensure even number of teams
  const actualSize = teams.length;

  // Generate schedule
  const schedule = generateSchedule(rng, actualSize);
  const rounds = totalRounds(actualSize);

  // League name — Praha has its own naming convention
  const LEAGUE_NAMES: Record<string, string> = { 'Praha': 'Přebor Prahy' };
  const leagueName = LEAGUE_NAMES[district] ?? `Okresní přebor ${district}`;

  return {
    name: leagueName,
    district,
    season,
    level: 1,
    totalRounds: rounds,
    teams,
    schedule,
  };
}
