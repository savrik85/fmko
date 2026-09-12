/**
 * Chorály, které si fanoušci vymyslí sami.
 *
 * Hlídá se hlavně to, co je z chorálu vidět na první pohled: ohnutý název
 * a jméno, které se nedá skandovat.
 */
import { describe, it, expect } from "vitest";
import {
  vymysliChoraly, domaciChoral, kdoZpiva, silaPo, PRAH_ZAPOMENUTI, MALA_OBEC,
  type ChantStav, type DomovStav,
} from "./fan-chants";

const STAV: ChantStav = {
  oblibenec: null, rival: null, trener: null, kampanProtiTreneru: false,
  serie: 0, nalada: 60, heat: 10, stiznostNaVybaveni: null, klub: "SK Nebahovy",
};
const DOMOV: DomovStav = {
  obec: "Nebahovy", okres: "Prachatice", obyvatel: 319,
  klub: "SK Nebahovy", prezdivkaTymu: null,
};

describe("domácí chorál", () => {
  it("název obce v něm vždycky zazní", () => {
    for (let i = 0; i < 20; i++) {
      const ch = domaciChoral(DOMOV, i / 20);
      expect(ch.text, ch.text).toContain("Nebahovy");
      expect(ch.kind).toBe("domov");
    }
  });

  it("název obce ani okresu se NEOHÝBÁ", () => {
    // „z Nebahovy" ani „celej Prachatice" není čeština a spolehlivě ohnout
    // české místní názvy bez morfologie nejde.
    // První pád je „Nebahovy" a „Prachatice". Cokoliv jiného za tím kmenem
    // je ohnutý tvar: Nebahov, Nebahovech, Prachaticích, od Prachatic.
    const spatne = /Nebahov(?!y\b)|Prachatic(?!e\b)/i;
    for (let i = 0; i < 20; i++) {
      const t = domaciChoral(DOMOV, i / 20).text;
      expect(t, t).not.toMatch(spatne);
    }
  });

  it("malá vesnice a město dostanou jinou zásobu", () => {
    const male = new Set(Array.from({ length: 30 }, (_, i) => domaciChoral(DOMOV, i / 30).text));
    const velke = new Set(Array.from({ length: 30 }, (_, i) =>
      domaciChoral({ ...DOMOV, obec: "Brno", okres: "Brno-město", obyvatel: 382405 }, i / 30).text));
    expect([...male].some((t) => t.includes("Malá ves"))).toBe(true);
    expect([...velke].some((t) => t.includes("Malá ves"))).toBe(false);
  });

  it("hranice malé obce je ostrá", () => {
    const podHranici = Array.from({ length: 30 }, (_, i) =>
      domaciChoral({ ...DOMOV, obyvatel: MALA_OBEC - 1 }, i / 30).text);
    const nadHranici = Array.from({ length: 30 }, (_, i) =>
      domaciChoral({ ...DOMOV, obyvatel: MALA_OBEC }, i / 30).text);
    expect(podHranici.some((t) => t.includes("Malá ves"))).toBe(true);
    expect(nadHranici.some((t) => t.includes("Malá ves"))).toBe(false);
  });

  it("bez okresu i bez počtu obyvatel to nespadne", () => {
    const ch = domaciChoral({ ...DOMOV, okres: null, obyvatel: null }, 0.5);
    expect(ch.text).toContain("Nebahovy");
    expect(ch.text).not.toContain("null");
  });

  it("stejný los dá stejný text", () => {
    expect(domaciChoral(DOMOV, 0.37).text).toBe(domaciChoral(DOMOV, 0.37).text);
  });

  it("začíná silný, umí ho celý stadion", () => {
    expect(domaciChoral(DOMOV, 0.5).sila).toBeGreaterThan(PRAH_ZAPOMENUTI);
    expect(kdoZpiva("domov").length).toBeGreaterThan(kdoZpiva("rival").length);
  });
});

describe("jméno, které se nedá skandovat", () => {
  it("miláček s příjmením kratším než tři znaky chorál nedostane", () => {
    const s = { ...STAV, oblibenec: "A A" };
    expect(vymysliChoraly(s, 0.5).some((c) => c.kind === "oblibenec")).toBe(false);
    expect(vymysliChoraly({ ...STAV, oblibenec: "Jan Kolman" }, 0.5)
      .some((c) => c.kind === "oblibenec")).toBe(true);
  });

  it("trenér s nesmyslným jménem nedostane ani chválu, ani odvolání", () => {
    const proti = { ...STAV, trener: "A A", kampanProtiTreneru: true };
    expect(vymysliChoraly(proti, 0.5).some((c) => c.kind === "trener_proti")).toBe(false);
    const pro = { ...STAV, trener: "A A", serie: 4 };
    expect(vymysliChoraly(pro, 0.5).some((c) => c.kind === "trener_pro")).toBe(false);
    // Se skutečným jménem projde obojí.
    expect(vymysliChoraly({ ...proti, trener: "Karel Testovič" }, 0.5)
      .some((c) => c.kind === "trener_proti")).toBe(true);
  });
});

describe("síla", () => {
  it("roste, dokud důvod trvá, a pak rychle padá", () => {
    expect(silaPo(50, true)).toBeGreaterThan(50);
    expect(silaPo(50, false)).toBeLessThan(50);
    expect(silaPo(100, true)).toBe(100);
    expect(silaPo(2, false)).toBe(0);
  });
});
