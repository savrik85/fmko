/**
 * Přístavby tribun v databázi: načtení, atomická stavba a přepočet kapacity.
 *
 * Stavba se zamyká stejně jako stavba zařízení: nová přístavba podmíněným INSERTem
 * (druhý pokus do stejného místa neprojde), vylepšení podmíněným UPDATEm na očekávanou
 * úroveň a druh. Kdo zámek prohraje, nezapíše nic a volající nesmí strhnout peníze.
 */
import { cornerConflict, extensionsCapacity, type ExtKind, type ExtSlot } from "./extension-catalog";
import { logger } from "../lib/logger";

export interface ExtensionRow {
  slot: string;
  kind: string;
  level: number;
}

export async function loadExtensions(db: D1Database, teamId: string): Promise<ExtensionRow[]> {
  const res = await db
    .prepare("SELECT slot, kind, level FROM stadium_extensions WHERE team_id = ? ORDER BY slot")
    .bind(teamId)
    .all<ExtensionRow>();
  return res.results;
}

/** Přepočítá `stadiums.stand_ext_capacity` ze všech postavených přístaveb. */
export async function refreshExtensionCapacity(db: D1Database, teamId: string): Promise<number> {
  const capacity = extensionsCapacity(await loadExtensions(db, teamId));
  await db.prepare("UPDATE stadiums SET stand_ext_capacity = ? WHERE team_id = ?").bind(capacity, teamId).run();
  return capacity;
}

/**
 * Postaví přístavbu (`currentLevel` 0) nebo ji vylepší o úroveň.
 * Vrací, zda zámek sedl. `slot` a `kind` musí volající ověřit proti katalogu.
 */
export async function buildExtension(
  db: D1Database,
  teamId: string,
  slot: string,
  kind: string,
  currentLevel: number,
): Promise<boolean> {
  const res = currentLevel === 0
    ? await db
      .prepare("INSERT OR IGNORE INTO stadium_extensions (team_id, slot, kind, level) VALUES (?, ?, ?, 1)")
      .bind(teamId, slot, kind)
      .run()
    : await db
      .prepare("UPDATE stadium_extensions SET level = ? WHERE team_id = ? AND slot = ? AND kind = ? AND level = ?")
      .bind(currentLevel + 1, teamId, slot, kind, currentLevel)
      .run();
  if ((res.meta?.changes ?? 0) < 1) return false;
  if (currentLevel === 0 && !(await keepIfCompatible(db, teamId, slot, kind))) return false;
  await refreshCapacitySafely(db, teamId);
  return true;
}

/**
 * Vylučování se ověřuje ve volající trase před zápisem, souběžný požadavek ho ale může obejít.
 * Proto se po zápisu zkontroluje znovu a kolidující přístavba se vrátí zpět.
 */
async function keepIfCompatible(db: D1Database, teamId: string, slot: string, kind: string): Promise<boolean> {
  const others = (await loadExtensions(db, teamId)).filter((r) => r.slot !== slot);
  if (!cornerConflict(kind as ExtKind, slot as ExtSlot, others)) return true;
  await db.prepare("DELETE FROM stadium_extensions WHERE team_id = ? AND slot = ? AND kind = ? AND level = 1").bind(teamId, slot, kind).run();
  return false;
}

/** Stavba už platí; selhání přepočtu kapacity ji nesmí zrušit ani zabránit strhnutí peněz. */
async function refreshCapacitySafely(db: D1Database, teamId: string): Promise<void> {
  try {
    await refreshExtensionCapacity(db, teamId);
  } catch (e) {
    logger.error({ module: "stadium", teamId }, "přepočet kapacity přístaveb selhal", e);
  }
}

/**
 * Nahradí mobilní tribunku v místě jinou přístavbou na úrovni 1. Atomicky: UPDATE sedne jen když
 * v místě pořád stojí mobilní tribunka dané úrovně, takže dvojí odeslání nebo souběžná stavba
 * neprojde. Kdo zámek prohraje, nezapíše nic a volající nesmí strhnout peníze.
 */
export async function replaceMobileExtension(
  db: D1Database,
  teamId: string,
  slot: string,
  newKind: string,
  currentLevel: number,
): Promise<boolean> {
  const res = await db
    .prepare("UPDATE stadium_extensions SET kind = ?, level = 1 WHERE team_id = ? AND slot = ? AND kind = 'mobile' AND level = ?")
    .bind(newKind, teamId, slot, currentLevel)
    .run();
  if ((res.meta?.changes ?? 0) < 1) return false;
  await refreshCapacitySafely(db, teamId);
  return true;
}
