/**
 * FMK-12: Tréninkový systém — plánování, účast, efekt na atributy.
 */

import type { Rng } from "../generators/rng";
import type { GeneratedPlayer } from "../generators/player";

export type TrainingType = "conditioning" | "technique" | "tactics" | "match_practice";
export type TrainingApproach = "strict" | "balanced" | "relaxed";

export interface TrainingPlan {
  sessionsPerWeek: number; // 1-3
  type: TrainingType;
  approach: TrainingApproach;
}

export interface TrainingAttendance {
  playerIndex: number;
  attended: boolean;
  reason?: string;
}

export interface TrainingResult {
  attendance: TrainingAttendance[];
  improvements: Array<{ playerIndex: number; attribute: string; change: number }>;
  teamChemistry: number; // Change to team chemistry
  description: string;
}

const ABSENCE_REASONS = [
  "Měl směnu v práci",
  "Nedostal se z domu — děti",
  "Páteční hospoda se protáhla",
  "Prší, nechce se mu",
  "Grilování u sousedů",
  "Říkal, že zapomněl",
  "Auto nejelo",
  "Dovolená",
];

const COMMUTE_ABSENCE_REASONS = [
  "Nestihl to — daleko dojíždí",
  "Auto se porouchalo cestou",
  "Nechtělo se mu jet tak daleko v dešti",
  "Zmeškal autobus",
  "Říkal že cesta za to nestojí",
];

const TRAINING_EFFECTS: Record<TrainingType, string[]> = {
  conditioning: ["stamina", "speed", "strength"],
  technique: ["technique", "shooting", "creativity", "setPieces"],
  tactics: ["passing", "defense", "vision"],
  match_practice: ["shooting", "heading", "goalkeeping"],
};

/**
 * Simulate training attendance for one session.
 * commuteKms: optional array of commute distances per player index.
 */
function simulateAttendance(
  rng: Rng,
  squad: GeneratedPlayer[],
  approach: TrainingApproach,
  commuteKms?: number[],
): TrainingAttendance[] {
  return squad.map((player, i) => {
    // Base attendance from discipline
    let attendProb = player.discipline / 100 * 0.6 + 0.3;

    // Approach modifiers
    if (approach === "strict") attendProb += 0.1;
    if (approach === "relaxed") attendProb -= 0.1;

    // Age: older players skip more
    if (player.age > 35) attendProb -= 0.1;

    // Alcohol: party animals skip more
    if (player.alcohol > 70) attendProb -= 0.1;

    // Morale: low morale = less motivated
    if (player.morale < 30) attendProb -= 0.15;

    // Commute: farther players attend less
    const km = commuteKms?.[i] ?? 0;
    if (km > 0) {
      // 5km → -3%, 10km → -7%, 15km → -12%, 20km → -17%, 25km+ → -22%
      attendProb -= Math.min(0.22, km * 0.008);
    }

    attendProb = Math.max(0.1, Math.min(0.95, attendProb));

    if (rng.random() < attendProb) {
      return { playerIndex: i, attended: true };
    }

    // Commuters more likely to have commute-specific excuse
    const reason = km > 10 && rng.random() < 0.4
      ? rng.pick(COMMUTE_ABSENCE_REASONS)
      : rng.pick(ABSENCE_REASONS);

    return {
      playerIndex: i,
      attended: false,
      reason,
    };
  });
}

/**
 * Simulate a week of training (1-3 sessions).
 */
export function simulateTraining(
  rng: Rng,
  squad: GeneratedPlayer[],
  plan: TrainingPlan,
  commuteKms?: number[],
  equipmentMultiplier: number = 1.0,
): TrainingResult {
  const allAttendance: TrainingAttendance[] = [];
  const attendanceCounts = new Map<number, number>();

  // Simulate each session
  for (let s = 0; s < plan.sessionsPerWeek; s++) {
    const session = simulateAttendance(rng, squad, plan.approach);
    for (const a of session) {
      if (a.attended) {
        attendanceCounts.set(a.playerIndex, (attendanceCounts.get(a.playerIndex) ?? 0) + 1);
      }
    }
    // Keep last session's attendance for display
    if (s === plan.sessionsPerWeek - 1) {
      allAttendance.push(...session);
    }
  }

  // Calculate improvements
  const improvements: TrainingResult["improvements"] = [];
  const affectedAttrs = TRAINING_EFFECTS[plan.type];

  for (const [playerIndex, sessions] of attendanceCounts) {
    // Only improve if attended at least half the sessions
    if (sessions < Math.ceil(plan.sessionsPerWeek / 2)) continue;

    const player = squad[playerIndex];
    // GK filter: non-GK never gets goalkeeping, GK prefers goalkeeping in match_practice
    let attr = rng.pick(affectedAttrs);
    if (attr === "goalkeeping" && player.position !== "GK") {
      // Re-pick without goalkeeping
      const filtered = affectedAttrs.filter((a) => a !== "goalkeeping");
      attr = rng.pick(filtered);
    } else if (player.position === "GK" && plan.type === "match_practice" && attr !== "goalkeeping") {
      // GK has 60% chance to train goalkeeping instead during match practice
      if (rng.random() < 0.6) attr = "goalkeeping";
    }
    const current = player[attr as keyof GeneratedPlayer] as number;

    // Diminishing returns: each point above 50 reduces chance
    const diminishing = current >= 50 ? Math.max(0.15, 1.0 - (current - 50) * 0.017) : 1.0;

    // Age modifier
    const ageMod = player.age < 20 ? 1.3
      : player.age < 25 ? 1.15
      : player.age < 30 ? 1.0
      : player.age < 34 ? 0.7
      : player.age < 38 ? 0.4
      : 0.15;

    // TODO: Talent modifier — requires hidden_talent from DB (not in GeneratedPlayer yet)
    // Will be added when daily-tick passes hidden_talent to squad data

    const improveChance = 0.015 * sessions * equipmentMultiplier * diminishing * ageMod;
    if (rng.random() < improveChance) {
      if (current < 100) {
        (player as unknown as Record<string, number>)[attr] = current + 1;
        improvements.push({ playerIndex, attribute: attr, change: 1 });
      }
    }
  }

  // Veteran decay: 34+ lose physical attributes
  for (const [playerIndex] of attendanceCounts) {
    const player = squad[playerIndex];
    if (player.age >= 34) {
      const decayChance = (player.age - 33) * 0.01;
      for (const attr of ["speed", "stamina", "strength"]) {
        const val = player[attr as keyof GeneratedPlayer] as number;
        if (rng.random() < decayChance && val > 15) {
          (player as unknown as Record<string, number>)[attr] = val - 1;
          improvements.push({ playerIndex, attribute: attr, change: -1 });
        }
      }
    }
  }

  // Non-attendees may lose stamina
  for (let i = 0; i < squad.length; i++) {
    const attended = attendanceCounts.get(i) ?? 0;
    if (attended === 0 && rng.random() < 0.3) {
      const player = squad[i];
      if (player.stamina > 5) {
        player.stamina -= 1;
        improvements.push({ playerIndex: i, attribute: "stamina", change: -1 });
      }
    }
  }

  // Team chemistry from tactics training
  let chemistryChange = 0;
  if (plan.type === "tactics") {
    const attendRate = [...attendanceCounts.values()].filter((v) => v > 0).length / squad.length;
    chemistryChange = Math.round(attendRate * 3);
  }

  // Approach morale effects
  if (plan.approach === "strict") {
    for (const player of squad) {
      if (player.discipline < 50 && rng.random() < 0.1) {
        player.morale = Math.max(0, player.morale - 2);
      }
    }
  }
  if (plan.approach === "relaxed") {
    for (const player of squad) {
      if (rng.random() < 0.05) {
        player.morale = Math.min(100, player.morale + 1);
      }
    }
  }

  const attendedCount = [...attendanceCounts.values()].filter((v) => v > 0).length;
  const descriptions = [
    `Na trénink dorazilo ${attendedCount} z ${squad.length} hráčů.`,
    `Trénink ${plan.type === "conditioning" ? "kondice" : plan.type === "technique" ? "techniky" : plan.type === "tactics" ? "taktiky" : "zápasový"}: účast ${attendedCount}/${squad.length}.`,
  ];

  return {
    attendance: allAttendance,
    improvements,
    teamChemistry: chemistryChange,
    description: rng.pick(descriptions),
  };
}
