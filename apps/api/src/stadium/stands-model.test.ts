import { describe, it, expect } from "vitest";
import {
  STAND_SIDES, STAND_SIDE_CAPACITY, hasStandSides, readStandLevels,
  legacyStandsToSides, standsCapacity, standsMaxLevel, standSideGain, standSideCosts,
} from "./stands-model";

const LEGACY_CAP = [0, 90, 290, 500];
const LEGACY_COST = [0, 55000, 170000, 450000];

describe("kapacita tribun po stranách", () => {
  for (const level of [0, 1, 2, 3]) {
    it(`čtyři strany na L${level} dají přesně dnešní kapacitu`, () => {
      expect(standsCapacity(legacyStandsToSides(level))).toBe(LEGACY_CAP[level]);
    });
  }

  it("smíšené úrovně se sčítají po stranách", () => {
    const l = { ...legacyStandsToSides(0), stand_main: 3, stand_goal_east: 1 };
    expect(standsCapacity(l)).toBe(STAND_SIDE_CAPACITY.stand_main[3] + STAND_SIDE_CAPACITY.stand_goal_east[1]);
    expect(standsMaxLevel(l)).toBe(3);
  });

  it("úroveň mimo 0–3 se ořízne a nečíslo je nula", () => {
    const l = readStandLevels({ stand_main: 9, stand_opposite: -2, stand_goal_west: "x", stand_goal_east: 2.4 });
    expect(l).toEqual({ stand_main: 3, stand_opposite: 0, stand_goal_west: 0, stand_goal_east: 2 });
  });

  it("chybějící řádek stadionu je čtyři nuly", () => {
    expect(readStandLevels(null)).toEqual(legacyStandsToSides(0));
    expect(readStandLevels(undefined)).toEqual(legacyStandsToSides(0));
  });

  it("hasStandSides pozná, že volající sloupce stran nepředal", () => {
    expect(hasStandSides({ stands: 2 })).toBe(false);
    expect(hasStandSides({ stand_main: 0 })).toBe(true);
  });
});

describe("ceny a přírůstky po stranách", () => {
  it("úrovně 1 a 2 stojí dohromady jako dřív (zaokrouhlení), úroveň 3 je o polovinu dražší", () => {
    for (const next of [1, 2]) {
      const sum = STAND_SIDES.reduce((s, side) => s + standSideCosts(side, LEGACY_COST)[next], 0);
      expect(Math.abs(sum - LEGACY_COST[next]), `L${next}`).toBeLessThanOrEqual(400);
    }
    const l3 = STAND_SIDES.reduce((s, side) => s + standSideCosts(side, LEGACY_COST)[3], 0);
    expect(Math.abs(l3 - LEGACY_COST[3] * 1.5)).toBeLessThanOrEqual(400);
  });

  it("přírůstek mezi úrovněmi sedí na tabulku", () => {
    expect(standSideGain("stand_main", 0, 2)).toBe(STAND_SIDE_CAPACITY.stand_main[2]);
    expect(standSideGain("stand_main", 1, 3)).toBe(STAND_SIDE_CAPACITY.stand_main[3] - STAND_SIDE_CAPACITY.stand_main[1]);
  });

  it("cena nulté úrovně je nula a ceny rostou", () => {
    for (const side of STAND_SIDES) {
      const c = standSideCosts(side, LEGACY_COST);
      expect(c[0]).toBe(0);
      expect(c[1]).toBeGreaterThan(0);
      expect(c[3]).toBeGreaterThan(c[2]);
    }
  });
});

describe("převod dnešní úrovně na strany zachová vzhled i kapacitu", () => {
  it("L1 má tribuny jen za brankami, L2 a L3 na všech čtyřech stranách (jako dosud ve 3D)", () => {
    expect(legacyStandsToSides(0)).toEqual({ stand_main: 0, stand_opposite: 0, stand_goal_west: 0, stand_goal_east: 0 });
    expect(legacyStandsToSides(1)).toEqual({ stand_main: 0, stand_opposite: 0, stand_goal_west: 1, stand_goal_east: 1 });
    expect(legacyStandsToSides(2)).toEqual({ stand_main: 2, stand_opposite: 2, stand_goal_west: 2, stand_goal_east: 2 });
    expect(legacyStandsToSides(3)).toEqual({ stand_main: 3, stand_opposite: 3, stand_goal_west: 3, stand_goal_east: 3 });
  });

  it("přírůstek každé strany s úrovní neklesá (dražší stupeň nedá míň)", () => {
    for (const side of STAND_SIDES) {
      const c = STAND_SIDE_CAPACITY[side];
      const inc = [c[1] - c[0], c[2] - c[1], c[3] - c[2]];
      expect(inc, side).toEqual([...inc].sort((a, b) => a - b));
    }
  });
});

describe("cesta na kapacitu dnešní L2 nesmí být výrazně dražší než za starých cen", () => {
  const sideCost = (side: (typeof STAND_SIDES)[number], from: number, to: number) => {
    const c = standSideCosts(side, LEGACY_COST);
    let sum = 0;
    for (let l = from + 1; l <= to; l++) sum += c[l];
    return sum;
  };
  const pathCost = (from: ReturnType<typeof legacyStandsToSides>, to: ReturnType<typeof legacyStandsToSides>) =>
    STAND_SIDES.reduce((s, side) => s + sideCost(side, from[side], to[side]), 0);

  it("od nuly na všechny strany L2 stojí 55 000 + 170 000 jako dřív", () => {
    const cost = pathCost(legacyStandsToSides(0), legacyStandsToSides(2));
    expect(Math.abs(cost - 225000)).toBeLessThanOrEqual(600);
    expect(standsCapacity(legacyStandsToSides(2))).toBe(290);
  });

  it("klub po převodu z dnešní L1 doplatí na kapacitu L2 nejvýš o 10 % víc než dřív (170 000)", () => {
    const cost = pathCost(legacyStandsToSides(1), legacyStandsToSides(2));
    expect(cost).toBeLessThanOrEqual(170000 * 1.1);
    expect(cost).toBeGreaterThanOrEqual(170000 * 0.95);
  });
});
