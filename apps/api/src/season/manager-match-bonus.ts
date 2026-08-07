import { logger } from "../lib/logger";

/**
 * Bonus trenéra k sestavě před výkopem.
 *
 * Taktika přidá celému kádru přihrávky a obranu, motivace morálku. Aplikuje se
 * na hráče v paměti, ještě než sestava vstoupí do simulace.
 *
 * Sdílené mezi ligou a pohárem — dřív to uměl jen ligový match-runner, takže
 * stejný trenér byl v poháru k ničemu.
 */

export interface ManagerMatchBonus {
  tactics: number;
  motivation: number;
  /** +přihrávky a obrana všem hráčům */
  passingDefenseBonus: number;
  /** +morálka všem hráčům */
  moraleBonus: number;
}

/** Taktika: 40 = +0, 60 = +1, 80 = +2. Strop atributu je 99, takže výš než +2 to nejde. */
export function tacticsBonus(tactics: number): number {
  return Math.max(0, Math.floor((tactics - 40) / 20));
}

/** Motivace: 40 = +1, 60 = +3, 80 = +5, 99 = +6 morálky. */
export function moraleBonus(motivation: number): number {
  return Math.max(0, Math.floor((motivation - 30) / 10));
}

interface BonusablePlayer {
  passing: number;
  defense: number;
  morale: number;
}

/**
 * Načte trenéra týmu a promítne jeho bonusy do sestavy i lavičky.
 * Vrací, co se aplikovalo (pro report „co rozhodlo"), nebo null když tým trenéra nemá.
 */
export async function applyManagerMatchBonus(
  db: D1Database,
  teamId: string,
  players: BonusablePlayer[][],
): Promise<ManagerMatchBonus | null> {
  const mgr = await db.prepare("SELECT tactics, motivation FROM managers WHERE team_id = ? LIMIT 1")
    .bind(teamId).first<{ tactics: number; motivation: number }>()
    .catch((e) => {
      logger.warn({ module: "manager-match-bonus" }, `load manager for ${teamId}`, e);
      return null;
    });
  if (!mgr) return null;

  const pd = tacticsBonus(mgr.tactics);
  const mb = moraleBonus(mgr.motivation);

  for (const group of players) {
    for (const p of group) {
      if (pd > 0) {
        p.passing = Math.min(100, p.passing + pd);
        p.defense = Math.min(100, p.defense + pd);
      }
      if (mb > 0) {
        p.morale = Math.min(100, p.morale + mb);
      }
    }
  }

  return {
    tactics: mgr.tactics,
    motivation: mgr.motivation,
    passingDefenseBonus: pd,
    moraleBonus: mb,
  };
}
