/**
 * Pure calculation of lineup strength — for pre-match preview UI.
 *
 * Reuse identical formulas from simulation.ts (attackPower / defensePower) but
 * deterministically (no RNG, no events) so that hráč při sestavování soupisky
 * vidí, jak silná je jeho sestava před zahájením zápasu.
 *
 * Pure functions only — žádné DB volání ani side effects.
 */

import type { MatchPlayer, TeamSetup, Tactic } from "./types";

// ── Identické konstanty s simulation.ts ─────────────────────────────────────
// (Pokud se simulation.ts změní, je třeba synchronizovat zde — nebo refaktorovat
//  TACTIC_MODS do shared místa. Pro Fázi 2 stačí duplicita, je to malé.)

const TACTIC_MODS: Record<Tactic, { attackMod: number; defenseMod: number; chanceMod: number }> = {
  offensive:  { attackMod: 1.15, defenseMod: 0.85, chanceMod: 1.05 },
  balanced:   { attackMod: 1.0,  defenseMod: 1.0,  chanceMod: 1.0 },
  defensive:  { attackMod: 0.75, defenseMod: 1.15, chanceMod: 0.75 },
  long_ball:  { attackMod: 1.05, defenseMod: 0.95, chanceMod: 0.95 },
  possession: { attackMod: 1.05, defenseMod: 1.0,  chanceMod: 1.10 },
  pressing:   { attackMod: 1.08, defenseMod: 1.08, chanceMod: 1.05 },
};

function teamAvg(lineup: MatchPlayer[], stat: keyof MatchPlayer): number {
  if (lineup.length === 0) return 0;
  const vals = lineup.map((p) => p[stat] as number);
  return vals.reduce((a, b) => a + b, 0) / vals.length;
}

// ── Per-line strength: vážený průměr klíčových atributů pro pozici ──────────
// Hodnoty atributů jsou 1–20, normalizujeme na 0–100 pro UI.

// Realne pozorovane atributy ve hre se pohybuji ~5-30 (max ~40 u top hracu).
// Pro UI 0-100 skalu nasobime ~4x (silny hrac → 80-95, prumer → 50-65, slaby → 20-40).
// condition/morale jsou 0-100 → nasobeni neni potreba, pouzivame primo.
const SKILL_TO_UI_FACTOR = 4;

function gkStrength(gks: MatchPlayer[]): number {
  if (gks.length === 0) return 0;
  const gk = gks[0];
  return clamp(gk.goalkeeping * SKILL_TO_UI_FACTOR * 0.7 + gk.condition * 0.15 + gk.morale * 0.15, 0, 100);
}

function defStrength(defs: MatchPlayer[]): number {
  if (defs.length === 0) return 0;
  return clamp((teamAvg(defs, "defense") * 0.5 + teamAvg(defs, "strength") * 0.25 + teamAvg(defs, "heading") * 0.15 + teamAvg(defs, "speed") * 0.1) * SKILL_TO_UI_FACTOR, 0, 100);
}

function midStrength(mids: MatchPlayer[]): number {
  if (mids.length === 0) return 0;
  return clamp((teamAvg(mids, "passing") * 0.35 + teamAvg(mids, "technique") * 0.25 + teamAvg(mids, "vision") * 0.15 + teamAvg(mids, "workRate") * 0.15 + teamAvg(mids, "stamina") * 0.10) * SKILL_TO_UI_FACTOR, 0, 100);
}

function fwdStrength(fwds: MatchPlayer[]): number {
  if (fwds.length === 0) return 0;
  return clamp((teamAvg(fwds, "shooting") * 0.4 + teamAvg(fwds, "speed") * 0.2 + teamAvg(fwds, "technique") * 0.2 + teamAvg(fwds, "heading") * 0.1 + teamAvg(fwds, "creativity") * 0.1) * SKILL_TO_UI_FACTOR, 0, 100);
}

function clamp(v: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, v));
}

// ── Attack / Defense power — kopie engine vzorce ────────────────────────────

function rawAttackPower(setup: TeamSetup): number {
  const outfield = setup.lineup.filter((p) => p.position !== "GK");
  const mids = setup.lineup.filter((p) => p.position === "MID");
  const midAndFwd = setup.lineup.filter((p) => p.position === "MID" || p.position === "FWD");
  const tacticMod = TACTIC_MODS[setup.tactic] ?? TACTIC_MODS.balanced;

  const base = (
    teamAvg(outfield, "technique") * 0.8 +
    teamAvg(outfield, "passing") * 1.0 +
    teamAvg(outfield, "speed") * 0.7 +
    (mids.length > 0 ? teamAvg(mids, "vision") * 0.6 : 0) +
    (midAndFwd.length > 0 ? teamAvg(midAndFwd, "creativity") * 0.5 : 0) +
    teamAvg(outfield, "workRate") * 0.3
  ) / 5;

  return base * tacticMod.attackMod;
}

function rawDefensePower(setup: TeamSetup): number {
  const defOutfield = setup.lineup.filter((p) => p.position !== "GK");
  const defs = setup.lineup.filter((p) => p.position === "DEF");
  const tacticMod = TACTIC_MODS[setup.tactic] ?? TACTIC_MODS.balanced;

  const base = (
    teamAvg(defOutfield, "defense") * 1.0 +
    teamAvg(defOutfield, "strength") * 0.7 +
    (defs.length > 0 ? teamAvg(defs, "aggression") * 0.2 : 0) +
    teamAvg(defOutfield, "workRate") * 0.2
  ) / 3;

  return base * tacticMod.defenseMod;
}

// Normalize attack/defense power to 0-100 scale.
// Engine values typically ~20–35 (attack), ~18–25 (defense).
function normalize(rawValue: number, low: number, high: number): number {
  return clamp(((rawValue - low) / (high - low)) * 100, 0, 100);
}

// ── Public API ──────────────────────────────────────────────────────────────

export interface LineStrengths {
  gk: number;   // 0-100
  def: number;
  mid: number;
  fwd: number;
}

export type Comparison = "MUCH_WEAKER" | "WEAKER" | "EVEN" | "STRONGER" | "MUCH_STRONGER";

export interface LineupStrength {
  perLine: LineStrengths;
  attack: number;   // 0-100, normalized from engine attackPower
  defense: number;  // 0-100
  overall: number;  // 0-100, weighted average
  tacticEffect: {
    attackMod: number;
    defenseMod: number;
    chanceMod: number;
  };
  notes: string[];
}

export interface LineupPreview {
  own: LineupStrength;
  opponent?: LineupStrength;
  comparison?: {
    perLine: Record<keyof LineStrengths, Comparison>;
    overall: Comparison;
    overallDelta: number;  // own.overall - opponent.overall
  };
  recommendation?: string;
}

function compare(own: number, opp: number): Comparison {
  const delta = own - opp;
  if (delta >= 15) return "MUCH_STRONGER";
  if (delta >= 5) return "STRONGER";
  if (delta >= -5) return "EVEN";
  if (delta >= -15) return "WEAKER";
  return "MUCH_WEAKER";
}

export function calcLineupStrength(setup: TeamSetup): LineupStrength {
  const gks = setup.lineup.filter((p) => p.position === "GK");
  const defs = setup.lineup.filter((p) => p.position === "DEF");
  const mids = setup.lineup.filter((p) => p.position === "MID");
  const fwds = setup.lineup.filter((p) => p.position === "FWD");

  const perLine: LineStrengths = {
    gk: Math.round(gkStrength(gks)),
    def: Math.round(defStrength(defs)),
    mid: Math.round(midStrength(mids)),
    fwd: Math.round(fwdStrength(fwds)),
  };

  // rawAttack/Defense vychazi ze skutecnych atributu (1-30 typicky).
  // Pozorovany engine range: attack ~7-20, defense ~5-18.
  const attack = Math.round(normalize(rawAttackPower(setup), 5, 22));
  const defense = Math.round(normalize(rawDefensePower(setup), 4, 18));
  const overall = Math.round(
    perLine.gk * 0.15 + perLine.def * 0.30 + perLine.mid * 0.30 + perLine.fwd * 0.25
  );

  const tacticMod = TACTIC_MODS[setup.tactic] ?? TACTIC_MODS.balanced;

  const notes: string[] = [];
  // Detekovat slabiny v sestavě
  const avgCondition = teamAvg(setup.lineup, "condition");
  if (avgCondition < 60) notes.push(`Průměrná kondice ${Math.round(avgCondition)} % — výrazně snižuje výkon.`);
  if (perLine.gk < 30) notes.push("Brankář je velmi slabý — zvaž rotaci.");
  if (perLine.def < 30) notes.push("Obrana je slabá.");
  if (perLine.fwd < 30) notes.push("Útok je slabý.");

  // Out-of-position penalty (matchPosition ≠ position)
  const oop = setup.lineup.filter((p) => p.matchPosition && p.matchPosition !== p.position);
  if (oop.length > 0) {
    notes.push(`${oop.length} ${oop.length === 1 ? "hráč hraje" : "hráči hrají"} mimo svou pozici — ztrácí ~30 % atributů.`);
  }

  return {
    perLine,
    attack,
    defense,
    overall,
    tacticEffect: {
      attackMod: tacticMod.attackMod,
      defenseMod: tacticMod.defenseMod,
      chanceMod: tacticMod.chanceMod,
    },
    notes,
  };
}

export function calcLineupPreview(ownSetup: TeamSetup, opponentSetup?: TeamSetup): LineupPreview {
  const own = calcLineupStrength(ownSetup);
  if (!opponentSetup) return { own };

  const opponent = calcLineupStrength(opponentSetup);
  const comparison = {
    perLine: {
      gk: compare(own.perLine.gk, opponent.perLine.gk),
      def: compare(own.perLine.def, opponent.perLine.def),
      mid: compare(own.perLine.mid, opponent.perLine.mid),
      fwd: compare(own.perLine.fwd, opponent.perLine.fwd),
    },
    overall: compare(own.overall, opponent.overall),
    overallDelta: own.overall - opponent.overall,
  };

  // Generuj doporučení na základě porovnání (akuzativ — "Slabší obranu/útok")
  let recommendation: string | undefined;
  const weakLines: string[] = [];
  if (comparison.perLine.gk === "MUCH_WEAKER" || comparison.perLine.gk === "WEAKER") weakLines.push("brankáře");
  if (comparison.perLine.def === "MUCH_WEAKER" || comparison.perLine.def === "WEAKER") weakLines.push("obranu");
  if (comparison.perLine.mid === "MUCH_WEAKER" || comparison.perLine.mid === "WEAKER") weakLines.push("zálohu");
  if (comparison.perLine.fwd === "MUCH_WEAKER" || comparison.perLine.fwd === "WEAKER") weakLines.push("útok");

  if (weakLines.length === 0 && comparison.overall === "STRONGER") {
    recommendation = "Tvůj tým je silnější ve všech liniích — můžeš hrát útočněji.";
  } else if (weakLines.length === 0 && comparison.overall === "MUCH_STRONGER") {
    recommendation = "Výrazně silnější tým — neztrať koncentraci a hrej s respektem.";
  } else if (weakLines.length >= 2 && comparison.overall === "MUCH_WEAKER") {
    recommendation = `Velký rozdíl v síle (${weakLines.join(", ")}). Zvaž defenzivní taktiku a rychlé protiútoky.`;
  } else if (weakLines.length >= 1) {
    recommendation = `Máš slabší ${weakLines.join(", ")} než soupeř — buď zpevni sestavu, nebo zvol Defenzivní taktiku.`;
  } else if (comparison.overall === "EVEN") {
    recommendation = "Vyrovnaný souboj. Klíč: kondice, morálka a sehranost.";
  }

  return { own, opponent, comparison, recommendation };
}
