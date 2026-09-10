/** Testy stavové matematiky part — čisté funkce, bez DB. */
import { describe, it, expect } from "vitest";
import {
  targetMood, driftToward, sizeForShare,
  MOOD_DRIFT_PER_DAY,
} from "./fan-group-state";

describe("cílová nálada", () => {
  const zaklad = { satisfaction: 50, passion: 50, ticketDiscount: 0, heat: 0 };

  it("při průměrné spokojenosti a nulové křivdě sedí uprostřed", () => {
    expect(targetMood(zaklad)).toBe(50);
  });

  it("vášnivější parta prožívá spokojenost i nespokojenost silněji", () => {
    const kotel = targetMood({ ...zaklad, satisfaction: 90, passion: 95 });
    const pametnici = targetMood({ ...zaklad, satisfaction: 90, passion: 45 });
    expect(kotel).toBeGreaterThan(pametnici);

    const kotelSpatne = targetMood({ ...zaklad, satisfaction: 10, passion: 95 });
    const pametniciSpatne = targetMood({ ...zaklad, satisfaction: 10, passion: 45 });
    expect(kotelSpatne).toBeLessThan(pametniciSpatne);
  });

  it("sleva náladu zvedne, křivda ji drží dole", () => {
    expect(targetMood({ ...zaklad, ticketDiscount: 0.2 })).toBeGreaterThan(50);
    expect(targetMood({ ...zaklad, heat: 100 })).toBeLessThan(50);
  });

  it("nikdy nevyleze z rozsahu 0–100", () => {
    expect(targetMood({ satisfaction: 100, passion: 100, ticketDiscount: 0.5, heat: 0 })).toBeLessThanOrEqual(100);
    expect(targetMood({ satisfaction: 0, passion: 100, ticketDiscount: 0, heat: 100 })).toBeGreaterThanOrEqual(0);
    expect(targetMood({ satisfaction: 200, passion: 200, ticketDiscount: 9, heat: -50 })).toBeLessThanOrEqual(100);
  });
});

describe("drift", () => {
  it("posune se o krok správným směrem", () => {
    expect(driftToward(50, 80, MOOD_DRIFT_PER_DAY)).toBe(54);
    expect(driftToward(50, 20, MOOD_DRIFT_PER_DAY)).toBe(46);
  });

  it("nepřestřelí cíl", () => {
    expect(driftToward(50, 52, MOOD_DRIFT_PER_DAY)).toBe(52);
    expect(driftToward(50, 48, MOOD_DRIFT_PER_DAY)).toBe(48);
    expect(driftToward(50, 50, MOOD_DRIFT_PER_DAY)).toBe(50);
  });
});

describe("velikost party", () => {
  it("je podílem na své vrstvě", () => {
    expect(sizeForShare(0.6, 100)).toBe(60);
    expect(sizeForShare(0.55, 33)).toBe(18);
  });

  it("prázdná fanbáze i nesmyslný podíl dají nulu nebo strop, ne NaN", () => {
    expect(sizeForShare(0.6, 0)).toBe(0);
    expect(sizeForShare(-1, 100)).toBe(0);
    expect(sizeForShare(5, 100)).toBe(100);
    expect(sizeForShare(0.5, -20)).toBe(0);
  });
});

