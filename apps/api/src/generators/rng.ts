/**
 * Seedable pseudo-random number generator (mulberry32).
 * Allows deterministic player generation from a seed.
 */
export function createRng(seed: number) {
  let s = seed | 0;

  function next(): number {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  return {
    /** Returns float in [0, 1) */
    random: next,

    /** Returns integer in [min, max] inclusive */
    int(min: number, max: number): number {
      return Math.floor(next() * (max - min + 1)) + min;
    },

    /** Pick one item from array */
    pick<T>(arr: T[]): T {
      return arr[Math.floor(next() * arr.length)];
    },

    /** Pick from weighted map { key: weight } — klíče s weight <= 0 se nikdy nevyberou */
    weighted(weights: Record<string, number>): string {
      const entries = Object.entries(weights).filter(([, w]) => w > 0);
      if (entries.length === 0) {
        // Všechny váhy 0 — fallback na první klíč (volající musí zajistit ≥1 nenulovou)
        const all = Object.entries(weights);
        return all.length > 0 ? all[0][0] : "";
      }
      const total = entries.reduce((sum, [, w]) => sum + w, 0);
      let r = next() * total;
      for (const [key, weight] of entries) {
        r -= weight;
        if (r <= 0) return key;
      }
      return entries[entries.length - 1][0];
    },

    /** Shuffle array in place */
    shuffle<T>(arr: T[]): T[] {
      for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(next() * (i + 1));
        [arr[i], arr[j]] = [arr[j], arr[i]];
      }
      return arr;
    },
  };
}

export type Rng = ReturnType<typeof createRng>;

/**
 * Returns a cryptographically random 32-bit seed for createRng.
 * Use instead of Date.now() to prevent predictable RNG sequences.
 */
export function cryptoSeed(): number {
  const buf = new Uint32Array(1);
  crypto.getRandomValues(buf);
  return buf[0];
}
