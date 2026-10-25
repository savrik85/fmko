import { describe, it, expect } from "vitest";
import { marketValue, MARKET_VALUE_MAX } from "./market-value";

describe("tržní hodnota", () => {
  it("sedí na skutečné ceny z Prachatic", () => {
    // Medián skutečných obchodů (záložník/útočník, 26–29 let): 45–49 → ~19 000, 50–54 → ~35 000.
    expect(marketValue(47, 27, "MID")).toBeGreaterThan(12_000);
    expect(marketValue(47, 27, "MID")).toBeLessThan(25_000);
    expect(marketValue(52, 27, "MID")).toBeGreaterThan(20_000);
  });

  it("mladý je dražší, veterán levnější, brankář nejlevnější", () => {
    expect(marketValue(45, 19, "MID")).toBeGreaterThan(marketValue(45, 27, "MID") * 2.5);
    expect(marketValue(45, 35, "MID")).toBeLessThan(marketValue(45, 27, "MID") * 0.35);
    expect(marketValue(45, 27, "GK")).toBeLessThan(marketValue(45, 27, "DEF"));
  });

  it("úroveň cen k 25. 10.: sedí na poslední skutečné obchody mezi lidmi", () => {
    // 22. 10. obránce 18 let, hodnocení 52, za 125 000; 30. 9.–25. 10. medián do 21 let 2,21× tvaru z 3. 10.
    expect(marketValue(52, 18, "DEF")).toBeGreaterThan(90_000);
    expect(marketValue(52, 18, "DEF")).toBeLessThan(150_000);
    // 8. 10. záložník 30 let, hodnocení 51, za 17 000.
    expect(marketValue(51, 30, "MID")).toBeGreaterThan(12_000);
    expect(marketValue(51, 30, "MID")).toBeLessThan(26_000);
  });

  it("mezi 21 a 22 lety cena skočí: do 21 let hráč může hrát za U21", () => {
    expect(marketValue(50, 21, "MID")).toBeGreaterThan(marketValue(50, 22, "MID") * 5);
  });

  it("drží se mezi minimem a stropem", () => {
    expect(marketValue(1, 40, "GK")).toBe(500);
    expect(marketValue(99, 18, "MID")).toBe(MARKET_VALUE_MAX);
  });
});
