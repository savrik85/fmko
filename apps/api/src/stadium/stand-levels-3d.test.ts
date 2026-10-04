/**
 * Mapování tribun po stranách na světové strany 3D scény.
 *
 * Scéna: hřiště je 40 (X) × 60 (Z). Sever a jih stojí ZA BRANKAMI, východ a západ
 * jsou na dlouhých stranách (východ je hlavní tribuna, tam sedí i lóže).
 * Logika leží ve webu a nezná React, aby šla otestovat tady.
 */
import { describe, it, expect } from "vitest";
import { getSideLevels, vipBoxSideFor } from "../../../web/src/components/stadium/stadium-3d/stand-levels";

describe("getSideLevels", () => {
  it("strany tribun míří na světové strany", () => {
    expect(getSideLevels({ stands: 3, stand_main: 3, stand_opposite: 2, stand_goal_west: 1, stand_goal_east: 0 }))
      .toEqual({ east: 3, west: 2, south: 1, north: 0 });
  });

  it("bez sloupců stran platí starý model: za brankami vždy, na bocích od L2", () => {
    expect(getSideLevels({ stands: 1 })).toEqual({ north: 1, south: 1, east: 0, west: 0 });
    expect(getSideLevels({ stands: 2 })).toEqual({ north: 2, south: 2, east: 2, west: 2 });
    expect(getSideLevels({})).toEqual({ north: 0, south: 0, east: 0, west: 0 });
  });

  it("úroveň se ořízne na 0–3", () => {
    expect(getSideLevels({ stand_main: 9, stand_opposite: -1, stand_goal_west: 0, stand_goal_east: 0 }).east).toBe(3);
    expect(getSideLevels({ stand_main: 9, stand_opposite: -1, stand_goal_west: 0, stand_goal_east: 0 }).west).toBe(0);
  });
});

describe("vipBoxSideFor", () => {
  const L = (north: number, south: number, east: number, west: number) => ({ north, south, east, west });

  it("shoduje se se starým chováním: L2+ východ, L1 sever", () => {
    expect(vipBoxSideFor(L(2, 2, 2, 2), "south")).toBe("east");
    expect(vipBoxSideFor(L(1, 1, 0, 0), "south")).toBe("north");
  });

  it("kotel lóži nepřebije", () => {
    expect(vipBoxSideFor(L(2, 2, 2, 2), "east")).toBe("west");
    expect(vipBoxSideFor(L(1, 1, 0, 0), "north")).toBe("south");
  });

  it("lóže se staví jen tam, kde tribuna stojí", () => {
    expect(vipBoxSideFor(L(0, 0, 0, 3), "south")).toBe("west");
    expect(vipBoxSideFor(L(0, 0, 0, 0), "south")).toBeNull();
    expect(vipBoxSideFor(L(0, 0, 0, 1), "west")).toBeNull();
  });
});
