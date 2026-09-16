import { describe, expect, it } from "vitest";
import { createRng } from "../generators/rng";
import { MISTO_INCIDENTU, odhalujePachatele, seznamJmen, vygenerujStopy, type ZdrojeStop } from "./stopy";
import { hrac, PROBLEMOVY, stavKlubu } from "./testovaci-stav";
import type { NavrhIncidentu, NavrhStopy, StavKlubu } from "./typy";

const KADR = [PROBLEMOVY, hrac({ id: "a", jmeno: "Adam Kos" }), hrac({ id: "b", jmeno: "Bedřich Vrba" }), hrac({ id: "c", jmeno: "Cyril Malý" })];
const BEZ_ZDROJU: ZdrojeStop = { spravceUsudek: null, vztahyPachatele: [] };

function navrh(over: Partial<NavrhIncidentu> = {}): NavrhIncidentu {
  return {
    kind: "vloupani_sklad", category: "kradez", status: "otevreny", severity: 1,
    culpritType: "hrac", culpritPlayerId: "p", culpritRevealed: false,
    ztraty: [], text: "Ze skladu zmizely dresy.", ...over,
  };
}

function seedy(stav: StavKlubu, n: NavrhIncidentu, zdroje: ZdrojeStop = BEZ_ZDROJU, pocet = 200): NavrhStopy[][] {
  return Array.from({ length: pocet }, (_, i) => vygenerujStopy(stav, n, zdroje, createRng(i + 1)));
}
const zeZdroje = (vysledky: NavrhStopy[][], zdroj: string) => vysledky.flat().filter((s) => s.zdroj === zdroj);

describe("stopy vzniknou jen ze zdroje, který klub má", () => {
  it("bez zabezpečení areálu žádná kamera", () => {
    expect(zeZdroje(seedy(stavKlubu({ kadr: KADR }), navrh()), "kamera")).toEqual([]);
  });

  it("zabezpečení úrovně 1 kameru nemá", () => {
    const s = stavKlubu({ kadr: KADR, vybaveni: { area_security: 1, area_security_condition: 90 } });
    expect(zeZdroje(seedy(s, navrh()), "kamera")).toEqual([]);
  });

  it("sešlá kamera dá jen informaci, že nenahrávala", () => {
    const s = stavKlubu({ kadr: KADR, vybaveni: { area_security: 2, area_security_condition: 30 } });
    const kamery = zeZdroje(seedy(s, navrh()), "kamera");
    expect(kamery).toHaveLength(200);
    for (const k of kamery) {
      expect(k).toMatchObject({ ukazujeNa: null, podezreli: null, sila: 1, bonusPolicie: 0, nalezena: true });
      expect(k.text).toContain("30 %");
    }
  });

  it("úroveň 2 vidí na sklad, ale ne na parkoviště; úroveň 3 vidí i tam", () => {
    const dodavka = navrh({ kind: "dodavka_ukradena", culpritType: "cizi", culpritPlayerId: null });
    const lv2 = stavKlubu({ kadr: KADR, vybaveni: { area_security: 2, area_security_condition: 90 } });
    const lv3 = stavKlubu({ kadr: KADR, vybaveni: { area_security: 3, area_security_condition: 90 } });
    expect(MISTO_INCIDENTU.dodavka_ukradena).toBe("parkoviste");
    expect(zeZdroje(seedy(lv2, dodavka), "kamera")).toEqual([]);
    expect(zeZdroje(seedy(lv2, navrh()), "kamera")).toHaveLength(200);
    expect(zeZdroje(seedy(lv3, dodavka), "kamera")).toHaveLength(200);
  });

  it("ukradené kamery nic nenatočí", () => {
    const s = stavKlubu({ kadr: KADR, vybaveni: { area_security: 3, area_security_condition: 90 } });
    expect(zeZdroje(seedy(s, navrh({ kind: "kradez_kamery", culpritType: "cizi", culpritPlayerId: null })), "kamera")).toEqual([]);
  });

  it("bez správce hřiště nic neviděl správce", () => {
    const s = stavKlubu({ kadr: KADR });
    expect(zeZdroje(seedy(s, navrh()), "spravce")).toEqual([]);
    expect(zeZdroje(seedy(s, navrh(), { spravceUsudek: 20, vztahyPachatele: [] }), "spravce").length).toBeGreaterThan(0);
  });

  it("bez osvětlení nic neviděl soused, s osvětlením dá 2 až 3 podezřelé včetně pachatele", () => {
    expect(zeZdroje(seedy(stavKlubu({ kadr: KADR }), navrh()), "soused")).toEqual([]);
    const sousede = zeZdroje(seedy(stavKlubu({ kadr: KADR, stadion: { lighting: 1, pitch_condition: 70 } }), navrh()), "soused");
    expect(sousede.length).toBeGreaterThan(0);
    for (const s of sousede) {
      expect(s.podezreli).toContain("p");
      expect(s.podezreli?.length).toBeGreaterThanOrEqual(2);
      expect(s.podezreli?.length).toBeLessThanOrEqual(3);
      expect(s.ukazujeNa).toBeNull();
    }
  });

  it("svědek je jen hráč, který byl včera v hospodě, a stopu má u sebe", () => {
    expect(zeZdroje(seedy(stavKlubu({ kadr: KADR }), navrh()), "svedek")).toEqual([]);
    const svedci = zeZdroje(seedy(stavKlubu({ kadr: KADR, hospodaVcera: ["a", "p"] }), navrh()), "svedek");
    expect(svedci.length).toBeGreaterThan(0);
    for (const s of svedci) expect(s).toMatchObject({ drzitel: "a", ukazujeNa: "p", nalezena: false });
  });

  it("kamarád s pevným vztahem ví vždycky, slabý vztah nestačí, rival jen někdy", () => {
    const vztahy: ZdrojeStop = { spravceUsudek: null, vztahyPachatele: [
      { hracId: "a", typ: "drinking_buddies", sila: 60 },
      { hracId: "b", typ: "neighbors", sila: 20 },
      { hracId: "c", typ: "rivals", sila: 50 },
    ] };
    const vysledky = seedy(stavKlubu({ kadr: KADR }), navrh(), vztahy);
    const kamaradi = zeZdroje(vysledky, "kamarad");
    expect(kamaradi).toHaveLength(200);
    for (const k of kamaradi) expect(k).toMatchObject({ drzitel: "a", ukazujeNa: "p", nalezena: false });
    const rivalove = zeZdroje(vysledky, "rival");
    expect(rivalove.length).toBeGreaterThan(0);
    expect(rivalove.length).toBeLessThan(200);
    for (const r of rivalove) expect(r.drzitel).toBe("c");
  });
});

describe("stopy nelžou", () => {
  const plny = stavKlubu({
    kadr: KADR, hospodaVcera: ["a", "b"],
    vybaveni: { area_security: 3, area_security_condition: 70 },
    stadion: { lighting: 2, pitch_condition: 70 },
  });
  const vztahy: ZdrojeStop = {
    spravceUsudek: 15,
    vztahyPachatele: [{ hracId: "c", typ: "brothers", sila: 80 }, { hracId: "b", typ: "rivals", sila: 40 }],
  };

  it("ukazují jen na skutečného pachatele", () => {
    for (const stopy of seedy(plny, navrh(), vztahy)) {
      for (const s of stopy) {
        if (s.ukazujeNa !== null) expect(s.ukazujeNa).toBe("p");
        if (s.podezreli !== null) expect(s.podezreli).toContain("p");
      }
    }
  });

  it("u cizího pachatele neukazují na nikoho z kádru", () => {
    for (const stopy of seedy(plny, navrh({ culpritType: "cizi", culpritPlayerId: null }), vztahy)) {
      for (const s of stopy) {
        expect(s.ukazujeNa).toBeNull();
        expect(s.podezreli).toBeNull();
        expect(s.drzitel).toBeNull();
      }
    }
  });

  it("stejný seed dá stejné stopy", () => {
    expect(vygenerujStopy(plny, navrh(), vztahy, createRng(9))).toEqual(vygenerujStopy(plny, navrh(), vztahy, createRng(9)));
  });

  it("odhalený pachatel, nehoda ani uzavřený incident se nevyšetřují", () => {
    expect(vygenerujStopy(plny, navrh({ culpritRevealed: true }), vztahy, createRng(1))).toEqual([]);
    expect(vygenerujStopy(plny, navrh({ culpritType: "nikdo", culpritPlayerId: null }), vztahy, createRng(1))).toEqual([]);
    expect(vygenerujStopy(plny, navrh({ status: "uzavreny" }), vztahy, createRng(1))).toEqual([]);
  });

  it("pachatele odhalí jen nalezená stopa síly 3, která na něj ukazuje", () => {
    const zaklad: NavrhStopy = { zdroj: "kamera", ukazujeNa: "p", podezreli: null, drzitel: null, sila: 3, bonusPolicie: 0.35, text: "x.", nalezena: true };
    expect(odhalujePachatele([zaklad])).toBe(true);
    expect(odhalujePachatele([{ ...zaklad, nalezena: false }])).toBe(false);
    expect(odhalujePachatele([{ ...zaklad, sila: 2 }])).toBe(false);
    expect(odhalujePachatele([{ ...zaklad, ukazujeNa: null }])).toBe(false);
  });

  it("seznam jmen", () => {
    expect(seznamJmen(["A"])).toBe("A");
    expect(seznamJmen(["A", "B"])).toBe("A nebo B");
    expect(seznamJmen(["A", "B", "C"])).toBe("A, B nebo C");
  });
});
