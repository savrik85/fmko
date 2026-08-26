/**
 * Ekonomika a výnos mládežnické akademie.
 *
 * Klíčové je srovnání s pasivním tokem: průměrnému klubu chodí ~2,5 nabídky dorostence
 * za 60 dní, tedy 4–7 za sezónu, a zadarmo. Akademie musí za své peníze nabídnout znatelně
 * víc než „jednoho kluka, možná" — jinak nemá důvod existovat.
 */
import { describe, it, expect } from "vitest";
import { createRng } from "../generators/rng";
import { FIRSTNAMES } from "../data/czech-names";
import {
  youthMonthlyCost, tryGraduateYouth, ocekavanyPocetOdchovancu, sanceJednohoPokusu,
  YOUTH_SANCE_STROP, YOUTH_POCET_POKUSU, type YouthInvestment,
} from "./youth";

const VESNICE = { region_code: "PT", category: "obec" as const, population: 1200, district: "PT" };
const PRIJMENI = { surnames: { Novák: 10, Dvořák: 8 }, female_forms: {} };
// Křestní jména jsou klíčovaná dekádou narození, ne jménem — proto skutečný pool,
// ať test nespadne na tvaru dat místo na chování akademie.
const JMENA = { male: FIRSTNAMES, female: {} };

describe("cena akademie", () => {
  it("roste s úrovní a žádná úroveň nestojí nic", () => {
    expect(youthMonthlyCost("none")).toBe(0);
    expect(youthMonthlyCost("minimal")).toBeLessThan(youthMonthlyCost("medium"));
    expect(youthMonthlyCost("medium")).toBeLessThan(youthMonthlyCost("high"));
  });

  it("nejvyšší úroveň je citelná proti fixním nákladům klubu", () => {
    // Fixní týdenní výdaje průměrného klubu na produkci: ~6 800 Kč
    const tydne = youthMonthlyCost("high") / 4.3;
    expect(tydne / 6800).toBeGreaterThan(0.3);
    // ...ale ne likvidační
    expect(tydne / 6800).toBeLessThan(0.6);
  });
});

describe("výnos akademie", () => {
  it("i nejlevnější akademie dá zhruba kluka za sezónu", () => {
    // Dřív vycházel vesnici jeden za tři sezóny, což bylo za týdenní platbu vyhozené peníze
    expect(ocekavanyPocetOdchovancu("minimal")).toBeGreaterThanOrEqual(0.8);
  });

  it("velkorysá dá za sezónu víc než dva kluky", () => {
    expect(ocekavanyPocetOdchovancu("high")).toBeGreaterThan(2);
  });

  it("výnos roste s úrovní investice", () => {
    expect(ocekavanyPocetOdchovancu("minimal")).toBeLessThan(ocekavanyPocetOdchovancu("medium"));
    expect(ocekavanyPocetOdchovancu("medium")).toBeLessThan(ocekavanyPocetOdchovancu("high"));
  });

  it("žádná investice nedá nic", () => {
    expect(ocekavanyPocetOdchovancu("none")).toBe(0);
    expect(YOUTH_POCET_POKUSU.none).toBe(0);
  });

  it("ani nejlepší akademie není jistota", () => {
    // Strop drží jednotlivý pokus pod 100 %, takže neúspěšný ročník je pořád možný
    expect(ocekavanyPocetOdchovancu("high")).toBeLessThan(YOUTH_POCET_POKUSU.high);
  });

  it("velikost obce se do POČTU odchovanců nepromítá", () => {
    // Vesnice s 54 obyvateli musí dostat totéž co město — vzorec populace/3000 posadil
    // jedenáct klubů z třiadvaceti na dno stupnice a akademie tam nedávala smysl
    for (const uroven of ["minimal", "medium", "high"] as const) {
      expect(sanceJednohoPokusu(uroven)).toBe(sanceJednohoPokusu(uroven));
    }
    expect(ocekavanyPocetOdchovancu("minimal")).toBeGreaterThan(0.5);
  });
});

describe("tryGraduateYouth", () => {
  it("bez investice nikdy nikdo neprojde", () => {
    const rng = createRng(1);
    for (let i = 0; i < 50; i++) {
      expect(tryGraduateYouth(rng, { investment: "none", villagPopulation: 5000 }, VESNICE, PRIJMENI, JMENA)).toBeNull();
    }
  });

  it("skutečná úspěšnost sedí na deklarovanou šanci", () => {
    const rng = createRng(99);
    const POKUSU = 600;
    let uspechu = 0;
    for (let i = 0; i < POKUSU; i++) {
      if (tryGraduateYouth(rng, { investment: "high", villagPopulation: 6000 }, VESNICE, PRIJMENI, JMENA)) uspechu++;
    }
    const podil = uspechu / POKUSU;
    // popMod pro 6000 obyvatel je zastropovaný na 1,5 → 0,70 × 1,5 = 1,05, srazí se na strop
    expect(podil).toBeGreaterThan(YOUTH_SANCE_STROP - 0.08);
    expect(podil).toBeLessThan(YOUTH_SANCE_STROP + 0.08);
  });

  it("odchovanec je mladík se jménem a pozicí", () => {
    const rng = createRng(7);
    let g = null;
    for (let i = 0; i < 50 && !g; i++) {
      g = tryGraduateYouth(rng, { investment: "high", villagPopulation: 5000 }, VESNICE, PRIJMENI, JMENA);
    }
    expect(g).not.toBeNull();
    expect(g!.player.age).toBeGreaterThanOrEqual(16);
    expect(g!.player.age).toBeLessThanOrEqual(18);
    expect(g!.player.firstName.length).toBeGreaterThan(0);
    expect(["GK", "DEF", "MID", "FWD"]).toContain(g!.player.position);
    expect(g!.description).toContain(g!.player.lastName);
  });
});
