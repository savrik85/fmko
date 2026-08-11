/**
 * Exekutoři standardek — překlad týmových rolí z DB na engine ID.
 *
 * Role jsou týmové (tabulka `teams`), ne per-sestava jako kapitán, takže platí
 * pro ligu, pohár i přátelák. Když hráč zrovna nehraje, vrátí se undefined
 * a engine si vybere nejlepší setPieces v aktuální sestavě sám.
 */

import { logger } from "../lib/logger";

/** Najde engine ID k DB ID hráče. Vrací undefined, když hráč není v zápase. */
export function toEngineId(idMap: Map<number, string>, dbId: string | null | undefined): number | undefined {
  if (!dbId) return undefined;
  for (const [engineId, v] of idMap) {
    if (v === dbId) return engineId;
  }
  return undefined;
}

export interface SetPieceTakers {
  penaltyTakerId?: number;
  freekickTakerId?: number;
}

/** Načte exekutory penalt a přímých kopů daného týmu. */
export async function loadSetPieceTakers(
  db: D1Database,
  teamId: string | null | undefined,
  idMap: Map<number, string>,
): Promise<SetPieceTakers> {
  if (!teamId) return {};

  const row = await db.prepare(
    "SELECT penalty_taker_id, freekick_taker_id FROM teams WHERE id = ?"
  ).bind(teamId).first<{ penalty_taker_id: string | null; freekick_taker_id: string | null }>()
    .catch((e) => {
      logger.warn({ module: "set-piece-takers" }, "load takers", e);
      return null;
    });

  if (!row) return {};
  return {
    penaltyTakerId: toEngineId(idMap, row.penalty_taker_id),
    freekickTakerId: toEngineId(idMap, row.freekick_taker_id),
  };
}
