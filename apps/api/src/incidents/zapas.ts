/**
 * Incidenty v zápase (spec 17c). Úpravy sestavy v paměti před simulací,
 * vedle bonusu trenéra (`season/manager-match-bonus.ts`).
 */

import { logger } from "../lib/logger";
import { nactiDruhyHracu } from "./absence-hracu";
import { ZAPAS_NAROZENI_MORALKA, ZAPAS_ROZVOD_KONZISTENCE, ZAPAS_ROZVOD_MORALKA } from "./nastaveni";

const M = "incidents-zapas";

export interface HracVZapase {
  id: number;
  morale: number;
  consistency: number;
}

export interface IncidentVZapase {
  obvinenych: number;
  pachatelVSestave: boolean;
  /**
   * Engine player id → skutečně uplatněná změna morálky (záporná, po podlaze na 0). Slouží
   * jen k tomu, aby volající uměl po zápase odečíst tenhle dočasný handicap zpátky předtím,
   * než se výsledná morálka zapíše do `players.life_context` (spec 17c: modifikátory platí
   * jen pro tenhle zápas, nesmí se propsat trvale).
   */
  moraleDelta: Map<number, number>;
}

const OBVINENY_MORALKA = -8;
const OBVINENY_KONZISTENCE = -10;
const PACHATEL_TYM_MORALKA = -2;

const SITUACE_MORALKA: Record<string, number> = { rozvod: ZAPAS_ROZVOD_MORALKA, narozeni_ditete: ZAPAS_NAROZENI_MORALKA };
const SITUACE_KONZISTENCE: Record<string, number> = { rozvod: ZAPAS_ROZVOD_KONZISTENCE };

/** `skupiny[0]` je základní sestava, další skupiny lavička. Mění hráče na místě. */
export function upravSestavuZIncidentu(
  skupiny: HracVZapase[][],
  idMap: ReadonlyMap<number, string>,
  druhy: ReadonlyMap<string, readonly string[]>,
): IncidentVZapase {
  const druhyHrace = (h: HracVZapase) => druhy.get(idMap.get(h.id) ?? "") ?? [];
  let obvinenych = 0;
  const moraleDelta = new Map<number, number>();
  const pridejDeltu = (h: HracVZapase, puvodni: number) => moraleDelta.set(h.id, (moraleDelta.get(h.id) ?? 0) + (h.morale - puvodni));
  for (const skupina of skupiny) {
    for (const h of skupina) {
      if (!druhyHrace(h).includes("obvineny")) continue;
      const puvodni = h.morale;
      h.morale = Math.max(0, h.morale + OBVINENY_MORALKA);
      pridejDeltu(h, puvodni);
      h.consistency = Math.max(0, h.consistency + OBVINENY_KONZISTENCE);
      obvinenych++;
    }
    for (const h of skupina) {
      for (const kind of druhyHrace(h)) {
        const moralka = SITUACE_MORALKA[kind];
        if (moralka) {
          const puvodni = h.morale;
          h.morale = Math.max(0, Math.min(100, h.morale + moralka));
          // Po zápase se odečítá jen postih; radost z narození dítěte si hráč nechá.
          if (moralka < 0) pridejDeltu(h, puvodni);
        }
        const konzistence = SITUACE_KONZISTENCE[kind];
        if (konzistence) h.consistency = Math.max(0, h.consistency + konzistence);
      }
    }
  }
  const pachatelVSestave = (skupiny[0] ?? []).some((h) => druhyHrace(h).includes("pachatel"));
  if (pachatelVSestave) {
    for (const skupina of skupiny) {
      for (const h of skupina) {
        const puvodni = h.morale;
        h.morale = Math.max(0, h.morale + PACHATEL_TYM_MORALKA);
        pridejDeltu(h, puvodni);
      }
    }
  }
  return { obvinenych, pachatelVSestave, moraleDelta };
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
