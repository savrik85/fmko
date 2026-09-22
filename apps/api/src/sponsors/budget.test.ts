/**
 * Rozpočet sponzora B a odhad, který klub vidí (čisté funkce).
 */
import { describe, it, expect } from "vitest";
import { budgetEstimateRange, sponsorBudgetB } from "./budget";

describe("sponsorBudgetB", () => {
  it("hlavní sponzor, reputace 50, obec, neutrální náklonnost 50 = max × 3", () => {
    expect(sponsorBudgetB({ monthlyMax: 1000, reputation: 50, villageSize: "obec", category: "main", favor: 50 })).toBe(3000);
  });

  it("stadion je poloviční než hlavní", () => {
    const main = sponsorBudgetB({ monthlyMax: 4000, reputation: 80, villageSize: "mesto", category: "main", favor: 60 });
    const stadium = sponsorBudgetB({ monthlyMax: 4000, reputation: 80, villageSize: "mesto", category: "stadium", favor: 60 });
    expect(stadium).toBe(Math.round(main / 2));
  });

  it("náklonnost 0 → ×0,8, náklonnost 100 → ×1,2", () => {
    const base = { monthlyMax: 1000, reputation: 50, villageSize: "obec", category: "main" as const };
    expect(sponsorBudgetB({ ...base, favor: 0 })).toBe(2400);
    expect(sponsorBudgetB({ ...base, favor: 100 })).toBe(3600);
  });
});

describe("budgetEstimateRange", () => {
  it("nízká náklonnost = široké rozmezí ±30 %", () => {
    expect(budgetEstimateRange(10000, 0)).toEqual({ low: 7000, high: 13000 });
  });
  it("vysoká náklonnost = úzké rozmezí ±5 %", () => {
    expect(budgetEstimateRange(10000, 100)).toEqual({ low: 9500, high: 10500 });
  });
});
