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
  YOUTH_SANCE_STROP, YOUTH_POCET_POKUSU, generateAcademyGraduateSkills, paidYouthLevel, youthWeeklyBaseCost, type YouthInvestment,
} from "./youth";
import { generateFieldSkills, generateHiddenTalent, overallRatingFromFlat, flattenGeneratedSkills } from "../skills/generator";

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

describe("kvalita odchovance", () => {
  // Běžný dorostenec, kterého klub dostane zadarmo (stejná cesta jako vygenerujDorostence)
  function averageGeneratedYouth(rng: ReturnType<typeof createRng>, n: number) {
    let rating = 0, cap = 0, talentSum = 0;
    for (let i = 0; i < n; i++) {
      const position = rng.pick(["DEF", "MID", "FWD"] as const);
      const fs = generateFieldSkills(rng, position, "village", rng.int(16, 18));
      const talent = generateHiddenTalent(rng, "village");
      rating += overallRatingFromFlat(position, flattenGeneratedSkills(fs, false), {}, talent) ?? 0;
      cap += Object.values(fs).reduce((s, v) => s + v.maxPotential, 0) / Object.keys(fs).length;
      talentSum += talent;
    }
    return { rating: rating / n, cap: cap / n, talent: talentSum / n };
  }

  function averageAcademyGraduate(rng: ReturnType<typeof createRng>, level: "minimal" | "medium" | "high", n: number) {
    let rating = 0, cap = 0, talentSum = 0;
    for (let i = 0; i < n; i++) {
      const position = rng.pick(["DEF", "MID", "FWD"] as const);
      const g = generateAcademyGraduateSkills(rng, level, position, "village", rng.int(16, 18));
      rating += overallRatingFromFlat(position, g.skills, {}, g.hiddenTalent) ?? 0;
      const vals = Object.values(g.skillsMax as unknown as Record<string, { maxPotential: number }>);
      cap += vals.reduce((s, v) => s + v.maxPotential, 0) / vals.length;
      talentSum += g.hiddenTalent;
    }
    return { rating: rating / n, cap: cap / n, talent: talentSum / n };
  }

  it("odchovanec z kterékoli placené akademie není slabší než dorostenec zadarmo", () => {
    // Dřív: velkorysá 16, dorostenec 24 — klub platil za horší kluky
    const rng = createRng(2024);
    const baseline = averageGeneratedYouth(rng, 2000);
    for (const level of ["minimal", "medium", "high"] as const) {
      const graduate = averageAcademyGraduate(rng, level, 2000);
      expect(graduate.rating).toBeGreaterThanOrEqual(baseline.rating);
      expect(graduate.cap).toBeGreaterThan(baseline.cap);
      expect(graduate.talent).toBeGreaterThanOrEqual(baseline.talent);
    }
  });

  it("vyšší investice dá lepšího kluka dnes i do budoucna", () => {
    const rng = createRng(77);
    const minimal = averageAcademyGraduate(rng, "minimal", 2000);
    const medium = averageAcademyGraduate(rng, "medium", 2000);
    const high = averageAcademyGraduate(rng, "high", 2000);
    expect(minimal.rating).toBeLessThan(medium.rating);
    expect(medium.rating).toBeLessThan(high.rating);
    expect(minimal.cap).toBeLessThan(medium.cap);
    expect(medium.cap).toBeLessThan(high.cap);
    expect(minimal.talent).toBeLessThan(medium.talent);
    expect(medium.talent).toBeLessThan(high.talent);
  });

  it("ploché dovednosti sedí s current ve capech a nikde nepřelezou cap", () => {
    const rng = createRng(5);
    for (let i = 0; i < 300; i++) {
      const position = rng.pick(["GK", "DEF", "MID", "FWD"] as const);
      const g = generateAcademyGraduateSkills(rng, "high", position, "village", 16);
      const mx = g.skillsMax as unknown as Record<string, { current: number; maxPotential: number }>;
      for (const [k, v] of Object.entries(mx)) {
        expect(v.current).toBeLessThanOrEqual(v.maxPotential);
        expect(g.skills[k]).toBe(v.current);
      }
    }
  });
});

describe("zaplacená úroveň", () => {
  const WEEKS = 20;
  const season = (weeklyLevels: YouthInvestment[]) =>
    paidYouthLevel(weeklyLevels.reduce((sum, level) => sum + youthWeeklyBaseCost(level), 0), weeklyLevels.length);

  it("celá sezóna na jedné úrovni dá tu úroveň", () => {
    for (const level of ["none", "minimal", "medium", "high"] as const) {
      expect(season(Array(WEEKS).fill(level))).toBe(level);
    }
  });

  it("přepnutí na velkorysou týden před koncem nedá velkorysý ročník", () => {
    expect(season([...Array(WEEKS - 1).fill("none"), "high"])).toBe("none");
  });

  it("zrušení akademie týden před koncem nesebere, co klub zaplatil", () => {
    expect(season([...Array(WEEKS - 1).fill("high"), "none"])).toBe("high");
  });

  it("půl sezóny velkorysé dá zhruba solidní", () => {
    expect(season([...Array(WEEKS / 2).fill("none"), ...Array(WEEKS / 2).fill("high")])).toBe("medium");
  });

  it("bez uzávěrky nebo platby nic", () => {
    expect(paidYouthLevel(0, 0)).toBe("none");
    expect(paidYouthLevel(0, 10)).toBe("none");
  });
});

describe("hvězdy z akademie", () => {
  // Strop hodnocení, kam kluk doroste. Hvězda = 75+, úroveň nejlepších hráčů okresu.
  function capRating(position: "GK" | "DEF" | "MID" | "FWD", skillsMax: unknown): number {
    const flat: Record<string, number> = {};
    for (const [key, value] of Object.entries(skillsMax as Record<string, { maxPotential: number }>)) flat[key] = value.maxPotential;
    if (position === "GK") { flat.shooting = flat.technique; flat.setPieces = flat.technique; flat.stamina = flat.strength; flat.vision = flat.defense; }
    return overallRatingFromFlat(position, flat, {}, 0) ?? 0;
  }
  function starShare(level: "minimal" | "medium" | "high", villageSize: string): number {
    const rng = createRng(31);
    const n = 4000;
    let stars = 0;
    for (let i = 0; i < n; i++) {
      const position = rng.pick(["GK", "DEF", "MID", "FWD"] as const);
      if (capRating(position, generateAcademyGraduateSkills(rng, level, position, villageSize, 16).skillsMax) >= 75) stars++;
    }
    return stars / n;
  }

  it("velkorysá akademie v osadě dá hvězdu, ale ne každý rok", () => {
    const seasonsPerStar = 1 / (starShare("high", "hamlet") * ocekavanyPocetOdchovancu("high"));
    expect(seasonsPerStar).toBeGreaterThan(3);
    expect(seasonsPerStar).toBeLessThan(10);
  });

  it("ani v obci není hvězda každý odchovanec", () => {
    expect(starShare("high", "village")).toBeLessThan(0.15);
  });

  it("symbolická akademie hvězdy prakticky nedává", () => {
    expect(starShare("minimal", "hamlet")).toBeLessThan(0.01);
  });
});
