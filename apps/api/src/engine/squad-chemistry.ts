/**
 * Chemie kabiny — JEDEN výpočet pro engine i pro UI.
 *
 * Dřív se číslo „CHEMIE" počítalo v prohlížeči vlastní tabulkou vah, na server se
 * neposílalo a engine o něm nevěděl — byla to čistá dekorace. Teď ho počítá tahle
 * funkce, používá ji simulace zápasu i endpoint sestavy, takže zobrazené číslo
 * odpovídá tomu, co se v zápase opravdu stane.
 */

import type { RelationType } from "./types";

/** Kolik bodů chemie přidá jeden pár daného typu (základ je 50). */
export const CHEMISTRY_WEIGHTS: Record<string, number> = {
  brothers: 5,
  father_son: 4,
  mentor_pupil: 4,
  classmates: 2,
  coworkers: 2,
  drinking_buddies: 2,
  neighbors: 1,
  in_laws: -1,
  rivals: -3,
};

/** Co daný typ vztahu v zápase reálně dělá — text pro UI, ať číslo nic neslibuje naslepo. */
export const CHEMISTRY_EFFECT_TEXT: Record<string, string> = {
  brothers: "hledají se na hřišti — častější vzájemné asistence",
  father_son: "hledají se na hřišti — častější vzájemné asistence",
  mentor_pupil: "mentor dodává klid — jistější zakončení a víc asistencí",
  classmates: "sehraní ze školy — častější vzájemné asistence",
  coworkers: "znají se z práce — lepší nálada v kabině",
  drinking_buddies: "parťáci od piva — lepší nálada, ale i společné výlety do hospody",
  neighbors: "jezdí spolu na zápasy — lepší nálada v kabině",
  in_laws: "rodinné tření — kabině to na náladě nepřidá",
  rivals: "nemůžou se cítit — horší nálada a víc zbytečných faulů",
};

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
  let score = 50;

  const nameOf = (p: ChemPlayer) => `${p.firstName} ${p.lastName}`;
  const byId = new Map(lineup.map((p) => [p.id, p]));

  for (const p of lineup) {
    for (const rel of p.relationshipsInLineup ?? []) {
      const other = byId.get(rel.withId);
      if (!other) continue;
      const key = [p.id, rel.withId].sort((a, b) => a - b).join("|") + `|${rel.type}`;
      if (seen.has(key)) continue;
      seen.add(key);

      const strength = rel.strength ?? 50;
      const weight = (CHEMISTRY_WEIGHTS[rel.type] ?? 0) * (strength / 50);
      score += weight;

      pairs.push({
        type: rel.type,
        aId: p.id, bId: other.id,
        aName: nameOf(p), bName: nameOf(other),
        strength,
        effect: CHEMISTRY_EFFECT_TEXT[rel.type] ?? "",
      });
    }
  }

  return { score: Math.max(0, Math.min(100, Math.round(score))), pairs };
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
