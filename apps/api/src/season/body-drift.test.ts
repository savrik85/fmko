import { describe, expect, it } from "vitest";
import { createRng } from "../generators/rng";
import {
  applyDailyWeight, dailyWeightChange, grownWeight, naturalWeight, summerWeightChange,
  weightAlertDue, weightSmsCause, weightSmsText, weightTrend, youthGrowthCm,
  type TrainingToday,
} from "./body-drift";

/** Rozprostře n událostí rovnoměrně do 30 dní. */
function spread(n: number, total = 30): Set<number> {
  return new Set(Array.from({ length: n }, (_, i) => Math.floor((i * total) / n)));
}

function month(start: number, natural: number, day: (i: number) => { pub?: boolean; alcohol?: number; training?: TrainingToday; injured?: boolean; planLoss?: number }) {
  let w = start;
  for (let i = 0; i < 30; i++) {
    const d = day(i);
    w = applyDailyWeight(w, dailyWeightChange({
      weight: w, natural, pubVisit: !!d.pub, alcohol: d.alcohol ?? 50, training: d.training ?? null, injured: !!d.injured,
      planLoss: d.planLoss,
    }));
  }
  return w - start;
}

describe("denní změna váhy: měsíční cíle ze spec", () => {
  it("štamgast (hospoda 13×, alkohol 80, netrénuje) přibere 1,0 až 1,5 kg", () => {
    const pub = spread(13);
    const gain = month(80, 80, (i) => ({ pub: pub.has(i), alcohol: 80 }));
    expect(gain).toBeGreaterThanOrEqual(1.0);
    expect(gain).toBeLessThanOrEqual(1.5);
  });

  it("průměrný hráč (hospoda 6×, 8 tréninků, 2 kondiční) zůstane v ±0,3 kg", () => {
    const pub = spread(6);
    const trainings = [...spread(8)].sort((a, b) => a - b);
    const conditioning = new Set(trainings.filter((_, i) => i % 4 === 0));
    const change = month(80, 80, (i) => ({
      pub: pub.has(i), alcohol: 50,
      training: trainings.includes(i) ? (conditioning.has(i) ? "conditioning" : "other") : null,
    }));
    expect(Math.abs(change)).toBeLessThanOrEqual(0.3);
  });

  it("dříč 5 kg nad přirozenou (17 tréninků, 4 kondiční, bez hospody) shodí 1,0 až 1,8 kg", () => {
    const trainings = [...spread(17)].sort((a, b) => a - b);
    const conditioning = new Set(trainings.filter((_, i) => i % 4 === 0).slice(0, 4));
    const change = month(85, 80, (i) => ({
      training: trainings.includes(i) ? (conditioning.has(i) ? "conditioning" : "other") : null,
    }));
    expect(change).toBeLessThanOrEqual(-1.0);
    expect(change).toBeGreaterThanOrEqual(-1.8);
  });

  it("zraněný celý měsíc přibere 0,6 až 1,0 kg", () => {
    const gain = month(80, 80, () => ({ injured: true }));
    expect(gain).toBeGreaterThanOrEqual(0.6);
    expect(gain).toBeLessThanOrEqual(1.0);
  });

  it("tah k přirozené váze působí jen shora: kdo je pod ní, nahoru se netáhne", () => {
    expect(dailyWeightChange({ weight: 90, natural: 94, pubVisit: false, alcohol: 50, training: null, injured: false })).toBe(0);
    expect(dailyWeightChange({ weight: 98, natural: 94, pubVisit: false, alcohol: 50, training: null, injured: false })).toBeCloseTo(-0.024, 5);
  });

  it("běžný trénink srazí váhu nejvýš na přirozenou, pod ni jen plán hubnutí", () => {
    const base = { natural: 94, pubVisit: false, alcohol: 50, injured: false } as const;
    expect(dailyWeightChange({ ...base, weight: 90, training: "other" })).toBe(0);
    expect(dailyWeightChange({ ...base, weight: 94.01, training: "conditioning" })).toBeCloseTo(-0.01, 3);
    expect(dailyWeightChange({ ...base, weight: 90, training: "other", planLoss: 0.2 })).toBeCloseTo(-0.23, 5);
  });

  it("hráč s nadváhou na plánu shodí kila a po plánu si je drží, dokud nechodí do hospody", () => {
    const trainings = spread(13);
    const onPlan = month(96, 96, (i) => ({ training: trainings.has(i) ? "other" : null, planLoss: 0.175 }));
    expect(onPlan).toBeLessThanOrEqual(-2.5);
    const after = month(96 + onPlan, 96, (i) => ({ training: trainings.has(i) ? "other" : null }));
    expect(after).toBe(0);
  });

  it("péče: trénink smí hráče stáhnout až na váhu bez postihu (careFloor), ne jen na přirozenou", () => {
    const base = { weight: 90, natural: 90, pubVisit: false, alcohol: 50, injured: false } as const;
    expect(dailyWeightChange({ ...base, training: "other" })).toBe(0);
    expect(dailyWeightChange({ ...base, training: "other", careFloor: 80 })).toBeCloseTo(-0.03, 5);
    expect(dailyWeightChange({ ...base, weight: 80.01, training: "conditioning", careFloor: 80 })).toBeCloseTo(-0.01, 5);
  });

  it("jídelníček ubírá každý den, ale jen nad váhou bez postihu", () => {
    const base = { natural: 90, pubVisit: false, alcohol: 50, injured: false, training: null } as const;
    expect(dailyWeightChange({ ...base, weight: 90, careFloor: 80, dietLoss: 0.02 })).toBeCloseTo(-0.02, 5);
    expect(dailyWeightChange({ ...base, weight: 80, careFloor: 80, dietLoss: 0.02 })).toBe(0);
  });

  it("hráč s nadváhou: bez péče za měsíc beze změny, s jídelníčkem a tréninkem shodí přes kilo", () => {
    const trainings = spread(10);
    const day = (i: number) => ({ training: (trainings.has(i) ? "other" : null) as TrainingToday });
    expect(month(96, 96, day)).toBe(0);
    let w = 96;
    for (let i = 0; i < 30; i++) {
      w = applyDailyWeight(w, dailyWeightChange({
        weight: w, natural: 96, pubVisit: false, alcohol: 50, injured: false, training: day(i).training, careFloor: 80, dietLoss: 0.02,
      }));
    }
    expect(w - 96).toBeLessThanOrEqual(-0.8);
  });

  it("bez přirozené váhy (chybí postava) se táhne jen hospodou a tréninkem", () => {
    expect(dailyWeightChange({ weight: 90, natural: null, pubVisit: false, alcohol: 50, training: null, injured: false })).toBe(0);
  });

  it("váha se drží mezi 50 a 140 kg a ukládá na setiny", () => {
    expect(applyDailyWeight(139.99, 0.5)).toBe(140);
    expect(applyDailyWeight(50.01, -0.5)).toBe(50);
    expect(applyDailyWeight(80, 0.123456)).toBe(80.12);
  });
});

describe("naturalWeight", () => {
  it("vlastní přirozená váha hráče (naturalBase) má přednost, od 28 let +0,5 % za rok", () => {
    expect(naturalWeight({ naturalBase: 90, height: 180, bodyType: "athletic" }, 25)).toBe(90);
    expect(naturalWeight({ naturalBase: 90 }, 38)).toBeCloseTo(94.5, 5);
  });

  it("bez naturalBase ideál × postava", () => {
    expect(naturalWeight({ height: 180, bodyType: "athletic" }, 25)).toBeCloseTo(76.14, 1);
    expect(naturalWeight({ height: 180, bodyType: "stocky" }, 25)).toBeCloseTo(87.56, 1);
    expect(naturalWeight({ height: 180, bodyType: "athletic" }, 38)).toBeCloseTo(76.14 * 1.05, 1);
  });

  it("bez naturalBase, výšky nebo postavy null", () => {
    expect(naturalWeight({ height: 0, bodyType: "normal" }, 25)).toBeNull();
    expect(naturalWeight({ height: 180 }, 25)).toBeNull();
  });
});

describe("summerWeightChange", () => {
  it("piják přes 30 s rusty +3 (strop), dříč s fit −1,5", () => {
    expect(summerWeightChange({ alcohol: 80, age: 32, event: "rusty" })).toBe(3);
    expect(summerWeightChange({ alcohol: 20, age: 24, event: "fit" })).toBe(-1.5);
    expect(summerWeightChange({ alcohol: 20, age: 24, event: null })).toBe(1);
  });
});

describe("růst dorostu", () => {
  it("do 17 let +2 až +4 cm, v 18 +1 až +2, pak nic", () => {
    const rng = createRng(3);
    for (let i = 0; i < 200; i++) {
      const g17 = youthGrowthCm(rng, 17);
      expect(g17).toBeGreaterThanOrEqual(2);
      expect(g17).toBeLessThanOrEqual(4);
      const g18 = youthGrowthCm(rng, 18);
      expect(g18).toBeGreaterThanOrEqual(1);
      expect(g18).toBeLessThanOrEqual(2);
      expect(youthGrowthCm(rng, 19)).toBe(0);
    }
  });

  it("váha roste se zachováním BMI: 175 cm / 70 kg → 178 cm / 72,42 kg", () => {
    expect(grownWeight(70, 175, 178)).toBe(72.42);
  });
});

describe("weightTrend", () => {
  const entries = [
    { gameDate: "2026-09-01", weight: 80 },
    { gameDate: "2026-09-10", weight: 81 },
    { gameDate: "2026-09-30", weight: 82 },
  ];

  it("bere záznam nejbližší 28 dnům v rozmezí 14–42 dní", () => {
    expect(weightTrend(83.4, entries, "2026-10-08", 14, 42)).toBe(2.4);
  });

  it("bez dost starého záznamu null", () => {
    expect(weightTrend(83, [{ gameDate: "2026-10-01", weight: 82 }], "2026-10-08", 14, 42)).toBeNull();
  });
});

describe("SMS o váze", () => {
  it("nárůst 3 kg a víc, nejvýš jednou za 30 dní", () => {
    expect(weightAlertDue({ gain: 3.2, lastSmsAt: null, today: "2026-10-08" })).toBe(true);
    expect(weightAlertDue({ gain: 2.9, lastSmsAt: null, today: "2026-10-08" })).toBe(false);
    expect(weightAlertDue({ gain: 3.5, lastSmsAt: "2026-09-20", today: "2026-10-08" })).toBe(false);
    expect(weightAlertDue({ gain: 3.5, lastSmsAt: "2026-09-01", today: "2026-10-08" })).toBe(true);
    expect(weightAlertDue({ gain: null, lastSmsAt: null, today: "2026-10-08" })).toBe(false);
  });

  it("příčina: zranění, pak hospoda (6+ za 28 dní), jinak nechodí na trénink", () => {
    expect(weightSmsCause({ injured: true, pubVisits28d: 10 })).toBe("injury");
    expect(weightSmsCause({ injured: false, pubVisits28d: 6 })).toBe("pub");
    expect(weightSmsCause({ injured: false, pubVisits28d: 2 })).toBe("idle");
  });

  it("text obsahuje jméno a kila s čárkou, bez dlouhé pomlčky", () => {
    const rng = createRng(1);
    for (const cause of ["pub", "idle", "injury"] as const) {
      for (let i = 0; i < 10; i++) {
        const text = weightSmsText(rng, cause, "Novák", 3.4);
        expect(text).toContain("Novák");
        expect(text).toContain("3,4");
        expect(text).not.toContain("—");
      }
    }
  });
});

describe("páky na váhu (část 3)", () => {
  it("plán hubnutí: trenér 0,5 a pracovitost 50 ubere ~2,3 kg za 13 tréninků", async () => {
    const { weightPlanDailyLoss } = await import("./body-drift");
    expect(13 * weightPlanDailyLoss(0.5, 50)).toBeCloseTo(2.275, 2);
    expect(weightPlanDailyLoss(1, 100)).toBeCloseTo(0.3125, 5);
    expect(weightPlanDailyLoss(0, 0)).toBeCloseTo(0.075, 5);
  });

  it("plán působí jen v den tréninku", () => {
    const base = { weight: 90, natural: 90, pubVisit: false, alcohol: 50, injured: false, planLoss: 0.2 };
    expect(dailyWeightChange({ ...base, training: null })).toBe(0);
    expect(dailyWeightChange({ ...base, training: "other" })).toBeCloseTo(-0.23, 5);
  });

  it("vybavení Váha a jídelníček: úroveň 3 v plném stavu půlí hospodu a zrychlí tah o polovinu", async () => {
    const { nutritionEffects } = await import("./body-drift");
    expect(nutritionEffects(0, 100)).toEqual({ pubMul: 1, pullMul: 1, dietLoss: 0, cared: false });
    expect(nutritionEffects(1, 100)).toEqual({ pubMul: 0.8, pullMul: 1, dietLoss: 0, cared: true });
    expect(nutritionEffects(3, 100)).toEqual({ pubMul: 0.5, pullMul: 1.5, dietLoss: 0.02, cared: true });
    expect(nutritionEffects(3, 0).cared).toBe(false);
    const half = nutritionEffects(2, 50);
    expect(half.pubMul).toBeCloseTo(1 - 0.35 * 0.5, 5);
    expect(half.pullMul).toBeCloseTo(1 + 0.25 * 0.5, 5);
  });

  it("násobky hospody a tahu vstupují do denní změny", () => {
    const pub = { weight: 80, natural: 80, pubVisit: true, alcohol: 50, training: null, injured: false };
    expect(dailyWeightChange({ ...pub, pubMul: 0.25 })).toBeCloseTo(0.02, 5);
    const pull = { weight: 90, natural: 80, pubVisit: false, alcohol: 50, training: null, injured: false };
    expect(dailyWeightChange({ ...pull, pullMul: 1.5 })).toBeCloseTo(-0.09, 5);
  });
});
