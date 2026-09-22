/**
 * Rozpočet sponzora B (měsíčně) — ze stejných veličin jako dřívější nabídky, ale z horní
 * hranice sponzora, takže nová smlouva typicky vychází nad dnešními náhodnými.
 */
export function villageSizeMod(size: string): number {
  return size === "mesto" ? 1.3 : size === "mestys" ? 1.1 : size === "obec" ? 1.0 : 0.8;
}

export function sponsorBudgetB(i: {
  monthlyMax: number; reputation: number; villageSize: string; category: "main" | "stadium"; favor: number;
}): number {
  const categoryMult = i.category === "main" ? 3 : 1.5;
  const favorMod = 0.8 + 0.4 * i.favor / 100;
  return Math.round(i.monthlyMax * (i.reputation / 50) * villageSizeMod(i.villageSize) * categoryMult * favorMod);
}

/** Co klub vidí: rozmezí, které se s náklonností zužuje z ±30 % na ±5 %. */
export function budgetEstimateRange(b: number, favor: number): { low: number; high: number } {
  const width = 0.30 - 0.25 * Math.max(0, Math.min(100, favor)) / 100;
  return { low: Math.round(b * (1 - width)), high: Math.round(b * (1 + width)) };
}
