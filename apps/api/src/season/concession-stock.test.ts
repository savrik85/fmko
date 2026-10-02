/**
 * Sklad občerstvení po kvalitách — prodává se jen zvolená kvalita, ne „levně koupit,
 * draze prodat". Převod starého společného skladu podle nákupů.
 */
import { describe, it, expect } from "vitest";
import { splitLegacyStock, sellableStock, stockColumn } from "./concession-stock";

describe("sellableStock", () => {
  it("prodá se jen sklad zvolené kvality", () => {
    // Plno levného piva, žádná Plzeň: na Plzni se neprodá nic
    expect(sellableStock({ qualityLevel: 3, stockByTier: [0, 500, 0, 0] })).toBe(0);
    expect(sellableStock({ qualityLevel: 1, stockByTier: [0, 500, 0, 0] })).toBe(500);
  });

  it("víc kvalit na skladě vedle sebe, prodává se ta vybraná", () => {
    const stockByTier: [number, number, number, number] = [0, 100, 200, 300];
    expect(sellableStock({ qualityLevel: 2, stockByTier })).toBe(200);
    expect(sellableStock({ qualityLevel: 3, stockByTier })).toBe(300);
  });

  it("nenabízený produkt nic neprodá", () => {
    expect(sellableStock({ qualityLevel: 0, stockByTier: [0, 100, 100, 100] })).toBe(0);
  });
});

describe("stockColumn", () => {
  it("pouští do SQL jen tři známé sloupce", () => {
    expect(stockColumn(1)).toBe("stock_l1");
    expect(stockColumn(3)).toBe("stock_l3");
    expect(stockColumn(0)).toBeNull();
    expect(stockColumn(4)).toBeNull();
  });
});

describe("splitLegacyStock", () => {
  it("levně nakoupené pivo zůstane levné, i když je přepnutá Plzeň", () => {
    // Měšťan 10° = 14 Kč; klub nakoupil levné a přepnul na úroveň 3
    const split = splitLegacyStock("beer", 400, [{ quantity: 500, unitPrice: 14 }], 3);
    expect(split).toEqual([0, 400, 0, 0]);
  });

  it("zbylé kusy jsou ty naposledy koupené", () => {
    // Nejnovější: 100 ks Plzně (30), před tím 300 ks Kozla (20), nejstarší 1000 ks Měšťana
    const purchases = [
      { quantity: 100, unitPrice: 30 },
      { quantity: 300, unitPrice: 20 },
      { quantity: 1000, unitPrice: 14 },
    ];
    expect(splitLegacyStock("beer", 250, purchases, 1)).toEqual([0, 0, 150, 100]);
    expect(splitLegacyStock("beer", 600, purchases, 1)).toEqual([0, 200, 300, 100]);
  });

  it("kusy bez dohledatelného nákupu jdou do zvolené kvality", () => {
    expect(splitLegacyStock("sausage", 50, [], 2)).toEqual([0, 0, 50, 0]);
    // Neznámá cena (katalog se mezitím změnil) se přeskočí
    expect(splitLegacyStock("sausage", 50, [{ quantity: 80, unitPrice: 99 }], 1)).toEqual([0, 50, 0, 0]);
  });

  it("součet se zachová", () => {
    const split = splitLegacyStock("lemonade", 777, [{ quantity: 300, unitPrice: 22 }, { quantity: 100, unitPrice: 8 }], 2);
    expect(split.reduce((a, b) => a + b, 0)).toBe(777);
  });
});
