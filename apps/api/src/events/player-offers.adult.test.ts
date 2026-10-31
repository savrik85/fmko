/**
 * Dospělí hráči z tipů (kapitán, starosta, hospodský).
 *
 * Do 2026-10-31 se všichni generovali jen podle obce s tržním posunem: tip kapitána měl
 * na produkci průměr 40,7 a nejlepší 56, zatímco silné kluby mají jedenáctku 55–67.
 * Pro ně byl každý tip šupák.
 */
import { describe, it, expect } from "vitest";
import { createRng } from "../generators/rng";
import { adultOfferShift, type OfferSource } from "./player-offers";
import { generatePlayerSkills } from "../skills/generator";
import { MARKET_SHIFT } from "../generators/create-player";

const POSITIONS = ["DEF", "MID", "FWD", "GK"] as const;

function ratings(source: OfferSource, topEleven: number | null, seed: number, n = 1500) {
  const rng = createRng(seed);
  const out: number[] = [];
  for (let i = 0; i < n; i++) {
    const pos = POSITIONS[i % 4];
    const age = source === "recommendation" ? rng.int(28, 42) : rng.int(18, 38);
    const shift = adultOfferShift(source, "village", pos, age, topEleven, rng);
    out.push(generatePlayerSkills(rng, { position: pos, age, level: "village", shift }).rating);
  }
  return out;
}

const avg = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;

describe("tip kapitána podle jedenáctky", () => {
  it("silnému klubu přijde hráč kousek pod jedenáctkou", () => {
    const r = ratings("friend", 65, 1);
    expect(avg(r)).toBeGreaterThanOrEqual(56);
    expect(avg(r)).toBeLessThanOrEqual(64);
  });

  it("občas přijde někdo, kdo jedenáctku posílí", () => {
    const r = ratings("friend", 60, 2);
    const better = r.filter((x) => x > 60).length / r.length;
    expect(better).toBeGreaterThan(0.08);
    expect(better).toBeLessThan(0.4);
  });

  it("slabý klub dostane hráče jako dřív, ne horší", () => {
    const old = ratings("pub", 37, 3);
    const now = ratings("friend", 37, 3);
    expect(avg(now)).toBeGreaterThanOrEqual(avg(old) - 1);
  });
});

describe("starosta a hospodský", () => {
  it("starosta nabízí slabšího než kapitán", () => {
    expect(avg(ratings("recommendation", 60, 4))).toBeLessThan(avg(ratings("friend", 60, 4)));
  });

  it("hospodský se na kádr nedívá", () => {
    const rng = createRng(5);
    expect(adultOfferShift("pub", "village", "MID", 25, 65, rng)).toBe(MARKET_SHIFT);
  });

  it("bez kádru zůstává tržní posun", () => {
    const rng = createRng(6);
    expect(adultOfferShift("friend", "village", "MID", 25, null, rng)).toBe(MARKET_SHIFT);
  });
});
