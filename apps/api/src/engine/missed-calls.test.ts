/**
 * Zmeškané hovory.
 *
 * Hlídá se hlavně to, že hovor nevzniká bez důvodu. Kdyby zvonili pořád,
 * hráč se je naučí ignorovat a celý vtip je pryč.
 */
import { describe, it, expect } from "vitest";
import { kdoVolal, VOLAJICI_LABEL, type StavHovoru } from "./missed-calls";

const KLID: StavHovoru = {
  vudceKotle: "Josef Vlček", heatKotle: 20, kampanProtiTreneru: false,
  serie: 0, sponzor: "Madeta", pokutaZaBordel: 0, nastvanyHrac: null, obec: "Spůle",
};
const kdo = (s: Partial<StavHovoru>, roll = 0.5) =>
  kdoVolal({ ...KLID, ...s }, roll).map((h) => h.volajici);

describe("když je klid, nezvoní nikdo", () => {
  it("spokojený klub nemá zmeškané hovory", () => {
    expect(kdoVolal(KLID, 0.5)).toEqual([]);
  });
});

describe("kdo volá a proč", () => {
  it("vůdce kotle při podpisovce za odvolání, a nedá pokoj", () => {
    const h = kdoVolal({ ...KLID, kampanProtiTreneru: true }, 0.5);
    const kotel = h.find((x) => x.volajici === "kotel")!;
    expect(kotel.jmeno).toBe("Josef Vlček");
    expect(kotel.pocet).toBeGreaterThan(3);
  });

  it("naštvaný kotel volá míň než při podpisovce", () => {
    const pri = kdoVolal({ ...KLID, kampanProtiTreneru: true }, 0.5).find((x) => x.volajici === "kotel")!;
    const jen = kdoVolal({ ...KLID, heatKotle: 70 }, 0.5).find((x) => x.volajici === "kotel")!;
    expect(jen.pocet).toBeLessThan(pri.pocet);
  });

  it("kotel bez vůdce nevolá, nemá kdo", () => {
    expect(kdo({ vudceKotle: null, kampanProtiTreneru: true, heatKotle: 90 })).not.toContain("kotel");
  });

  it("sponzor až po třech prohrách po sobě", () => {
    expect(kdo({ serie: -2 })).not.toContain("sponzor");
    expect(kdo({ serie: -3 })).toContain("sponzor");
  });

  it("klub bez sponzora nikdo z centrály neotravuje", () => {
    expect(kdo({ sponzor: null, serie: -5 })).not.toContain("sponzor");
  });

  it("starosta po pokutě za bordel, komise až u velké", () => {
    expect(kdo({ pokutaZaBordel: 3000 })).toEqual(["starosta"]);
    expect(kdo({ pokutaZaBordel: 9000 })).toEqual(["starosta", "komise"]);
  });

  it("novinář volá po sérii výher, jediný hovor, co není průšvih", () => {
    expect(kdo({ serie: 3 })).not.toContain("novinar");
    expect(kdo({ serie: 4 })).toContain("novinar");
  });

  it("naštvaný hráč volá, ať je stav jakýkoli", () => {
    expect(kdo({ nastvanyHrac: "David Novák" })).toContain("hrac");
  });
});

describe("texty", () => {
  it("v průšvihu zvoní víc než jednou", () => {
    const h = kdoVolal({ ...KLID, serie: -5 }, 0.5).find((x) => x.volajici === "sponzor")!;
    expect(h.pocet).toBeGreaterThan(1);
    expect(h.duvod.length).toBeGreaterThan(10);
  });

  it("žádná varianta textu není prázdná", () => {
    for (let i = 0; i < 10; i++) {
      const vse = kdoVolal(
        { ...KLID, kampanProtiTreneru: true, serie: -4, pokutaZaBordel: 9000, nastvanyHrac: "Jan Kolman" },
        i / 10,
      );
      for (const h of vse) {
        expect(h.duvod.trim().length, `${h.volajici} @ ${i}`).toBeGreaterThan(10);
        expect(h.jmeno.trim().length).toBeGreaterThan(1);
      }
    }
  });

  it("každý druh volajícího má popisek", () => {
    for (const k of Object.keys(VOLAJICI_LABEL) as Array<keyof typeof VOLAJICI_LABEL>) {
      expect(VOLAJICI_LABEL[k].length).toBeGreaterThan(2);
    }
  });
});
