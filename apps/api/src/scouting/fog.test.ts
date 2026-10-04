/**
 * Mlha hlášení skauta: skutečné hodnocení leží v rozmezí vždy, rozmezí se další návštěvou
 * a lepším skautem zužuje a při obnovení stránky se nemění.
 */
import { describe, it, expect } from "vitest";
import { ASK_HINT_MAX_ERROR, blurredAskHint, blurredWillingness, potentialRange, rangeAround, ratingHalfWidth, ratingRange, scoutError } from "./fog";

describe("rozmezí hodnocení", () => {
  it("skutečná hodnota leží v rozmezí pro jakýkoli seed, skauta i počet návštěv", () => {
    for (let i = 0; i < 2000; i++) {
      const rating = 10 + (i % 70);
      const eff = 1 + (i % 20);
      const visits = 1 + (i % 4);
      const r = ratingRange(rating, eff, visits, `rep-${i}`);
      expect(r.lo).toBeLessThanOrEqual(rating);
      expect(r.hi).toBeGreaterThanOrEqual(rating);
    }
  });

  it("lepší skaut a víc návštěv = užší rozmezí", () => {
    expect(ratingHalfWidth(20, 1)).toBeLessThan(ratingHalfWidth(5, 1));
    expect(ratingHalfWidth(10, 4)).toBeLessThan(ratingHalfWidth(10, 1));
    // Tabulka ze specu: medián skautů na produ (13,5) ±9 / ±6 / ±4.
    expect(ratingHalfWidth(13.5, 1)).toBe(9);
    expect(ratingHalfWidth(13.5, 2)).toBe(6);
    expect(ratingHalfWidth(13.5, 4)).toBe(4);
    expect(ratingHalfWidth(20, 9)).toBe(2);
  });

  it("stejné hlášení = stejné rozmezí", () => {
    expect(ratingRange(44, 12, 1, "abc")).toEqual(ratingRange(44, 12, 1, "abc"));
  });

  it("nevyjede z mezí stupnice", () => {
    const r = rangeAround(3, 15, "x");
    expect(r.lo).toBeGreaterThanOrEqual(1);
    const r2 = rangeAround(97, 15, "y");
    expect(r2.hi).toBeLessThanOrEqual(99);
  });
});

describe("názor na potenciál", () => {
  const skillsMax = {
    speed: { maxPotential: 60 }, technique: { maxPotential: 58 }, shooting: { maxPotential: 55 },
    passing: { maxPotential: 57 }, heading: { maxPotential: 50 }, defense: { maxPotential: 40 },
    stamina: { maxPotential: 60 }, strength: { maxPotential: 55 }, vision: { maxPotential: 54 },
    creativity: { maxPotential: 56 }, setPieces: { maxPotential: 45 },
  };

  it("nikdy pod dnešní hodnocení", () => {
    for (let i = 0; i < 200; i++) {
      const r = potentialRange({ age: 18, rating: 35, position: "MID", talent: 30, skillsMax }, 3, 1, `p-${i}`);
      expect(r).not.toBeNull();
      expect(r!.lo).toBeGreaterThanOrEqual(35);
      expect(r!.hi).toBeGreaterThanOrEqual(r!.lo);
    }
  });

  it("bez stropů dovedností nic neříká", () => {
    expect(potentialRange({ age: 18, rating: 35, position: "MID", talent: 30, skillsMax: {} }, 10, 1, "z")).toBeNull();
  });
});

describe("odhad ceny a ochoty podle skauta", () => {
  it("slabší skaut se plete víc, další návštěva chybu zmenší", () => {
    expect(scoutError(5, 1)).toBeGreaterThan(scoutError(13.5, 1));
    expect(scoutError(13.5, 1)).toBeGreaterThan(scoutError(20, 1));
    expect(scoutError(10, 4)).toBeCloseTo(scoutError(10, 1) / 2, 5);
  });

  it("odhad ceny je v mezích chyby skauta a stabilní", () => {
    for (let i = 0; i < 300; i++) {
      const eff = 1 + (i % 20);
      const hint = blurredAskHint(20_000, eff, 1, `r-${i}`);
      const maxErr = ASK_HINT_MAX_ERROR * scoutError(eff, 1);
      expect(hint).toBeGreaterThanOrEqual(Math.floor((20_000 * (1 - maxErr)) / 1000) * 1000);
      expect(hint).toBeLessThanOrEqual(Math.ceil((20_000 * (1 + maxErr)) / 1000) * 1000);
    }
    expect(blurredAskHint(20_000, 8, 1, "x")).toBe(blurredAskHint(20_000, 8, 1, "x"));
  });

  it("špičkový skaut odhadne cenu přesněji než mizerný", () => {
    let good = 0, bad = 0;
    for (let i = 0; i < 300; i++) {
      good += Math.abs(blurredAskHint(20_000, 20, 1, `s-${i}`) - 20_000);
      bad += Math.abs(blurredAskHint(20_000, 3, 1, `s-${i}`) - 20_000);
    }
    expect(good).toBeLessThan(bad);
  });

  it("ochota se posune nejvýš o stupeň a zůstane v 0–3", () => {
    for (let i = 0; i < 300; i++) {
      for (const level of [0, 1, 2, 3]) {
        const b = blurredWillingness(level, 1 + (i % 20), 1, `w-${i}`);
        expect(Math.abs(b - level)).toBeLessThanOrEqual(1);
        expect(b).toBeGreaterThanOrEqual(0);
        expect(b).toBeLessThanOrEqual(3);
      }
    }
  });
});
