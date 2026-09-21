import { motivationMoraleBonus, tacticsMatchBonus } from "@okresni-masina/shared";
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
  /** ±přihrávky a obrana všem hráčům (slabý taktik ubírá) */
  passingDefenseBonus: number;
  /** +morálka všem hráčům */
  moraleBonus: number;
}

/**
 * Taktika: 10 = −2, 40 = 0, 60 = +1, 99 = +4. Plynule — dřív to byl schod od 60,
 * takže trenéři 10 až 59 se v zápase nelišili vůbec. Vzorec je sdílený s profilem.
 */
export function tacticsBonus(tactics: number): number {
  return tacticsMatchBonus(tactics);
}

/** Motivace: 40 = +1, 60 = +3, 80 = +5, 99 = +6 morálky. */
export function moraleBonus(motivation: number): number {
  return motivationMoraleBonus(motivation);
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
      if (pd !== 0) {
        p.passing = Math.max(1, Math.min(100, p.passing + pd));
        p.defense = Math.max(1, Math.min(100, p.defense + pd));
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
