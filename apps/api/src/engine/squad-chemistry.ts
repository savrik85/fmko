/**
 * Chemie kabiny — JEDEN výpočet pro engine i pro UI.
 *
 * Dřív se číslo „CHEMIE" počítalo v prohlížeči vlastní tabulkou vah, na server se
 * neposílalo a engine o něm nevěděl — byla to čistá dekorace. Teď ho počítá tahle
 * funkce, používá ji simulace zápasu i endpoint sestavy, takže zobrazené číslo
 * odpovídá tomu, co se v zápase opravdu stane.
 */

import type { RelationType } from "./types";
// Váhy i texty žijí ve sdíleném balíku — používá je i web v sestavovači,
// aby zobrazené číslo odpovídalo tomu, co počítá engine.
import {
  CHEMISTRY_WEIGHTS,
  CHEMISTRY_EFFECT_TEXT,
  computeLineupChemistry,
  type RelationshipType,
} from "@okresni-masina/shared";

export { CHEMISTRY_WEIGHTS, CHEMISTRY_EFFECT_TEXT };

export interface ChemistryPair {
  type: string;
  aId: number;
  bId: number;
  aName: string;
  bName: string;
  strength: number;
  effect: string;
}

export interface ChemistryResult {
  /** 0–100, neutrál 50. */
  score: number;
  pairs: ChemistryPair[];
}

interface ChemPlayer {
  id: number;
  firstName: string;
  lastName: string;
  relationshipsInLineup?: Array<{ withId: number; type: RelationType; strength?: number }>;
}

/**
 * Chemie sestavy z párů, které jsou OBA na hřišti.
 *
 * Váha páru se škáluje silou vztahu (`strength/50`, tedy 0,4–1,9) — bratři, co spolu
 * vyrostli, drží víc než vzdálení bratranci. Chybí-li síla, počítá se neutrální 50.
 */
export function lineupChemistry(lineup: ChemPlayer[]): ChemistryResult {
  const seen = new Set<string>();
  const pairs: ChemistryPair[] = [];

  const nameOf = (p: ChemPlayer) => `${p.firstName} ${p.lastName}`;
  const byId = new Map(lineup.map((p) => [p.id, p]));

  for (const p of lineup) {
    for (const rel of p.relationshipsInLineup ?? []) {
      const other = byId.get(rel.withId);
      if (!other) continue;
      const key = [p.id, rel.withId].sort((a, b) => a - b).join("|") + `|${rel.type}`;
      if (seen.has(key)) continue;
      seen.add(key);

      pairs.push({
        type: rel.type,
        aId: p.id, bId: other.id,
        aName: nameOf(p), bName: nameOf(other),
        strength: rel.strength ?? 50,
        effect: CHEMISTRY_EFFECT_TEXT[rel.type as RelationshipType] ?? "",
      });
    }
  }

  const score = computeLineupChemistry(
    pairs.map((p) => ({ type: p.type as RelationshipType, strength: p.strength })),
  );
  return { score, pairs };
}

/**
 * Multiplikátor útočné síly z chemie kabiny — 0 → 0,98, 50 (neutrál) → 1,00, 100 → 1,02.
 *
 * Držíme to malé schválně: jednotlivé páry už mají svoje konkrétní efekty (asistence,
 * fauly, morálka), tohle je jen tenká týmová vrstva navíc, aby zobrazené číslo nebylo
 * jen ozdoba.
 */
export function squadChemistryFactor(lineup: ChemPlayer[]): number {
  const { score } = lineupChemistry(lineup);
  return 0.98 + 0.04 * (score / 100);
}
