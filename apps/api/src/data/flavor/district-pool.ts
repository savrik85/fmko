/**
 * Generický helper pro okresově lokalizované flavor texty.
 *
 * `core` = funguje v každém okrese (bez místních jmen). Volitelné per-okres
 * top-upy se ke `core` PŘIDÁVAJÍ, nikdy ho nenahrazují. Neznámý / budoucí okres
 * (např. "České Budějovice") dostane jen `core` — NIKDY cizí (šumavský/pražský) flavor.
 *
 * Vzor převzat z data/districts/index.ts (injektovaný `pick`, aby fungoval
 * jak s Math.random-based pickRandom, tak se seeded Rng.pick).
 */
export interface DistrictPool<T> {
  core: T[];
  prachatice?: T[];
  praha?: T[];
  // Budoucí okresy: přidat pole zde, dispatch v districtPoolFor níže — žádný nový mechanismus.
}

/** Vrátí efektivní pole pro daný okres. Neznámý/undefined okres → jen core. */
export function districtPoolFor<T>(pool: DistrictPool<T>, district?: string): T[] {
  if (district === "Prachatice" && pool.prachatice?.length) return [...pool.core, ...pool.prachatice];
  if (district === "Praha" && pool.praha?.length) return [...pool.core, ...pool.praha];
  return pool.core;
}

/** Sloučí core + top-up daného okresu a vybere jeden přes dodaný pick. */
export function pickDistrictFlavor<T>(
  pool: DistrictPool<T>,
  district: string | undefined,
  pick: (arr: T[]) => T,
): T {
  return pick(districtPoolFor(pool, district));
}
