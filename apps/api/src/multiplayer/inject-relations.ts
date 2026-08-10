/**
 * Přiřazení vztahů hráčům před simulací zápasu.
 *
 * Sdílené mezi ligou, pohárem a přátelákem — dřív to uměl jen ligový match-runner,
 * takže v poháru a v příprávě vztahy neexistovaly vůbec (žádné asistence mezi bratry,
 * žádné fauly rivalů, nulová chemie kabiny).
 *
 * Vazby se přiřazují i náhradníkům. Engine si při každém použití ověří, že je protějšek
 * na hřišti, takže vazba na hráče na lavičce ožije až po jeho střídání.
 */

import { logger } from "../lib/logger";

const M = "inject-relations";

interface HasRelations {
  id: number;
  relationshipsInLineup?: Array<{ withId: number; type: string; strength?: number }>;
}

/**
 * Načte vztahy pro zadané soupisky a přiřadí je hráčům.
 * `players` má obsahovat sestavu I lavičku; `idMap` mapuje engine ID → DB ID.
 */
export async function injectRelationships(
  db: D1Database,
  squads: Array<{ players: HasRelations[]; idMap: Map<number, string> }>,
): Promise<void> {
  for (const { players, idMap } of squads) {
    try {
      const dbIds = players.map((p) => idMap.get(p.id)).filter((v): v is string => !!v);
      if (dbIds.length < 2) continue;

      const ph = dbIds.map(() => "?").join(",");
      const rows = await db.prepare(
        `SELECT player_a_id, player_b_id, type, strength FROM relationships
          WHERE player_a_id IN (${ph}) OR player_b_id IN (${ph})`,
      ).bind(...dbIds, ...dbIds).all<{ player_a_id: string; player_b_id: string; type: string; strength: number | null }>()
        .catch((e) => { logger.warn({ module: M }, "relationships query", e); return { results: [] as never[] }; });
      if (rows.results.length === 0) continue;

      const dbToEngine = new Map<string, number>();
      for (const [engineId, dbId] of idMap) dbToEngine.set(dbId, engineId);

      for (const p of players) {
        const pDbId = idMap.get(p.id);
        if (!pDbId) continue;
        const rels: Array<{ withId: number; type: string; strength: number }> = [];
        for (const r of rows.results) {
          const otherDbId = r.player_a_id === pDbId ? r.player_b_id
            : r.player_b_id === pDbId ? r.player_a_id : null;
          if (!otherDbId) continue;
          const otherEngineId = dbToEngine.get(otherDbId);
          if (otherEngineId != null && players.some((op) => op.id === otherEngineId)) {
            rels.push({ withId: otherEngineId, type: r.type, strength: r.strength ?? 50 });
          }
        }
        if (rels.length > 0) p.relationshipsInLineup = rels;
      }
    } catch (e) {
      logger.warn({ module: M }, "inject failed", e);
    }
  }
}
