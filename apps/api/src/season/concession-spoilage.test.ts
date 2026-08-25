import { describe, expect, it } from "vitest";
import { CONCESSION_CATALOG, CONCESSION_PRODUCT_KEYS, stockAfterDays } from "./concession-catalog";

/**
 * Zkáza zboží je to, co ze skladu dělá rozhodnutí.
 *
 * Bez ní byla optimální strategie „naskladni jednou hodně od všeho a zapomeň":
 * sklad se jen odečítal při prodeji a nic ho neubíralo. Předpověď počasí tím
 * pádem nemělo smysl sledovat — nadzásoba nic nestála.
 */
describe("sazby zkázy", () => {
  it("každý produkt má sazbu v rozumném rozsahu", () => {
    for (const key of CONCESSION_PRODUCT_KEYS) {
      const r = CONCESSION_CATALOG[key].spoilRatePerDay;
      expect(r, key).toBeGreaterThan(0);
      expect(r, key).toBeLessThanOrEqual(0.2);
    }
  });

  it("klobása se kazí nejrychleji ze všeho", () => {
    const klobasa = CONCESSION_CATALOG.sausage.spoilRatePerDay;
    for (const key of CONCESSION_PRODUCT_KEYS) {
      if (key === "sausage") continue;
      expect(klobasa, key).toBeGreaterThan(CONCESSION_CATALOG[key].spoilRatePerDay);
    }
  });

  it("klobásy se do dalšího zápasu ztratí zhruba půlka", () => {
    // Týden mezi domácími zápasy. Klobásu musíš koupit čerstvou, nedá se předzásobit.
    const zbylo = stockAfterDays(1000, CONCESSION_CATALOG.sausage.spoilRatePerDay, 7);
    expect(zbylo).toBeGreaterThan(400);
    expect(zbylo).toBeLessThan(600);
  });

  it("nápoje týden v pohodě vydrží", () => {
    for (const key of ["beer", "lemonade", "mulled_wine"] as const) {
      const zbylo = stockAfterDays(1000, CONCESSION_CATALOG[key].spoilRatePerDay, 7);
      expect(zbylo, key).toBeGreaterThan(850);
    }
  });

  it("ani svařák nevydrží od léta do zimy", () => {
    // Ve čtyřech měsících se z letního nákupu nedá v prosinci prodávat —
    // jinak by svařák nebyl sezónní sázka, ale trvalý bonus.
    const zbylo = stockAfterDays(1000, CONCESSION_CATALOG.mulled_wine.spoilRatePerDay, 120);
    expect(zbylo).toBeLessThan(200);
  });
});

describe("výpočet zkázy", () => {
  it("prázdný sklad zůstane prázdný", () => {
    expect(stockAfterDays(0, 0.1, 30)).toBe(0);
  });

  it("nula dní nic neubere", () => {
    expect(stockAfterDays(500, 0.1, 0)).toBe(500);
  });

  it("zaokrouhluje dolů, stejně jako CAST v SQL", () => {
    // 100 * 0.9 = 90, 90 * 0.9 = 81 — žádná desetinná místa v DB.
    expect(stockAfterDays(100, 0.1, 1)).toBe(90);
    expect(stockAfterDays(100, 0.1, 2)).toBe(81);
  });

  it("zbytky doopravdy zmizí, nezůstane věčný jeden kus", () => {
    for (const key of CONCESSION_PRODUCT_KEYS) {
      expect(stockAfterDays(3, CONCESSION_CATALOG[key].spoilRatePerDay, 400), key).toBe(0);
    }
  });

  it("záporný ani desetinný vstup nerozbije výsledek", () => {
    expect(stockAfterDays(-5, 0.1, 3)).toBe(0);
    expect(stockAfterDays(10.9, 0.1, 1)).toBe(9);
  });
});
