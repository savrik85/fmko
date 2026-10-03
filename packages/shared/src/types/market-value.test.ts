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

  it("drží se mezi minimem a stropem", () => {
    expect(marketValue(1, 40, "GK")).toBe(500);
    expect(marketValue(99, 18, "MID")).toBe(MARKET_VALUE_MAX);
  });
});
