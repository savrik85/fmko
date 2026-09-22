/**
 * Dopady vlastností trenéra. Hlídá hlavně, že trenér se čtyřicítkou hraje
 * stejně jako předtím a že čísla v tabulce návrhu platí.
 */
import { describe, it, expect } from "vitest";
import {
  coachRelationBand,
  coachingTrainingMul,
  youthTrainingMul,
  youthMatchGrowthMod,
  disciplineAttendanceMod,
  disciplineFoulMul,
  disciplineCardMul,
  disciplinePubExcessMul,
  tacticsMatchBonus,
  tacticsFamiliarityMul,
  motivationMoraleBonus,
  motivationLeftOutSoftening,
  motivationSulkMod,
  leftOutRelationDrop,
  coachTransferPull,
  coachSigningFactor,
  coachAttributeEffects,
  LICENCE_LEVELS,
  licenceLabel,
  licenceCap,
  deriveLicenceLevel,
  newcomerCoachRelationship,
  staffRequiredLicence,
  attrCoursePrice,
  retakePrice,
  coachAwayValue,
  standInValue,
  coachAwayImpact,
  assistantEffectiveness,
} from "./coach";

describe("pásma vztahu k trenérovi", () => {
  it("hranice 80/60/40/20", () => {
    expect(coachRelationBand(80).key).toBe("idol");
    expect(coachRelationBand(79).key).toBe("loyal");
    expect(coachRelationBand(40).key).toBe("neutral");
    expect(coachRelationBand(39).key).toBe("skeptic");
    expect(coachRelationBand(0).key).toBe("hostile");
  });
});

describe("neutrální trenér (40) hraje jako dřív", () => {
  it("nové dopady jsou na čtyřicítce nulové", () => {
    expect(disciplineFoulMul(40)).toBe(1);
    expect(disciplineCardMul(40)).toBe(1);
    expect(disciplinePubExcessMul(40)).toBe(1);
    expect(disciplineAttendanceMod(40)).toBe(0);
    expect(tacticsMatchBonus(40)).toBe(0);
    expect(tacticsFamiliarityMul(40)).toBe(1);
    expect(youthMatchGrowthMod(40)).toBe(0);
    expect(motivationLeftOutSoftening(40)).toBe(0);
    expect(motivationSulkMod(40)).toBe(0);
  });

  it("dosavadní vzorce tréninku a morálky se nezměnily", () => {
    expect(coachingTrainingMul(40)).toBeCloseTo(1.12);
    expect(coachingTrainingMul(60)).toBeCloseTo(1.28);
    expect(youthTrainingMul(60)).toBeCloseTo(1.26);
    expect(motivationMoraleBonus(40)).toBe(1);
    expect(motivationMoraleBonus(60)).toBe(3);
    expect(motivationMoraleBonus(99)).toBe(6);
  });
});

describe("tabulka dopadů", () => {
  it("taktika v zápase: 10 / 40 / 60 / 99", () => {
    expect([10, 40, 60, 99].map(tacticsMatchBonus)).toEqual([-2, 0, 1, 4]);
    expect(Object.is(tacticsMatchBonus(35), -0)).toBe(false);
  });

  it("disciplína ubírá karty a fauly, lajdák je přidává", () => {
    expect(disciplineCardMul(99)).toBeCloseTo(0.7935);
    expect(disciplineCardMul(10)).toBeCloseTo(1.105);
    expect(disciplineFoulMul(60)).toBeCloseTo(0.95);
    expect(disciplinePubExcessMul(99)).toBeCloseTo(0.646);
    expect(disciplinePubExcessMul(0)).toBe(1.2);
  });

  it("sehranost roste rychleji s taktikem, ale v mezích", () => {
    expect(tacticsFamiliarityMul(10)).toBe(0.7);
    expect(tacticsFamiliarityMul(60)).toBeCloseTo(1.2);
    expect(tacticsFamiliarityMul(99)).toBeCloseTo(1.59);
  });

  it("mládež z minut: −15 % až +30 %", () => {
    expect(youthMatchGrowthMod(10)).toBeCloseTo(-0.15);
    expect(youthMatchGrowthMod(99)).toBeCloseTo(0.295);
  });
});

describe("nenominace a vztah k trenérovi", () => {
  it("první nenominace vztah nebere, další v řadě ano, nejvýš 4", () => {
    expect(leftOutRelationDrop(0, 40)).toBe(0);
    expect(leftOutRelationDrop(1, 40)).toBe(1);
    expect(leftOutRelationDrop(3, 40)).toBe(3);
    expect(leftOutRelationDrop(9, 40)).toBe(4);
  });

  it("motivátor to zmírní, ale aspoň bod to stojí", () => {
    expect(leftOutRelationDrop(3, 99)).toBe(2);
    expect(leftOutRelationDrop(1, 99)).toBe(1);
  });

  it("motivátor snižuje šanci na trucování", () => {
    expect(motivationSulkMod(99)).toBeCloseTo(-0.1967, 3);
    expect(motivationSulkMod(10)).toBeCloseTo(0.05, 3);
  });
});

describe("jméno trenéra na trhu", () => {
  it("stejní trenéři se navzájem ruší", () => {
    expect(coachTransferPull({ reputation: 50, licence: 1 }, { reputation: 50, licence: 1 })).toBe(0);
  });

  it("slavnější trenér s licencí láká, strop +10", () => {
    expect(coachTransferPull({ reputation: 70, licence: 3 }, { reputation: 30, licence: 0 })).toBe(10);
    expect(coachTransferPull({ reputation: 20, licence: 0 }, { reputation: 70, licence: 4 })).toBe(-8);
  });

  it("podpis volného hráče: 40 bez licence neutrální", () => {
    expect(coachSigningFactor({ reputation: 40, licence: 0 })).toBe(0);
    expect(coachSigningFactor({ reputation: 75, licence: 4 })).toBe(14);
  });
});

describe("popisky na profilu", () => {
  it("šest vlastností, žádná dlouhá pomlčka", () => {
    const fx = coachAttributeEffects({ coaching: 60, motivation: 55, tactics: 48, youthDevelopment: 30, discipline: 70, reputation: 45 });
    expect(fx.map((f) => f.key)).toEqual(["coaching", "motivation", "tactics", "youthDevelopment", "discipline", "reputation"]);
    for (const f of fx) for (const l of f.lines) expect(l).not.toContain("—");
    expect(fx[0].lines[0]).toBe("Šance na zlepšení v tréninku ×1,28");
    expect(fx[2].lines[0]).toBe("Přihrávky a obrana celé sestavy v zápase +1");
    expect(fx[3].lines[1]).toBe("Růst hráčů do 22 let z odehraných minut −5 %");
  });
});

describe("licence", () => {
  it("odvození z nejvyšší vlastnosti: nikomu strop nic nesebere", () => {
    const base = { coaching: 40, motivation: 40, tactics: 40, youthDevelopment: 40, discipline: 40 };
    expect(deriveLicenceLevel(base)).toBe(0);
    expect(deriveLicenceLevel({ ...base, coaching: 60 })).toBe(0);
    expect(deriveLicenceLevel({ ...base, coaching: 61 })).toBe(1);
    expect(deriveLicenceLevel({ ...base, tactics: 75 })).toBe(2);
    expect(deriveLicenceLevel({ ...base, discipline: 99 })).toBe(4);
  });

  it("stropy a štítky", () => {
    expect(LICENCE_LEVELS.map((l) => l.cap)).toEqual([60, 70, 80, 90, 99]);
    expect(licenceLabel(2)).toBe("UEFA B");
    expect(licenceCap(7)).toBe(99);
  });

  it("nováček respektuje licencovaného trenéra víc", () => {
    expect(newcomerCoachRelationship({ reputation: 40, licence: 0 })).toBe(50);
    expect(newcomerCoachRelationship({ reputation: 75, licence: 4 })).toBe(65);
    expect(newcomerCoachRelationship({ reputation: 15, licence: 0 })).toBe(47);
  });

  it("špičkoví zaměstnanci chtějí licenci", () => {
    expect([10, 13, 16, 18, 20].map(staffRequiredLicence)).toEqual([0, 1, 2, 3, 3]);
  });
});

describe("trenérská škola", () => {
  it("ceny kurzů vlastností rostou s hodnotou a jsou na stovky", () => {
    expect(attrCoursePrice("attr_basic", 40)).toBe(18_000);
    expect(attrCoursePrice("attr_basic", 60)).toBe(22_000);
    expect(attrCoursePrice("attr_advanced", 70)).toBe(65_000);
    expect(retakePrice(18_000)).toBe(3_600);
  });

  it("trenér mimo trénink: bez asistenta hodně, s dobrým asistentem málo", () => {
    expect(coachAwayValue(60, standInValue(null))).toBe(40);
    expect(coachAwayValue(60, standInValue(20))).toBe(60);
    expect(coachAwayValue(30, standInValue(20))).toBe(30);
    expect(standInValue(8)).toBe(40);
  });
});

describe("skloňování na profilu", () => {
  it("procentní body a nula", () => {
    const text = (d: number, m: number) => coachAttributeEffects({ coaching: 40, motivation: m, tactics: 40, youthDevelopment: 40, discipline: d, reputation: 40 });
    expect(text(47, 40)[4].lines[0]).toBe("Docházka na trénink: +1 procentní bod");
    expect(text(55, 40)[4].lines[0]).toBe("Docházka na trénink: +3 procentní body");
    expect(text(99, 40)[4].lines[0]).toBe("Docházka na trénink: +10 procentních bodů");
    expect(text(40, 40)[1].lines[2]).toBe("Šance, že nenominovaný začne trucovat: beze změny");
  });
});

describe("trenér na kurzu v praxi", () => {
  it("bez asistenta se trénink citelně zpomalí, s dobrým asistentem skoro vůbec", () => {
    const solo = coachAwayImpact({ coaching: 66, discipline: 47 }, null);
    expect(solo.coachingAway).toBe(43);
    expect(solo.slowdownPct).toBe(14);
    expect(solo.attendanceDropPp).toBeGreaterThanOrEqual(1);
    const helped = coachAwayImpact({ coaching: 66, discipline: 47 }, 20);
    expect(helped.slowdownPct).toBe(0);
    expect(assistantEffectiveness(14, 8)).toBe(12);
  });
});
