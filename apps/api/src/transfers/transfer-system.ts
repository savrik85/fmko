/**
 * FMK-19: Přestupový systém — příchody, odchody, doporučení.
 *
 * V okresu se lidi znají — přestupy jsou spíš
 * "hele, Franta by šel k vám kopat".
 */

import type { Rng } from "../generators/rng";
import type { GeneratedPlayer, VillageInfo } from "../generators/player";
import { generatePlayer } from "../generators/player";

export type TransferChannel = "free_agent" | "recommendation" | "departure" | "pub" | "scouting";

export interface TransferOffer {
  channel: TransferChannel;
  player: GeneratedPlayer;
  description: string;
  cost: number; // 0 for free agents, small for pub rounds etc.
  expiresInRounds: number;
}

export interface DepartureRisk {
  playerIndex: number;
  reason: string;
  probability: number;
  description: string;
}

const DEPARTURE_REASONS = [
  { reason: "low_patriotism", check: (p: GeneratedPlayer) => p.patriotism <= 6, baseProb: 0.15, desc: (p: GeneratedPlayer) => `${p.firstName} ${p.lastName} říká, že by chtěl zkusit jiný tým. Prý ho to tu nebaví.` },
  { reason: "low_morale", check: (p: GeneratedPlayer) => p.morale < 25, baseProb: 0.2, desc: (p: GeneratedPlayer) => `${p.firstName} ${p.lastName} je nespokojený. Zvažuje odchod.` },
  { reason: "better_offer", check: (p: GeneratedPlayer) => p.shooting >= 14 || p.technique >= 14, baseProb: 0.08, desc: (p: GeneratedPlayer) => `${p.firstName} ${p.lastName} dostal nabídku z vyšší soutěže.` },
  { reason: "moving_away", check: (_p: GeneratedPlayer) => true, baseProb: 0.02, desc: (p: GeneratedPlayer) => `${p.firstName} ${p.lastName} se stěhuje kvůli práci. Prý jede do Prahy.` },
];

/**
 * Check which players are at risk of leaving.
 */
export function checkDepartureRisks(
  rng: Rng,
  squad: GeneratedPlayer[],
): DepartureRisk[] {
  const risks: DepartureRisk[] = [];

  for (let i = 0; i < squad.length; i++) {
    const player = squad[i];
    for (const reason of DEPARTURE_REASONS) {
      if (!reason.check(player)) continue;
      const prob = reason.baseProb * (1 + (20 - player.patriotism) / 20);
      if (rng.random() < prob * 2) { // 2x for detection, actual leaving uses baseProb
        risks.push({
          playerIndex: i,
          reason: reason.reason,
          probability: Math.round(prob * 100),
          description: reason.desc(player),
        });
        break;
      }
    }
  }

  return risks;
}

/**
 * Generate transfer offers from various channels.
 */
export function generateTransferOffers(
  rng: Rng,
  villageInfo: VillageInfo,
  reputation: number,
  squadSize: number,
  surnameData: { surnames: Record<string, number>; female_forms: Record<string, string> },
  firstnameData: { male: Record<string, Record<string, number>>; female: Record<string, Record<string, number>> },
  existingSquad: GeneratedPlayer[],
): TransferOffer[] {
  const offers: TransferOffer[] = [];
  const repMod = reputation / 50;

  // Free agent (self-offered)
  if (rng.random() < 0.08 * repMod && squadSize < 25) {
    const positions = ["GK", "DEF", "MID", "FWD"] as const;
    const pos = rng.pick([...positions]);
    const player = generatePlayer(rng, villageInfo, pos, surnameData, firstnameData);
    player.age = rng.int(20, 38);
    offers.push({
      channel: "free_agent",
      player,
      description: `${player.firstName} ${player.lastName} (${player.age}, ${player.occupation}) hledá tým. Nabízí se zadarmo.`,
      cost: 0,
      expiresInRounds: rng.int(2, 5),
    });
  }

  // Recommendation from existing player
  if (rng.random() < 0.06 && existingSquad.length > 0) {
    const recommender = rng.pick(existingSquad);
    const positions = ["GK", "DEF", "MID", "FWD"] as const;
    const pos = rng.pick([...positions]);
    const player = generatePlayer(rng, villageInfo, pos, surnameData, firstnameData);
    player.age = rng.int(18, 35);
    // Recommendation = same surname possible (brother/cousin)
    if (rng.random() < 0.4) {
      player.lastName = recommender.lastName;
    }
    offers.push({
      channel: "recommendation",
      player,
      description: `${recommender.firstName} ${recommender.lastName} doporučuje svého ${player.lastName === recommender.lastName ? "bráchu" : "kamaráda"} ${player.firstName} ${player.lastName} (${player.age}).`,
      cost: 0,
      expiresInRounds: rng.int(3, 6),
    });
  }

  // Pub encounter
  if (rng.random() < 0.05) {
    const positions = ["DEF", "MID", "FWD"] as const;
    const pos = rng.pick([...positions]);
    const player = generatePlayer(rng, villageInfo, pos, surnameData, firstnameData);
    player.age = rng.int(22, 42);
    const pubCost = rng.int(0, 500); // Maybe a round of beers
    offers.push({
      channel: "pub",
      player,
      description: `V hospodě ses seznámil s ${player.firstName} ${player.lastName} (${player.age}). Tvrdí, že dřív kopal za sousední vesnici. ${pubCost > 0 ? `Stálo tě to ${pubCost} Kč za pivo.` : ""}`,
      cost: pubCost,
      expiresInRounds: rng.int(1, 3),
    });
  }

  return offers;
}

/**
 * Scout a player from opposing team after a match.
 */
export function scoutOpponent(
  rng: Rng,
  opponentSquad: GeneratedPlayer[],
  reputation: number,
): TransferOffer | null {
  if (rng.random() > 0.15) return null;

  // Pick a notable player from opponent
  const notable = opponentSquad.filter((p) =>
    p.shooting >= 12 || p.technique >= 12 || p.defense >= 12 || p.speed >= 12
  );
  if (notable.length === 0) return null;

  const target = rng.pick(notable);
  const successChance = Math.min(0.4, reputation / 100);

  return {
    channel: "scouting",
    player: target,
    description: `Všiml sis ${target.firstName} ${target.lastName} (${target.age}) u soupeře. ${target.patriotism <= 8 ? "Prý tam není spokojený..." : "Ale asi je tam spokojený."}`,
    cost: rng.int(500, 3000),
    expiresInRounds: rng.int(2, 4),
  };
}
