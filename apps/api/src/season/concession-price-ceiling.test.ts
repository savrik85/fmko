import { describe, expect, it } from "vitest";
import {
  CONCESSION_CATALOG,
  CONCESSION_PRODUCT_KEYS,
  concessionNoSalePrice,
  concessionPriceFactor,
  type ProductKey,
} from "./concession-catalog";
import { computeSelfConcessionMatch } from "./fans-processor";

/**
 * Pravidlo majitele hry: ať si klub prodává za kolik chce, ale za přemrštěnou cenu
 * nesmí nikdo kupovat. Podlaha 10 % poptávky dřív dělala z ceny 1 000 Kč zlatý důl
 * (na produ FK FORPSI Čkyně prodával všechno za tisícovku, 875 tisíc Kč za 30 dní).
 */

/** Velká návštěva, ať i malá poptávka dá aspoň jeden kus. */
const CROWD = 5000;

function sold(key: ProductKey, qualityLevel: number, sellPrice: number): number {
  const r = computeSelfConcessionMatch(
    CROWD, 50, [{ key, qualityLevel, sellPrice, stockQuantity: 1_000_000 }], "cloudy", 1,
  );
  return r.products[0].sold;
}

describe("přemrštěná cena v bufetu", () => {
  it("za 1 000 Kč nikdo nekoupí nic z žádného produktu v žádné kvalitě", () => {
    for (const key of CONCESSION_PRODUCT_KEYS) {
      for (const level of [1, 2, 3]) {
        expect(sold(key, level, 1000), `${key} L${level}`).toBe(0);
      }
    }
  });

  it("za 1 000 Kč je tržba nula", () => {
    const r = computeSelfConcessionMatch(
      CROWD, 100,
      CONCESSION_PRODUCT_KEYS.map((key) => ({ key, qualityLevel: 1, sellPrice: 1000, stockQuantity: 1_000_000 })),
      "sunny", 1.5, 20,
    );
    expect(r.totalRevenue).toBe(0);
  });

  it("hranice odpovídá elasticitě: pivo 2,25×, klobása 2,67×, svařák 3×, limonáda 3,5×", () => {
    const ratio = (key: ProductKey) => 1 + 1 / CONCESSION_CATALOG[key].priceElasticity;
    expect(ratio("beer")).toBeCloseTo(2.25, 2);
    expect(ratio("sausage")).toBeCloseTo(2.67, 2);
    expect(ratio("mulled_wine")).toBeCloseTo(3, 2);
    expect(ratio("lemonade")).toBeCloseTo(3.5, 2);

    // Pivo Měšťan za 25 Kč: za 56 Kč (2,24×) se ještě prodá, za 57 Kč (2,28×) už ne.
    expect(sold("beer", 1, 56)).toBeGreaterThan(0);
    expect(sold("beer", 1, 57)).toBe(0);
  });

  it("concessionNoSalePrice je první cena, za kterou se nic neprodá", () => {
    for (const key of CONCESSION_PRODUCT_KEYS) {
      for (const level of [1, 2, 3]) {
        const limit = concessionNoSalePrice(key, level);
        expect(limit, `${key} L${level}`).not.toBeNull();
        expect(sold(key, level, limit!), `${key} L${level} za ${limit} Kč`).toBe(0);
        expect(concessionPriceFactor(key, level, limit!), `${key} L${level} za ${limit} Kč`).toBe(0);
        expect(concessionPriceFactor(key, level, limit! - 1), `${key} L${level} za ${limit! - 1} Kč`).toBeGreaterThan(0);
        expect(sold(key, level, limit! - 1), `${key} L${level} za ${limit! - 1} Kč`).toBeGreaterThan(0);
      }
    }
  });

  it("kvalita 0 se nenabízí, hranici nemá", () => {
    expect(concessionNoSalePrice("beer", 0)).toBeNull();
  });

  it("pod hranicí se poptávka nemění: stejný vzorec jako dřív", () => {
    // Dřívější vzorec bez podlahy, tam kde podlaha 10 % nezasahovala.
    for (const key of CONCESSION_PRODUCT_KEYS) {
      const { priceElasticity, tiers } = CONCESSION_CATALOG[key];
      for (const level of [1, 2, 3]) {
        const def = tiers[level].defaultSellPrice;
        for (const price of [0, Math.round(def * 0.5), def, Math.round(def * 1.5), Math.round(def * 2)]) {
          const old = 1 - (price / def - 1) * priceElasticity;
          if (old < 0.1) continue;
          expect(concessionPriceFactor(key, level, price), `${key} L${level} za ${price} Kč`).toBeCloseTo(old, 10);
        }
      }
    }
  });
});
