import { describe, expect, it } from "vitest";
import { CATEGORIES, getBazarPriceBand, getPawnQuote } from "../equipment/equipment-generator";
import { createRng } from "../generators/rng";
import { gameExpiry } from "../lib/game-time";
import { seedFromString } from "../lib/seed";
import { cenaKradenehoZbozi, denBazaru, jePoznatelne, jmenoProdejce, kradeneZbozi, lzeNahlasit, oznaceniInzeratu } from "./bazar";
import type { Ztrata } from "./typy";

const DNES = "2026-09-16T16:00:00.000Z";
const DRESY: Ztrata[] = [{ typ: "vybaveni", kategorie: "jerseys", uroven: 2, stav: 70, urovniDolu: 2 }];
const los = (id: string) => createRng(seedFromString(`bazar|${id}`));

describe("cena kradeného zboží", () => {
  it("nikdy pod výkupem zastavárny, pro všechny kategorie, úrovně a stavy", () => {
    for (const k of CATEGORIES) {
      for (let lv = 1; lv <= 3; lv++) {
        for (let s = 0; s <= 100; s += 5) {
          const cena = cenaKradenehoZbozi(k, lv, s);
          expect(cena, `${k} ${lv} ${s}`).toBeGreaterThanOrEqual(getBazarPriceBand(k, lv, s).min);
          expect(cena, `${k} ${lv} ${s}`).toBeGreaterThanOrEqual(getPawnQuote(k, lv, s));
        }
      }
    }
  });

  it("je levnější než běžná doporučená cena", () => {
    expect(cenaKradenehoZbozi("team_van", 2, 100)).toBeLessThan(getBazarPriceBand("team_van", 2, 100).suggested);
  });
});

describe("poznání", () => {
  it.each([
    ["jerseys", 1, false], ["jerseys", 2, true], ["team_van", 2, false], ["team_van", 3, true],
    ["trophy_case", 1, true], ["fan_drums", 1, false], ["fan_drums", 2, true], ["balls", 3, false], ["area_security", 3, false],
  ] as const)("%s úroveň %i: %s", (kategorie, uroven, ano) => {
    expect(jePoznatelne(kategorie, uroven)).toBe(ano);
  });
});

describe("co zloděj odnesl", () => {
  it("jen celé vybavení úrovně 1 až 3, ne opotřebení ani stadion", () => {
    expect(kradeneZbozi([
      ...DRESY,
      { typ: "vybaveni_stav", kategorie: "team_van", stavPred: 80, stavPo: 40 },
      { typ: "stadion", zarizeni: "fence", urovni: 1 },
      { typ: "vybaveni", kategorie: "balls", uroven: 0, stav: 50, urovniDolu: 0 },
    ])).toEqual(DRESY);
  });
});

describe("den bazaru", () => {
  it("jen prodejné krádeže s odneseným vybavením", () => {
    for (let i = 0; i < 50; i++) {
      expect(denBazaru("vandal", DRESY, DNES, los(`v${i}`))).toBeNull();
      expect(denBazaru("vloupani_sklad", [{ typ: "vybaveni_stav", kategorie: "team_van", stavPred: 80, stavPo: 40 }], DNES, los(`s${i}`))).toBeNull();
    }
  });

  it("zhruba 60 % krádeží, 1 až 5 herních dní po vzniku", () => {
    const povolene = [1, 2, 3, 4, 5].map((d) => gameExpiry(DNES, d));
    let vBazaru = 0;
    for (let i = 0; i < 400; i++) {
      const den = denBazaru("vloupani_sklad", DRESY, DNES, los(`inc-${i}`));
      if (den === null) continue;
      vBazaru++;
      expect(povolene).toContain(den);
    }
    expect(vBazaru / 400).toBeGreaterThan(0.5);
    expect(vBazaru / 400).toBeLessThan(0.7);
  });

  it("stejný incident dá stejný den", () => {
    expect(denBazaru("vitrina", DRESY, DNES, los("inc-x"))).toBe(denBazaru("vitrina", DRESY, DNES, los("inc-x")));
  });
});

describe("prodejce", () => {
  it("obec z okresu v 1. pádě, bez obcí záložní", () => {
    for (let i = 0; i < 30; i++) {
      const jmeno = jmenoProdejce(["Volary"], createRng(i));
      expect(jmeno).toMatch(/^(Láďa|Pepík|Franta|Jirka|Mirek|Standa|Honza|Zdeněk), Volary$/);
    }
    expect(jmenoProdejce([], createRng(1))).toMatch(/, (Lhota|Újezd|Dvory|Zálesí)$/);
  });
});

describe("lze nahlásit policii", () => {
  it.each([
    [{ status: "otevreny", category: "kradez", odhalen: false, policieVysledek: null }, true, "otevřený, kategorie kradez, neodhalený, policie ještě nešetřila"],
    [{ status: "otevreny", category: "poskozeni", odhalen: false, policieVysledek: null }, true, "otevřený, kategorie poskozeni"],
    [{ status: "otevreny", category: "zivotni", odhalen: false, policieVysledek: null }, false, "jiná kategorie"],
    [{ status: "otevreny", category: "kradez", odhalen: true, policieVysledek: null }, false, "pachatel už odhalený"],
    [{ status: "otevreny", category: "kradez", odhalen: false, policieVysledek: 0 }, false, "policie už jednou neuspěla"],
    [{ status: "policie", category: "kradez", odhalen: false, policieVysledek: null }, true, "policie právě šetří, pachatel neodhalený"],
    [{ status: "policie", category: "kradez", odhalen: true, policieVysledek: null }, false, "policie šetří, ale udání odhaleného pachatele (M2)"],
    [{ status: "uzavreny", category: "kradez", odhalen: false, policieVysledek: null }, false, "incident je uzavřený"],
  ] as const)("%j -> %s (%s)", (i, ocekavano, _popis) => {
    expect(lzeNahlasit(i)).toBe(ocekavano);
  });
});

describe("co vidí klub v bazaru", () => {
  const setri = { status: "otevreny", category: "kradez", odhalen: false, policieVysledek: null };
  const inzerat = { teamId: null, isAiListing: false, incidentId: "inc-1", incidentTeamId: "tym-a", category: "jerseys", level: 2, incident: setri };

  it("okradený klub pozná poznatelné zboží, dostane id incidentu a smí nahlásit", () => {
    expect(oznaceniInzeratu(inzerat, "tym-a")).toEqual({ isPrivateListing: true, vypadaJakoVase: true, incidentId: "inc-1", lzeNahlasit: true });
  });

  it("cizí klub vidí jen soukromý inzerát a nesmí nahlásit", () => {
    expect(oznaceniInzeratu(inzerat, "tym-b")).toEqual({ isPrivateListing: true, vypadaJakoVase: false, incidentId: null, lzeNahlasit: false });
  });

  it("nepoznatelné zboží nepozná ani okradený klub, nesmí nahlásit", () => {
    expect(oznaceniInzeratu({ ...inzerat, category: "balls" }, "tym-a")).toEqual({ isPrivateListing: true, vypadaJakoVase: false, incidentId: null, lzeNahlasit: false });
  });

  it("nahlásit nejde, když už na incidentu nemá smysl (uzavřený, odhalený, ...)", () => {
    expect(oznaceniInzeratu({ ...inzerat, incident: { ...setri, status: "uzavreny" } }, "tym-a").lzeNahlasit).toBe(false);
  });

  it("bez incidentu (běžný nebo AI inzerát) nahlásit nejde", () => {
    expect(oznaceniInzeratu({ ...inzerat, incident: null }, "tym-a").lzeNahlasit).toBe(false);
  });

  it("inzeráty klubů a okolí nejsou soukromé", () => {
    expect(oznaceniInzeratu({ ...inzerat, teamId: "tym-c", incidentId: null, incidentTeamId: null }, "tym-a").isPrivateListing).toBe(false);
    expect(oznaceniInzeratu({ ...inzerat, isAiListing: true, incidentId: null, incidentTeamId: null }, "tym-a").isPrivateListing).toBe(false);
  });
});
