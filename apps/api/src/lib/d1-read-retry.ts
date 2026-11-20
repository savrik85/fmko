/**
 * Opakování čtení z D1 při krátkém výpadku.
 *
 * D1 občas na pár vteřin vrací na všechno „D1_ERROR: internal error“, i když u nás žádný
 * těžký dotaz neběží (17. 11. 2026 ve 20:01, 19. 11. v 17:04 a 19:16, 20. 11. dvacet
 * vteřin ve 13:14 UTC). Hráčům v tu chvíli padaly obrazovky a zprávy v Telefonu.
 *
 * Obal databáze proto čtení (SELECT) při přechodné chybě (transient-db-error.ts) zkusí
 * ještě dvakrát, po 0,3 a 1,5 s. Zápisy se neopakují: po výpadku nejde poznat, jestli
 * se provedly, a druhý pokus by mohl zapsat totéž dvakrát. `batch` se taky neopakuje,
 * obvykle zapisuje.
 *
 * Obal dostává každý vstup Workeru (fetch, cron, fronta) v index.ts, takže platí všude,
 * kde se pracuje s `env.DB`.
 */

import { logger } from "./logger";
import { isTransientDbError } from "./transient-db-error";

/** Prodlevy před dalšími pokusy. Krátké výpadky trvaly do vteřiny, ten delší 20 s nezachrání nic. */
export const READ_RETRY_DELAYS_MS = [300, 1500];

const WRITE_KEYWORDS = /\b(INSERT|UPDATE|DELETE|REPLACE|UPSERT|CREATE|DROP|ALTER|VACUUM|REINDEX|ATTACH|DETACH)\b/i;

/** Jen čtení: SELECT (i s WITH) bez jediného zapisovacího slova. Při pochybnosti ne. */
export function isReadOnlySql(sql: string): boolean {
  const body = sql.replace(/--[^\n]*/g, " ").replace(/\/\*[\s\S]*?\*\//g, " ").trim();
  if (!/^(SELECT|WITH)\b/i.test(body)) return false;
  return !WRITE_KEYWORDS.test(body);
}

const wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

async function withRetry<T>(sql: string, run: () => Promise<T>, delays: number[]): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await run();
    } catch (e) {
      if (attempt >= delays.length || !isTransientDbError(e)) throw e;
      logger.warn({ module: "d1-retry" }, `čtení selhalo na výpadku D1, zkouším znovu (${attempt + 1}/${delays.length}): ${sql.replace(/\s+/g, " ").slice(0, 100)}`, e);
      await wait(delays[attempt]);
    }
  }
}

/** Původní příkaz D1 za obalem, pro `batch` (ten bere jen skutečné příkazy D1). */
const originals = new WeakMap<object, D1PreparedStatement>();

function wrapStatement(stmt: D1PreparedStatement, sql: string, delays: number[]): D1PreparedStatement {
  const retry = isReadOnlySql(sql);
  const guarded = <T>(run: () => Promise<T>) => (retry ? withRetry(sql, run, delays) : run());
  const wrapper = {
    bind: (...values: unknown[]) => wrapStatement(stmt.bind(...values), sql, delays),
    first: (column?: string) => guarded(() => (column === undefined ? stmt.first() : stmt.first(column))),
    all: () => guarded(() => stmt.all()),
    raw: (options?: { columnNames?: boolean }) => guarded(() => stmt.raw(options as { columnNames: true })),
    run: () => guarded(() => stmt.run()),
  };
  originals.set(wrapper, stmt);
  return wrapper as unknown as D1PreparedStatement;
}

function unwrap(stmt: D1PreparedStatement): D1PreparedStatement {
  return originals.get(stmt as object) ?? stmt;
}

/** Obal databáze s opakováním čtení. Ostatní metody (exec, dump…) jdou beze změny. */
export function withReadRetry(db: D1Database, delays: number[] = READ_RETRY_DELAYS_MS): D1Database {
  return new Proxy(db, {
    get(target, prop) {
      if (prop === "prepare") return (sql: string) => wrapStatement(target.prepare(sql), sql, delays);
      if (prop === "batch") {
        return <T>(statements: D1PreparedStatement[]) => target.batch<T>(statements.map(unwrap));
      }
      const value = Reflect.get(target, prop, target);
      return typeof value === "function" ? value.bind(target) : value;
    },
  });
}

/**
 * Jeden obal na jednu databázi: kód má cache podle objektu databáze (owner-activity.ts)
 * a nový obal při každém požadavku by ji obcházel.
 */
const wrappedDbs = new WeakMap<D1Database, D1Database>();

/** Prostředí Workeru s obalenou databází. Bez DB vrací prostředí beze změny. */
export function withDbReadRetry<E extends { DB?: D1Database }>(env: E): E {
  if (!env.DB) return env;
  let wrapped = wrappedDbs.get(env.DB);
  if (!wrapped) {
    wrapped = withReadRetry(env.DB);
    wrappedDbs.set(env.DB, wrapped);
  }
  return { ...env, DB: wrapped };
}
