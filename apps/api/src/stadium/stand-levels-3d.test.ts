/**
 * Mapování tribun po stranách na světové strany 3D scény.
 *
 * Scéna: hřiště je 40 (X) × 60 (Z). Sever a jih stojí ZA BRANKAMI, východ a západ
 * jsou na dlouhých stranách (východ je hlavní tribuna, tam sedí i lóže).
 * Logika leží ve webu a nezná React, aby šla otestovat tady.
 */
import { describe, it, expect } from "vitest";
import { getSideLevels, joinedEnds, replacedSides, vipBoxSideFor } from "../../../web/src/components/stadium/stadium-3d/stand-levels";

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

describe("joinedEnds (konce tribuny spojené s přístavbou nemají koncovou stěnu)", () => {
  it("bez přístavby se nic nespojuje", () => {
    expect(joinedEnds("east", [])).toEqual({ left: false, right: false });
  });

  it("prodloužení spojí oba konce tribuny na své straně", () => {
    expect(joinedEnds("east", [{ slot: "ext_main", kind: "length" }])).toEqual({ left: true, right: true });
    expect(joinedEnds("west", [{ slot: "ext_main", kind: "length" }])).toEqual({ left: false, right: false });
  });

  it("jiný druh na postranním místě konce nespojuje", () => {
    expect(joinedEnds("east", [{ slot: "ext_main", kind: "second_tier" }])).toEqual({ left: false, right: false });
  });

  it("křídlo v rohu spojí konec tribuny za brankou na straně rohu (sever: +X vpravo, jih: +X vlevo)", () => {
    const wingNE = [{ slot: "corner_main_goal_east", kind: "wing" }]; // východ + sever
    expect(joinedEnds("north", wingNE)).toEqual({ left: false, right: true });
    expect(joinedEnds("south", wingNE)).toEqual({ left: false, right: false });
    const wingSE = [{ slot: "corner_main_goal_west", kind: "wing" }]; // východ + jih
    expect(joinedEnds("south", wingSE)).toEqual({ left: true, right: false });
    const wingNW = [{ slot: "corner_opposite_goal_east", kind: "wing" }]; // západ + sever
    expect(joinedEnds("north", wingNW)).toEqual({ left: true, right: false });
  });
});

describe("replacedSides (točená tribuna a val nahrazují rovnou tribunu, nestojí před ní)", () => {
  it("točená tribuna a val nahradí tribunu na své straně", () => {
    const r = replacedSides([{ slot: "ext_goal_west", kind: "round_stand" }, { slot: "ext_goal_east", kind: "terrace" }]);
    expect([...r].sort()).toEqual(["north", "south"]);
  });

  it("ostatní druhy tribunu nenahrazují", () => {
    expect(replacedSides([{ slot: "ext_main", kind: "double_stand" }, { slot: "corner_main_goal_east", kind: "curved_corner" }]).size).toBe(0);
  });

  it("náhled se počítá a nahrazuje stávající přístavbu ve stejném místě", () => {
    const r = replacedSides([{ slot: "ext_goal_west", kind: "round_stand" }], { slot: "ext_goal_west", kind: "second_tier" });
    expect(r.size).toBe(0);
    expect(replacedSides([], { slot: "ext_goal_east", kind: "terrace" }).has("north")).toBe(true);
  });
});
