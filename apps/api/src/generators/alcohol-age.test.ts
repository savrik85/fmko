import { describe, it, expect } from "vitest";
import { alcoholCap, alcoholForAge, alcoholAfterAging } from "./alcohol-age";
import { generatePlayer } from "./player";
import { createRng } from "./rng";

describe("alkohol podle věku", () => {
  it("čtrnáctiletý nemůže být alkáč, dospělý ano", () => {
    expect(alcoholForAge(100, 14)).toBeLessThanOrEqual(15);
    expect(alcoholForAge(100, 25)).toBe(100);
    expect(alcoholCap(13)).toBeLessThan(alcoholCap(16));
    expect(alcoholCap(18)).toBeLessThan(alcoholCap(19));
  });

  it("stárnutím se sklon projeví, pořadí mezi hráči zůstane", () => {
    const heavy = alcoholForAge(90, 14);
    const light = alcoholForAge(20, 14);
    let h = heavy;
    let l = light;
    for (let age = 14; age < 19; age++) {
      h = alcoholAfterAging(h, age, age + 1);
      l = alcoholAfterAging(l, age, age + 1);
      expect(h).toBeGreaterThanOrEqual(l);
    }
    expect(h).toBeGreaterThan(75);
    expect(l).toBeLessThan(30);
  });

  it("generátor mladým nedá vysoký alkohol", () => {
    const village = { region_code: "Prachatice", category: "obec", population: 1500, district: "Prachatice" } as Parameters<typeof generatePlayer>[1];
    const names = { surnames: { Novák: 10 }, female_forms: {} } as unknown as Parameters<typeof generatePlayer>[3];
    const first = { male: { "1980s": { Jan: 10 }, "2000s": { Jan: 10 }, "2010s": { Jan: 10 } }, female: {} } as unknown as Parameters<typeof generatePlayer>[4];
    for (let i = 0; i < 300; i++) {
      const p = generatePlayer(createRng(i), village, "MID", names, first, { age: 15 });
      expect(p.alcohol).toBeLessThanOrEqual(alcoholCap(15));
    }
  });
});
