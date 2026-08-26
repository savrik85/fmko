/**
 * Dorostový cyklus — hlavně to, že se kádr nerozjede do nesmyslu.
 *
 * Doplňování postů je čistá funkce, takže se dá projet křížem: jde o to, aby po pár
 * sezónách nezbyli samí záložníci a ani jeden brankář, a aby doplnění vždycky dodalo
 * přesně tolik kluků, kolik chybí do cílového počtu.
 */
import { describe, it, expect } from "vitest";
import {
  vyberChybejiciPosty, CILOVY_POCET_DOROSTU, VEK_ODCHODU_Z_DOROSTU, MAX_KADR_ACKA,
} from "./u21-lifecycle";
import { vekovyNasobitel } from "../skills/generator";

describe("doplňování postů", () => {
  it("dodá přesně tolik hráčů, kolik se žádá", () => {
    for (const kolik of [1, 2, 3, 5, 8, 16]) {
      expect(vyberChybejiciPosty(new Map(), kolik)).toHaveLength(kolik);
    }
  });

  it("prázdný dorost doplní na rozumné rozložení, ne na 16 záložníků", () => {
    const posty = vyberChybejiciPosty(new Map(), 14);
    const pocty = posty.reduce<Record<string, number>>((a, p) => ({ ...a, [p]: (a[p] ?? 0) + 1 }), {});
    expect(pocty.GK).toBeGreaterThanOrEqual(1);
    expect(pocty.DEF).toBeGreaterThanOrEqual(3);
    expect(pocty.MID).toBeGreaterThanOrEqual(3);
    expect(pocty.FWD).toBeGreaterThanOrEqual(1);
  });

  it("bere post, kde je největší díra", () => {
    // Brankáři chybí oba, ostatní posty jsou plné — první doplněný musí být brankář
    const maPost = new Map([["GK", 0], ["DEF", 5], ["MID", 5], ["FWD", 2]]);
    expect(vyberChybejiciPosty(maPost, 1)[0]).toBe("GK");
  });

  it("nedoplňuje post, kterého je dost, dokud jiný chybí", () => {
    const maPost = new Map([["GK", 2], ["DEF", 5], ["MID", 1], ["FWD", 2]]);
    const posty = vyberChybejiciPosty(maPost, 4);
    expect(posty.every((p) => p === "MID")).toBe(true);
  });

  it("i po přeplnění jednoho postu vrátí platné posty", () => {
    const maPost = new Map([["GK", 9], ["DEF", 9], ["MID", 9], ["FWD", 9]]);
    const posty = vyberChybejiciPosty(maPost, 3);
    expect(posty).toHaveLength(3);
    for (const p of posty) expect(["GK", "DEF", "MID", "FWD"]).toContain(p);
  });
});

describe("hranice cyklu", () => {
  it("z dorostu se odchází dřív, než hráč přeroste kategorii", () => {
    // U21 znamená do 21 včetně — kdo má 22, tam už nepatří
    expect(VEK_ODCHODU_Z_DOROSTU).toBe(22);
  });

  it("cílový kádr dorostu stačí na sestavu i náhradníky", () => {
    expect(CILOVY_POCET_DOROSTU).toBeGreaterThanOrEqual(14);
  });

  it("áčko má strop, jinak by kádry AI klubů rostly donekonečna", () => {
    expect(MAX_KADR_ACKA).toBeGreaterThan(CILOVY_POCET_DOROSTU);
    expect(MAX_KADR_ACKA).toBeLessThanOrEqual(30);
  });
});

describe("věková křivka", () => {
  it("mezi 16 a 22 lety roste plynule, bez skoku", () => {
    for (let vek = 16; vek < 22; vek++) {
      const skok = vekovyNasobitel(vek + 1) - vekovyNasobitel(vek);
      expect(skok).toBeGreaterThan(0);
      // Dřív tu byl schod 0,7 → 1,0 mezi 19. a 20. rokem, tedy +0,30 přes noc
      expect(skok).toBeLessThan(0.06);
    }
  });

  it("dospělý věk je na plné hodnotě a stáří zase klesá", () => {
    expect(vekovyNasobitel(22)).toBe(1.0);
    expect(vekovyNasobitel(27)).toBe(1.0);
    expect(vekovyNasobitel(30)).toBeLessThan(1.0);
    expect(vekovyNasobitel(41)).toBeLessThan(vekovyNasobitel(35));
  });

  it("nejmladší ročník už není nepoužitelně slabý", () => {
    // Šestnáctiletí vycházeli na 0,7 a v dorostu se nedali použít
    expect(vekovyNasobitel(16)).toBeGreaterThan(0.75);
  });

  it("mimo rozsah nespadne pod ani nad křivku", () => {
    expect(vekovyNasobitel(14)).toBe(vekovyNasobitel(16));
    expect(vekovyNasobitel(99)).toBe(0.5);
  });
});
