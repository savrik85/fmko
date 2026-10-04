/**
 * Přístavby tribun v databázi: načtení, atomická stavba a přepočet kapacity.
 *
 * Stavba se zamyká stejně jako stavba zařízení: nová přístavba podmíněným INSERTem
 * (druhý pokus do stejného místa neprojde), vylepšení podmíněným UPDATEm na očekávanou
 * úroveň a druh. Kdo zámek prohraje, nezapíše nic a volající nesmí strhnout peníze.
 */
import { extensionsCapacity } from "./extension-catalog";

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
  await refreshExtensionCapacity(db, teamId);
  return true;
}
