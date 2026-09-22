/**
 * VIP lóže: kapacita, náklad a text v nabídce upgradu vycházejí z jediné škály.
 */
import { describe, expect, it } from "vitest";
import {
  calculateFacilityEffects, FACILITY_LABELS, getUpgradeOptions, SKALY, UPGRADE_COSTS,
} from "./stadium-generator";

describe("VIP lóže v katalogu", () => {
  it("má popisek a ceny jako tribuny", () => {
    expect(FACILITY_LABELS.vip_box).toBe("VIP lóže");
    expect(UPGRADE_COSTS.vip_box).toEqual([0, 55000, 170000, 450000]);
  });

  it("bere platícím divákům 30/60/100 míst", () => {
    const kap = (vip: number) => calculateFacilityEffects({ stands: 3, vip_box: vip }).capacityBonus;
    expect([0, 1, 2, 3].map(kap)).toEqual([500, 470, 440, 400]);
    expect(calculateFacilityEffects({ stands: 1, vip_box: 1 }).capacityBonus).toBe(60);
    expect(calculateFacilityEffects({ vip_box: 3 }).vipBoxCapacityLoss).toBe(100);
  });

  it("stojí 1 500 / 3 000 / 5 000 Kč za domácí zápas", () => {
    expect([0, 1, 2, 3].map((l) => calculateFacilityEffects({ vip_box: l }).vipBoxMatchCost))
      .toEqual([0, 1500, 3000, 5000]);
  });

  it("bonusy pro majitele a zastupitele rostou s úrovní", () => {
    const fx = (l: number) => calculateFacilityEffects({ vip_box: l });
    expect([0, 1, 2, 3].map((l) => fx(l).vipBoxSponsorFavorBonus)).toEqual([0, 1, 2, 3]);
    expect([0, 1, 2, 3].map((l) => fx(l).vipBoxSponsorAcceptanceBonus)).toEqual([0, 0.05, 0.1, 0.15]);
    expect([0, 1, 2, 3].map((l) => fx(l).vipBoxVillageFavorBonus)).toEqual([0, 1, 2, 3]);
  });

  it("nesmyslná úroveň se ořízne na 0–3", () => {
    expect(calculateFacilityEffects({ vip_box: 9 }).vipBoxMatchCost).toBe(5000);
    expect(calculateFacilityEffects({ vip_box: -2 }).vipBoxMatchCost).toBe(0);
  });

  it("bez tribuny je zamčená, s tribunou ne", () => {
    const bez = getUpgradeOptions({ stands: 0, vip_box: 0 }, 100, 100, 10, true).find((o) => o.facility === "vip_box");
    expect(bez?.locked).toBe(true);
    expect(bez?.lockDetail?.prerequisite).toBe("Nejdřív postav aspoň základní tribuny");
    const s = getUpgradeOptions({ stands: 1, vip_box: 0 }, 100, 100, 10, true).find((o) => o.facility === "vip_box");
    expect(s?.locked).toBe(false);
  });

  it("nabídka slibuje přesně přírůstek, ztráta míst jde první", () => {
    for (const current of [0, 1, 2]) {
      const o = getUpgradeOptions({ stands: 3, vip_box: current }, 100, 100, 10, true).find((x) => x.facility === "vip_box")!;
      const ztrata = SKALY.vip_box.seatsLost[current + 1] - SKALY.vip_box.seatsLost[current];
      const prvni = o.effect.match(/([+−-])\s*([\d.,]+)/);
      expect(prvni?.[1]).toBe("−");
      expect(Number(prvni?.[2])).toBe(ztrata);
      expect(o.effect).toContain(`provoz ${SKALY.vip_box.matchCost[current + 1]} Kč za domácí zápas`);
      expect(o.effect).not.toContain("—");
    }
  });
});
