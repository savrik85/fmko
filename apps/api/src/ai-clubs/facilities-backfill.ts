/**
 * Doplnění řádků stadionu a vybavení všem klubům v ligách.
 *
 * Řádky vznikaly až při prvním otevření stránky, takže na produkci k 25. 10. 2026 chyběl
 * stadion 33 klubům a vybavení 46 (AI kluby, U21 a lidské kluby, jejichž stránku nikdo
 * neotevřel). Bez stadionu počítá zápas s kapacitou 200 a údržba trávníku klub přeskočí.
 * Idempotentní: založí jen chybějící řádky.
 */

import { ensureEquipmentRow } from "../equipment/equipment-service";
import { logger } from "../lib/logger";
import { ensureStadiumRow } from "../stadium/stadium-service";

export interface FacilitiesBackfillResult {
  stadiumsMissing: number;
  equipmentMissing: number;
  stadiumsCreated: number;
  equipmentCreated: number;
}

export async function backfillClubFacilities(db: D1Database, dryRun: boolean): Promise<FacilitiesBackfillResult> {
  const noStadium = await db.prepare(
    "SELECT t.id FROM teams t WHERE t.league_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM stadiums s WHERE s.team_id = t.id)",
  ).all<{ id: string }>()
    .catch((e) => { logger.warn({ module: "facilities-backfill" }, "kluby bez stadionu", e); return { results: [] as { id: string }[] }; });
  const noEquipment = await db.prepare(
    "SELECT t.id FROM teams t WHERE t.league_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM equipment e WHERE e.team_id = t.id)",
  ).all<{ id: string }>()
    .catch((e) => { logger.warn({ module: "facilities-backfill" }, "kluby bez vybavení", e); return { results: [] as { id: string }[] }; });

  const result: FacilitiesBackfillResult = {
    stadiumsMissing: noStadium.results.length,
    equipmentMissing: noEquipment.results.length,
    stadiumsCreated: 0,
    equipmentCreated: 0,
  };
  if (dryRun) return result;

  for (const t of noStadium.results) {
    if (await ensureStadiumRow(db, t.id)) result.stadiumsCreated++;
  }
  for (const t of noEquipment.results) {
    if (await ensureEquipmentRow(db, t.id)) result.equipmentCreated++;
  }
  return result;
}
