/**
 * Nábor a scouting — náhodné příchody a aktivní hledání hráčů.
 */

import type { Rng } from "../generators/rng";
import type { GeneratedPlayer, VillageInfo } from "../generators/player";
import { generatePlayer } from "../generators/player";

export type RecruitmentAction = "poster" | "newsletter" | "visit_villages" | "contact_player";

export interface RecruitmentResult {
  success: boolean;
  player?: GeneratedPlayer;
  description: string;
  cost: number;
}

export interface RandomArrival {
  player: GeneratedPlayer;
  source: string;
  description: string;
}

const ARRIVAL_SOURCES = [
  {
    source: "moved_in",
    prob: 0.06,
    description: (p: GeneratedPlayer) =>
      `Do obce se přistěhoval ${p.firstName} ${p.lastName} (${p.age}). Prý kopal za ${["Slavoj Horní Lhota", "TJ Dolní Újezd", "FK Nová Ves"][Math.floor(Math.random() * 3)]}.`,
    ageRange: [20, 40] as [number, number],
  },
  {
    source: "returned_student",
    prob: 0.04,
    description: (p: GeneratedPlayer) =>
      `${p.firstName} ${p.lastName} (${p.age}) se vrátil ze studia v Praze. Kopal tam za univerzitní tým.`,
    ageRange: [20, 25] as [number, number],
  },
  {
    source: "higher_league_veteran",
    prob: 0.03,
    description: (p: GeneratedPlayer) =>
      `${p.firstName} ${p.lastName} (${p.age}) odešel z krajského přeboru a hledá klidnější angažmá.`,
    ageRange: [28, 38] as [number, number],
  },
  {
    source: "pub_encounter",
    prob: 0.05,
    description: (p: GeneratedPlayer) =>
      `V hospodě ses dozvěděl, že ${p.firstName} ${p.lastName} (${p.age}) by chtěl někde kopat. Prý je ${p.occupation.toLowerCase()}.`,
    ageRange: [18, 45] as [number, number],
  },
  {
    source: "friend_referral",
    prob: 0.04,
    description: (p: GeneratedPlayer) =>
      `Někdo z kádru přivedl kamaráda — ${p.firstName} ${p.lastName} (${p.age}). Říká, že umí hrát.`,
    ageRange: [18, 35] as [number, number],
  },
];

/**
 * Check for random player arrivals between rounds.
 */
export function checkRandomArrivals(
  rng: Rng,
  villageInfo: VillageInfo,
  reputation: number,
  surnameData: { surnames: Record<string, number>; female_forms: Record<string, string> },
  firstnameData: { male: Record<string, Record<string, number>>; female: Record<string, Record<string, number>> },
): RandomArrival | null {
  const repMod = reputation / 50; // Higher reputation = more arrivals

  for (const source of ARRIVAL_SOURCES) {
    const prob = source.prob * repMod;
    if (rng.random() < prob) {
      const positions = ["GK", "DEF", "MID", "FWD"] as const;
      const position = rng.pick([...positions]);
      const player = generatePlayer(rng, villageInfo, position, surnameData, firstnameData);
      player.age = rng.int(source.ageRange[0], source.ageRange[1]);

      return {
        player,
        source: source.source,
        description: source.description(player),
      };
    }
  }

  return null;
}

const RECRUITMENT_ACTIONS: Record<RecruitmentAction, {
  cost: number;
  successProb: number;
  qualityMod: number;
  description: string;
}> = {
  poster: {
    cost: 200,
    successProb: 0.15,
    qualityMod: 0.7,
    description: "Vyvěsil jsi plakát na obecní nástěnku a v místním obchodě.",
  },
  newsletter: {
    cost: 500,
    successProb: 0.25,
    qualityMod: 0.8,
    description: "Inzerát v obecním zpravodaji zaujal několik lidí.",
  },
  visit_villages: {
    cost: 1500,
    successProb: 0.4,
    qualityMod: 1.0,
    description: "Objel jsi sousední vesnice a ptal se v hospodách.",
  },
  contact_player: {
    cost: 500,
    successProb: 0.5,
    qualityMod: 1.2,
    description: "Kontaktoval jsi hráče, o kterém jsi slyšel.",
  },
};

/**
 * Perform an active recruitment action.
 */
export function performRecruitment(
  rng: Rng,
  action: RecruitmentAction,
  villageInfo: VillageInfo,
  reputation: number,
  surnameData: { surnames: Record<string, number>; female_forms: Record<string, string> },
  firstnameData: { male: Record<string, Record<string, number>>; female: Record<string, Record<string, number>> },
): RecruitmentResult {
  const config = RECRUITMENT_ACTIONS[action];
  const repMod = Math.min(1.5, reputation / 50);
  const prob = config.successProb * repMod;

  if (rng.random() > prob) {
    return {
      success: false,
      description: `${config.description} Bohužel se nikdo neozval.`,
      cost: config.cost,
    };
  }

  const positions = ["GK", "DEF", "MID", "FWD"] as const;
  const position = rng.pick([...positions]);
  const player = generatePlayer(rng, villageInfo, position, surnameData, firstnameData);
  player.age = rng.int(18, 38);

  return {
    success: true,
    player,
    description: `${config.description} ${player.firstName} ${player.lastName} (${player.age}) má zájem!`,
    cost: config.cost,
  };
}
