import type { MatchPlayer, TeamSetup } from "../types";

/**
 * Sdílené sestavy pro testy enginu. Dřív si každý test kopíroval vlastní
 * `createPlayer` — při změně typu se pak opravovalo na pěti místech.
 */
export function createPlayer(id: number, pos: "GK" | "DEF" | "MID" | "FWD", skill = 50): MatchPlayer {
  return {
    id,
    firstName: "Jan",
    lastName: `Hráč${id}`,
    nickname: null,
    position: pos,
    matchPosition: pos,
    speed: skill,
    technique: skill,
    shooting: skill,
    passing: skill,
    heading: skill,
    defense: skill,
    goalkeeping: pos === "GK" ? skill : 10,
    stamina: 60,
    strength: skill,
    vision: skill,
    creativity: skill,
    setPieces: skill,
    discipline: 50,
    alcohol: 10,
    temper: 50,
    leadership: 50,
    workRate: 50,
    aggression: 50,
    consistency: 50,
    clutch: 50,
    injuryProneness: 50,
    preferredFoot: "right",
    preferredSide: "any",
    condition: 100,
    morale: 50,
  };
}

export function createTeam(teamId: number, name: string, skill = 50, weatherResist = 0): TeamSetup {
  const lineup: MatchPlayer[] = [
    createPlayer(teamId * 100 + 1, "GK", skill),
    createPlayer(teamId * 100 + 2, "DEF", skill),
    createPlayer(teamId * 100 + 3, "DEF", skill),
    createPlayer(teamId * 100 + 4, "DEF", skill),
    createPlayer(teamId * 100 + 5, "DEF", skill),
    createPlayer(teamId * 100 + 6, "MID", skill),
    createPlayer(teamId * 100 + 7, "MID", skill),
    createPlayer(teamId * 100 + 8, "MID", skill),
    createPlayer(teamId * 100 + 9, "MID", skill),
    createPlayer(teamId * 100 + 10, "FWD", skill),
    createPlayer(teamId * 100 + 11, "FWD", skill),
  ];

  return {
    teamId,
    teamName: name,
    lineup,
    subs: [
      createPlayer(teamId * 100 + 12, "DEF", skill),
      createPlayer(teamId * 100 + 13, "MID", skill),
      createPlayer(teamId * 100 + 14, "FWD", skill),
    ],
    tactic: "balanced",
    formation: "4-4-2",
    weatherResist,
  };
}
