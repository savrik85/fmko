/**
 * FMK-21: Postup a sestup — víceúrovňová ligová pyramida.
 */

import type { Rng } from "../generators/rng";
import type { StandingEntry } from "./standings";

export type LeagueLevel =
  | "okresni_soutez"
  | "okresni_prebor"
  | "ib_trida"
  | "ia_trida"
  | "krajsky_prebor";

export interface PromotionResult {
  teamIndex: number;
  type: "promotion" | "relegation";
  fromLevel: LeagueLevel;
  toLevel: LeagueLevel;
  description: string;
}

export interface SeasonEndEffect {
  teamIndex: number;
  effect: string;
  description: string;
}

const LEVEL_ORDER: LeagueLevel[] = [
  "okresni_soutez",
  "okresni_prebor",
  "ib_trida",
  "ia_trida",
  "krajsky_prebor",
];

const LEVEL_NAMES: Record<LeagueLevel, string> = {
  okresni_soutez: "Okresní soutěž",
  okresni_prebor: "Okresní přebor",
  ib_trida: "I.B třída",
  ia_trida: "I.A třída",
  krajsky_prebor: "Krajský přebor",
};

/**
 * Determine promotions and relegations at end of season.
 */
export function calculatePromotions(
  standings: StandingEntry[],
  currentLevel: LeagueLevel,
): PromotionResult[] {
  const results: PromotionResult[] = [];
  const levelIdx = LEVEL_ORDER.indexOf(currentLevel);

  // Top 2 promote (if not already at highest level)
  if (levelIdx < LEVEL_ORDER.length - 1) {
    const nextLevel = LEVEL_ORDER[levelIdx + 1];
    for (let i = 0; i < 2 && i < standings.length; i++) {
      results.push({
        teamIndex: standings[i].teamIndex,
        type: "promotion",
        fromLevel: currentLevel,
        toLevel: nextLevel,
        description: `Postup do ${LEVEL_NAMES[nextLevel]}!`,
      });
    }
  }

  // Bottom 2 relegate (if not already at lowest level)
  if (levelIdx > 0) {
    const prevLevel = LEVEL_ORDER[levelIdx - 1];
    for (let i = standings.length - 1; i >= standings.length - 2 && i >= 0; i--) {
      results.push({
        teamIndex: standings[i].teamIndex,
        type: "relegation",
        fromLevel: currentLevel,
        toLevel: prevLevel,
        description: `Sestup do ${LEVEL_NAMES[prevLevel]}.`,
      });
    }
  }

  return results;
}

/**
 * Generate effects of promotion/relegation on a team.
 */
export function getPromotionEffects(
  rng: Rng,
  type: "promotion" | "relegation",
  isPlayerTeam: boolean,
): SeasonEndEffect[] {
  const effects: SeasonEndEffect[] = [];

  if (type === "promotion") {
    effects.push({
      teamIndex: 0,
      effect: "reputation_up",
      description: "Reputace klubu stoupla! Lepší sponzoři se ozývají.",
    });
    effects.push({
      teamIndex: 0,
      effect: "budget_up",
      description: `Vyšší soutěž = vyšší příjmy. Rozpočet +${rng.int(10, 30)}%.`,
    });
    if (rng.random() < 0.3) {
      effects.push({
        teamIndex: 0,
        effect: "player_interest",
        description: "Po postupu se ozval hráč z vyšší soutěže, že by chtěl přijít.",
      });
    }
  } else {
    effects.push({
      teamIndex: 0,
      effect: "reputation_down",
      description: "Sestup zasáhl morálku. Někteří hráči přemýšlejí o odchodu.",
    });
    effects.push({
      teamIndex: 0,
      effect: "budget_down",
      description: `Nižší soutěž = nižší příjmy. Rozpočet -${rng.int(10, 25)}%.`,
    });
    if (rng.random() < 0.4) {
      effects.push({
        teamIndex: 0,
        effect: "player_leave",
        description: "Nejlepší hráč chce odejít. Nechce hrát nižší soutěž.",
      });
    }
    if (rng.random() < 0.3) {
      effects.push({
        teamIndex: 0,
        effect: "sponsor_leave",
        description: "Hlavní sponzor ukončil smlouvu. Prý se vrátí při postupu.",
      });
    }
  }

  return effects;
}
