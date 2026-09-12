/**
 * Oblíbenci a otloukánci.
 *
 * Podstata je, že každá parta soudí podle sebe — kdyby všechny milovaly toho
 * samého, nemělo by cenu je rozlišovat. A miláček musí vydržet déle než do
 * dalšího gólu někoho jiného, jinak věta „kotel ho miluje" neznamená nic.
 */
import { describe, it, expect } from "vitest";
import {
  skoreObliby, vyberOblibence, NASKOK_NA_VYMENU, type HodnocenyHrac,
} from "./fan-favourites";

const h = (o: Partial<HodnocenyHrac> = {}): HodnocenyHrac => ({
  id: "p1", firstName: "Jan", lastName: "Novák", position: "MID",
  age: 26, overallRating: 45,
  workRate: 50, aggression: 40, discipline: 50, patriotism: 50,
  leadership: 30, alcohol: 30, experience: 20,
  domaci: false, goly: 0, asistence: 0, zapasuBezMinuty: 0, ...o,
});

/** Kádr, kde má každá parta koho milovat — jinak by test neměl co rozlišovat. */
const KADR: HodnocenyHrac[] = [
  h({ id: "dric", lastName: "Dřič", workRate: 90, aggression: 75, discipline: 35, goly: 2 }),
  h({ id: "mladik", lastName: "Mládek", age: 18, discipline: 90, aggression: 10, alcohol: 5, goly: 1 }),
  h({ id: "veteran", lastName: "Pamětník", age: 36, experience: 110, patriotism: 90, domaci: true, leadership: 70 }),
  h({ id: "kanonyr", lastName: "Kanonýr", goly: 9, asistence: 4, alcohol: 70, overallRating: 55 }),
  h({ id: "prumer", lastName: "Průměrný" }),
  h({ id: "lajdak", lastName: "Lajdák", workRate: 15, discipline: 20, aggression: 70, goly: 0, overallRating: 25 }),
  h({ id: "lavicka", lastName: "Náhradník", overallRating: 48, zapasuBezMinuty: 6 }),
];

describe("každá parta soudí podle sebe", () => {
  it("kotel bere dříče výš než střelce, co se nehoní", () => {
    const dric = skoreObliby("kotel", KADR[0]);
    const lajdak = skoreObliby("kotel", KADR[5]);
    expect(dric).toBeGreaterThan(lajdak);
  });

  it("rodiny chtějí slušňáka, ne toho nejagresivnějšího", () => {
    const mladik = skoreObliby("rodiny", KADR[1]);
    const dric = skoreObliby("rodiny", KADR[0]);
    expect(mladik).toBeGreaterThan(dric);
  });

  it("pamětníci ctí toho, kdo je tu nejdéle a je odsud", () => {
    const veteran = skoreObliby("pametnici", KADR[2]);
    const kanonyr = skoreObliby("pametnici", KADR[3]);
    expect(veteran).toBeGreaterThan(kanonyr);
  });

  it("party se neshodnou na jednom jménu", () => {
    const vyhercu = new Set(
      (["kotel", "rodiny", "pametnici", "stamgasti"] as const).map((k) =>
        [...KADR].sort((a, b) => skoreObliby(k, b) - skoreObliby(k, a))[0].id,
      ),
    );
    expect(vyhercu.size).toBeGreaterThan(1);
  });

  it("kdo nehraje, na toho se zapomíná", () => {
    const hraje = skoreObliby("kotel", h({ id: "x", overallRating: 48, zapasuBezMinuty: 0 }));
    const sedi = skoreObliby("kotel", h({ id: "x", overallRating: 48, zapasuBezMinuty: 6 }));
    expect(sedi).toBeLessThan(hraje);
  });
});

describe("výběr miláčka", () => {
  it("malý kádr nikoho nevybírá — pět lidí otloukánka nepotřebuje", () => {
    const v = vyberOblibence("kotel", KADR.slice(0, 4));
    expect(v.oblibenec).toBeNull();
    expect(v.otloukanek).toBeNull();
  });

  it("vybere miláčka i otloukánka a nejsou to titíž", () => {
    const v = vyberOblibence("kotel", KADR);
    expect(v.oblibenec).not.toBeNull();
    expect(v.otloukanek).not.toBeNull();
    expect(v.oblibenec!.hrac.id).not.toBe(v.otloukanek!.hrac.id);
  });

  it("miláček se nemění bez zřetelného náskoku", () => {
    // Náskok se počítá z AKTUÁLNÍCH skóre obou, ne z toho uloženého — uložené
    // číslo je jen záznam. Proto kádr, kde jsou dva skoro stejní.
    const tesny: HodnocenyHrac[] = [
      h({ id: "vyzyvatel", lastName: "Vyzyvatel", workRate: 82, aggression: 70, goly: 2 }),
      h({ id: "drzitel", lastName: "Držitel", workRate: 80, aggression: 70, goly: 2 }),
      h({ id: "a" }), h({ id: "b" }), h({ id: "c" }),
      h({ id: "slaby", workRate: 10, aggression: 10, overallRating: 20 }),
    ];
    const bezDrzitele = vyberOblibence("kotel", tesny);
    expect(bezDrzitele.oblibenec!.hrac.id).toBe("vyzyvatel");

    const rozdil = skoreObliby("kotel", tesny.find((x) => x.id === "vyzyvatel")!)
      - skoreObliby("kotel", tesny.find((x) => x.id === "drzitel")!);
    expect(rozdil).toBeLessThan(NASKOK_NA_VYMENU);

    const sDrzitelem = vyberOblibence("kotel", tesny, {
      oblibenec: { playerId: "drzitel", score: 0 },
    });
    expect(sDrzitelem.oblibenec!.hrac.id).toBe("drzitel");
  });

  it("při velkém náskoku se miláček vymění", () => {
    const v = vyberOblibence("kotel", KADR);
    const puvodni = v.oblibenec!;
    // Držitelem je někdo výrazně slabší — ten místo neudrží.
    const slaby = KADR.find((x) => x.id === "lajdak")!;
    const rozdil = puvodni.score - skoreObliby("kotel", slaby);
    expect(rozdil).toBeGreaterThanOrEqual(NASKOK_NA_VYMENU);

    const vymeneny = vyberOblibence("kotel", KADR, {
      oblibenec: { playerId: slaby.id, score: 0 },
    });
    expect(vymeneny.oblibenec!.hrac.id).toBe(puvodni.hrac.id);
  });

  it("každá volba nese důvod, ne prázdný řetězec", () => {
    for (const k of ["kotel", "rodiny", "pametnici", "stamgasti", "parta_z_okoli"] as const) {
      const v = vyberOblibence(k, KADR);
      expect(v.oblibenec?.duvod).toBeTruthy();
      if (v.otloukanek) expect(v.otloukanek.duvod).toBeTruthy();
    }
  });
});
