/**
 * Pure calculation of lineup strength — for pre-match preview UI.
 *
 * Reuse identical formulas from simulation.ts (attackPower / defensePower) but
 * deterministically (no RNG, no events) so that hráč při sestavování soupisky
 * vidí, jak silná je jeho sestava před zahájením zápasu.
 *
 * Pure functions only — žádné DB volání ani side effects.
 */

import type { MatchPlayer, TeamSetup } from "./types";
// Modifikátory taktiky se berou z jednoho místa. Dřív tu byla kopie, kterou
// bylo nutné ručně synchronizovat — a s příchodem tvrdosti hry by se rozjela.
import { TACTIC_MODS, calcTacticEffectiveness, effMod } from "./tactics";
import { playerRoleRating, slotOf, teamAttackIndex, teamDefenseIndex } from "./roles";

function teamAvg(lineup: MatchPlayer[], stat: keyof MatchPlayer): number {
  if (lineup.length === 0) return 0;
  const vals = lineup.map((p) => p[stat] as number);
  return vals.reduce((a, b) => a + b, 0) / vals.length;
}

// ── Síla řad a útoku/obrany — z rolí, stejně jako v zápase ─────────────────
// Do 2026-10-10 tu byla ruční kopie vzorců enginu a vlastní váhy řad, přepočtené
// na „UI škálu“ násobkem 4 z doby, kdy dovednosti jely 1–25. U dnešních hráčů
// (dovednosti kolem 50) tak náhled skoro všude ukazoval strop 100.

function lineStrength(players: MatchPlayer[]): number {
  if (players.length === 0) return 0;
  return clamp(players.reduce((s, p) => s + playerRoleRating(p), 0) / players.length, 0, 100);
}

function clamp(v: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, v));
}

function tacticAdjusted(setup: TeamSetup, value: number, kind: "attackMod" | "defenseMod"): number {
  const tacticMod = TACTIC_MODS[setup.tactic] ?? TACTIC_MODS.balanced;
  return value * effMod(tacticMod[kind], calcTacticEffectiveness(setup.lineup, setup.tactic, setup.formation));
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
  const inSlot = (slot: string) => setup.lineup.filter((p) => slotOf(p) === slot);

  const perLine: LineStrengths = {
    gk: Math.round(lineStrength(inSlot("GK"))),
    def: Math.round(lineStrength(inSlot("DEF"))),
    mid: Math.round(lineStrength(inSlot("MID"))),
    fwd: Math.round(lineStrength(inSlot("FWD"))),
  };

  // Útok a obrana stejně jako v zápase (engine/roles.ts), 50 = průměrný tým.
  const attack = Math.round(clamp(tacticAdjusted(setup, teamAttackIndex(setup.lineup), "attackMod"), 0, 100));
  const defense = Math.round(clamp(tacticAdjusted(setup, teamDefenseIndex(setup.lineup), "defenseMod"), 0, 100));
  // Řady se váží počtem hráčů — každý hráč v sestavě má stejný hlas jako v zápase.
  const counted = setup.lineup.length || 1;
  const overall = Math.round(setup.lineup.reduce((s, p) => s + playerRoleRating(p), 0) / counted);

  const tacticMod = TACTIC_MODS[setup.tactic] ?? TACTIC_MODS.balanced;
  const tacticEff = calcTacticEffectiveness(setup.lineup, setup.tactic, setup.formation);
  const round2 = (v: number) => Math.round(v * 100) / 100;

  const notes: string[] = [];
  // Detekovat slabiny v sestavě
  const avgCondition = teamAvg(setup.lineup, "condition");
  if (avgCondition < 60) notes.push(`Průměrná kondice ${Math.round(avgCondition)} %, výrazně snižuje výkon.`);
  if (perLine.gk < 30) notes.push("Brankář je velmi slabý, zvaž rotaci.");
  if (perLine.def < 30) notes.push("Obrana je slabá.");
  if (perLine.fwd < 30) notes.push("Útok je slabý.");

  // Out-of-position penalty (matchPosition ≠ position)
  const oop = setup.lineup.filter((p) => p.matchPosition && p.matchPosition !== p.position);
  if (oop.length > 0) {
    notes.push(`${oop.length} ${oop.length === 1 ? "hráč hraje" : "hráči hrají"} mimo svou pozici — ztrácí 10–40 % klíčových atributů.`);
  }

  return {
    perLine,
    attack,
    defense,
    overall,
    // Skutečný efekt taktiky po započtení toho, jak ji kádr zvládá (stejně jako v zápase).
    // Dřív se ukazovala nominální procenta, která tým se slabým fitem nikdy neviděl.
    tacticEffect: {
      attackMod: round2(effMod(tacticMod.attackMod, tacticEff)),
      defenseMod: round2(effMod(tacticMod.defenseMod, tacticEff)),
      chanceMod: round2(effMod(tacticMod.chanceMod, tacticEff)),
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
    recommendation = "Tvůj tým je silnější ve všech liniích, můžeš hrát útočněji.";
  } else if (weakLines.length === 0 && comparison.overall === "MUCH_STRONGER") {
    recommendation = "Výrazně silnější tým, neztrať koncentraci a hrej s respektem.";
  } else if (weakLines.length >= 2 && comparison.overall === "MUCH_WEAKER") {
    recommendation = `Velký rozdíl v síle (${weakLines.join(", ")}). Zvaž defenzivní taktiku a rychlé protiútoky.`;
  } else if (weakLines.length >= 1) {
    recommendation = `Máš slabší ${weakLines.join(", ")} než soupeř — buď zpevni sestavu, nebo zvol Defenzivní taktiku.`;
  } else if (comparison.overall === "EVEN") {
    recommendation = "Vyrovnaný souboj. Klíč: kondice, morálka a sehranost.";
  }

  return { own, opponent, comparison, recommendation };
}
