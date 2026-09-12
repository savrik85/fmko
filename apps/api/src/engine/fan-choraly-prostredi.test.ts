/**
 * Chorály, prostředí stadionu a klec.
 *
 * Společné téma: fanoušci mají reagovat na věci, které se dějí kolem nich,
 * a každá parta jinak. Testy hlídají hlavně to, že se party neshodnou na
 * všem a že klec zabírá jen tam, kam míří.
 */
import { describe, it, expect } from "vitest";
import { vymysliChoraly, silaPo, PRAH_ZAPOMENUTI, chantSilaWord, type ChantStav } from "./fan-chants";
import { incidentWeights } from "./fan-groups";
import { SKALY } from "../stadium/stadium-generator";
import { dopadProstredi, type StavProstredi } from "../fans/fan-prostredi";

const stav = (o: Partial<ChantStav> = {}): ChantStav => ({
  oblibenec: null, rival: null, trener: "Karel Klement",
  kampanProtiTreneru: false, serie: 0, nalada: 55, heat: 10,
  stiznostNaVybaveni: null, klub: "Prales", ...o,
});

describe("chorály", () => {
  it("klidný klub bez miláčka a bez rivala nezpívá nic", () => {
    expect(vymysliChoraly(stav(), 0.5)).toHaveLength(0);
  });

  it("miláček dostane svůj chorál se svým příjmením", () => {
    const ch = vymysliChoraly(stav({ oblibenec: "Jan Kolman" }), 0.1);
    expect(ch.some((c) => c.kind === "oblibenec" && c.text.toUpperCase().includes("KOLMAN"))).toBe(true);
  });

  it("proti trenérovi se zpívá jen při podpisovce, jinak se mu děkuje", () => {
    const proti = vymysliChoraly(stav({ kampanProtiTreneru: true }), 0.2);
    expect(proti.some((c) => c.kind === "trener_proti")).toBe(true);
    expect(proti.some((c) => c.kind === "trener_pro")).toBe(false);

    const pro = vymysliChoraly(stav({ serie: 4 }), 0.2);
    expect(pro.some((c) => c.kind === "trener_pro")).toBe(true);
  });

  it("vzdor přijde, až když je zle", () => {
    expect(vymysliChoraly(stav({ nalada: 60, heat: 10 }), 0.3).some((c) => c.kind === "vzdor")).toBe(false);
    expect(vymysliChoraly(stav({ nalada: 20 }), 0.3).some((c) => c.kind === "vzdor")).toBe(true);
    expect(vymysliChoraly(stav({ heat: 70 }), 0.3).some((c) => c.kind === "vzdor")).toBe(true);
  });

  it("na každý důvod nejvýš jeden chorál", () => {
    const ch = vymysliChoraly(stav({
      oblibenec: "Jan Kolman", rival: { nazev: "Sokol", heat: 80 },
      kampanProtiTreneru: true, serie: -3, nalada: 15, heat: 80,
      stiznostNaVybaveni: "záchody",
    }), 0.4);
    const druhy = ch.map((c) => c.kind);
    expect(new Set(druhy).size).toBe(druhy.length);
  });

  it("každý chorál nese důvod i text", () => {
    for (const c of vymysliChoraly(stav({ oblibenec: "Jan Kolman", rival: { nazev: "Sokol", heat: 70 } }), 0.6)) {
      expect(c.text.length).toBeGreaterThan(5);
      expect(c.duvod.length).toBeGreaterThan(5);
    }
  });

  it("chorál sílí, dokud důvod trvá, a jinak se zapomene", () => {
    expect(silaPo(50, true)).toBeGreaterThan(50);
    expect(silaPo(50, false)).toBeLessThan(50);
    let s = 40;
    for (let i = 0; i < 5; i++) s = silaPo(s, false);
    expect(s).toBeLessThan(PRAH_ZAPOMENUTI);
  });

  it("síla se nikdy nedostane mimo rozsah", () => {
    expect(silaPo(100, true)).toBeLessThanOrEqual(100);
    expect(silaPo(0, false)).toBe(0);
    expect(chantSilaWord(95)).toBe("zpívá celý kotel");
  });
});

describe("klec nad kotlem", () => {
  const opts = { awayUltrasPresent: true, sector: "kotel" as const };

  it("bez klece se vniknutí i házení nabízí", () => {
    const v = incidentWeights("kotel", { ...opts, cageBlok: 0 });
    expect(v.vniknuti).toBeGreaterThan(0);
    expect(v.hazeni).toBeGreaterThan(0);
  });

  it("klec sráží jen vniknutí a házení, pyro a rvačka zůstávají", () => {
    const bez = incidentWeights("kotel", { ...opts, cageBlok: 0 });
    const s = incidentWeights("kotel", { ...opts, cageBlok: 0.85 });
    expect(s.vniknuti).toBeLessThan(bez.vniknuti);
    expect(s.hazeni).toBeLessThan(bez.hazeni);
    expect(s.pyro).toBe(bez.pyro);
    expect(s.bitka_kotle).toBe(bez.bitka_kotle);
  });

  it("plná klec ty dva skutky z výběru vyhodí úplně", () => {
    const s = incidentWeights("kotel", { ...opts, cageBlok: 1 });
    expect(s.vniknuti).toBeUndefined();
    expect(s.hazeni).toBeUndefined();
    expect(Object.keys(s).length).toBeGreaterThan(0);
  });

  it("klec stojí kotel náladu, jinak by to byla volba bez ceny", () => {
    expect(SKALY.cage.heatZaZapas[1]).toBeGreaterThan(0);
    expect(SKALY.cage.tlumeniHlasu[1]).toBeGreaterThan(0);
    expect(SKALY.cage.vniknutiHazeni[1]).toBeGreaterThan(0);
  });
});

describe("stav stadionu a občerstvení", () => {
  const prostredi = (o: Partial<StavProstredi> = {}): StavProstredi => ({
    facilities: { toilets: 2, roof: 2, stands: 2, parking: 2, ultras_stand: 2, refreshments: 2 },
    pitchCondition: 70,
    produkty: [{ key: "beer", quality: 2, priceRatio: 1 }],
    ...o,
  });

  it("rozbitý stadion náladu sráží, vybavený zvedá", () => {
    const bida = dopadProstredi({ kind: "rodiny", id: "g" }, prostredi({
      facilities: { toilets: 0, roof: 0, stands: 0, parking: 0, ultras_stand: 0, refreshments: 0 },
      produkty: [],
    }));
    const paradа = dopadProstredi({ kind: "rodiny", id: "g" }, prostredi({
      facilities: { toilets: 3, roof: 3, stands: 3, parking: 3, ultras_stand: 3, refreshments: 3 },
      produkty: [{ key: "beer", quality: 3, priceRatio: 0.9 }],
    }));
    expect(bida.mood).toBeLessThan(0);
    expect(paradа.mood).toBeGreaterThan(0);
  });

  it("každá parta řeší něco jiného: rodiny záchody, štamgasti pivo", () => {
    // Zbytek stadionu je průměrný, ať je vidět jen ten jeden rozdíl.
    const bezZachodu = prostredi({ facilities: { toilets: 0, roof: 2, stands: 2, parking: 2, ultras_stand: 2, refreshments: 2 } });
    const bezPiva = prostredi({ facilities: { toilets: 2, roof: 2, stands: 2, parking: 2, ultras_stand: 2, refreshments: 0 }, produkty: [] });

    // Chybějící záchody vezmou rodinám víc než štamgastům.
    const rodiny = dopadProstredi({ kind: "rodiny", id: "g" }, bezZachodu);
    const stamgasti = dopadProstredi({ kind: "stamgasti", id: "g" }, bezZachodu);
    expect(rodiny.mood).toBeLessThan(stamgasti.mood);
    expect(rodiny.duvod).toContain("záchody");

    // A zavřený bufet naopak štamgastům víc než pamětníkům.
    const stamgastiBezPiva = dopadProstredi({ kind: "stamgasti", id: "g" }, bezPiva);
    const pametniciBezPiva = dopadProstredi({ kind: "pametnici", id: "g" }, bezPiva);
    expect(stamgastiBezPiva.mood).toBeLessThan(pametniciBezPiva.mood);
    expect(stamgastiBezPiva.duvod).toContain("bufet");
  });

  it("přemrštěná cena v bufetu štamgasty urazí i při dobré kvalitě", () => {
    const levne = dopadProstredi({ kind: "stamgasti", id: "g" }, prostredi({ produkty: [{ key: "beer", quality: 3, priceRatio: 0.9 }] }));
    const drahe = dopadProstredi({ kind: "stamgasti", id: "g" }, prostredi({ produkty: [{ key: "beer", quality: 3, priceRatio: 2.2 }] }));
    expect(drahe.mood).toBeLessThan(levne.mood);
  });

  it("rozorané hřiště vadí pamětníkům víc než partě z okolí", () => {
    const oranisko = prostredi({ pitchCondition: 10 });
    expect(dopadProstredi({ kind: "pametnici", id: "g" }, oranisko).mood)
      .toBeLessThan(dopadProstredi({ kind: "parta_z_okoli", id: "g" }, oranisko).mood);
  });

  it("posun za týden je omezený, prostředí nesmí přebít výsledky", () => {
    for (const kind of ["kotel", "stamgasti", "rodiny", "pametnici", "parta_z_okoli"] as const) {
      for (const p of [
        prostredi({ facilities: { toilets: 0, roof: 0, stands: 0, parking: 0, ultras_stand: 0, refreshments: 0 }, produkty: [], pitchCondition: 0 }),
        prostredi({ facilities: { toilets: 3, roof: 3, stands: 3, parking: 3, ultras_stand: 3, refreshments: 3 }, pitchCondition: 100 }),
      ]) {
        const d = dopadProstredi({ kind, id: "g" }, p);
        expect(Math.abs(d.mood)).toBeLessThanOrEqual(8);
      }
    }
  });

  it("stížnost se pojmenuje, ať se dá zobrazit", () => {
    const d = dopadProstredi({ kind: "rodiny", id: "g" }, prostredi({
      facilities: { toilets: 0, roof: 0, stands: 3, parking: 3, ultras_stand: 3, refreshments: 3 },
    }));
    expect(d.duvod).toContain("záchody");
  });
});

describe("čeština v chorálech", () => {
  /**
   * Jména se v textech neskloňují. Spolehlivě ohnout česká příjmení
   * (Vlček → Vlčka, Petrášek → Petráška, Hrubý → Hrubého) bez morfologie
   * nejde a patvar typu „Kdo nemá rád Kolman" je vidět na první pohled.
   */
  const PODEZRELA_JMENA = ["Vlček", "Petrášek", "Hrubý", "Kolman", "Řepka"];

  it("příjmení nikde nestojí v pádu, který by se musel ohýbat", () => {
    for (const p of PODEZRELA_JMENA) {
      for (const roll of [0, 0.2, 0.4, 0.6, 0.8, 0.99]) {
        const ch = vymysliChoraly(stav({
          oblibenec: `Jan ${p}`, trener: `Karel ${p}`,
          kampanProtiTreneru: true, serie: 4,
          rival: { nazev: "Sokol Zálezly", heat: 70 },
          nalada: 20, heat: 70, stiznostNaVybaveni: "záchody",
        }), roll);
        for (const c of ch) {
          // Po předložkách a slovesech, které vyžadují jiný než první pád,
          // jméno být nesmí.
          for (const vzor of [
            new RegExp(`rád ${p}\\b`, "i"),
            new RegExp(`ne ${p}\\b`, "i"),
            new RegExp(`z ${p}\\b`, "i"),
            new RegExp(`${p}ovi\\b`, "i"),
            new RegExp(`${p}a\\b`),
          ]) {
            expect(c.text, `„${c.text}" ohýbá jméno ${p}`).not.toMatch(vzor);
          }
        }
      }
    }
  });

  it("název klubu se taky neskloňuje", () => {
    for (const roll of [0, 0.3, 0.6, 0.9]) {
      const ch = vymysliChoraly(stav({
        klub: "FK Duplex Břevnov", nalada: 15,
        rival: { nazev: "Sokol Zálezly", heat: 80 },
      }), roll);
      for (const c of ch) {
        expect(c.text).not.toMatch(/z FK Duplex Břevnov\b/);
        expect(c.text).not.toMatch(/FK Duplex Břevnova/);
      }
    }
  });
});
