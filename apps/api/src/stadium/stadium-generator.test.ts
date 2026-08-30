import { describe, expect, it } from "vitest";
import { createRng } from "../generators/rng";
import { calculateFacilityEffects, generateStadium, getUpgradeOptions } from "./stadium-generator";
import type { StadiumFacilityEffects } from "./stadium-generator";

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
      effect: "4 stožáry — +5 % návštěvnost",
    });
    expect(lightingUpgrade(2)).toMatchObject({
      currentLevel: 2,
      nextLevel: 3,
      cost: 600_000,
      // L3 přidá stejných 5 % jako L2 — text dřív hlásil celkových 10 %.
      effect: "Profesionální osvětlení — +5 % návštěvnost",
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
      effect: "Rychlejší odbavení u vstupu — +2 % návštěvnost",
    });
    expect(entranceGateUpgrade(1)).toMatchObject({
      currentLevel: 1,
      nextLevel: 2,
      cost: 45_000,
      // Klub s L1 dostane 3 %, ne 5 — to je celková hodnota úrovně.
      effect: "Dva turnikety — +3 % návštěvnost",
    });
    expect(entranceGateUpgrade(2)).toMatchObject({
      currentLevel: 2,
      nextLevel: 3,
      cost: 120_000,
      effect: "Elektronické turnikety — +5 % návštěvnost",
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
 * Kapacita je funkce postaveného stadionu, ne adresy.
 *
 * Dva kluby se stejně postavenými tribunami musí mít stejnou kapacitu, ať jeden
 * hraje na samotě o 62 obyvatelích a druhý ve městě. Dřív rozhodovala velikost
 * obce (80 až 1200) plus náhodný rozptyl, takže i dva kluby v jedné vsi dostaly
 * jiný stadion — a protože se strop v okresním přeboru běžně vyprodá, byl to
 * trvalý rozdíl v tržbách, který se nedal dohnat.
 */
describe("kapacita podle stadionu, ne podle adresy", () => {
  const VELIKOSTI = ["hamlet", "vesnice", "obec", "mestys", "mesto", "small_city", "city"];

  it("stejný stadion má stejnou kapacitu bez ohledu na velikost obce", () => {
    const kapacity = VELIKOSTI.map((v) => generateStadium(createRng(1), v).capacity);
    expect(new Set(kapacity).size).toBe(1);
  });

  it("neznámá velikost obce nedostane jinou kapacitu než známá", () => {
    // `villages.size` obsahuje `village` a `town`, které v tabulce nejsou —
    // fallback proto nesmí vést k jinému stadionu.
    expect(generateStadium(createRng(1), "village").capacity)
      .toBe(generateStadium(createRng(1), "city").capacity);
    expect(generateStadium(createRng(7), "town").capacity)
      .toBe(generateStadium(createRng(99), "hamlet").capacity);
  });

  it("dva kluby ve stejné vsi dostanou totožnou kapacitu — žádný náhodný rozptyl", () => {
    const a = generateStadium(createRng(1), "hamlet").capacity;
    const b = generateStadium(createRng(2), "hamlet").capacity;
    const c = generateStadium(createRng(12345), "hamlet").capacity;
    expect([b, c]).toEqual([a, a]);
  });

  it("rozdíl v kapacitě dělají jedině postavené tribuny", () => {
    const zaklad = generateStadium(createRng(1), "hamlet").capacity;
    const kapacita = (stands: number) => zaklad + calculateFacilityEffects({ stands }).capacityBonus;
    const skoky = [0, 1, 2, 3].map(kapacita);
    expect(skoky).toEqual([...skoky].sort((a, b) => a - b));
    expect(new Set(skoky).size).toBe(4);
  });

  it("velká tribuna je znát víc než malá — jako na stadionu", () => {
    const zaklad = generateStadium(createRng(1), "hamlet").capacity;
    const kap = (s: number) => zaklad + calculateFacilityEffects({ stands: s }).capacityBonus;
    // L1→L2 musí být větší skok než L0→L1, jinak stavba neodpovídá tomu, co je vidět
    expect(kap(2) - kap(1)).toBeGreaterThan(kap(1) - kap(0));
    // a malá tribuna musí být znát aspoň o polovinu proti holému hřišti
    expect(kap(1) / kap(0)).toBeGreaterThanOrEqual(1.5);
  });

  it("drží čísla, na která je okresní přebor zvyklý", () => {
    // 440 je kapacita, kterou kluby s velkou tribunou měly odjakživa.
    // Když se tahle čtveřice mění, mění se ekonomika vstupného všem — ať to je vidět.
    const zaklad = generateStadium(createRng(1), "hamlet").capacity;
    expect([0, 1, 2, 3].map((s) => zaklad + calculateFacilityEffects({ stands: s }).capacityBonus))
      .toEqual([150, 240, 440, 650]);
  });
});

/**
 * Co tlačítko slíbí, to klub dostane.
 *
 * Nabídka upgradu ukazovala `UPGRADE_EFFECTS[nextLevel]`, což je ale kumulativní
 * bonus té úrovně, ne přírůstek. Klub s L1 tak u tribun za 170 000 Kč četl
 * „+190 kapacita" a dostal 100. Text se teď počítá z týchž čísel jako efekt.
 */
describe("slib v nabídce upgradu sedí se skutečností", () => {
  const nabidka = (stands: number) =>
    getUpgradeOptions({ stands }, 100, 100, 10, true).find((o) => o.facility === "stands");

  const kapacita = (stands: number) => calculateFacilityEffects({ stands }).capacityBonus;

  it.each([0, 1, 2])("z L%i na další úroveň přidá přesně to, co slibuje", (current) => {
    const slib = nabidka(current)!.effect;
    const skutecnost = kapacita(current + 1) - kapacita(current);
    expect(slib).toContain(`+${skutecnost} kapacita`);
  });

  it("součet slíbených přírůstků dá celkový bonus L3", () => {
    const soucet = [0, 1, 2]
      .map((l) => Number(nabidka(l)!.effect.match(/\+(\d+) kapacita/)![1]))
      .reduce((a, b) => a + b, 0);
    expect(soucet).toBe(kapacita(3));
  });

  it("na maximu už se nic nenabízí", () => {
    expect(nabidka(3)).toBeUndefined();
  });
});

/**
 * Žádné zařízení nesmí slíbit víc, než přidá.
 *
 * Popisky nesly kumulativní hodnotu úrovně, ale hráč je čte jako přírůstek:
 * u parkoviště L3 za 150 000 Kč stálo „+15 % návštěvnost" a klub s L2 dostal 5.
 * Text se teď počítá ze SKAL, tenhle test hlídá, že to tak zůstane — projde
 * všechna zařízení, všechny přechody, a porovná slíbené číslo se změřeným.
 */
describe("slib v nabídce sedí u všech zařízení", () => {
  const ZMERITELNE: Record<string, { hodnota: (e: StadiumFacilityEffects) => number; procenta?: boolean }> = {
    stands: { hodnota: (e) => e.capacityBonus },
    changing_rooms: { hodnota: (e) => e.homeMoraleBonus },
    showers: { hodnota: (e) => e.conditionRegenBonus },
    lighting: { hodnota: (e) => e.attendanceBonus, procenta: true },
    parking: { hodnota: (e) => e.attendanceBonus, procenta: true },
    entrance_gate: { hodnota: (e) => e.attendanceBonus, procenta: true },
    toilets: { hodnota: (e) => e.matchSatisfactionBonus },
    ultras_stand: { hodnota: (e) => e.homeCrowdMoraleBonus },
  };

  for (const [key, { hodnota, procenta }] of Object.entries(ZMERITELNE)) {
    for (const current of [0, 1, 2]) {
      it(`${key}: L${current} → L${current + 1}`, () => {
        const nabidka = getUpgradeOptions({ [key]: current }, 100, 100, 10, true)
          .find((o) => o.facility === key);
        expect(nabidka).toBeDefined();

        const zmereno = hodnota(calculateFacilityEffects({ [key]: current + 1 }))
          - hodnota(calculateFacilityEffects({ [key]: current }));
        const ocekavane = procenta ? Math.round(zmereno * 1000) / 10 : zmereno;

        const cislo = nabidka!.effect.match(/([+−-])\s*([\d.,]+)/);
        if (ocekavane === 0) {
          // Nulový přírůstek se nesmí inzerovat vůbec (osvětlení L0→L1 nedává nic).
          expect(nabidka!.effect).not.toMatch(/[+−]\s*[\d]/);
          return;
        }
        expect(cislo, `chybí číslo v "${nabidka!.effect}"`).not.toBeNull();
        expect(Number(cislo![2].replace(",", "."))).toBeCloseTo(ocekavane, 5);
      });
    }
  }

  it("nulový přírůstek se neinzeruje jako výhoda", () => {
    const o = getUpgradeOptions({ lighting: 0 }, 100, 100, 10, true)
      .find((x) => x.facility === "lighting");
    expect(o!.effect).toBe("2 základní osvětlovací stožáry");
  });
});
