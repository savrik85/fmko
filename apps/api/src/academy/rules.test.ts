import { describe, it, expect } from "vitest";
import { createRng } from "../generators/rng";
import {
  programQuality, weeklyProgress, expectedKidsPerYear, estimatedTalent, canPlayUp, recommendsPlayUp, quitChance,
  rollKids, WEEKS_PER_SEASON, MAX_KIDS_PER_YEAR, MIN_SQUAD, verdictText, talentShiftAt13, youthTransferFee,
  upkeepWeekly, ACADEMY_LEVELS, academyLevelOf, coachSonAge, COACH_SON_CHANCE,
} from "./rules";

describe("kolik kluků obec dá", () => {
  it("osada do 500 obyvatel kluka jednou za dva roky, medián klubů (2 300) 3–4 na ročník", () => {
    expect(expectedKidsPerYear(400)).toBeCloseTo(0.6, 1);
    expect(expectedKidsPerYear(2300)).toBeGreaterThan(3);
    expect(expectedKidsPerYear(2300)).toBeLessThan(4);
    expect(expectedKidsPerYear(80_000)).toBe(MAX_KIDS_PER_YEAR);
  });

  it("obec s 1 500 obyvateli dá po čtyřech ročnících zhruba družstvo (9 kluků)", () => {
    expect(expectedKidsPerYear(1500) * 4).toBeCloseTo(MIN_SQUAD, 0);
  });

  it("losování počtu drží střední hodnotu", () => {
    const rng = createRng(3);
    let sum = 0;
    for (let i = 0; i < 4000; i++) sum += rollKids(rng, 1.6);
    expect(sum / 4000).toBeGreaterThan(1.5);
    expect(sum / 4000).toBeLessThan(1.7);
  });
});

describe("trenér a příprava", () => {
  it("bez trenéra žáci netrénují", () => {
    expect(programQuality({ coach: null, managerYouth: 80, squadSize: 15 })).toBe(0);
  });

  it("placený trenér je lepší než táta a dobrovolník s průměrným vůdcovstvím", () => {
    const staff = programQuality({ coach: "staff", staffEffectiveness: 12, managerYouth: 40, squadSize: 12 });
    const parent = programQuality({ coach: "parent", managerYouth: 40, squadSize: 12 });
    const volunteer = programQuality({ coach: "volunteer", volunteerLeadership: 40, managerYouth: 40, squadSize: 12 });
    expect(staff).toBeGreaterThan(parent);
    expect(staff).toBeGreaterThan(volunteer);
  });

  it("bez soutěže (pod 9 kluků) je příprava poloviční", () => {
    const full = programQuality({ coach: "parent", managerYouth: 40, squadSize: 12 });
    const few = programQuality({ coach: "parent", managerYouth: 40, squadSize: 5 });
    expect(few).toBeCloseTo(full / 2, 5);
  });

  it("čtyři roky u placeného trenéra dají zhruba +6 k dovednostem a +12 ke stropu", () => {
    const q = programQuality({ coach: "staff", staffEffectiveness: 10, managerYouth: 40, squadSize: 12 });
    const perWeek = weeklyProgress(q);
    expect(perWeek.current * WEEKS_PER_SEASON * 4).toBeGreaterThan(5);
    expect(perWeek.current * WEEKS_PER_SEASON * 4).toBeLessThan(8);
    expect(perWeek.cap * WEEKS_PER_SEASON * 4).toBeGreaterThan(10);
    expect(perWeek.cap * WEEKS_PER_SEASON * 4).toBeLessThan(16);
  });
});

describe("odhad trenéra a kategorie výš", () => {
  it("v jedenácti se plete víc než ve čtrnácti, placený trenér s dobrým úsudkem míň", () => {
    expect(Math.abs(estimatedTalent(40, 11, 1, null) - 40)).toBe(25);
    expect(Math.abs(estimatedTalent(40, 14, 1, null) - 40)).toBe(10);
    expect(Math.abs(estimatedTalent(40, 11, 1, 20) - 40)).toBe(13);
  });

  it("slova sedí na odhad", () => {
    expect(verdictText(80)).toContain("hvězda");
    expect(verdictText(10)).toContain("pro radost");
  });

  it("o kategorii výš od 13 let, trenér sám jen nadějného", () => {
    expect(canPlayUp(12)).toBe(false);
    expect(canPlayUp(13)).toBe(true);
    expect(recommendsPlayUp(13, 30)).toBe(false);
    expect(recommendsPlayUp(13, 60)).toBe(true);
  });

  it("ve třinácti asi desetina kluků rozkvete a desetina vyhoří", () => {
    const rng = createRng(11);
    let bloom = 0;
    let burnout = 0;
    for (let i = 0; i < 5000; i++) {
      const d = talentShiftAt13(rng);
      if (d > 0) bloom++;
      if (d < 0) burnout++;
    }
    expect(bloom / 5000).toBeCloseTo(0.1, 1);
    expect(burnout / 5000).toBeCloseTo(0.1, 1);
  });
});

describe("odchody a odstupné", () => {
  it("bez soutěže a bez trenéra končí víc kluků", () => {
    expect(quitChance(70, false, true)).toBeGreaterThan(quitChance(70, true, true));
    expect(quitChance(70, true, false)).toBeGreaterThan(quitChance(70, true, true));
  });

  it("odstupné za staršího žáka podle soutěže áčka klubu, kam jde (FAČR § 23)", () => {
    expect(youthTransferFee("okresni_prebor")).toBe(8_000);
    expect(youthTransferFee("okresni_soutez")).toBe(6_500);
    expect(youthTransferFee(null)).toBe(8_000);
  });
});

describe("úroveň akademie", () => {
  it("skromná je levnější a horší, ambiciózní dražší a lepší", () => {
    expect(upkeepWeekly(12, "modest")).toBe(560);
    expect(upkeepWeekly(12, "standard")).toBe(900);
    expect(upkeepWeekly(12, "ambitious")).toBe(1580);
    expect(ACADEMY_LEVELS.modest.growth).toBeLessThan(1);
    expect(ACADEMY_LEVELS.ambitious.growth).toBeGreaterThan(1);
    expect(quitChance(70, true, true, 0, ACADEMY_LEVELS.modest.quit)).toBeGreaterThan(quitChance(70, true, true, 0, ACADEMY_LEVELS.ambitious.quit));
  });

  it("neznámá úroveň je běžná", () => {
    expect(academyLevelOf(null)).toBe("standard");
    expect(academyLevelOf("elite")).toBe("standard");
  });
});

describe("syn trenéra", () => {
  it("má ho zhruba 45 % trenérů, pevně podle trenéra, a roste s ním", () => {
    let withSon = 0;
    for (let i = 0; i < 2000; i++) if (coachSonAge(`m-${i}`, 60) !== null) withSon++;
    expect(withSon / 2000).toBeCloseTo(COACH_SON_CHANCE, 1);
    const id = Array.from({ length: 200 }, (_, i) => `m-${i}`).find((x) => coachSonAge(x, 45) !== null)!;
    expect(coachSonAge(id, 46)).toBe(coachSonAge(id, 45)! + 1);
    expect(coachSonAge(id, 45)).toBe(coachSonAge(id, 45));
  });

  it("dvacetiletý trenér syna v žácích nemá", () => {
    for (let i = 0; i < 200; i++) {
      const age = coachSonAge(`m-${i}`, 20);
      expect(age === null || age < 0).toBe(true);
    }
  });
});
