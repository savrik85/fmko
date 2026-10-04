/**
 * Růst mladých podle naměřeného tempa a cena, za kterou klub svého kluka pustí.
 */
import { describe, it, expect } from "vitest";
import { marketValue } from "@okresni-masina/shared";
import { clubValuation, projectRating, youthTrainingTempo } from "./youth-growth";

// Stropy dovedností hodně vysoko, aby projekci neomezovaly.
const HIGH_CAPS = Object.fromEntries(
  ["speed", "technique", "shooting", "passing", "heading", "defense", "stamina", "strength", "vision", "creativity", "setPieces"]
    .map((k) => [k, { maxPotential: 95 }]),
);
const kid = (talent: number, o: Partial<{ age: number; rating: number }> = {}) => ({
  age: o.age ?? 18, rating: o.rating ?? 25, position: "DEF", talent, skillsMax: HIGH_CAPS,
});

describe("tempo mladých podle talentu (naměřeno na produkci)", () => {
  it("talentovaný roste rychleji", () => {
    expect(youthTrainingTempo(10)).toBe(2.58);
    expect(youthTrainingTempo(40)).toBe(3.11);
    expect(youthTrainingTempo(60)).toBe(4.28);
    expect(youthTrainingTempo(78)).toBe(5.87);
  });

  it("za sezónu trénink + dospívání", () => {
    // talent 78: 25 + 5,87 + dospívání 11 = 41,87 → 42
    expect(projectRating(kid(78), 1)).toBe(42);
    // talent 10: 25 + 2,58 + dospívání 5 = 32,58 → 33
    expect(projectRating(kid(10), 1)).toBe(33);
  });

  it("dvacetiletý dospěje už jen jednou, jednadvacetiletý vůbec", () => {
    // 20 let: trénink 5,87 + dospívání (bude mu 21) 12 = +17,87
    expect(projectRating(kid(84, { age: 20, rating: 20 }), 1)).toBe(38);
    // 21 let: jen trénink, dospívání už ne (bude mu 22)
    expect(projectRating(kid(84, { age: 21, rating: 20 }), 1)).toBe(26);
  });

  it("po 21 letech roste tempem podle věku, ne tempem dorostu", () => {
    // Jakub Horák z testu: 20 let, hodnocení 20, talent 84. 8 sezón:
    // 20 → 37,9 (trénink + dospívání) → 43,7 (21) → 3× 2,0 (22–24) → 3× 1,5 (25–27) = 54
    expect(projectRating(kid(84, { age: 20, rating: 20 }), 8)).toBe(54);
  });

  it("nikdy přes strop dovedností", () => {
    const lowCaps = Object.fromEntries(Object.keys(HIGH_CAPS).map((k) => [k, { maxPotential: 30 }]));
    expect(projectRating({ ...kid(78), skillsMax: lowCaps }, 3)).toBeLessThanOrEqual(42);
  });
});

describe("cena, za kterou klub kluka pustí", () => {
  it("talentovaný kluk je dražší než netalentovaný se stejným hodnocením", () => {
    expect(clubValuation(kid(78))).toBeGreaterThan(clubValuation(kid(10)));
  });

  it("mladík stojí víc než tržní cena podle dnešního hodnocení", () => {
    expect(clubValuation(kid(78))).toBeGreaterThan(marketValue(25, 18, "DEF") * 3);
  });

  it("dospělý stojí tržní cenu", () => {
    expect(clubValuation({ ...kid(78), age: 25, rating: 50 })).toBe(marketValue(50, 25, "DEF"));
  });
});
