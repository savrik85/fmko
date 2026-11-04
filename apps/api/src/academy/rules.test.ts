import { describe, it, expect } from "vitest";
import { createRng } from "../generators/rng";
import {
  programWeeklyCost, programQuality, weeklyProgress, expectedKidsFromVillage, estimatedTalent, canPromote, quitChance,
  rollKids, WEEKS_PER_SEASON, MAX_KIDS_PER_VILLAGE, verdictText, talentShiftAt14,
} from "./rules";
import { programLevel, programFromLevel } from "./service";

const fullProgram = { upkeep: true, hall: true, bus: true };

describe("zázemí žáků", () => {
  it("bez provozu se neplatí nic a nikdo neroste", () => {
    expect(programWeeklyCost({ upkeep: false, hall: true, bus: true })).toBe(0);
    expect(programQuality({ program: { upkeep: false, hall: true, bus: true }, trainerEffectiveness: 20, managerYouth: 100, squadSize: 15 })).toBe(0);
  });

  it("plný program stojí 1 800 Kč týdně, méně než dřívější velkorysá akademie (2 791)", () => {
    expect(programWeeklyCost(fullProgram)).toBe(1800);
  });

  it("čtyři roky průměrné přípravy dají zhruba dřívější velkorysou akademii (+6 / +12)", () => {
    const q = programQuality({ program: { upkeep: true, hall: true, bus: false }, trainerEffectiveness: 10, managerYouth: 40, squadSize: 12 });
    const perWeek = weeklyProgress(q);
    expect(perWeek.current * WEEKS_PER_SEASON * 4).toBeGreaterThan(5);
    expect(perWeek.current * WEEKS_PER_SEASON * 4).toBeLessThan(8);
    expect(perWeek.cap * WEEKS_PER_SEASON * 4).toBeGreaterThan(10);
    expect(perWeek.cap * WEEKS_PER_SEASON * 4).toBeLessThan(16);
  });

  it("dobrý trenér, hala a dost kluků dávají lepší přípravu než holý provoz", () => {
    const bare = programQuality({ program: { upkeep: true, hall: false, bus: false }, trainerEffectiveness: null, managerYouth: 0, squadSize: 12 });
    const best = programQuality({ program: fullProgram, trainerEffectiveness: 18, managerYouth: 80, squadSize: 12 });
    const fewKids = programQuality({ program: fullProgram, trainerEffectiveness: 18, managerYouth: 80, squadSize: 5 });
    expect(best).toBeGreaterThan(bare + 0.4);
    expect(fewKids).toBeLessThan(best);
  });
});

describe("nábor", () => {
  it("osada skoro nic, obec s 2 000 obyvateli asi 1,6 kluka, víc než strop nikdy", () => {
    expect(expectedKidsFromVillage(60, 0)).toBeLessThan(0.1);
    expect(expectedKidsFromVillage(2000, 0)).toBeCloseTo(1.6, 1);
    expect(expectedKidsFromVillage(50_000, 0)).toBe(MAX_KIDS_PER_VILLAGE);
  });

  it("o kluky z obce s vlastním klubem se dělí", () => {
    expect(expectedKidsFromVillage(2000, 1)).toBeCloseTo(0.8, 1);
  });

  it("losování počtu drží střední hodnotu", () => {
    const rng = createRng(3);
    let sum = 0;
    for (let i = 0; i < 4000; i++) sum += rollKids(rng, 1.6);
    expect(sum / 4000).toBeGreaterThan(1.5);
    expect(sum / 4000).toBeLessThan(1.7);
  });
});

describe("odhad trenéra", () => {
  it("ve dvanácti se plete víc než v patnácti, dobrý trenér míň", () => {
    expect(Math.abs(estimatedTalent(40, 12, 1, null) - 40)).toBe(24);
    expect(Math.abs(estimatedTalent(40, 15, 1, null) - 40)).toBe(6);
    expect(Math.abs(estimatedTalent(40, 12, 1, 20) - 40)).toBe(12);
  });

  it("slova sedí na odhad", () => {
    expect(verdictText(80)).toContain("hvězda");
    expect(verdictText(10)).toContain("pro radost");
  });

  it("do dorostu od patnácti, výjimečný talent už ve čtrnácti", () => {
    expect(canPromote(14, 50)).toBe(false);
    expect(canPromote(14, 75)).toBe(true);
    expect(canPromote(15, 0)).toBe(true);
  });

  it("ve čtrnácti asi desetina kluků rozkvete a desetina vyhoří", () => {
    const rng = createRng(11);
    let bloom = 0;
    let burnout = 0;
    for (let i = 0; i < 5000; i++) {
      const d = talentShiftAt14(rng);
      if (d > 0) bloom++;
      if (d < 0) burnout++;
    }
    expect(bloom / 5000).toBeCloseTo(0.1, 1);
    expect(burnout / 5000).toBeCloseTo(0.1, 1);
  });
});

describe("odchody", () => {
  it("bez autobusu končí víc kluků z dalekých obcí", () => {
    expect(quitChance(70, 6, false)).toBeGreaterThan(quitChance(70, 6, true));
    expect(quitChance(70, 1, false)).toBe(quitChance(70, 1, true));
  });

  it("kluk, kterého to nebaví, končí častěji", () => {
    expect(quitChance(30, 0, true)).toBeGreaterThan(quitChance(80, 0, true));
  });
});

describe("úroveň zázemí pro AI trenéra", () => {
  it("převod tam a zpět sedí", () => {
    for (const level of ["none", "minimal", "medium", "high"] as const) {
      expect(programLevel(programFromLevel(level))).toBe(level);
    }
  });
});
