export type RelationshipType =
  | "brothers"
  | "father_son"
  | "in_laws"
  | "classmates"
  | "coworkers"
  | "neighbors"
  | "drinking_buddies"
  | "rivals"
  | "mentor_pupil";

export interface Relationship {
  id: number;
  playerAId: number;
  playerBId: number;
  type: RelationshipType;
  strength: number;
  createdAt: string;
}

/**
 * Váhy chemie kabiny — kolik bodů přidá jeden pár daného typu k základu 50.
 *
 * Sdílené schválně: stejnou tabulku používá engine při simulaci zápasu i sestavovač
 * ve webu. Dřív měl web vlastní kopii s jinými čísly, takže zobrazená „CHEMIE"
 * nepopisovala nic z toho, co se v zápase reálně dělo.
 */
export const CHEMISTRY_WEIGHTS: Record<RelationshipType, number> = {
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

/** Co daný vztah v zápase a v kabině reálně dělá — text pro UI. */
export const CHEMISTRY_EFFECT_TEXT: Record<RelationshipType, string> = {
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

/**
 * Chemie sestavy z párů, kde jsou OBA hráči na hřišti. Základ 50, rozsah 0–100.
 * Váha páru se škáluje silou vztahu (`strength/50`, tedy zhruba 0,4–1,9).
 */
export function computeLineupChemistry(
  pairs: Array<{ type: RelationshipType; strength?: number }>,
): number {
  let score = 50;
  for (const p of pairs) {
    score += (CHEMISTRY_WEIGHTS[p.type] ?? 0) * ((p.strength ?? 50) / 50);
  }
  return Math.max(0, Math.min(100, Math.round(score)));
}