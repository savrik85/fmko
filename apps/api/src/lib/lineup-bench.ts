/**
 * Lavička, kterou si manažer sestaví sám (sloupec `bench_data` v lineups a lineup_presets).
 *
 * Uložené je pole id hráčů. `null` znamená, že manažer lavičku nesestavoval a náhradníky
 * vybere automat podle ratingu. Engine ji čte v `buildMatchPlayers` (multiplayer/match-runner.ts).
 */

import { logger } from "./logger";

/** Nejvýš sedm náhradníků v zápise o utkání, jako v okresních soutěžích. */
export const MAX_BENCH = 7;

export type BenchValidation =
  | { ok: true; bench: string[] | null }
  | { ok: false; error: string };

interface BenchContextIds {
  /** Hráči základní jedenáctky — na lavičce být nesmí. */
  starterIds: Set<string>;
  /** Celý aktivní kádr — náhradník musí být z něj. */
  squadIds: Set<string>;
}

/**
 * Zkontroluje lavičku z těla requestu. `undefined` i `null` znamenají „nechat na automatu",
 * starší verze webu lavičku neposílají.
 */
export function validateBench(raw: unknown, ctx: BenchContextIds): BenchValidation {
  if (raw === undefined || raw === null) return { ok: true, bench: null };
  if (!Array.isArray(raw) || raw.some((id) => typeof id !== "string")) {
    return { ok: false, error: "Lavička musí být seznam hráčů" };
  }
  const ids = raw as string[];
  if (new Set(ids).size !== ids.length) return { ok: false, error: "Na lavičce je někdo dvakrát" };
  if (ids.length > MAX_BENCH) return { ok: false, error: `Na lavičku může jet nejvýš ${MAX_BENCH} hráčů` };
  if (ids.some((id) => ctx.starterIds.has(id))) {
    return { ok: false, error: "Hráč ze základní sestavy nemůže být zároveň na lavičce" };
  }
  if (ids.some((id) => !ctx.squadIds.has(id))) {
    return { ok: false, error: "Na lavičce je hráč, který nepatří do kádru" };
  }
  return { ok: true, bench: ids };
}

/** Přečte uložený sloupec. Poškozená hodnota se chová jako „nechat na automatu". */
export function parseStoredBench(rawColumn: string | null | undefined): string[] | null {
  if (!rawColumn) return null;
  try {
    const parsed: unknown = JSON.parse(rawColumn);
    if (Array.isArray(parsed) && parsed.every((id) => typeof id === "string")) return parsed as string[];
    logger.warn({ module: "lineup-bench" }, "bench_data není pole id hráčů, použije se automat");
  } catch (e) {
    logger.warn({ module: "lineup-bench" }, "bench_data nejde přečíst, použije se automat", e);
  }
  return null;
}

/** Uložitelná hodnota sloupce — `null` zůstane NULL, ne řetězec "null". */
export function benchColumn(bench: string[] | null): string | null {
  return bench ? JSON.stringify(bench) : null;
}
