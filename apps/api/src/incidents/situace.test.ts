import { describe, expect, it } from "vitest";
import { createRng, type Rng } from "../generators/rng";
import { MAX_AKTIVNICH_SITUACI } from "./nastaveni";
import { KATALOG_SITUACI, nazevSituace, oknoAbsence, vylosujSituaci } from "./situace";
import { hrac, stavKlubu } from "./testovaci-stav";
import type { HracKlubu } from "./typy";

const proSeedy = (fn: (rng: Rng) => void, pocet = 300) => {
  for (let s = 1; s <= pocet; s++) fn(createRng(s));
};
const MLADY = hrac({ id: "m", jmeno: "Michal Mladý", vek: 19, povolani: "Student", alkohol: 20 });
const ZRALY = hrac({ id: "z", jmeno: "Zdeněk Zralý", vek: 30, povolani: "Zedník", alkohol: 70 });
const kadr = (...h: HracKlubu[]) => stavKlubu({ kadr: h, odehranychZapasu: 10 });

describe("katalog situací", () => {
  it("každá situace má popisek, emoji a kladné trvání", () => {
    expect(KATALOG_SITUACI.length).toBeGreaterThanOrEqual(7);
    for (const d of KATALOG_SITUACI) {
      expect(d.label.length, d.kind).toBeGreaterThan(0);
      expect(d.emoji.length, d.kind).toBeGreaterThan(0);
      proSeedy((rng) => expect(d.trvani(rng), d.kind).toBeGreaterThan(0), 20);
    }
    expect(nazevSituace("rozvod")).toContain("Rozvod");
  });

  it("věkové a povoláním dané podmínky platí", () => {
    const podle = (kind: string) => KATALOG_SITUACI.find((d) => d.kind === kind)!;
    expect(podle("rozvod").muze(MLADY)).toBe(false);
    expect(podle("rozvod").muze(ZRALY)).toBe(true);
    expect(podle("narozeni_ditete").muze(MLADY)).toBe(false);
    expect(podle("nemocny_rodic").muze(MLADY)).toBe(false);
    // Kdo nemá práci, o ni nepřijde.
    expect(podle("prisel_o_praci").muze(MLADY)).toBe(false);
    expect(podle("prisel_o_praci").muze(hrac({ povolani: "Nezaměstnaný", vek: 30 }))).toBe(false);
    expect(podle("prisel_o_praci").muze(ZRALY)).toBe(true);
    // Řidičák sebrali tomu, kdo pije.
    expect(podle("zabaveny_ridicak").muze(hrac({ vek: 30, alkohol: 30 }))).toBe(false);
    expect(podle("zabaveny_ridicak").muze(ZRALY)).toBe(true);
  });

  it("dluhy tíhnou k nezaměstnaným a pijákům", () => {
    const podle = KATALOG_SITUACI.find((d) => d.kind === "dluhy")!;
    const klidny = hrac({ vek: 30, povolani: "Účetní", alkohol: 20 });
    expect(podle.vaha(hrac({ vek: 30, povolani: "Nezaměstnaný", alkohol: 20 }))).toBeGreaterThan(podle.vaha(klidny));
    expect(podle.vaha(hrac({ vek: 30, povolani: "Účetní", alkohol: 80 }))).toBeGreaterThan(podle.vaha(klidny));
  });
});

describe("los situace", () => {
  it("nový klub, plný limit ani hráč se situací situaci nedostanou", () => {
    proSeedy((rng) => {
      expect(vylosujSituaci(stavKlubu({ kadr: [ZRALY], odehranychZapasu: 1 }), rng)).toBeNull();
      expect(vylosujSituaci(stavKlubu({
        kadr: [ZRALY], odehranychZapasu: 10, situace: new Map([["x", "rozvod"], ["y", "dluhy"]]),
      }), rng)).toBeNull();
      expect(vylosujSituaci(stavKlubu({
        kadr: [ZRALY], odehranychZapasu: 10, situace: new Map([[ZRALY.id, "dluhy"]]),
      }), rng)).toBeNull();
    }, 60);
    expect(MAX_AKTIVNICH_SITUACI).toBe(2);
  });

  it("vylosovaná situace patří hráči z kádru, je probíhající a má trvání", () => {
    let vylosovanych = 0;
    proSeedy((rng) => {
      const n = vylosujSituaci(kadr(ZRALY, MLADY), rng);
      if (!n) return;
      vylosovanych++;
      expect(n.category).toBe("zivotni");
      expect(n.status).toBe("probiha");
      expect(n.culpritType).toBe("nikdo");
      expect([ZRALY.id, MLADY.id]).toContain(n.subjectPlayerId);
      expect(n.dniTrvani ?? 0).toBeGreaterThan(0);
      expect(n.ztraty).toEqual([]);
      expect(n.text).toMatch(/Zdeněk Zralý|Michal Mladý/);
    });
    expect(vylosovanych).toBeGreaterThan(0);
  });

  it("cooldown typu drží: když jsou všechny typy čerstvé, nic se nevylosuje", () => {
    // Cooldown se počítá od `stav.den`, fixtura má 2026-09-16, takže stejný den je vždy na cooldownu.
    const vsechnyNaCooldownu = Object.fromEntries(KATALOG_SITUACI.map((d) => [d.kind, "2026-09-16"]));
    proSeedy((rng) => {
      expect(vylosujSituaci(stavKlubu({ kadr: [ZRALY], odehranychZapasu: 10, posledniVyskyt: vsechnyNaCooldownu }), rng)).toBeNull();
    }, 60);
  });
});

describe("absence posazená na zápas", () => {
  // Kravčenko (Spůle): ohlášeno 29. 9., zápasy 1. 10. a 5. 10. Dřív padla absence
  // na 2.–3. 10., mezi zápasy, a hráč „v nemocnici" normálně nastoupil.
  const ZAPASY = ["2026-10-01", "2026-10-05", "2026-10-08"];

  it("absence vždycky pokryje zápas", () => {
    for (let za = 2; za <= 6; za++) {
      for (let delka = 1; delka <= 4; delka++) {
        for (let posun = 0; posun < delka; posun++) {
          const o = oknoAbsence({ den: "2026-09-29", zapasy: ZAPASY, za, delka, posun });
          expect(o).not.toBeNull();
          expect(o!.od <= o!.zapas && o!.do >= o!.zapas).toBe(true);
          expect(o!.od >= "2026-10-01").toBe(true); // aspoň dva dny po ohlášení
        }
      }
    }
  });

  it("bere první zápas v den chtěného začátku nebo po něm", () => {
    const o = oknoAbsence({ den: "2026-09-29", zapasy: ZAPASY, za: 3, delka: 2, posun: 0 });
    expect(o).toEqual({ od: "2026-10-05", do: "2026-10-06", zapas: "2026-10-05" });
  });

  it("posun přesune začátek před zápas, ne před lhůtu ohlášení", () => {
    expect(oknoAbsence({ den: "2026-09-29", zapasy: ZAPASY, za: 6, delka: 3, posun: 2 }))
      .toEqual({ od: "2026-10-03", do: "2026-10-05", zapas: "2026-10-05" });
    expect(oknoAbsence({ den: "2026-09-29", zapasy: ZAPASY, za: 2, delka: 3, posun: 2 }))
      .toEqual({ od: "2026-10-01", do: "2026-10-03", zapas: "2026-10-01" });
  });

  it("když po chtěném dni už zápas není, vezme nejbližší možný", () => {
    const o = oknoAbsence({ den: "2026-09-29", zapasy: ["2026-10-01"], za: 5, delka: 2, posun: 0 });
    expect(o?.zapas).toBe("2026-10-01");
  });

  it("zápas dřív než za dva dny se nepočítá a bez zápasu absence není", () => {
    expect(oknoAbsence({ den: "2026-09-29", zapasy: ["2026-09-30"], za: 2, delka: 2, posun: 0 })).toBeNull();
    expect(oknoAbsence({ den: "2026-09-29", zapasy: [], za: 2, delka: 2, posun: 0 })).toBeNull();
  });
});
