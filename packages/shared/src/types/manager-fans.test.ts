/**
 * Vliv trenéra na fanoušky.
 *
 * Vzniklo z konkrétní stížnosti: trenéři vyhrávali a dostávali po zápase
 * mínus. Vzorec totiž znal jen kariéru a povahu, ne to, jak se týmu daří teď.
 * Testy hlídají hlavně, že se vyhrávání pozná.
 */
import { describe, it, expect } from "vitest";
import {
  MANAGER_FANS, managerInfluence, managerFansEffect, managerFansBand, formaSkore,
} from "./manager-fans";

describe("skóre formy", () => {
  it("bez odehraného zápasu je neutrál, ne nula", () => {
    expect(formaSkore({ vyher: 0, remiz: 0, proher: 0 })).toBe(50);
  });

  it("pět výher z prvního místa je skoro sto", () => {
    expect(formaSkore({ vyher: 5, remiz: 0, proher: 0, pozice: 1, tymu: 12 })).toBeGreaterThan(95);
  });

  it("pět proher z posledního místa je skoro nula", () => {
    expect(formaSkore({ vyher: 0, remiz: 0, proher: 5, pozice: 12, tymu: 12 })).toBeLessThan(5);
  });

  it("body váží víc než postavení, ale postavení se počítá", () => {
    const lidrCoNehraje = formaSkore({ vyher: 0, remiz: 2, proher: 3, pozice: 1, tymu: 12 });
    const posledniCoLetí = formaSkore({ vyher: 4, remiz: 1, proher: 0, pozice: 12, tymu: 12 });
    expect(posledniCoLetí).toBeGreaterThan(lidrCoNehraje);
    // Ale ani jeden není extrém: obojí se do výsledku promítá.
    expect(lidrCoNehraje).toBeGreaterThan(10);
    expect(posledniCoLetí).toBeLessThan(90);
  });

  it("bez známé pozice se počítá jen z bodů a nespadne", () => {
    expect(formaSkore({ vyher: 3, remiz: 1, proher: 1 })).toBeGreaterThan(50);
    expect(formaSkore({ vyher: 0, remiz: 0, proher: 3, pozice: null, tymu: null })).toBe(0);
  });

  it("nikdy nevyleze z rozsahu 0 až 100", () => {
    for (const o of [
      { vyher: 99, remiz: 0, proher: 0, pozice: 1, tymu: 2 },
      { vyher: 0, remiz: 0, proher: 99, pozice: 50, tymu: 2 },
      { vyher: 1, remiz: 1, proher: 1, pozice: 0, tymu: 1 },
    ]) {
      const v = formaSkore(o);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(100);
    }
  });
});

describe("vliv trenéra", () => {
  it("váhy dávají dohromady jedničku, jinak by vliv utekl ze škály", () => {
    const soucet = MANAGER_FANS.REP_WEIGHT + MANAGER_FANS.MOT_WEIGHT + MANAGER_FANS.FORM_WEIGHT;
    expect(soucet).toBeCloseTo(1, 5);
  });

  it("běžný trenér ve středu tabulky vyjde na neutrál, ne do mínusu", () => {
    // Reálné hodnoty z testovacího účtu, který si stěžoval.
    const vliv = managerInfluence(40, 42, 50);
    expect(vliv).toBeGreaterThanOrEqual(MANAGER_FANS.NEUTRAL - 1);
    expect(managerFansBand(vliv).matchBoost).toBe(0);
  });

  it("nováček, který vyhrává ligu, není odepsaný", () => {
    const vliv = managerInfluence(40, 42, formaSkore({ vyher: 4, remiz: 1, proher: 0, pozice: 1, tymu: 12 }));
    expect(managerFansBand(vliv).matchBoost).toBeGreaterThan(0);
  });

  it("matador na posledním místě není uznávaný", () => {
    const vliv = managerInfluence(75, 53, formaSkore({ vyher: 0, remiz: 0, proher: 5, pozice: 12, tymu: 12 }));
    expect(managerFansBand(vliv).matchBoost).toBeLessThanOrEqual(0);
  });

  it("při stejné kariéře rozhoduje forma", () => {
    const vyhrava = managerInfluence(40, 42, 95);
    const prohrava = managerInfluence(40, 42, 5);
    expect(vyhrava - prohrava).toBeGreaterThan(25);
  });

  it("rozpad sedí na výsledný vliv", () => {
    const fx = managerFansEffect(50, 60, 70);
    // Složky se zaokrouhlují na desetinu, vliv na celé číslo, takže se smí
    // rozejít nejvýš o půl bodu.
    expect(Math.abs(fx.repPoints + fx.motPoints + fx.formPoints - fx.influence)).toBeLessThanOrEqual(0.5);
    expect(fx.forma).toBe(70);
  });

  it("chybějící forma se bere jako neutrál, ne jako nula", () => {
    expect(managerInfluence(40, 42)).toBe(managerInfluence(40, 42, 50));
  });

  it("nepřeteče ani na extrémech", () => {
    expect(managerInfluence(999, 999, 999)).toBeLessThanOrEqual(100);
    expect(managerInfluence(-999, -999, -999)).toBeGreaterThanOrEqual(0);
  });
});
