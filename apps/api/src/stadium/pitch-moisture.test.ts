import { describe, it, expect } from "vitest";
import {
  moistureAfterMatch, moistureDailyDrift, wetnessFromMoisture, drynessFromMoisture,
  MOISTURE_NORMAL, MOISTURE_MIN, MOISTURE_MAX,
} from "./pitch-moisture";

/**
 * Vyschlý trávník i kaluže se dřív odvozovaly z aktuálního počasí, takže týden
 * veder skončil v momentě, kdy se zatáhlo. Vlhkost je paměť — tyhle testy hlídají,
 * že si hřiště stav skutečně nese dál.
 */

describe("posun vlhkosti zápasem", () => {
  it("déšť a sníh půdu nasytí, výheň a vítr ji vysuší", () => {
    expect(moistureAfterMatch(50, "rain")).toBeGreaterThan(50);
    expect(moistureAfterMatch(50, "snow")).toBeGreaterThan(50);
    expect(moistureAfterMatch(50, "sunny")).toBeLessThan(50);
    expect(moistureAfterMatch(50, "wind")).toBeLessThan(50);
  });

  it("déšť sytí víc než sníh, výheň vysušuje víc než vítr", () => {
    expect(moistureAfterMatch(50, "rain")).toBeGreaterThan(moistureAfterMatch(50, "snow"));
    expect(moistureAfterMatch(50, "sunny")).toBeLessThan(moistureAfterMatch(50, "wind"));
  });

  it("zavlažování propad na výhni vyrovná", () => {
    const bezZalivky = moistureAfterMatch(50, "sunny");
    const seZalivkou = moistureAfterMatch(50, "sunny", { irrigationRan: true });
    expect(seZalivkou).toBeGreaterThan(bezZalivky);
  });

  it("vlhkost nepřeteče mimo rozsah", () => {
    expect(moistureAfterMatch(98, "rain")).toBeLessThanOrEqual(MOISTURE_MAX);
    expect(moistureAfterMatch(3, "sunny")).toBeGreaterThanOrEqual(MOISTURE_MIN);
  });

  it("neznámé počasí vlhkostí nehne", () => {
    expect(moistureAfterMatch(40, null)).toBe(40);
    expect(moistureAfterMatch(40, undefined)).toBe(40);
  });
});

describe("denní drift k normálu", () => {
  it("rozmáčené hřiště osychá, vyprahlé se dotuje", () => {
    expect(moistureDailyDrift(90)).toBeLessThan(90);
    expect(moistureDailyDrift(10)).toBeGreaterThan(10);
  });

  it("na normálu se nic neděje", () => {
    expect(moistureDailyDrift(MOISTURE_NORMAL)).toBe(MOISTURE_NORMAL);
  });

  it("drift normál nepřestřelí ani z jedné strany", () => {
    expect(moistureDailyDrift(51)).toBe(MOISTURE_NORMAL);
    expect(moistureDailyDrift(49)).toBe(MOISTURE_NORMAL);
  });

  it("stav přetrvá několik dní — to je celý smysl", () => {
    // Po deštivém zápase trvá pár dní, než hřiště oschne.
    let m = moistureAfterMatch(50, "rain");
    const poZapase = m;
    for (let i = 0; i < 3; i++) m = moistureDailyDrift(m);
    expect(m).toBeLessThan(poZapase);
    expect(m).toBeGreaterThan(MOISTURE_NORMAL);
  });
});

describe("překlad vlhkosti do vzhledu", () => {
  it("normální hřiště není ani rozmáčené, ani vyprahlé", () => {
    expect(wetnessFromMoisture(50)).toBe(0);
    expect(drynessFromMoisture(50)).toBe(0);
  });

  it("kaluže začínají nad 55, plno je při 100", () => {
    expect(wetnessFromMoisture(55)).toBe(0);
    expect(wetnessFromMoisture(78)).toBeGreaterThan(0);
    expect(wetnessFromMoisture(100)).toBe(1);
  });

  it("žloutnutí začíná pod 45, spálené je při 0", () => {
    expect(drynessFromMoisture(45)).toBe(0);
    expect(drynessFromMoisture(20)).toBeGreaterThan(0);
    expect(drynessFromMoisture(0)).toBe(1);
  });

  it("rozmáčené a vyprahlé se nikdy nepotkají", () => {
    for (const m of [0, 20, 45, 50, 55, 80, 100]) {
      expect(wetnessFromMoisture(m) * drynessFromMoisture(m)).toBe(0);
    }
  });

  it("neznámá vlhkost (starší stadiony) vzhled nemění", () => {
    expect(wetnessFromMoisture(null)).toBe(0);
    expect(drynessFromMoisture(undefined)).toBe(0);
  });
});
