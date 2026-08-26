/**
 * Mentoring: zkušený harcovník v kabině táhne mladé nahoru.
 *
 * Testuje se hlavně to, že bonus dostane jen mladík a jen tehdy, když mentor na trénink
 * opravdu dorazí — jinak by stačilo mít veterána na soupisce a nikdy ho neposlat na hřiště.
 */
import { describe, it, expect } from "vitest";
import { createRng } from "../generators/rng";
import { mentoringMod, simulateTraining, MENTOR_MIN_LEADERSHIP, type TrainingPlayer } from "./training";

function hrac(over: Partial<TrainingPlayer> & { age: number }): TrainingPlayer {
  return {
    firstName: "Jan", lastName: "Novák", position: "MID",
    speed: 30, technique: 30, shooting: 30, passing: 30, heading: 30, defense: 30,
    goalkeeping: 1, vision: 30, creativity: 30, setPieces: 30, stamina: 30, strength: 30,
    injuryProneness: 50, discipline: 95, patriotism: 50, alcohol: 10, temper: 30,
    occupation: "zedník", bodyType: "normal", avatarConfig: {} as never,
    condition: 100, morale: 50, preferredFoot: "right", preferredSide: "center",
    leadership: 30, workRate: 50, aggression: 40, consistency: 50, clutch: 50,
    ...over,
  } as TrainingPlayer;
}

const PLAN = { sessionsPerWeek: 3, type: "tactics" as const, approach: "balanced" as const };

describe("mentoringMod", () => {
  it("pod prahem vůdcovství nedává nic", () => {
    expect(mentoringMod(MENTOR_MIN_LEADERSHIP - 1)).toBe(1);
    expect(mentoringMod(0)).toBe(1);
  });

  it("roste s vůdcovstvím a je zastropovaný na +25 %", () => {
    expect(mentoringMod(70)).toBeGreaterThan(mentoringMod(60));
    expect(mentoringMod(100)).toBeCloseTo(1.25, 5);
    expect(mentoringMod(200)).toBeCloseTo(1.25, 5);
  });
});

describe("mentor v tréninku", () => {
  it("vůdčí veterán na tréninku se ohlásí jako mentor", () => {
    const squad = [hrac({ age: 34, leadership: 85 }), hrac({ age: 18 })];
    const r = simulateTraining(createRng(5), squad, PLAN);
    expect(r.mentor?.playerIndex).toBe(0);
    expect(r.mentor?.bonusPct).toBeGreaterThan(0);
  });

  it("bez mladíka v kádru se mentor nehlásí", () => {
    const squad = [hrac({ age: 34, leadership: 85 }), hrac({ age: 28 })];
    expect(simulateTraining(createRng(5), squad, PLAN).mentor).toBeUndefined();
  });

  it("mladý kapitán mentorem není — na to je potřeba věk", () => {
    const squad = [hrac({ age: 24, leadership: 95 }), hrac({ age: 18 })];
    expect(simulateTraining(createRng(5), squad, PLAN).mentor).toBeUndefined();
  });

  it("veterán bez autority mentorem není", () => {
    const squad = [hrac({ age: 36, leadership: 20 }), hrac({ age: 18 })];
    expect(simulateTraining(createRng(5), squad, PLAN).mentor).toBeUndefined();
  });

  it("mentor zrychlí růst mladých v kádru", () => {
    const zlepseniMladych = (leadershipVeterana: number) => {
      let celkem = 0;
      for (let seed = 0; seed < 60; seed++) {
        const squad = [
          hrac({ age: 34, leadership: leadershipVeterana }),
          ...Array.from({ length: 6 }, () => hrac({ age: 18 })),
        ];
        const r = simulateTraining(createRng(seed), squad, PLAN);
        celkem += r.improvements.filter((i) => i.playerIndex > 0 && i.change > 0).length;
      }
      return celkem;
    };
    expect(zlepseniMladych(95)).toBeGreaterThan(zlepseniMladych(20));
  });
});
