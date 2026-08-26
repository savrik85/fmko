/**
 * Žádný generátor nesmí vyrobit hráče s nulovými dovednostmi.
 *
 * Historicky se to stalo několikrát: nabídky hráčů generovaly jen 9 z 13 atributů a v profilu
 * pak svítily nuly u přehledu, kreativity a standardek; brankáři měli dovednosti pod jinými
 * názvy, takže se část neuložila vůbec. Tenhle test hlídá, aby se to nevrátilo — projíždí
 * všechny generátory a kontroluje, že vrací kompletní a nenulové sady.
 */
import { describe, it, expect } from "vitest";
import { createRng } from "../generators/rng";
import { generateFieldSkills, generateGKSkills, calculateOverallRating } from "./generator";
import { ratingWeightsFor } from "@okresni-masina/shared";

/** Atributy, které musí mít hráč v poli vyplněné. */
const POLE = [
  "speed", "stamina", "strength", "technique", "shooting",
  "passing", "heading", "defense", "vision", "creativity", "setPieces", "experience",
] as const;

/** Brankář má vlastní sadu — od sjednocení názvů taky pod plochými jmény. */
const BRANKAR = [
  "goalkeeping", "defense", "speed", "technique",
  "passing", "strength", "heading", "creativity", "experience",
] as const;

const VELIKOSTI = ["hamlet", "village", "town", "small_city", "city"];
const POZICE = ["DEF", "MID", "FWD"] as const;

describe("generátor hráčů v poli", () => {
  it("vrací kompletní sadu dovedností bez nul napříč pozicemi, věky i velikostmi obcí", () => {
    for (let seed = 0; seed < 40; seed++) {
      const rng = createRng(seed * 977 + 13);
      for (const velikost of VELIKOSTI) {
        for (const pozice of POZICE) {
          for (const vek of [16, 22, 30, 44]) {
            const s = generateFieldSkills(rng, pozice, velikost, vek) as unknown as Record<string, { current: number; maxPotential: number }>;
            for (const attr of POLE) {
              const v = s[attr];
              expect(v, `${pozice}/${velikost}/${vek} postrádá ${attr}`).toBeDefined();
              // zkušenost šestnáctiletého smí být nula, ostatní ne
              if (attr !== "experience") {
                expect(v.current, `${pozice}/${velikost}/${vek}: ${attr} je nula`).toBeGreaterThan(0);
              }
              expect(v.maxPotential, `${pozice}/${velikost}/${vek}: strop ${attr} je nula`).toBeGreaterThan(0);
              expect(v.maxPotential, `${pozice}/${velikost}/${vek}: ${attr} nad stropem`).toBeGreaterThanOrEqual(v.current);
            }
          }
        }
      }
    }
  });
});

describe("generátor brankářů", () => {
  it("vrací kompletní sadu bez nul", () => {
    for (let seed = 0; seed < 40; seed++) {
      const rng = createRng(seed * 613 + 7);
      for (const velikost of VELIKOSTI) {
        for (const vek of [16, 22, 30, 44]) {
          const s = generateGKSkills(rng, velikost, vek) as unknown as Record<string, { current: number; maxPotential: number }>;
          for (const attr of BRANKAR) {
            const v = s[attr];
            expect(v, `GK/${velikost}/${vek} postrádá ${attr}`).toBeDefined();
            if (attr !== "experience") {
              expect(v.current, `GK/${velikost}/${vek}: ${attr} je nula`).toBeGreaterThan(0);
            }
            expect(v.maxPotential, `GK/${velikost}/${vek}: strop ${attr} je nula`).toBeGreaterThan(0);
          }
        }
      }
    }
  });

  it("pokrývá všechny dovednosti, které váhy hodnocení očekávají", () => {
    // Tohle je jádro té staré chyby: váhy jely pod jinými názvy než generátor,
    // takže hodnocení počítalo z chybějících hodnot.
    const s = generateGKSkills(createRng(1), "village", 25) as unknown as Record<string, unknown>;
    for (const attr of Object.keys(ratingWeightsFor("GK"))) {
      expect(s[attr], `váhy GK počítají s "${attr}", generátor ho nevrací`).toBeDefined();
    }
  });

  it("hodnocení brankáře vyjde nenulové", () => {
    for (let seed = 0; seed < 20; seed++) {
      const s = generateGKSkills(createRng(seed * 31), "village", 25);
      expect(calculateOverallRating("GK", s, 0)).toBeGreaterThan(0);
    }
  });
});

describe("hráč v poli vs váhy", () => {
  it("generátor pokrývá všechny dovednosti z vah pro každou pozici", () => {
    for (const pozice of POZICE) {
      const s = generateFieldSkills(createRng(5), pozice, "village", 25) as unknown as Record<string, unknown>;
      for (const attr of Object.keys(ratingWeightsFor(pozice))) {
        expect(s[attr], `váhy ${pozice} počítají s "${attr}", generátor ho nevrací`).toBeDefined();
      }
    }
  });
});
