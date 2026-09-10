/** Testy katalogu manažerských akcí a jejich dopadů — čisté funkce, bez DB. */
import { describe, it, expect } from "vitest";
import {
  FAN_ACTIONS, FAN_ACTION_KEYS, actionCost, dnuOd,
  dopadSchuzky, dopadSlevy, dopadTifa, dopadZakazu, dopadOdvolaniZakazu, dopadPresunu,
} from "./fan-group-actions";

describe("katalog akcí", () => {
  it("každá akce má popisek i popis a klíč sedí sám se sebou", () => {
    for (const k of FAN_ACTION_KEYS) {
      const d = FAN_ACTIONS[k];
      expect(d.key).toBe(k);
      expect(d.label.length).toBeGreaterThan(0);
      expect(d.popis.length).toBeGreaterThan(0);
      expect(d.cooldownDnu).toBeGreaterThanOrEqual(0);
    }
  });

  it("cena se bere z varianty, když akce varianty má", () => {
    expect(actionCost("tifo", "male")).toBe(2000);
    expect(actionCost("tifo", "velke")).toBe(12000);
    expect(actionCost("schuzka")).toBe(600);
    expect(actionCost("zakaz", "2")).toBe(0);
  });

  it("neznámá varianta spadne na základní cenu, ne na NaN", () => {
    expect(actionCost("tifo", "obri")).toBe(FAN_ACTIONS.tifo.cost);
    expect(actionCost("tifo", null)).toBe(FAN_ACTIONS.tifo.cost);
  });
});

describe("cooldown", () => {
  it("počítá celé dny mezi herními daty", () => {
    expect(dnuOd("2026-09-01", "2026-09-15")).toBe(14);
    expect(dnuOd("2026-09-01T16:00:00.000Z", "2026-09-08T16:00:00.000Z")).toBe(7);
    expect(dnuOd("2026-09-15", "2026-09-15")).toBe(0);
  });

  it("bez předchozí akce ani u nečitelného data nezablokuje", () => {
    expect(dnuOd(null, "2026-09-15")).toBe(Number.MAX_SAFE_INTEGER);
    expect(dnuOd("nesmysl", "2026-09-15")).toBe(Number.MAX_SAFE_INTEGER);
  });
});

describe("schůzka s vůdcem", () => {
  const zaklad = { vyjednavani: 80, sentiment: 0, managerReputation: 50, roll: 0.1 };

  it("s ochotným vůdcem vyjde a vztah se zlepší", () => {
    const d = dopadSchuzky(zaklad);
    expect(d.sentiment).toBeGreaterThan(0);
    expect(d.heat).toBeLessThan(0);
  });

  it("s radikálem skoro vždycky selže a naštve ho", () => {
    // vyjednávání 20 → šance na úspěch 0,25 + 0,12 + 0,075 = 0,445
    const d = dopadSchuzky({ ...zaklad, vyjednavani: 20, roll: 0.9 });
    expect(d.sentiment).toBeLessThan(0);
    expect(d.heat).toBeGreaterThan(0);
  });

  it("lepší reputace manažera zvedne šanci i zisk", () => {
    const slaby = dopadSchuzky({ ...zaklad, managerReputation: 0 });
    const silny = dopadSchuzky({ ...zaklad, managerReputation: 100 });
    expect(silny.sentiment).toBeGreaterThan(slaby.sentiment);
  });

  it("i nejhorší vůdce se dá občas přesvědčit", () => {
    const d = dopadSchuzky({ vyjednavani: 0, sentiment: -100, managerReputation: 0, roll: 0 });
    expect(d.sentiment).toBeGreaterThan(0);
  });
});

describe("ústupky a tresty", () => {
  it("větší sleva potěší víc, zrušení naopak urazí", () => {
    expect(dopadSlevy(50).sentiment).toBeGreaterThan(dopadSlevy(25).sentiment);
    expect(dopadSlevy(25).sentiment).toBeGreaterThan(dopadSlevy(10).sentiment);
    expect(dopadSlevy(0).sentiment).toBeLessThan(0);
  });

  it("choreo účinkuje víc u vůdce, který s klubem mluví", () => {
    expect(dopadTifa("velke", 100).sentiment).toBeGreaterThan(dopadTifa("velke", 0).sentiment);
    expect(dopadTifa("velke", 50).sentiment).toBeGreaterThan(dopadTifa("male", 50).sentiment);
  });

  it("delší zákaz bolí víc a zvedne naštvanost", () => {
    expect(dopadZakazu(3).sentiment).toBeLessThan(dopadZakazu(1).sentiment);
    expect(dopadZakazu(3).heat).toBeGreaterThan(dopadZakazu(1).heat);
  });

  it("zákaz mimo rozsah se ořízne na 1–3 zápasy", () => {
    expect(dopadZakazu(0)).toEqual(dopadZakazu(1));
    expect(dopadZakazu(99)).toEqual(dopadZakazu(3));
  });

  it("odpuštění trestu vztah zlepší", () => {
    expect(dopadOdvolaniZakazu().sentiment).toBeGreaterThan(0);
  });
});

describe("přesun sektoru", () => {
  it("hlavní tribuna je pro partu urážka, kotel odměna", () => {
    expect(dopadPresunu("kotel", "hlavni").sentiment).toBeLessThan(0);
    expect(dopadPresunu("hlavni", "kotel").sentiment).toBeGreaterThan(0);
  });

  it("přesun na místo, kde už stojí, nic nedělá", () => {
    const d = dopadPresunu("kotel", "kotel");
    expect(d).toEqual({ sentiment: 0, mood: 0, heat: 0, text: "Parta už tam stojí." });
  });
});
