/**
 * Mapování tribun po stranách na světové strany 3D scény.
 *
 * Scéna: hřiště je 40 (X) × 60 (Z). Sever a jih stojí ZA BRANKAMI, východ a západ
 * jsou na dlouhých stranách (východ je hlavní tribuna, tam sedí i lóže).
 * Logika leží ve webu a nezná React, aby šla otestovat tady.
 */
import { describe, it, expect } from "vitest";
import { getSideLevels, joinedEnds, canopyPlan, raisedTierSpec, replacedSides, roofTiers, tierTop, vipBoxSideFor } from "../../../web/src/components/stadium/stadium-3d/stand-levels";

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

describe("joinedEnds u rohové tribuny (zahnutá i klín navazují na obě sousední tribuny)", () => {
  it("roh severovýchod spojí konec tribuny na severu (vpravo) a na východě (vlevo)", () => {
    const e = [{ slot: "corner_main_goal_east", kind: "curved_corner" }];
    expect(joinedEnds("north", e)).toEqual({ left: false, right: true });
    expect(joinedEnds("east", e)).toEqual({ left: true, right: false });
    expect(joinedEnds("south", e)).toEqual({ left: false, right: false });
    expect(joinedEnds("west", e)).toEqual({ left: false, right: false });
  });

  it("roh jihozápad spojí jih (vpravo, jih je otočený) a západ (vlevo)", () => {
    const e = [{ slot: "corner_opposite_goal_west", kind: "corner" }];
    expect(joinedEnds("south", e)).toEqual({ left: false, right: true });
    expect(joinedEnds("west", e)).toEqual({ left: true, right: false });
  });

  it("most a mobilní kus v rohu konce tribun nespojují", () => {
    expect(joinedEnds("north", [{ slot: "corner_main_goal_east", kind: "bridge" }])).toEqual({ left: false, right: false });
  });
});

describe("horní patra a zvednutí střechy", () => {
  it("patro leží nad tribunou, piloty nad její zadní hranou", () => {
    for (const kind of ["second_tier", "double_stand", "stilts"] as const) {
      const spec = raisedTierSpec(kind, 2, 6, 8);
      expect(spec.y0, kind).toBeGreaterThan(6);
      expect(tierTop(spec), kind).toBeGreaterThan(spec.y0);
    }
  });

  it("vyšší úroveň přidá řady a tedy výšku", () => {
    expect(tierTop(raisedTierSpec("second_tier", 3, 6, 8))).toBeGreaterThan(tierTop(raisedTierSpec("second_tier", 1, 6, 8)));
  });

  it("střecha nad patrem kryje tribunu od přední řady po zadní hranu patra", () => {
    const sideLevels = { east: 3, west: 3, north: 3, south: 3 };
    const dims = () => ({ height: 6, depth: 8 });
    const t = roofTiers([{ slot: "ext_main", kind: "double_stand", level: 2 }, { slot: "ext_opposite", kind: "footbridge", level: 3 }], sideLevels, dims);
    const east = t.east!;
    expect(east).toBeDefined();
    // Konec krytí je za patrem (aspoň za jeho přední hranou i za zadní hranou tribuny).
    expect(east.end).toBeGreaterThan(east.z0);
    expect(east.end).toBeGreaterThanOrEqual(8);
    // Střecha musí být nad nejvyšší řadou patra.
    expect(east.top).toBeGreaterThan(east.y0);
    expect(t.west).toBeUndefined();
    expect(t.north).toBeUndefined();
  });

  it("bez přístaveb se nezvedá nic", () => {
    expect(roofTiers([], { east: 2, west: 2, north: 2, south: 2 }, () => ({ height: 3.5, depth: 6 }))).toEqual({});
  });
});

describe("canopyPlan (střecha nad tribunou nesmí bránit ve výhledu)", () => {
  const DIMS: Array<[number, number]> = [[4, 1.2], [6, 3.5], [8, 6]];
  const surface = (p: ReturnType<typeof canopyPlan>, z: number) => p.roofY + (z - p.roofZ) * Math.tan(p.tilt);
  const standH = (z: number, D: number, H: number) => H * Math.max(0, Math.min(1, z / D));

  it("střecha je všude aspoň 2,2 m nad nejvyšším divákem pod ní a není příliš skloněná", () => {
    for (const [D, H] of DIMS) {
      for (const roofLevel of [1, 2, 3]) {
        const p = canopyPlan(D, H, roofLevel);
        expect(p.tilt, `D${D}`).toBeLessThanOrEqual(0.15);
        const z0 = p.roofZ - p.roofDepth / 2;
        const z1 = p.roofZ + p.roofDepth / 2;
        for (let i = 0; i <= 20; i++) {
          const z = z0 + ((z1 - z0) * i) / 20;
          expect(surface(p, z), `D${D} H${H} z${z.toFixed(1)}`).toBeGreaterThanOrEqual(standH(z, D, H) + 2.2 - 1e-6);
        }
      }
    }
  });

  it("nad tribunou s patrem je střecha celá nad nejvyšší řadou patra a krytí sahá za jeho zadní hranu", () => {
    const tierSpec = raisedTierSpec("double_stand", 3, 6, 8);
    const tier = { y0: tierSpec.y0, z0: tierSpec.z0, top: tierTop(tierSpec), end: Math.max(8, tierSpec.z0 + tierSpec.rows * tierSpec.rowDepth) };
    const p = canopyPlan(8, 6, 2, tier);
    expect(p.tilt).toBeLessThanOrEqual(0.12);
    expect(p.roofZ + p.roofDepth / 2).toBeGreaterThanOrEqual(tier.end);
    for (let i = 0; i <= 10; i++) {
      const z = tier.z0 + ((tier.end - tier.z0) * i) / 10;
      expect(surface(p, z)).toBeGreaterThanOrEqual(tier.top + 2.0);
    }
  });

  it("vyšší tribuna má vyšší střechu", () => {
    expect(canopyPlan(8, 6, 2).roofY).toBeGreaterThan(canopyPlan(4, 1.2, 2).roofY);
  });
});

describe("canopyPlan: souvislost střech", () => {
  it("střecha je vodorovná, aby na sebe sousední střechy navazovaly ve stejné výšce", () => {
    for (const [D, H] of [[4, 1.2], [6, 3.5], [8, 6]] as Array<[number, number]>) {
      expect(canopyPlan(D, H, 2).tilt).toBe(0);
    }
  });

  it("dvě tribuny stejné velikosti mají střechu ve stejné výšce a ve stejném rozsahu od přední hrany", () => {
    const a = canopyPlan(8, 6, 2);
    const b = canopyPlan(8, 6, 2);
    expect(a.roofY).toBe(b.roofY);
    expect(a.roofZ - a.roofDepth / 2).toBe(b.roofZ - b.roofDepth / 2);
  });
});
