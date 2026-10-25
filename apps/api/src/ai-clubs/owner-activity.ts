/**
 * Aktivita vlastníků klubů: kdy je klub opuštěný a kdy ho smí přepsat nová registrace.
 *
 * Aktivita je reálný čas (ne herní): `users.last_activity_at` zapisuje /auth/me nejvýš
 * jednou za pět minut. Starší účty ho nemají vyplněný, pak platí poslední přihlášení
 * a nakonec založení účtu.
 *
 * Sloupec `last_activity_at` na produkci je (přidaný ručně v dubnu 2026), v migracích ale
 * chybí. Čistá databáze z migrací (lokální vývoj, DB testy) ho proto mít nemusí a dotaz
 * s ním by tam spadl. Proto se jednou na databázi ověří, jestli sloupec existuje.
 */

import { logger } from "../lib/logger";

const M = "owner-activity";

/** Po kolika dnech bez aktivity vlastníka převezme klub AI trenér. */
export const ABANDONED_AFTER_DAYS = 45;
/** Klub, který dřív patřil člověku, smí nová registrace přepsat až po tolika dnech jeho nečinnosti. */
export const OVERWRITE_PROTECTION_DAYS = 90;

const DAY_MS = 86_400_000;

const activityColumnCache = new WeakMap<D1Database, boolean>();

export async function hasLastActivityColumn(db: D1Database): Promise<boolean> {
  const cached = activityColumnCache.get(db);
  if (cached !== undefined) return cached;
  const found = await db.prepare("SELECT 1 AS x FROM pragma_table_info('users') WHERE name = 'last_activity_at'")
    .first<{ x: number }>()
    .then((r) => !!r)
    .catch((e) => {
      logger.warn({ module: M }, "ověření sloupce users.last_activity_at", e);
      return false;
    });
  activityColumnCache.set(db, found);
  return found;
}

/** SQL výraz poslední aktivity účtu `alias` (tabulka users). */
export async function lastActivitySql(db: D1Database, alias: string): Promise<string> {
  return (await hasLastActivityColumn(db))
    ? `COALESCE(${alias}.last_activity_at, ${alias}.last_login_at, ${alias}.created_at)`
    : `COALESCE(${alias}.last_login_at, ${alias}.created_at)`;
}

/** ISO okamžik `days` dní před `now` (reálný čas). */
export function daysBefore(now: Date, days: number): string {
  return new Date(now.getTime() - days * DAY_MS).toISOString();
}

/**
 * Podmínka na AI tým (alias `team`), který smí přepsat nová registrace: původní AI klub,
 * nebo převzatý lidský klub, jehož bývalý vlastník je neaktivní aspoň 90 dní (případně
 * jeho účet už neexistuje). Jinak se vlastník může ke klubu vrátit.
 * Vrací SQL s jedním parametrem (`?`) a jeho hodnotu.
 */
export async function overwritableAiTeamSql(db: D1Database, team: string, now: Date): Promise<{ sql: string; bind: string }> {
  const activity = await lastActivitySql(db, "former_owner");
  return {
    sql: `${team}.user_id = 'ai' AND (${team}.ai_former_user_id IS NULL OR NOT EXISTS (
            SELECT 1 FROM users former_owner
             WHERE former_owner.id = ${team}.ai_former_user_id
               AND julianday(${activity}) > julianday(?)))`,
    bind: daysBefore(now, OVERWRITE_PROTECTION_DAYS),
  };
}
