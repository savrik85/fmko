/**
 * Sektor kotle se vyplácí, jen když v něm kotel stojí.
 *
 * Vzniklo z konkrétní stížnosti: přesun kotle na hlavní tribunu stál 3 000 Kč
 * a byl skoro zadarmo. Hlas party nese domácí výhodu jen velmi slabě (0,15
 * procentního bodu), zatímco POSTAVENÝ sektor dává až +5 % výhody a +6
 * morálky, a to se počítalo i za prázdnou konstrukci. Volba tak byla
 * jednostranná: odstěhovat se bylo skoro vždycky lepší.
 */
import { describe, it, expect } from "vitest";
import { calculateFacilityEffects, SKALY } from "./stadium-generator";
import { zastraseniHostu, FAN_SKALY } from "../engine/fan-groups";

/** Totéž, co dělá match-runner: atmosféra se počítá jen s kotlem na místě. */
function atmosfera(ultrasLevel: number, kotel: { sector: string; closed: number }) {
  const fx = calculateFacilityEffects({ ultras_stand: ultrasLevel });
  const doma = kotel.sector === "kotel" && kotel.closed === 0;
  return {
    advantage: doma ? fx.homeAdvantageBonus : 0,
    morale: doma ? fx.homeCrowdMoraleBonus : 0,
  };
}

describe("atmosféra se stěhuje s partou", () => {
  it("postavený sektor s kotlem uvnitř dává výhodu i morálku", () => {
    const a = atmosfera(3, { sector: "kotel", closed: 0 });
    expect(a.advantage).toBe(SKALY.ultras_stand.advantage[3]);
    expect(a.morale).toBe(SKALY.ultras_stand.morale[3]);
    expect(a.advantage).toBeGreaterThan(0.04);
  });

  it("kotel na hlavní tribuně znamená prázdný sektor a nulovou atmosféru", () => {
    const a = atmosfera(3, { sector: "hlavni", closed: 0 });
    expect(a.advantage).toBe(0);
    expect(a.morale).toBe(0);
  });

  it("kotel přesunutý za branku taky nezvedá postavený sektor", () => {
    expect(atmosfera(3, { sector: "za_branou", closed: 0 }).advantage).toBe(0);
  });

  it("zavřený sektor za trest neřve, i když v něm parta formálně je", () => {
    const a = atmosfera(3, { sector: "kotel", closed: 2 });
    expect(a.advantage).toBe(0);
    expect(a.morale).toBe(0);
  });

  it("cena přesunu je proti tomu, co se ztratí, přiměřená", () => {
    // Ztráta při L2 sektoru: 3 % domácí výhody a 3 morálky za KAŽDÝ domácí
    // zápas. To je dost na to, aby přesun byl rozhodnutí, ne klik zadarmo.
    expect(SKALY.ultras_stand.advantage[2]).toBeGreaterThanOrEqual(0.03);
    expect(SKALY.ultras_stand.morale[2]).toBeGreaterThanOrEqual(3);
  });

  it("bez postaveného sektoru se nemá co ztratit", () => {
    expect(atmosfera(0, { sector: "kotel", closed: 0 }).advantage).toBe(0);
    expect(atmosfera(0, { sector: "hlavni", closed: 0 }).advantage).toBe(0);
  });
});

describe("zastrašení hostů", () => {
  const kotel = (o: Partial<Parameters<typeof zastraseniHostu>[0]> = {}) =>
    zastraseniHostu({ sector: "za_branou", size: 80, noise: 95, mood: 85, sectorClosed: false, ...o });

  it("jen z místa hned vedle hostů, jinde nula", () => {
    expect(kotel()).toBeGreaterThan(0);
    expect(kotel({ sector: "kotel" })).toBe(0);
    expect(kotel({ sector: "hlavni" })).toBe(0);
  });

  it("zavřený sektor nikoho nezastraší", () => {
    expect(kotel({ sectorClosed: true })).toBe(0);
  });

  it("hrstka lidí hosty neruší", () => {
    expect(kotel({ size: 10 })).toBe(0);
  });

  it("velká, hlasitá a nadšená parta bere víc než malá a otrávená", () => {
    expect(kotel({ size: 120, noise: 100, mood: 95 }))
      .toBeGreaterThan(kotel({ size: 25, noise: 40, mood: 20 }));
  });

  it("nikdy nesebere víc než strop", () => {
    expect(kotel({ size: 9999, noise: 100, mood: 100 })).toBeLessThanOrEqual(FAN_SKALY.ZASTRASENI.MAX);
  });

  it("tohle je jediný důvod, proč partu za branku stěhovat", () => {
    // Kdyby zastrašení bylo nulové, je ta volba horší ve všem a nemá smysl.
    expect(FAN_SKALY.ZASTRASENI.MAX).toBeGreaterThan(0);
  });
});
