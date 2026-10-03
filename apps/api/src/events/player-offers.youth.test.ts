/**
 * Kluk, kterého trenér dorostu nabízí do áčka, nesmí být horší než průměrný dorostenec.
 *
 * 2026-10-03 dostalo 24 klubů na produkci nabídku kluka s hodnocením 11–20, zatímco jejich
 * vlastní dorost měl průměr 22–40 a průměr všech nabídek z dorostu byl 21 proti 41–48
 * u ostatních zdrojů — nabídka se losovala natvrdo 3–30 mimo generátor dorostu.
 */
import { describe, it, expect } from "vitest";
import { createRng } from "../generators/rng";
import { youthOfferShift } from "./player-offers";
import { generatePlayerSkills } from "../skills/generator";

const POZICE = ["GK", "DEF", "MID", "FWD"] as const;

function prumer(n: number, vyrob: (i: number) => number) {
  let soucet = 0;
  for (let i = 0; i < n; i++) soucet += vyrob(i);
  return soucet / n;
}

describe("nabídka kluka z dorostu", () => {
  it("v silném kádru vyjde v průměru 4–12 bodů pod průměrem áčka", () => {
    const rng = createRng(42);
    const prumerAcka = 50;
    const vysledek = prumer(800, (i) => {
      const pos = POZICE[i % 4];
      const age = 16 + (i % 5);
      const shift = youthOfferShift("village", pos, age, prumerAcka, rng);
      return generatePlayerSkills(rng, { position: pos, age, level: "village", shift }).rating;
    });
    expect(vysledek).toBeGreaterThanOrEqual(prumerAcka - 12);
    expect(vysledek).toBeLessThanOrEqual(prumerAcka - 4);
  });

  it("ve slabém kádru nespadne pod běžného dorostence z obce", () => {
    const rng = createRng(7);
    for (let i = 0; i < 200; i++) {
      expect(youthOfferShift("village", POZICE[i % 4], 17, 10, rng)).toBe(0);
    }
    expect(youthOfferShift("village", "MID", 17, null, rng)).toBe(0);
  });
});
