/**
 * DB helpers s logováním — nahrazuje tiché .catch(() => {}).
 */

import { logger, type LogContext } from "./logger";

/**
 * Kritická DB operace — loguje a RE-THROWS chybu.
 * Použít pro operace kde selhání znamená chybu celého requestu.
 */
export async function dbRun(
  stmt: D1PreparedStatement,
  ctx: LogContext,
  label: string,
): Promise<D1Result> {
  try {
    return await stmt.run();
  } catch (e) {
    logger.error(ctx, `DB [${label}] failed`, e);
    throw e;
  }
}

/**
 * Nekritická DB operace — loguje ale POKRAČUJE.
 * Použít pro stats updates, news inserts, training log atd.
 */
export async function dbRunSafe(
  stmt: D1PreparedStatement,
  ctx: LogContext,
  label: string,
): Promise<D1Result | null> {
  try {
    return await stmt.run();
  } catch (e) {
    logger.warn(ctx, `DB [${label}] failed (non-critical)`, e);
    return null;
  }
}

/**
 * Query s logováním — vrací null při chybě místo tichého spolknutí.
 */
export async function dbFirst<T>(
  stmt: D1PreparedStatement,
  ctx: LogContext,
  label: string,
): Promise<T | null> {
  try {
    return await stmt.first<T>();
  } catch (e) {
    logger.warn(ctx, `DB query [${label}] failed`, e);
    return null;
  }
}

/**
 * Query all s logováním.
 */
export async function dbAll(
  stmt: D1PreparedStatement,
  ctx: LogContext,
  label: string,
): Promise<D1Result> {
  try {
    return await stmt.all();
  } catch (e) {
    logger.warn(ctx, `DB query [${label}] failed`, e);
    return { results: [], success: false, meta: { duration: 0 } } as any;
  }
}
