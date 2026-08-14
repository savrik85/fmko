/**
 * Katalog taktik — skill requirements + formation synergy.
 *
 * `calcTacticFit` posuzuje jak dobře tým zvládá taktiku (na základě skillů),
 * `calcFormationSynergy` jak se taktika kombinuje s konkrétní formací.
 */

import type { MatchPlayer, Tactic } from "./types";

type Pos = "GK" | "DEF" | "MID" | "FWD";

/**
 * Základní modifikátory taktiky. Engine je škáluje přes `effMod` podle toho,
 * jak dobře tým taktiku zvládá — netrénovaná taktika klesá k neutrální 1,0.
 *
 * Žije tady, ne v simulation.ts, protože je čte i `lineup-strength.ts` (náhled
 * síly sestavy). Dřív existovala kopie na obou místech a komentář u ní přiznával,
 * že se to musí ručně synchronizovat.
 */
export const TACTIC_MODS: Record<Tactic, { attackMod: number; defenseMod: number; chanceMod: number; counterMod: number }> = {
  offensive:  { attackMod: 1.15, defenseMod: 0.85, chanceMod: 1.05, counterMod: 0.0 },
  balanced:   { attackMod: 1.0,  defenseMod: 1.0,  chanceMod: 1.0,  counterMod: 0.0 },
  defensive:  { attackMod: 0.75, defenseMod: 1.15, chanceMod: 0.75, counterMod: 0.03 },
  long_ball:  { attackMod: 1.05, defenseMod: 0.95, chanceMod: 0.95, counterMod: 0.0 },
  possession: { attackMod: 1.05, defenseMod: 1.0,  chanceMod: 1.10, counterMod: 0.0 },
  pressing:   { attackMod: 1.08, defenseMod: 1.08, chanceMod: 1.05, counterMod: 0.0 },
};

/** Škáluje modifikátor podle toho, jak tým taktiku zvládá. */
export function effMod(baseMod: number, effectiveness: number): number {
  return 1 + (baseMod - 1) * effectiveness;
}

export interface SkillRequirement {
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
    formationSynergy: { "4-3-3": 1.05, "3-4-3": 1.08, "4-5-1": 0.93, "3-5-2": 1.0, "5-3-2": 0.95 },
  },
  defensive: {
    requirements: [
      { skill: "defense", positions: ["DEF"], threshold: 60, weight: 1.0 },
      { skill: "strength", positions: ["DEF"], threshold: 55, weight: 0.6 },
    ],
    formationSynergy: { "4-5-1": 1.06, "5-3-2": 1.05, "3-5-2": 0.98, "3-4-3": 0.92, "4-3-3": 0.95 },
  },
  long_ball: {
    requirements: [
      { skill: "heading", positions: ["FWD"], threshold: 60, weight: 1.0 },
      { skill: "strength", positions: ["FWD"], threshold: 55, weight: 0.7 },
      { skill: "heading", positions: ["GK"], threshold: 50, weight: 0.3 },
    ],
    formationSynergy: { "4-4-2": 1.05, "5-3-2": 1.05, "3-5-2": 1.03, "3-4-3": 0.92, "4-5-1": 0.95 },
  },
  possession: {
    requirements: [
      { skill: "technique", positions: ["MID"], threshold: 65, weight: 1.0 },
      { skill: "passing", positions: ["MID"], threshold: 65, weight: 1.0 },
      { skill: "vision", positions: ["MID"], threshold: 60, weight: 0.7 },
    ],
    formationSynergy: { "4-3-3": 1.08, "3-5-2": 1.06, "4-5-1": 1.04, "3-4-3": 1.03, "5-3-2": 0.92 },
  },
  pressing: {
    requirements: [
      { skill: "stamina", positions: OUTFIELD, threshold: 65, weight: 1.0 },
      { skill: "workRate", positions: OUTFIELD, threshold: 60, weight: 0.8 },
      { skill: "aggression", positions: OUTFIELD, threshold: 55, weight: 0.5 },
    ],
    formationSynergy: { "4-3-3": 1.05, "3-5-2": 1.04, "4-5-1": 0.95, "5-3-2": 0.95 },
    drainMod: 1.3,
  },
};

/**
 * Spočítá jak dobře tým zvládá taktiku — porovná skill týmu s požadavky.
 * Návratová hodnota: 0.7 (vůbec neumí) – 1.15 (velmi dobře).
 */
export function fitFromRequirements(lineup: MatchPlayer[], requirements: readonly SkillRequirement[]): number {
  if (requirements.length === 0) return 1.0;

  let weightedSum = 0;
  let totalWeight = 0;

  for (const req of requirements) {
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
  return Math.min(1.15, Math.max(0.7, weightedSum / totalWeight));
}

export function calcTacticFit(lineup: MatchPlayer[], tactic: Tactic): number {
  const def = TACTIC_CATALOG[tactic];
  if (!def) return 1.0;
  return fitFromRequirements(lineup, def.requirements);
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
 * Sehranost formace jako SAMOSTATNÝ multiplikátor útočné síly — 15 (floor) = 0,975, 100 = 1,025.
 *
 * Dřív se sehranost míchala do `calcTacticEffectiveness` a odtud do `effMod`, které škáluje
 * jen ODCHYLKU modifikátoru taktiky od 1,0. Vyrovnaná taktika má všechny modifikátory přesně
 * 1,0, takže odchylka byla nulová a sehranost u ní neměla žádný efekt — měřeno 400 ze 400
 * zápasů bit-identických. A vyrovnanou hraje ~68 % sestav. Proto se teď aplikuje přímo na
 * útočnou sílu, nezávisle na zvolené taktice.
 *
 * Rozsah ±2,5 % na útočné síle odpovídá zhruba ±7 % vytvořených šancí (~±0,2 gólu na zápas).
 */
export function formationChemistryFactor(familiarity: number | undefined): number {
  const f = Math.max(15, Math.min(100, familiarity ?? 15));
  return 0.975 + 0.05 * ((f - 15) / 85);
}

/**
 * Celkový multiplikátor efektivity taktiky — skill-fit × formation synergy.
 * Sehranost sem záměrně NEPATŘÍ, aplikuje se zvlášť (viz formationChemistryFactor).
 */
export function calcTacticEffectiveness(
  lineup: MatchPlayer[],
  tactic: Tactic,
  formation: string | undefined,
  _formationFamiliarity?: number,
): number {
  const fit = calcTacticFit(lineup, tactic);
  const formSyn = calcFormationSynergy(tactic, formation);
  return fit * formSyn;
}

export function tacticDrainMod(tactic: Tactic): number {
  return TACTIC_CATALOG[tactic]?.drainMod ?? 1.0;
}
