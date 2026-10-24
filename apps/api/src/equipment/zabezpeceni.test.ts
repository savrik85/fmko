import { describe, expect, it } from "vitest";
import {
  calculateEffects, CATEGORIES, CATEGORY_LABELS, efektyZabezpeceni,
  getLevelDescription, getUpgradeEffectLabel, getUpgradeEffectNote, getUpgradeOptions,
} from "./equipment-generator";

describe("popisek efektu a poznámka k opotřebení", () => {
  it("popisek je jen efekt, obecná věta o opotřebení je na stránce jednou, ne u každé karty", () => {
    expect(getUpgradeEffectLabel("balls", 3)).not.toContain("plném stavu");
    expect(getUpgradeEffectNote("balls", 3)).toBe("");
  });

  it("zabezpečení má vlastní poznámku, protože se stavem nenásobí", () => {
    expect(getUpgradeEffectNote("area_security", 2)).toContain("nefungují");
    expect(getUpgradeEffectNote("area_security", 1)).toBe("");
  });

  it("nabídka vylepšení nese poznámku zvlášť", () => {
    const security = getUpgradeOptions({ area_security: 1 }, 100, 50, 1).find((o) => o.category === "area_security");
    expect(security?.effectNote).toContain("nefungují");
    expect(security?.effect).not.toContain("nefungují");
  });
});

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
