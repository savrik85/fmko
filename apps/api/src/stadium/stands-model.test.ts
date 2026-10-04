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
  it("součet cen čtyř stran za jednu úroveň se od staré ceny liší nejvýš o zaokrouhlení", () => {
    for (const next of [1, 2, 3]) {
      const sum = STAND_SIDES.reduce((s, side) => s + standSideCosts(side, LEGACY_COST)[next], 0);
      expect(Math.abs(sum - LEGACY_COST[next])).toBeLessThanOrEqual(400);
    }
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
