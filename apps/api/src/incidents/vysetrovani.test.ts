import { describe, expect, it } from "vitest";
import { createRng } from "../generators/rng";
import { hrac, PROBLEMOVY } from "./testovaci-stav";
import type { Stopa } from "./typy";
import {
  dostupneAkce, nactiObvineni, rozhodniObvineni, sancePolicie, sancePriznani, stavVysetrovani,
  stopaNaHrace, vysledekPolicie, type IncidentProAkce,
} from "./vysetrovani";

function stopa(over: Partial<Stopa> = {}): Stopa {
  return { id: "s1", zdroj: "spravce", ukazujeNa: null, podezreli: null, drzitel: null, sila: 2, bonusPolicie: 0, text: "Stopa.", nalezena: true, ...over };
}

describe("stav vyšetřování", () => {
  it("odhalený pachatel je známý", () => {
    expect(stavVysetrovani([stopa({ ukazujeNa: "p" })], true)).toEqual({ stav: "znamy", podezreli: [] });
  });

  it("nalezené stopy dají sjednocení podezřelých, nenalezené se nepočítají", () => {
    const stopy = [stopa({ ukazujeNa: "p" }), stopa({ podezreli: ["a", "p"] }), stopa({ ukazujeNa: "x", nalezena: false })];
    expect(stavVysetrovani(stopy, false)).toEqual({ stav: "podezreli", podezreli: ["a", "p"] });
  });

  it("bez nalezené stopy s identitou je pachatel neznámý", () => {
    expect(stavVysetrovani([stopa(), stopa({ ukazujeNa: "p", nalezena: false })], false)).toEqual({ stav: "neznamy", podezreli: [] });
  });

  it("stopa na hráče počítá přímé ukázání i podezřelé, ne nenalezené", () => {
    expect(stopaNaHrace([stopa({ podezreli: ["p", "a"] })], "a")).toBe(true);
    expect(stopaNaHrace([stopa({ ukazujeNa: "a", nalezena: false })], "a")).toBe(false);
  });
});

describe("obvinění", () => {
  it("šance na přiznání podle povahy, se stopou o 30 bodů vyšší, v mezích 0 až 100", () => {
    const h = hrac({ disciplina: 70, temperament: 40, vztahKTrenerovi: 60 });
    expect(sancePriznani(h, false)).toBeCloseTo(190 / 3 - 20);
    expect(sancePriznani(h, true)).toBeCloseTo(190 / 3 + 10);
    expect(sancePriznani(hrac({ disciplina: 0, temperament: 100, vztahKTrenerovi: 0 }), false)).toBe(0);
    expect(sancePriznani(hrac({ disciplina: 100, temperament: 0, vztahKTrenerovi: 100 }), true)).toBe(100);
  });

  it("nevinný vždy zapírá", () => {
    for (let s = 1; s <= 100; s++) {
      expect(rozhodniObvineni({ obvineny: hrac({ id: "a" }), pachatelId: "p", stopy: [], rng: createRng(s) }))
        .toEqual({ vysledek: "zapira", vinen: false });
    }
  });

  it("pachatel se stopou nikdy jen nezapírá, bez stopy nikdy není usvědčen", () => {
    const seStopou = [stopa({ ukazujeNa: "p" })];
    for (let s = 1; s <= 200; s++) {
      expect(rozhodniObvineni({ obvineny: PROBLEMOVY, pachatelId: "p", stopy: seStopou, rng: createRng(s) }).vysledek).not.toBe("zapira");
      expect(rozhodniObvineni({ obvineny: PROBLEMOVY, pachatelId: "p", stopy: [], rng: createRng(s) }).vysledek).not.toBe("usvedcen");
    }
  });

  it("u cizího pachatele je každý obviněný nevinný", () => {
    expect(rozhodniObvineni({ obvineny: PROBLEMOVY, pachatelId: null, stopy: [], rng: createRng(1) }).vinen).toBe(false);
  });

  it("rozbitý JSON obvinění dá prázdný seznam", () => {
    expect(nactiObvineni("{x")).toEqual([]);
    expect(nactiObvineni('[{"playerId":"a","jmeno":"Adam Kos","den":"2026-09-16","vysledek":"zapira"}]')).toHaveLength(1);
  });
});

describe("policie", () => {
  it("šance: základ, jen nalezené stopy, policista, strop", () => {
    expect(sancePolicie([], false)).toBeCloseTo(0.15);
    expect(sancePolicie([stopa({ bonusPolicie: 0.35 }), stopa({ bonusPolicie: 0.15, nalezena: false })], false)).toBeCloseTo(0.5);
    expect(sancePolicie([], true)).toBeCloseTo(0.25);
    expect(sancePolicie([stopa({ bonusPolicie: 0.35 }), stopa({ bonusPolicie: 0.35 }), stopa({ bonusPolicie: 0.35 })], true)).toBeCloseTo(0.9);
  });

  it("výsledek podle udání, losu a pachatele", () => {
    expect(vysledekPolicie({ udani: true, pachatel: "hrac", sance: 0, los: 0.99 })).toBe("podminka");
    expect(vysledekPolicie({ udani: false, pachatel: "hrac", sance: 0.3, los: 0.3 })).toBe("neuspech");
    expect(vysledekPolicie({ udani: false, pachatel: "hrac", sance: 0.3, los: 0.29 })).toBe("odhalen_hrac");
    expect(vysledekPolicie({ udani: false, pachatel: "cizi", sance: 0.3, los: 0.1 })).toBe("dopaden_cizi");
    expect(vysledekPolicie({ udani: false, pachatel: "nikdo", sance: 0.3, los: 0.1 })).toBe("nehoda");
    expect(vysledekPolicie({ udani: false, pachatel: "zamestnanec", sance: 0.3, los: 0.1 })).toBe("neuspech");
  });
});

describe("dostupné akce", () => {
  const zaklad: IncidentProAkce = {
    status: "otevreny", category: "kradez", culpritType: "hrac", odhalen: false,
    obvineni: 0, policieVysledek: null, pachatelVKadru: true,
  };
  const nic = { obvinit: false, policie: false, tresty: [] };

  it("neodhalený incident: obvinit a policie, tresty ne", () => {
    expect(dostupneAkce(zaklad)).toEqual({ obvinit: true, policie: true, tresty: [] });
  });

  it("dvě obvinění a jedno šetření policie stačí", () => {
    expect(dostupneAkce({ ...zaklad, obvineni: 2 }).obvinit).toBe(false);
    expect(dostupneAkce({ ...zaklad, policieVysledek: 0 }).policie).toBe(false);
  });

  it("odhalený pachatel v kádru: tresty, předat policii jen když ještě nešetřila", () => {
    expect(dostupneAkce({ ...zaklad, odhalen: true })).toEqual({
      obvinit: false, policie: false, tresty: ["odpustit", "srazka", "pokuta", "vyhodit", "policie", "nechat_byt"],
    });
    expect(dostupneAkce({ ...zaklad, odhalen: true, policieVysledek: 1 }).tresty).not.toContain("policie");
  });

  it("pachatel mimo kádr, šetření policie, uzavřený incident a životní situace nedovolí nic", () => {
    expect(dostupneAkce({ ...zaklad, odhalen: true, pachatelVKadru: false })).toEqual(nic);
    expect(dostupneAkce({ ...zaklad, status: "policie" })).toEqual(nic);
    expect(dostupneAkce({ ...zaklad, status: "uzavreny" })).toEqual(nic);
    expect(dostupneAkce({ ...zaklad, category: "zivotni" })).toEqual(nic);
  });
});
