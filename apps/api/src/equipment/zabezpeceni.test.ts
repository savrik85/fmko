import { describe, expect, it } from "vitest";
import {
  calculateEffects, CATEGORIES, CATEGORY_LABELS, efektyZabezpeceni,
  getLevelDescription, getUpgradeEffectLabel,
} from "./equipment-generator";

describe("zabezpečení areálu", () => {
  it("je plnohodnotná kategorie vybavení", () => {
    expect(CATEGORIES).toContain("area_security");
    expect(CATEGORY_LABELS.area_security).toBe("Zabezpečení areálu");
    for (const lv of [0, 1, 2, 3]) expect(getLevelDescription("area_security", lv)).not.toBe("");
    for (const lv of [1, 2, 3]) expect(getUpgradeEffectLabel("area_security", lv)).not.toBe("");
  });

  it("zámek chrání i sešlý, alarm a kamera jen v použitelném stavu", () => {
    expect(efektyZabezpeceni(1, 10)).toEqual({ theftRiskMul: 0.6, alarmChance: 0, cameraCoverage: 0 });
    expect(efektyZabezpeceni(2, 39)).toEqual({ theftRiskMul: 0.35, alarmChance: 0, cameraCoverage: 0 });
    expect(efektyZabezpeceni(2, 40)).toEqual({ theftRiskMul: 0.35, alarmChance: 0.5, cameraCoverage: 1 });
    expect(efektyZabezpeceni(3, 90)).toEqual({ theftRiskMul: 0.2, alarmChance: 0.7, cameraCoverage: 2 });
  });

  it("klub bez zabezpečení nemá žádnou ochranu", () => {
    const fx = calculateEffects({}, {});
    expect(fx.theftRiskMul).toBe(1);
    expect(fx.alarmChance).toBe(0);
    expect(fx.cameraCoverage).toBe(0);
  });
});
