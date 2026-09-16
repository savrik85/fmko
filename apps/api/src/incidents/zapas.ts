/**
 * Incidenty v zápase (spec 17c). Úpravy sestavy v paměti před simulací,
 * vedle bonusu trenéra (`season/manager-match-bonus.ts`).
 */

import { logger } from "../lib/logger";
import { nactiDruhyHracu } from "./absence-hracu";

const M = "incidents-zapas";

export interface HracVZapase {
  id: number;
  morale: number;
  consistency: number;
}

export interface IncidentVZapase {
  obvinenych: number;
  pachatelVSestave: boolean;
}

const OBVINENY_MORALKA = -8;
const OBVINENY_KONZISTENCE = -10;
const PACHATEL_TYM_MORALKA = -2;

/** `skupiny[0]` je základní sestava, další skupiny lavička. Mění hráče na místě. */
export function upravSestavuZIncidentu(
  skupiny: HracVZapase[][],
  idMap: ReadonlyMap<number, string>,
  druhy: ReadonlyMap<string, readonly string[]>,
): IncidentVZapase {
  const druhyHrace = (h: HracVZapase) => druhy.get(idMap.get(h.id) ?? "") ?? [];
  let obvinenych = 0;
  for (const skupina of skupiny) {
    for (const h of skupina) {
      if (!druhyHrace(h).includes("obvineny")) continue;
      h.morale = Math.max(0, h.morale + OBVINENY_MORALKA);
      h.consistency = Math.max(0, h.consistency + OBVINENY_KONZISTENCE);
      obvinenych++;
    }
  }
  const pachatelVSestave = (skupiny[0] ?? []).some((h) => druhyHrace(h).includes("pachatel"));
  if (pachatelVSestave) {
    for (const skupina of skupiny) {
      for (const h of skupina) h.morale = Math.max(0, h.morale + PACHATEL_TYM_MORALKA);
    }
  }
  return { obvinenych, pachatelVSestave };
}

export async function applyIncidentMatchMods(
  db: D1Database,
  teamId: string,
  skupiny: HracVZapase[][],
  idMap: ReadonlyMap<number, string>,
): Promise<IncidentVZapase | null> {
  const tym = await db.prepare("SELECT game_date FROM teams WHERE id = ?").bind(teamId).first<{ game_date: string | null }>()
    .catch((e) => { logger.warn({ module: M }, `herní datum pro zápas ${teamId}`, e); return null; });
  if (!tym?.game_date) return null;
  const druhy = await nactiDruhyHracu(db, teamId, tym.game_date);
  if (druhy.size === 0) return null;
  return upravSestavuZIncidentu(skupiny, idMap, druhy);
}
