import { describe, expect, it } from "vitest";
import { createRng } from "../generators/rng";
import { calculateFacilityEffects, generateStadium, getUpgradeOptions } from "./stadium-generator";

function lightingUpgrade(currentLevel: number) {
  return getUpgradeOptions(
    { lighting: currentLevel },
    100,
    100,
    10,
  ).find((option) => option.facility === "lighting");
}

function entranceGateUpgrade(currentLevel: number) {
  return getUpgradeOptions(
    { entrance_gate: currentLevel },
    100,
    100,
    10,
  ).find((option) => option.facility === "entrance_gate");
}

describe("osvětlení stadionu", () => {
  it("začíná na L0 bez ohledu na velikost obce, stejně jako existující kluby", () => {
    expect(generateStadium(createRng(1), "hamlet").lighting).toBe(0);
    expect(generateStadium(createRng(1), "small_city").lighting).toBe(0);
    expect(generateStadium(createRng(1), "city").lighting).toBe(0);
  });

  it("nabízí historické ceny a efekty pro všechny tři úrovně", () => {
    expect(lightingUpgrade(0)).toMatchObject({
      currentLevel: 0,
      nextLevel: 1,
      cost: 95_000,
      effect: "2 základní osvětlovací stožáry",
    });
    expect(lightingUpgrade(1)).toMatchObject({
      currentLevel: 1,
      nextLevel: 2,
      cost: 280_000,
      effect: "4 stožáry — +5% návštěvnost",
    });
    expect(lightingUpgrade(2)).toMatchObject({
      currentLevel: 2,
      nextLevel: 3,
      cost: 600_000,
      effect: "Profesionální osvětlení — +10% návštěvnost",
    });
    expect(lightingUpgrade(3)).toBeUndefined();
  });

  it("přičítá bonus osvětlení k parkovišti a chybějící hodnotu bere jako L0", () => {
    expect(calculateFacilityEffects({ parking: 2 }).attendanceBonus).toBeCloseTo(0.10);
    expect(calculateFacilityEffects({ lighting: 1, parking: 2 }).attendanceBonus).toBeCloseTo(0.10);
    expect(calculateFacilityEffects({ lighting: 2, parking: 2 }).attendanceBonus).toBeCloseTo(0.15);
    expect(calculateFacilityEffects({ lighting: 3, parking: 2 }).attendanceBonus).toBeCloseTo(0.20);
  });

  it("v lokálním testovacím režimu přeskočí progresní zámky, ale zachová návaznosti", () => {
    const unlocked = getUpgradeOptions({ lighting: 1, stands: 0, roof: 0 }, 0, 0, 1, true);
    expect(unlocked.find((option) => option.facility === "lighting")?.locked).toBe(false);
    expect(unlocked.find((option) => option.facility === "roof")?.locked).toBe(true);
  });
});

describe("vstupní brána", () => {
  it("nabízí všechny tři úrovně se správnými cenami a efekty", () => {
    expect(entranceGateUpgrade(0)).toMatchObject({
      currentLevel: 0,
      nextLevel: 1,
      cost: 12_000,
      effect: "Rychlejší odbavení — +2% návštěvnost",
    });
    expect(entranceGateUpgrade(1)).toMatchObject({
      currentLevel: 1,
      nextLevel: 2,
      cost: 45_000,
      effect: "2 turnikety — +5% návštěvnost",
    });
    expect(entranceGateUpgrade(2)).toMatchObject({
      currentLevel: 2,
      nextLevel: 3,
      cost: 120_000,
      effect: "Elektronické turnikety — +10% návštěvnost",
    });
    expect(entranceGateUpgrade(3)).toBeUndefined();
  });

  it("zvyšuje návštěvnost nezávisle na oplocení a nemění vstupné", () => {
    const base = calculateFacilityEffects({ fence: 2, parking: 1 });
    const level1 = calculateFacilityEffects({ fence: 2, parking: 1, entrance_gate: 1 });
    const level2 = calculateFacilityEffects({ fence: 2, parking: 1, entrance_gate: 2 });
    const level3 = calculateFacilityEffects({ fence: 2, parking: 1, entrance_gate: 3 });

    expect(level1.attendanceBonus).toBeCloseTo(base.attendanceBonus + 0.02);
    expect(level2.attendanceBonus).toBeCloseTo(base.attendanceBonus + 0.05);
    expect(level3.attendanceBonus).toBeCloseTo(base.attendanceBonus + 0.10);
    expect(level1.fencePayingRatio).toBe(base.fencePayingRatio);
    expect(level2.fencePayingRatio).toBe(base.fencePayingRatio);
    expect(level3.fencePayingRatio).toBe(base.fencePayingRatio);
    expect(level1.ticketPriceBonus).toBe(base.ticketPriceBonus);
    expect(level2.ticketPriceBonus).toBe(base.ticketPriceBonus);
    expect(level3.ticketPriceBonus).toBe(base.ticketPriceBonus);
  });
});

/**
 * Tribuny mají dohnat to, co klub zdědil.
 *
 * Základ stadionu se řídí velikostí obce (na samotě 120, ve větší obci 290),
 * ale upgrade stojí všechny stejně — a strop kapacity se v okresním přeboru
 * vyprodává skoro v každém zápase, takže rozdíl v základu jde rovnou do tržeb.
 * Kdo tribuny postaví, musí se dotáhnout; jinak o výdělku klubu rozhoduje
 * adresa, ne hra.
 */
describe("tribuny vyrovnávají start", () => {
  const kapacita = (zaklad: number, stands: number) =>
    zaklad + calculateFacilityEffects({ stands }).capacityBonus;

  const VES = 120;   // FK Löffler Spůle, 62 obyvatel
  const OBEC = 290;  // FK KMP Čkyně, 1550 obyvatel

  it("každá úroveň přidá stejně oběma — ceny jsou taky pro všechny stejné", () => {
    for (const level of [1, 2, 3]) {
      expect(kapacita(OBEC, level) - kapacita(VES, level)).toBe(OBEC - VES);
    }
  });

  it("po plné investici je ves na obci nejvýš o pětinu pozadu", () => {
    expect(kapacita(OBEC, 3) / kapacita(VES, 3)).toBeLessThan(1.25);
  });

  it("bez tribun rozhoduje adresa — to je ten rozdíl, který se má dát dohnat", () => {
    expect(kapacita(OBEC, 0) / kapacita(VES, 0)).toBeGreaterThan(2);
  });

  it("vyšší úroveň dá vždycky víc než nižší", () => {
    const skoky = [0, 1, 2, 3].map((l) => calculateFacilityEffects({ stands: l }).capacityBonus);
    expect(skoky).toEqual([...skoky].sort((a, b) => a - b));
    expect(new Set(skoky).size).toBe(4);
  });
});
