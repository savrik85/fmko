import { describe, expect, it } from "vitest";
import { generateAiProfile } from "./profile";
import { AI_TO_AI_CHANCE, marketDayChance, marketHour } from "./transfer-market";
import { monthlyDealLimit, openDealLimit } from "./valuation";
import { pragueDay, pragueHour, parseDbTime } from "./transfer-club";

describe("rozvrh AI klubu na trhu", () => {
  it("každý klub se na trh dívá v jinou hodinu mezi 9 a 19 a vždy ve stejnou", () => {
    const hours = new Set<number>();
    for (let i = 0; i < 200; i++) {
      const h = marketHour(`team-${i}`);
      expect(h).toBeGreaterThanOrEqual(9);
      expect(h).toBeLessThanOrEqual(19);
      expect(marketHour(`team-${i}`)).toBe(h);
      hours.add(h);
    }
    // Kluby se rozprostřou přes den, nechodí všechny naráz.
    expect(hours.size).toBeGreaterThanOrEqual(8);
  });

  it("obchodník chodí na trh častěji a smí uzavřít víc obchodů", () => {
    const calm = { ...generateAiProfile("calm", null), trading: 10 };
    const trader = { ...generateAiProfile("trader", null), trading: 90 };
    expect(marketDayChance(trader)).toBeGreaterThan(marketDayChance(calm));
    expect(marketDayChance(calm)).toBeGreaterThanOrEqual(0.25);
    expect(marketDayChance(trader)).toBeLessThanOrEqual(0.75);
    expect(monthlyDealLimit(trader)).toBeGreaterThan(monthlyDealLimit(calm));
    expect(openDealLimit(trader)).toBeGreaterThan(openDealLimit(calm));
    expect(monthlyDealLimit(calm)).toBeGreaterThanOrEqual(1);
  });

  it("obchody mezi AI kluby jsou vzácné", () => {
    expect(AI_TO_AI_CHANCE).toBeGreaterThan(0);
    expect(AI_TO_AI_CHANCE).toBeLessThanOrEqual(0.25);
  });

  it("pražský den a hodina sedí i přes změnu času", () => {
    // 25. 10. 2026 v 0:30 UTC je v Praze ještě letní čas (2:30).
    expect(pragueHour(new Date("2026-10-25T00:30:00Z"))).toBe(2);
    // Po přechodu na zimní čas je poledne UTC 13:00 v Praze.
    expect(pragueHour(new Date("2026-10-26T12:00:00Z"))).toBe(13);
    expect(pragueDay(new Date("2026-10-25T22:30:00Z"))).toBe("2026-10-25");
    expect(pragueDay(new Date("2026-10-25T23:30:00Z"))).toBe("2026-10-26");
  });

  it("čas z databáze se čte jako UTC v obou formátech", () => {
    expect(parseDbTime("2026-10-25 10:00:00")?.toISOString()).toBe("2026-10-25T10:00:00.000Z");
    expect(parseDbTime("2026-10-25T10:00:00Z")?.toISOString()).toBe("2026-10-25T10:00:00.000Z");
    expect(parseDbTime(null)).toBeNull();
    expect(parseDbTime("nesmysl")).toBeNull();
  });
});
