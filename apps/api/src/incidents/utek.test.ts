import { describe, expect, it } from "vitest";
import { hrac, stavKlubu } from "./testovaci-stav";
import { castkaUteku, kandidatiUteku, type SignalyUteku } from "./utek";

describe("kdo může utéct s penězi (spec 4a)", () => {
  const signal = (o: Partial<SignalyUteku> = {}): SignalyUteku =>
    ({ dluhyOdeDne: "2026-09-01", zadalOZalohu: true, mluviloSeVHospode: true, ...o });

  it("bez dluhů nikdo neutíká", () => {
    expect(kandidatiUteku(stavKlubu({ rozpocet: 100000 }), new Map())).toEqual([]);
  });

  it("věrný hráč neutíká ani s dluhy", () => {
    const h = hrac({ id: "a", vernost: 80 });
    const s = stavKlubu({ kadr: [h], rozpocet: 100000 });
    expect(kandidatiUteku(s, new Map([["a", signal()]]))).toEqual([]);
  });

  it("chybějící varovný signál útěk zakáže", () => {
    const h = hrac({ id: "a", vernost: 20 });
    const s = stavKlubu({ kadr: [h], rozpocet: 100000 });
    expect(kandidatiUteku(s, new Map([["a", signal({ zadalOZalohu: false })]]))).toEqual([]);
    expect(kandidatiUteku(s, new Map([["a", signal({ mluviloSeVHospode: false })]]))).toEqual([]);
    expect(kandidatiUteku(s, new Map([["a", signal()]])).map((x) => x.id)).toEqual(["a"]);
  });

  it("dluhy musí běžet aspoň týden, jinak trenér neměl šanci si všimnout", () => {
    const h = hrac({ id: "a", vernost: 20 });
    const s = stavKlubu({ kadr: [h], rozpocet: 100000, den: "2026-09-16" });
    expect(kandidatiUteku(s, new Map([["a", signal({ dluhyOdeDne: "2026-09-12" })]]))).toEqual([]);
    expect(kandidatiUteku(s, new Map([["a", signal({ dluhyOdeDne: "2026-09-09" })]])).map((x) => x.id)).toEqual(["a"]);
  });

  it("chudý klub nikoho neláká", () => {
    const h = hrac({ id: "a", vernost: 20 });
    expect(kandidatiUteku(stavKlubu({ kadr: [h], rozpocet: 5000 }), new Map([["a", signal()]]))).toEqual([]);
  });

  it("pořadí kádru se neztrácí, los nad ním musí být stabilní", () => {
    const a = hrac({ id: "a", vernost: 20 });
    const b = hrac({ id: "b", vernost: 20 });
    const c = hrac({ id: "c", vernost: 20 });
    const s = stavKlubu({ kadr: [c, a, b], rozpocet: 100000 });
    const signaly = new Map([["a", signal()], ["b", signal()], ["c", signal()]]);
    expect(kandidatiUteku(s, signaly).map((x) => x.id)).toEqual(["c", "a", "b"]);
  });

  it("částka je nejvýš desetina rozpočtu a nejvýš 40 000, bez losu", () => {
    expect(castkaUteku(stavKlubu({ rozpocet: 100000 }))).toBeLessThanOrEqual(10000);
    expect(castkaUteku(stavKlubu({ rozpocet: 9000000 }))).toBeLessThanOrEqual(40000);
    // Deterministické: stejný rozpočet dá vždycky stejnou částku, i bez rng.
    expect(castkaUteku(stavKlubu({ rozpocet: 250000 }))).toBe(castkaUteku(stavKlubu({ rozpocet: 250000 })));
  });
});
