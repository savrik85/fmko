import { describe, expect, it } from "vitest";
import { bodyEffects, generateHeightWeight, gkReachFactor, idealWeight, isBodyType, playerBodyView } from "./physicals";
import type { BodyType } from "./physicals";
import { createRng } from "./rng";

describe("idealWeight", () => {
  it("BMI 23,5: 180 cm → 76 kg, 190 cm → 85 kg", () => {
    expect(Math.round(idealWeight(180))).toBe(76);
    expect(Math.round(idealWeight(190))).toBe(85);
  });
});

describe("bodyEffects", () => {
  it("180 cm / 90 kg: −5 rychlost, −5 výdrž, +1 síla", () => {
    const e = bodyEffects({ height: 180, weight: 90 });
    expect(e).toMatchObject({ speed: -5, stamina: -5, strength: 1, heading: 0 });
    expect(e.gkReach).toBeCloseTo(0.96);
  });

  it("hmotnost přidá sílu až od 12 kg nadváhy", () => {
    expect(bodyEffects({ height: 180, weight: 87 }).strength).toBe(0);
    expect(bodyEffects({ height: 180, weight: 89 }).strength).toBe(1);
  });

  it("v toleranci ±4 kg se nic neděje", () => {
    const e = bodyEffects({ height: 180, weight: 79 });
    expect([e.speed, e.stamina, e.strength]).toEqual([0, 0, 0]);
  });

  it("190 cm / 70 kg: podváha −5 síla, rychlost beze změny", () => {
    const e = bodyEffects({ height: 190, weight: 70 });
    expect(e.strength).toBe(-5);
    expect(e.speed).toBe(0);
  });

  it("stropy: nadváha −12, hmotnost +1, podváha −6", () => {
    const fat = bodyEffects({ height: 170, weight: 140 });
    expect(fat.speed).toBe(-12);
    expect(fat.stamina).toBe(-12);
    expect(fat.strength).toBe(1);
    expect(bodyEffects({ height: 194, weight: 55 }).strength).toBe(-6);
  });

  it("výška: 192 cm +5 hlavičky, 170 cm −4, 179 cm 0 (ne −0)", () => {
    expect(bodyEffects({ height: 192, weight: 87 }).heading).toBe(5);
    expect(bodyEffects({ height: 170, weight: 68 }).heading).toBe(-4);
    expect(Object.is(bodyEffects({ height: 179, weight: 75 }).heading, 0)).toBe(true);
  });

  it("chybějící nebo nečíselné údaje jsou neutrální", () => {
    const neutral = { speed: 0, stamina: 0, strength: 0, heading: 0, gkReach: 1 };
    expect(bodyEffects({})).toEqual(neutral);
    expect(bodyEffects(null)).toEqual(neutral);
    expect(bodyEffects({ height: "180", weight: "90" })).toEqual(neutral);
    expect(bodyEffects({ height: 0, weight: 90 })).toEqual(neutral);
  });

  it("výška bez váhy: hlavičky a dosah ano, váhové úpravy ne", () => {
    const e = bodyEffects({ height: 190 });
    expect(e).toMatchObject({ speed: 0, stamina: 0, strength: 0, heading: 4 });
    expect(e.gkReach).toBeCloseTo(1.04);
  });

  it("nevrací zápornou nulu", () => {
    const e = bodyEffects({ height: 180, weight: 80 });
    for (const v of [e.speed, e.stamina, e.strength, e.heading]) expect(Object.is(v, -0)).toBe(false);
  });
});

describe("gkReachFactor", () => {
  it("185 cm = 1, 193 cm = 1,064, strop 0,9–1,1, bez výšky 1", () => {
    expect(gkReachFactor(185)).toBe(1);
    expect(gkReachFactor(193)).toBeCloseTo(1.064);
    expect(gkReachFactor(210)).toBe(1.1);
    expect(gkReachFactor(160)).toBe(0.9);
    expect(gkReachFactor(undefined)).toBe(1);
  });
});

describe("playerBodyView", () => {
  it("vrátí typ postavy, zaokrouhlený ideál a úpravy bez dosahu", () => {
    expect(playerBodyView({ height: 180, weight: 90, bodyType: "stocky" })).toEqual({
      bodyType: "stocky", idealWeight: 76, weightCategory: "obese", effects: { speed: -5, stamina: -5, strength: 1, heading: 0 },
    });
  });

  it("neznámý typ postavy a chybějící výška", () => {
    expect(playerBodyView({ bodyType: "giant" })).toEqual({
      bodyType: null, idealWeight: null, weightCategory: null, effects: { speed: 0, stamina: 0, strength: 0, heading: 0 },
    });
  });

  it("isBodyType zná jen pět typů", () => {
    expect(isBodyType("obese")).toBe(true);
    expect(isBodyType("giant")).toBe(false);
    expect(isBodyType(undefined)).toBe(false);
  });
});

describe("generateHeightWeight", () => {
  const avgBmi = (bodyType: BodyType) => {
    const rng = createRng(99);
    let sum = 0;
    for (let i = 0; i < 2000; i++) {
      const { height, weight } = generateHeightWeight(rng, "MID", bodyType);
      sum += weight / (height / 100) ** 2;
    }
    return sum / 2000;
  };

  it("průměrné BMI podle postavy: hubený ~21, atletický ~23,5, normální ~25, zavalitý ~27, obézní ~31", () => {
    expect(avgBmi("thin")).toBeCloseTo(20.7, 0);
    expect(avgBmi("athletic")).toBeCloseTo(23.5, 0);
    expect(avgBmi("normal")).toBeCloseTo(24.7, 0);
    expect(avgBmi("stocky")).toBeCloseTo(27, 0);
    expect(avgBmi("obese")).toBeCloseTo(31, 0);
  });

  it("vrací uložitelný typ postavy, neznámý typ je normal", () => {
    const rng = createRng(1);
    expect(generateHeightWeight(rng, "GK", "stocky").bodyType).toBe("stocky");
    expect(generateHeightWeight(rng, "GK", "giant").bodyType).toBe("normal");
  });

  it("vyšší hráč je při stejné postavě těžší", () => {
    const rng = createRng(5);
    const samples = Array.from({ length: 3000 }, () => generateHeightWeight(rng, "DEF", "normal"));
    const tall = samples.filter((s) => s.height >= 185);
    const short = samples.filter((s) => s.height <= 175);
    const mean = (xs: typeof samples) => xs.reduce((a, s) => a + s.weight, 0) / xs.length;
    expect(mean(tall)).toBeGreaterThan(mean(short) + 5);
  });
});

describe("weightCategory v playerBodyView", () => {
  it("podváha pod −4 kg, ideální do ±4, nadváha do +12, nad tím velká nadváha", () => {
    const cat = (weight: number) => playerBodyView({ height: 180, weight }).weightCategory;
    expect(cat(66)).toBe("under");
    expect(cat(72.5)).toBe("ideal");
    expect(cat(80)).toBe("ideal");
    expect(cat(85)).toBe("over");
    expect(cat(88)).toBe("over");
    expect(cat(89)).toBe("obese");
  });
});
