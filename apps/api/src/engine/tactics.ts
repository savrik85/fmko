/**
 * Katalog taktik — skill requirements + formation synergy.
 *
 * `calcTacticFit` posuzuje jak dobře tým zvládá taktiku (na základě skillů),
 * `calcFormationSynergy` jak se taktika kombinuje s konkrétní formací.
 */

import type { MatchPlayer, Tactic } from "./types";

type Pos = "GK" | "DEF" | "MID" | "FWD";

interface SkillRequirement {
  skill: keyof MatchPlayer; // numerický skill
  positions: Pos[];         // odkud brát průměr (prázdné = všichni outfield)
  threshold: number;        // ideální úroveň
  weight: number;           // váha v skillFit
}

interface TacticDef {
  requirements: SkillRequirement[];
  formationSynergy: Record<string, number>; // formation -> 0.9..1.1; default 1.0
  drainMod?: number; // modifikátor staminového úbytku (pressing)
}

const OUTFIELD: Pos[] = ["DEF", "MID", "FWD"];

export const TACTIC_CATALOG: Record<Tactic, TacticDef> = {
  balanced: {
    requirements: [],
    formationSynergy: {},
  },
  offensive: {
    requirements: [
      { skill: "shooting", positions: ["FWD"], threshold: 60, weight: 1.0 },
      { skill: "speed", positions: ["FWD"], threshold: 60, weight: 0.8 },
    ],
    formationSynergy: { "4-3-3": 1.05, "3-4-3": 1.08, "5-4-1": 0.95, "5-3-2": 0.95 },
  },
  defensive: {
    requirements: [
      { skill: "defense", positions: ["DEF"], threshold: 60, weight: 1.0 },
      { skill: "strength", positions: ["DEF"], threshold: 55, weight: 0.6 },
    ],
    formationSynergy: { "5-4-1": 1.08, "5-3-2": 1.05, "4-2-3-1": 1.02, "3-4-3": 0.92, "4-3-3": 0.95 },
  },
  long_ball: {
    requirements: [
      { skill: "heading", positions: ["FWD"], threshold: 60, weight: 1.0 },
      { skill: "strength", positions: ["FWD"], threshold: 55, weight: 0.7 },
      { skill: "heading", positions: ["GK"], threshold: 50, weight: 0.3 },
    ],
    formationSynergy: { "4-4-2": 1.05, "5-3-2": 1.05, "3-4-3": 0.92, "4-2-3-1": 0.95 },
  },
  possession: {
    requirements: [
      { skill: "technique", positions: ["MID"], threshold: 65, weight: 1.0 },
      { skill: "passing", positions: ["MID"], threshold: 65, weight: 1.0 },
      { skill: "vision", positions: ["MID"], threshold: 60, weight: 0.7 },
    ],
    formationSynergy: { "4-3-3": 1.08, "4-2-3-1": 1.08, "3-4-3": 1.03, "5-3-2": 0.92, "5-4-1": 0.9 },
  },
  pressing: {
    requirements: [
      { skill: "stamina", positions: OUTFIELD, threshold: 65, weight: 1.0 },
      { skill: "workRate", positions: OUTFIELD, threshold: 60, weight: 0.8 },
      { skill: "aggression", positions: OUTFIELD, threshold: 55, weight: 0.5 },
    ],
    formationSynergy: { "4-3-3": 1.05, "4-2-3-1": 1.05, "5-4-1": 0.92, "5-3-2": 0.95 },
    drainMod: 1.3,
  },
};

/**
 * Spočítá jak dobře tým zvládá taktiku — porovná skill týmu s požadavky.
 * Návratová hodnota: 0.7 (vůbec neumí) – 1.15 (velmi dobře).
 */
export function calcTacticFit(lineup: MatchPlayer[], tactic: Tactic): number {
  const def = TACTIC_CATALOG[tactic];
  if (!def || def.requirements.length === 0) return 1.0;

  let weightedSum = 0;
  let totalWeight = 0;

  for (const req of def.requirements) {
    const players = req.positions.length > 0
      ? lineup.filter((p) => req.positions.includes((p.matchPosition ?? p.position) as Pos))
      : lineup.filter((p) => p.position !== "GK");
    if (players.length === 0) continue;

    const avg = players.reduce((sum, p) => sum + ((p[req.skill] as number) ?? 50), 0) / players.length;
    const ratio = Math.min(1.3, Math.max(0.6, avg / req.threshold));
    weightedSum += ratio * req.weight;
    totalWeight += req.weight;
  }

  if (totalWeight === 0) return 1.0;
  const fit = weightedSum / totalWeight;
  return Math.min(1.15, Math.max(0.7, fit));
}

/**
 * Synergie taktiky s formací. Default 1.0 pokud není definováno.
 */
export function calcFormationSynergy(tactic: Tactic, formation?: string): number {
  if (!formation) return 1.0;
  const def = TACTIC_CATALOG[tactic];
  return def?.formationSynergy[formation] ?? 1.0;
}

/**
 * Sehranost faktor pro formaci — 15 (default/floor) = ~0.83, 100 = 1.0.
 * Žádná formace nikdy plně netlumená k 0.8 — i neznámou tým trochu umí.
 */
export function formationChemistryFactor(familiarity: number | undefined): number {
  const f = Math.max(15, Math.min(100, familiarity ?? 15));
  return 0.8 + 0.2 * (f / 100);
}

/**
 * Celkový multiplikátor efektivity taktiky — skill-fit × formation synergy × formation chemistry.
 * Sehranost se počítá jen na formaci (taktika se v reálu adoptuje rychle, sehranost rozestavění je klíčová).
 */
export function calcTacticEffectiveness(
  lineup: MatchPlayer[],
  tactic: Tactic,
  formation: string | undefined,
  formationFamiliarity: number | undefined,
): number {
  const fit = calcTacticFit(lineup, tactic);
  const formSyn = calcFormationSynergy(tactic, formation);
  const formChem = formationChemistryFactor(formationFamiliarity);
  return fit * formSyn * formChem;
}

export function tacticDrainMod(tactic: Tactic): number {
  return TACTIC_CATALOG[tactic]?.drainMod ?? 1.0;
}
