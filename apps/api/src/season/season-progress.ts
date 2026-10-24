/**
 * Stav konce sezóny v `season_end_progress` BEZ polykání chyb.
 *
 * Wrap fáze v end-season.ts mají vlastní shovívavé helpery: chyba čtení tam znamená
 * „ještě neběželo" a fáze se zopakuje. Rollover si to dovolit nemůže. Kdyby se chyba
 * čtení markeru vyložila jako „neproběhlo", pustil by se nevratný krok podruhé (stárnutí
 * dorostu, odečet sezóny ze sponzorských smluv). A kdyby se chyba zápisu spolkla, krok
 * by se tvářil hotový, i když se nic nezapsalo. Přesně to se stalo 21. 10. 2026: rollover
 * po stárnutí dorostu přestal zapisovat a admin dostal „hotovo".
 *
 * Proto tu chyba vždy propadne k volajícímu a krok skončí chybou, kterou admin uvidí.
 */

/** Marker celého rolloveru a jeho fází (sezóna = ta, která končí). */
export const ROLLOVER_KEY = "__global__";
/** Léto dorostu (sezóna = ta NOVÁ, stejně jako dřívější marker stárnutí `u21_aging`). */
export const U21_PROGRESS_KEY = "__u21__";
/** Komunální volby (sezóna = ta nová). */
export const VILLAGES_PROGRESS_KEY = "__villages__";

export interface ProgressKey {
  leagueId: string;
  seasonNumber: number;
  phase: string;
}

export interface ProgressRow {
  status: string;
  cursor: string | null;
}

export async function readProgress(db: D1Database, key: ProgressKey): Promise<ProgressRow | null> {
  return await db.prepare(
    "SELECT status, cursor FROM season_end_progress WHERE league_id = ? AND season_number = ? AND phase = ?",
  ).bind(key.leagueId, key.seasonNumber, key.phase).first<ProgressRow>();
}

/** Zápis stavu jako příkaz, ať jde přidat do dávky (D1 batch = transakce). */
export function progressStatement(
  db: D1Database, key: ProgressKey, status: string, cursor: string | null = null,
): D1PreparedStatement {
  return db.prepare(
    `INSERT INTO season_end_progress (league_id, season_number, phase, status, cursor, updated_at)
     VALUES (?, ?, ?, ?, ?, strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
     ON CONFLICT(league_id, season_number, phase)
     DO UPDATE SET status = excluded.status, cursor = excluded.cursor, updated_at = excluded.updated_at`,
  ).bind(key.leagueId, key.seasonNumber, key.phase, status, cursor);
}

export async function writeProgress(
  db: D1Database, key: ProgressKey, status: string, cursor: string | null = null,
): Promise<void> {
  await progressStatement(db, key, status, cursor).run();
}

/** Zapíše stav jen tam, kde ještě žádný není. Existující řádek nechá být. */
export async function insertProgressIfMissing(
  db: D1Database, key: ProgressKey, status: string, cursor: string | null = null,
): Promise<void> {
  await db.prepare(
    `INSERT INTO season_end_progress (league_id, season_number, phase, status, cursor, updated_at)
     VALUES (?, ?, ?, ?, ?, strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
     ON CONFLICT(league_id, season_number, phase) DO NOTHING`,
  ).bind(key.leagueId, key.seasonNumber, key.phase, status, cursor).run();
}

/** Kurzor dávkové fáze. Poškozený kurzor je chyba, ne prázdný seznam: prázdný by znamenal projet všechno znovu. */
export function parseCursor<T>(cursor: string | null | undefined, empty: T): T {
  if (!cursor) return empty;
  return { ...empty, ...(JSON.parse(cursor) as Partial<T>) };
}
