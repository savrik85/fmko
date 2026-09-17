import { describe, expect, it } from "vitest";
import { createRng } from "../generators/rng";
import { simulateAttendance, simulateTraining, type TrainingPlayer } from "./training";
import type { Rng } from "../generators/rng";

function hrac(over: Partial<TrainingPlayer> = {}): TrainingPlayer {
  return {
    firstName: "Jan", lastName: "Novák", position: "MID", age: 25,
    speed: 30, technique: 30, shooting: 30, passing: 30, heading: 30, defense: 30,
    goalkeeping: 1, vision: 30, creativity: 30, setPieces: 30, stamina: 30, strength: 30,
    injuryProneness: 50, discipline: 100, patriotism: 50, alcohol: 10, temper: 30,
    occupation: "zedník", bodyType: "normal", avatarConfig: {} as never,
    condition: 100, morale: 50, preferredFoot: "right", preferredSide: "center",
    leadership: 30, workRate: 50, aggression: 40, consistency: 50, clutch: 50,
    ...over,
  } as TrainingPlayer;
}

const PLAN = { sessionsPerWeek: 3, type: "tactics" as const, approach: "strict" as const };

describe("incident na tréninku", () => {
  it("hráč s výslechem na trénink nepřijde a důvod je výslech", () => {
    const squad = [hrac(), hrac({ firstName: "Petr" })];
    for (let seed = 1; seed <= 30; seed++) {
      const s = simulateTraining(createRng(seed), squad, PLAN, undefined, 1, undefined, {}, undefined, ["Byl na výslechu na policii", undefined]);
      expect(s.attendance[0]).toEqual({ playerIndex: 0, attended: false, reason: "Byl na výslechu na policii" });
    }
  });

  it("bez incidentních důvodů je trénink stejný jako dřív", () => {
    // Vlastní kádr na každé volání — simulateTraining hráče mutuje (zlepšení, morálka),
    // takže sdílený kádr mezi oběma voláními by druhé volání startovalo z jiného stavu
    // než první a porovnání by nebylo čestné.
    for (let seed = 1; seed <= 30; seed++) {
      const squadA = [hrac(), hrac({ discipline: 20 }), hrac({ alcohol: 90 })];
      const squadB = squadA.map((p) => ({ ...p }));
      expect(simulateTraining(createRng(seed), squadA, PLAN, undefined, 1, undefined, {}, undefined, [undefined, undefined, undefined]))
        .toEqual(simulateTraining(createRng(seed), squadB, PLAN));
    }
  });
});

function simulateTrainingProSituace(
  rng: Rng,
  squad: never[],
  situace?: Array<readonly string[] | undefined>,
) {
  return simulateAttendance(rng, squad as never, "balanced", undefined, 0, 40, undefined, situace);
}

describe("docházka podle životní situace (spec 17b)", () => {
  const squad = (n: number) => Array.from({ length: n }, (_, i) => ({
    id: `p${i}`, firstName: "Hráč", lastName: String(i), age: 27, position: "MID",
    discipline: 50, skills: {}, personality: { discipline: 50, workRate: 50 },
  })) as never[];

  const kolikPrislo = (situace?: Array<readonly string[] | undefined>) => {
    let prislo = 0;
    for (let s = 1; s <= 200; s++) {
      const r = simulateTrainingProSituace(createRng(s), squad(1), situace);
      prislo += r.filter((a) => a.attended).length;
    }
    return prislo;
  };

  it("kdo přišel o práci nebo se rozvádí, chodí víc; kdo má dluhy, míň", () => {
    const bez = kolikPrislo(undefined);
    expect(kolikPrislo([["prisel_o_praci"]])).toBeGreaterThan(bez);
    expect(kolikPrislo([["rozvod"]])).toBeGreaterThan(bez);
    expect(kolikPrislo([["dluhy"]])).toBeLessThan(bez);
  });
});
