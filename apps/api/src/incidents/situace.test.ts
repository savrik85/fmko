import { describe, expect, it } from "vitest";
import { createRng, type Rng } from "../generators/rng";
import { MAX_AKTIVNICH_SITUACI } from "./nastaveni";
import { KATALOG_SITUACI, nazevSituace, vylosujSituaci } from "./situace";
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
