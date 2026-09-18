import { describe, expect, it } from "vitest";
import { cumulativeInvestment, getRepairCost } from "../equipment/equipment-generator";
import { castkaPokuty, castkaSrazky, hodnotaSkody, jeOblibeny, splatkaSrazky } from "./tresty";

describe("hodnota škody", () => {
  it("vybavení: cena ztracených úrovní", () => {
    expect(hodnotaSkody([{ typ: "vybaveni", kategorie: "jerseys", uroven: 2, stav: 70, urovniDolu: 2 }]))
      .toBe(cumulativeInvestment("jerseys", 2));
    expect(hodnotaSkody([{ typ: "vybaveni", kategorie: "trophy_case", uroven: 3, stav: 70, urovniDolu: 1 }]))
      .toBe(cumulativeInvestment("trophy_case", 3) - cumulativeInvestment("trophy_case", 2));
  });

  it("opotřebení, zařízení stadionu a trávník", () => {
    expect(hodnotaSkody([{ typ: "vybaveni_stav", kategorie: "team_van", stavPred: 80, stavPo: 35 }])).toBe(getRepairCost("team_van", 1, 55));
    expect(hodnotaSkody([{ typ: "stadion", zarizeni: "fence", urovni: 1, cena: 17_500 }])).toBe(17_500);
    expect(hodnotaSkody([{ typ: "travnik", pred: 70, po: 58 }])).toBe(1_800);
  });

  it("více ztrát se sečte, prázdná škoda je nula", () => {
    expect(hodnotaSkody([])).toBe(0);
    expect(hodnotaSkody([{ typ: "travnik", pred: 70, po: 60 }, { typ: "stadion", zarizeni: "refreshments", urovni: 1, cena: 1_000 }])).toBe(2_500);
  });
});

describe("pozitivní incidenty nejsou škoda (spec 4d)", () => {
  it("oprava a zvýšení vybavení nesou nulovou hodnotu škody", () => {
    expect(hodnotaSkody([{ typ: "oprava", damageId: "dmg-1", zarizeni: "fence" }])).toBe(0);
    expect(hodnotaSkody([{ typ: "vybaveni_nahoru", kategorie: "jerseys", urovniNahoru: 1, stavNahoru: 100 }])).toBe(0);
  });

  it("nesnižují ani nezvyšují skutečnou škodu vedle nich", () => {
    const s = hodnotaSkody([
      { typ: "penize", castka: 1000 },
      { typ: "oprava", damageId: "dmg-1", zarizeni: "fence" },
      { typ: "vybaveni_nahoru", kategorie: "jerseys", stavNahoru: 30 },
    ]);
    expect(s).toBe(1000);
  });
});

describe("peněžní škoda (spec 3)", () => {
  it("hodnota peněžní ztráty je ukradená částka", () => {
    expect(hodnotaSkody([{ typ: "penize", castka: 4200 }])).toBe(4200);
  });

  it("sečte se s ostatními druhy škody", () => {
    const s = hodnotaSkody([{ typ: "penize", castka: 1000 }, { typ: "travnik", pred: 80, po: 60 }]);
    expect(s).toBeGreaterThan(1000);
  });
});

describe("srážka, pokuta, oblíbenost", () => {
  it("srážka je nejvýš škoda a čtyři mzdy, splátky dají přesně celek", () => {
    expect(castkaSrazky(10_000, 109)).toBe(436);
    expect(castkaSrazky(300, 109)).toBe(300);
    const splatky = [4, 3, 2, 1].map((zbyva) => splatkaSrazky(437, zbyva));
    expect(splatky).toEqual([109, 109, 109, 110]);
    expect(splatky.reduce((a, b) => a + b, 0)).toBe(437);
    expect(splatkaSrazky(437, 0)).toBe(0);
  });

  it("pokuta je nejvýš škoda, dvě mzdy a 5 000 Kč", () => {
    expect(castkaPokuty(10_000, 100)).toBe(200);
    expect(castkaPokuty(150, 100)).toBe(150);
    expect(castkaPokuty(100_000, 4_000)).toBe(5_000);
    expect(castkaPokuty(0, 100)).toBe(0);
  });

  it("oblíbený je vůdce nebo hráč se dvěma silnými vztahy", () => {
    expect(jeOblibeny(65, 0)).toBe(true);
    expect(jeOblibeny(30, 2)).toBe(true);
    expect(jeOblibeny(64, 1)).toBe(false);
  });
});
