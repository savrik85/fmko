import { describe, expect, it } from "vitest";
import {
  CONCESSION_CATALOG,
  CONCESSION_PRODUCT_KEYS,
  concessionWeatherFactor,
} from "./concession-catalog";
import { computeSelfConcessionMatch } from "./fans-processor";

describe("svařák jako zimní produkt", () => {
  it("je v katalogu i v seznamu klíčů", () => {
    expect(CONCESSION_PRODUCT_KEYS).toContain("mulled_wine");
    expect(CONCESSION_CATALOG.mulled_wine).toBeDefined();
    expect(CONCESSION_CATALOG.mulled_wine.label.length).toBeGreaterThan(0);
  });

  it("ve sněhu má výrazně vyšší poptávku než na slunci", () => {
    expect(concessionWeatherFactor("mulled_wine", "snow", 12))
      .toBeGreaterThan(concessionWeatherFactor("mulled_wine", "sunny", 7) * 3);
  });

  it("v létě je prakticky bezcenný, v prosinci nahoře", () => {
    expect(concessionWeatherFactor("mulled_wine", "sunny", 7)).toBeLessThan(0.45);
    expect(concessionWeatherFactor("mulled_wine", "snow", 12)).toBeGreaterThan(1.5);
  });

  it("reaguje na chlad prudčeji než klobása", () => {
    const rozpeti = (k: "mulled_wine" | "sausage") =>
      concessionWeatherFactor(k, "snow", 12) - concessionWeatherFactor(k, "sunny", 7);
    expect(rozpeti("mulled_wine")).toBeGreaterThan(rozpeti("sausage"));
  });
});

describe("dopad svařáku na tržbu", () => {
  const zbozi = (key: string, sellPrice: number) => ({
    key: key as never, qualityLevel: 2, sellPrice, stockQuantity: 100000,
  });
  const zaklad = [zbozi("sausage", 45), zbozi("beer", 35), zbozi("lemonade", 25)];
  const svarak = zbozi("mulled_wine", CONCESSION_CATALOG.mulled_wine.tiers[2].defaultSellPrice);
  const trzba = (produkty: typeof zaklad, weather: "sunny" | "snow", month: number) =>
    computeSelfConcessionMatch(300, 50, produkty, weather, 1, month).totalRevenue;

  it("v prosinci ve sněhu zvedne tržbu aspoň o třetinu", () => {
    const bez = trzba(zaklad, "snow", 12);
    const se = trzba([...zaklad, svarak], "snow", 12);
    expect(se).toBeGreaterThan(bez * 1.33);
  });

  it("v červenci na slunci skoro nic nepřidá", () => {
    const bez = trzba(zaklad, "sunny", 7);
    const se = trzba([...zaklad, svarak], "sunny", 7);
    expect(se).toBeLessThan(bez * 1.08);
  });

  it("kdo ho nenaskladní, o nic nepřijde — nulový sklad neprodá nic", () => {
    const prazdny = { ...svarak, stockQuantity: 0 };
    const r = computeSelfConcessionMatch(300, 50, [...zaklad, prazdny], "snow", 12, 12);
    expect(r.products.find((p) => p.key === "mulled_wine")!.sold).toBe(0);
  });
});

/**
 * Past, na kterou se dá naletět při přidání každého dalšího produktu.
 *
 * `computeMatchSatisfactionDelta` strhne −2 spokojenosti za "předraženou"
 * položku, když je qualityLevel <= 1 a prodejní cena je přes dvojnásobek
 * velkoobchodní. Sahá na VŠECHNY produkty v seznamu, i na ty s nulovým
 * prodejem — takže špatně nacenený L1 by trvale srážel spokojenost
 * i týmu, který produkt nikdy nenaskladní.
 */
describe("výchozí ceny nesmí trestat spokojenost", () => {
  it("žádný produkt na L1 nepřekročí dvojnásobek velkoobchodní ceny", () => {
    for (const key of CONCESSION_PRODUCT_KEYS) {
      const tier = CONCESSION_CATALOG[key].tiers[1];
      expect(tier.defaultSellPrice / tier.wholesalePrice, key).toBeLessThanOrEqual(2.0);
    }
  });

  it("každý produkt má čtyři tiery a nulový tier 0", () => {
    for (const key of CONCESSION_PRODUCT_KEYS) {
      const tiers = CONCESSION_CATALOG[key].tiers;
      expect(tiers.length, key).toBe(4);
      expect(tiers[0].wholesalePrice, key).toBe(0);
    }
  });

  it("kvalitní tiery se dají nacenit tak, aby daly bonus", () => {
    for (const key of CONCESSION_PRODUCT_KEYS) {
      const tier = CONCESSION_CATALOG[key].tiers[2];
      expect(tier.defaultSellPrice / tier.wholesalePrice, key).toBeLessThanOrEqual(1.85);
    }
  });
});
