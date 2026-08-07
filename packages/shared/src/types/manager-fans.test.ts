import { describe, expect, it } from "vitest";
import {
  MANAGER_FANS,
  MANAGER_FANS_BANDS,
  managerFansBand,
  managerFansEffect,
  managerInfluence,
} from "./manager-fans";

/** Všechny reálné kombinace reputace × motivace, které v enginu mohou nastat. */
function everyManager(): Array<{ rep: number; mot: number }> {
  const out: Array<{ rep: number; mot: number }> = [];
  for (let rep = MANAGER_FANS.REP_MIN; rep <= MANAGER_FANS.REP_MAX; rep++) {
    for (let mot = MANAGER_FANS.MOT_MIN; mot <= MANAGER_FANS.MOT_MAX; mot++) {
      out.push({ rep, mot });
    }
  }
  return out;
}

describe("managerInfluence", () => {
  it("clampuje mimo rozsah na krajní hodnoty", () => {
    expect(managerInfluence(999, 999)).toBe(managerInfluence(MANAGER_FANS.REP_MAX, MANAGER_FANS.MOT_MAX));
    expect(managerInfluence(-999, -999)).toBe(managerInfluence(MANAGER_FANS.REP_MIN, MANAGER_FANS.MOT_MIN));
  });

  it("váží reputaci víc než motivaci", () => {
    // Stejný celkový součet, ale rozdělený ve prospěch reputace → vyšší vliv.
    expect(managerInfluence(70, 30)).toBeGreaterThan(managerInfluence(30, 70));
  });
});

describe("managerFansBand", () => {
  it("neutrál nedává fanouškům nic", () => {
    expect(managerFansBand(MANAGER_FANS.NEUTRAL).matchBoost).toBe(0);
  });

  it("vrátí pásmo i pro nulový a záporný vliv", () => {
    expect(managerFansBand(0).key).toBe("odepsany");
    expect(managerFansBand(-5).key).toBe("odepsany");
  });
});

describe("managerFansEffect", () => {
  it("je monotónní — lepší trenér nikdy nedá horší výsledek", () => {
    // Regrese na původní bug: Math.round vytvářel skoky, kde rep 67 dávala 0
    // a rep 64 dávala +1.
    for (const { rep, mot } of everyManager()) {
      if (rep < MANAGER_FANS.REP_MAX) {
        expect(managerFansEffect(rep + 1, mot).matchBoost)
          .toBeGreaterThanOrEqual(managerFansEffect(rep, mot).matchBoost);
      }
      if (mot < MANAGER_FANS.MOT_MAX) {
        expect(managerFansEffect(rep, mot + 1).matchBoost)
          .toBeGreaterThanOrEqual(managerFansEffect(rep, mot).matchBoost);
      }
    }
  });

  it("drží efekt i loajalitu v deklarovaném rozsahu", () => {
    for (const { rep, mot } of everyManager()) {
      const fx = managerFansEffect(rep, mot);
      expect(fx.matchBoost).toBeGreaterThanOrEqual(-3);
      expect(fx.matchBoost).toBeLessThanOrEqual(3);
      expect(fx.loyaltyOffset).toBeGreaterThanOrEqual(-2);
      expect(fx.loyaltyOffset).toBeLessThanOrEqual(2);
    }
    // Nesmyslné vstupy nesmí vzorec rozhodit.
    expect(managerFansEffect(-999, 999).matchBoost).toBeGreaterThanOrEqual(-3);
    expect(managerFansEffect(999, -999).matchBoost).toBeLessThanOrEqual(3);
  });

  it("nechá bez efektu jen malou menšinu reálných trenérů", () => {
    // Jádro opravy: původní vzorec měl mrtvou zónu, ve které nic nedělal
    // polovina trenérů. Rozsah odpovídá tomu, co generátor reálně vyrábí.
    let total = 0;
    let zero = 0;
    for (let rep = 20; rep <= 70; rep++) {
      for (let mot = 30; mot <= 70; mot++) {
        total++;
        if (managerFansEffect(rep, mot).matchBoost === 0) zero++;
      }
    }
    expect(zero / total).toBeLessThan(0.2);
  });

  it("rada 'chybí ti X bodů' je vždy splnitelná a opravdu překlopí do dalšího stupně", () => {
    // Dřív tenhle test případ na stropu PŘESKAKOVAL podmínkou rep + need <= REP_MAX,
    // takže prošla rada "zvedni reputaci o 5" trenérovi s reputací 75. Teď se nepřeskakuje:
    // nula znamená "tudy cesta nevede" a cokoli nenulového musí být dosažitelné i účinné.
    for (const { rep, mot } of everyManager()) {
      const fx = managerFansEffect(rep, mot);
      if (!fx.nextBand) continue;

      if (fx.repPointsToNext > 0) {
        expect(rep + fx.repPointsToNext).toBeLessThanOrEqual(MANAGER_FANS.REP_MAX);
        expect(managerFansEffect(rep + fx.repPointsToNext, mot).matchBoost)
          .toBeGreaterThan(fx.matchBoost);
      }
      if (fx.motPointsToNext > 0) {
        expect(mot + fx.motPointsToNext).toBeLessThanOrEqual(MANAGER_FANS.MOT_MAX);
        expect(managerFansEffect(rep, mot + fx.motPointsToNext).matchBoost)
          .toBeGreaterThan(fx.matchBoost);
      }
      // Aspoň jedna cesta musí existovat, jinak by karta ukázala stupeň bez návodu.
      expect(fx.repPointsToNext + fx.motPointsToNext).toBeGreaterThan(0);
    }
  });

  it("na nejvyšším stupni nikam neukazuje", () => {
    const top = managerFansEffect(MANAGER_FANS.REP_MAX, MANAGER_FANS.MOT_MAX);
    expect(top.nextBand).toBeNull();
    expect(top.pointsToNext).toBe(0);
    expect(top.repPointsToNext).toBe(0);
    expect(top.motPointsToNext).toBe(0);
  });

  it("rozpad sečte zpátky na celkový vliv", () => {
    for (const { rep, mot } of everyManager()) {
      const fx = managerFansEffect(rep, mot);
      expect(Math.round(fx.repPoints + fx.motPoints)).toBe(fx.influence);
    }
  });

  it("sedí na skutečných trenérech z testovací databáze", () => {
    // Regresní fixture — odchytí každou budoucí změnu vah nebo hranic pásem.
    const fixture: Array<[number, number, number, number]> = [
      // reputace, motivace, očekávaný vliv, očekávaný matchBoost
      [75, 51, 65, 3],
      [67, 45, 58, 3],
      [64, 62, 63, 3],
      [60, 44, 54, 2],
      [55, 58, 56, 2],
      [53, 53, 53, 2],
      [42, 55, 47, 1],
      [43, 42, 43, 0],
      [35, 54, 43, 0],
      [42, 36, 40, -1],
      [38, 40, 39, -1],
      [32, 52, 40, -1],
      [31, 51, 39, -1],
      [30, 47, 37, -1],
      [35, 36, 35, -2],
      [15, 39, 25, -3],
    ];
    for (const [rep, mot, influence, matchBoost] of fixture) {
      const fx = managerFansEffect(rep, mot);
      expect(`${rep}/${mot} → ${fx.influence} (${fx.matchBoost})`)
        .toBe(`${rep}/${mot} → ${influence} (${matchBoost})`);
    }
  });
});

describe("MANAGER_FANS_BANDS", () => {
  it("je seřazené sestupně a pokrývá celý rozsah", () => {
    for (let i = 1; i < MANAGER_FANS_BANDS.length; i++) {
      expect(MANAGER_FANS_BANDS[i].min).toBeLessThan(MANAGER_FANS_BANDS[i - 1].min);
    }
    expect(MANAGER_FANS_BANDS[MANAGER_FANS_BANDS.length - 1].min).toBe(0);
  });

  it("má rostoucí efekt s rostoucím pásmem", () => {
    for (let i = 1; i < MANAGER_FANS_BANDS.length; i++) {
      expect(MANAGER_FANS_BANDS[i].matchBoost).toBeLessThan(MANAGER_FANS_BANDS[i - 1].matchBoost);
      expect(MANAGER_FANS_BANDS[i].loyaltyOffset).toBeLessThanOrEqual(MANAGER_FANS_BANDS[i - 1].loyaltyOffset);
    }
  });

  it("má vyplněné české popisky", () => {
    for (const band of MANAGER_FANS_BANDS) {
      expect(band.label.length).toBeGreaterThan(0);
      expect(band.fanView.length).toBeGreaterThan(0);
    }
  });
});
