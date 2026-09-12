/** Testy katalogu reakcí na dění kolem klubu — čisté funkce, bez DB. */
import { describe, it, expect } from "vitest";
import {
  CLUB_EVENTS, CLUB_EVENT_KINDS, dopadUdalosti, silaPodleHrace, silaZmenyCeny,
  klasifikujOdpoved, dopadOdpovedi,
} from "./fan-reactions";
import { FAN_GROUP_KINDS } from "./fan-groups";

describe("katalog událostí", () => {
  it("každá událost má popisek a aspoň jednu partu, které na tom záleží", () => {
    for (const k of CLUB_EVENT_KINDS) {
      const d = CLUB_EVENTS[k];
      expect(d.label.length, k).toBeGreaterThan(0);
      expect(Object.keys(d.dopad).length, k).toBeGreaterThan(0);
    }
  });

  it("dopady míří jen na party, které existují", () => {
    for (const k of CLUB_EVENT_KINDS) {
      for (const g of Object.keys(CLUB_EVENTS[k].dopad)) {
        expect(FAN_GROUP_KINDS, `${k} → ${g}`).toContain(g);
      }
    }
  });

  it("kdo píše, má co napsat, a naopak", () => {
    for (const k of CLUB_EVENT_KINDS) {
      const d = CLUB_EVENTS[k];
      if (d.pise) {
        expect(d.texty?.length, `${k} má odesílatele, ale žádný text`).toBeGreaterThan(0);
        expect(FAN_GROUP_KINDS).toContain(d.pise);
        // Kdo píše, musí na té události mít i vlastní dopad — jinak mluví o něčem,
        // co se ho netýká.
        expect(d.dopad[d.pise], `${k}: ${d.pise} píše, ale nic ho to nedělá`).toBeDefined();
      }
      if (d.texty) expect(d.pise, `${k} má texty, ale nikdo je neposílá`).toBeDefined();
      // Zpráva, co se ptá, musí mít odesílatele.
      if (d.ptaSe) expect(d.pise, `${k} se ptá, ale nikdo ji neposílá`).toBeDefined();
    }
  });

  it("texty jsou hotové věty bez zbylých placeholderů", () => {
    for (const k of CLUB_EVENT_KINDS) {
      for (const t of CLUB_EVENTS[k].texty ?? []) {
        expect(t.trim(), k).toMatch(/[.!?"]$/);
        expect(t, k).not.toMatch(/\{(?!co|klub)[a-z]+\}/);
      }
    }
  });

  it("prodej opory a přejmenování klubu berou party opačně podle povahy", () => {
    // Kotel nese prodej opory hůř než rodiny.
    const kotel = CLUB_EVENTS.prodej_opory.dopad.kotel!;
    const rodiny = CLUB_EVENTS.prodej_opory.dopad.rodiny!;
    expect(kotel.mood).toBeLessThan(rodiny.mood);

    // Kritiku rozhodčího kotel ocení, pamětníci ne — to je ta zajímavá část.
    expect(CLUB_EVENTS.rozhovor_kritika.dopad.kotel!.mood).toBeGreaterThan(0);
    expect(CLUB_EVENTS.rozhovor_kritika.dopad.pametnici!.mood).toBeLessThan(0);
    expect(CLUB_EVENTS.rozhovor_obhajoba.dopad.pametnici!.mood).toBeGreaterThan(0);
    expect(CLUB_EVENTS.rozhovor_obhajoba.dopad.kotel!.mood).toBeLessThan(0);
  });
});

describe("síla dopadu", () => {
  const zaklad = { severity: 1, passion: 55, loyalty: 50 };

  it("parta, které se to netýká, se nehne", () => {
    expect(dopadUdalosti("vylepseni_kotle", "rodiny", zaklad)).toEqual({ mood: 0, heat: 0 });
  });

  it("slabší událost bolí míň", () => {
    const plna = dopadUdalosti("prodej_opory", "kotel", zaklad);
    const slaba = dopadUdalosti("prodej_opory", "kotel", { ...zaklad, severity: 0.2 });
    expect(slaba.mood).toBeGreaterThan(plna.mood);
    expect(slaba.heat).toBeLessThan(plna.heat);
  });

  it("vášnivější parta to prožívá víc", () => {
    expect(dopadUdalosti("prodej_opory", "kotel", { ...zaklad, passion: 95 }).mood)
      .toBeLessThan(dopadUdalosti("prodej_opory", "kotel", { ...zaklad, passion: 20 }).mood);
  });

  it("loajalita tlumí špatné zprávy, dobré ne", () => {
    const loajalni = dopadUdalosti("prodej_opory", "kotel", { ...zaklad, loyalty: 100 });
    const vrtkavi = dopadUdalosti("prodej_opory", "kotel", { ...zaklad, loyalty: 0 });
    expect(loajalni.mood).toBeGreaterThan(vrtkavi.mood);

    expect(dopadUdalosti("posila", "kotel", { ...zaklad, loyalty: 100 }))
      .toEqual(dopadUdalosti("posila", "kotel", { ...zaklad, loyalty: 0 }));
  });

  it("nesmyslné vstupy nedají NaN", () => {
    const d = dopadUdalosti("prodej_opory", "kotel", { severity: 9, passion: -5, loyalty: 500 });
    expect(Number.isFinite(d.mood)).toBe(true);
    expect(Number.isFinite(d.heat)).toBe(true);
  });
});

describe("odhad síly události", () => {
  it("náhradník nikoho nezajímá, opora ano, kapitán nejvíc", () => {
    expect(silaPodleHrace(35)).toBe(0);
    expect(silaPodleHrace(60)).toBeGreaterThan(silaPodleHrace(45));
    expect(silaPodleHrace(70, true)).toBeGreaterThan(silaPodleHrace(70, false));
    expect(silaPodleHrace(100, true)).toBeLessThanOrEqual(1);
  });

  it("změna ceny: 20 % je plná dávka, drobnost skoro nic", () => {
    expect(silaZmenyCeny(100, 105)).toBeCloseTo(0.25, 2);
    expect(silaZmenyCeny(100, 120)).toBe(1);
    expect(silaZmenyCeny(100, 200)).toBe(1);
    expect(silaZmenyCeny(100, 100)).toBe(0);
    expect(silaZmenyCeny(0, 50)).toBe(0.5);
  });
});

describe("odpověď manažera", () => {
  it("pozná smířlivý, tvrdý i vyhýbavý tón", () => {
    expect(klasifikujOdpoved("Chápu vás, mrzí mě to a slibuju nápravu.")).toBe("uklidnit");
    expect(klasifikujOdpoved("O soupisce rozhoduju já, konec debaty.")).toBe("postavit_se");
    expect(klasifikujOdpoved("Uvidíme, jak to dopadne příště.")).toBe("vyhnout_se");
  });

  it("krátká odpověď je vyhýbavá, ať je v ní cokoli", () => {
    expect(klasifikujOdpoved("ok")).toBe("vyhnout_se");
    expect(klasifikujOdpoved("   ")).toBe("vyhnout_se");
  });

  it("mlčet je vždycky špatně", () => {
    for (const l of [{ vyjednavani: 0, radikalnost: 0 }, { vyjednavani: 100, radikalnost: 100 }]) {
      expect(dopadOdpovedi("vyhnout_se", l).sentiment).toBeLessThan(0);
    }
  });

  it("vyjednavač ocení smířlivost, radikál tvrdost", () => {
    const vyjednavac = { vyjednavani: 90, radikalnost: 15 };
    const radikal = { vyjednavani: 15, radikalnost: 90 };

    expect(dopadOdpovedi("uklidnit", vyjednavac).sentiment).toBeGreaterThan(0);
    expect(dopadOdpovedi("uklidnit", radikal).sentiment).toBeLessThan(0);
    expect(dopadOdpovedi("postavit_se", radikal).sentiment).toBeGreaterThan(0);
    expect(dopadOdpovedi("postavit_se", vyjednavac).sentiment).toBeLessThan(0);
  });

  it("vůdce vždycky něco odepíše", () => {
    for (const p of ["uklidnit", "postavit_se", "vyhnout_se"] as const) {
      const d = dopadOdpovedi(p, { vyjednavani: 50, radikalnost: 50 });
      expect(d.odpoved.length).toBeGreaterThan(3);
      expect(d.odpoved).toMatch(/[.!?]$/);
    }
  });
});
