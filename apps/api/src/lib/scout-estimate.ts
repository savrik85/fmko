/**
 * Přesnost odhadu podle skauta a stabilní posun odhadu. Sdílí to výhled vlastních hráčů
 * (routes/development.ts) i hlášení skauta o cizích hráčích (scouting/fog.ts), aby skaut
 * odhadoval všude stejně přesně.
 */

/**
 * Jak přesně klub odhaduje strop. Bez skauta ±18 bodů (prakticky "nevíme"),
 * špičkový skaut ±4 (skoro jistota). `scoutQuality` 0–1 = efektivita skauta / 20.
 */
export function estimateSpread(scoutQuality: number): number {
  return Math.round(18 - Math.max(0, Math.min(1, scoutQuality)) * 14);
}

/**
 * Stabilní pseudonáhoda z textu (−1…1) — aby se odhad neměnil při každém načtení stránky.
 * Manažer nesmí odhad "vyrolovat" opakovaným refreshem.
 */
export function stableOffset(seed: string): number {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return ((h >>> 0) / 4294967296) * 2 - 1;
}

/** Stabilní celé číslo ze stejného textu, jako seed pro `createRng`. */
export function stableSeed(seed: string): number {
  return Math.floor(((stableOffset(seed) + 1) / 2) * 2_147_483_646) + 1;
}
