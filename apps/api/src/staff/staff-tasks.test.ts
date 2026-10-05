import { describe, expect, it } from "vitest";
import { STAFF_TASK_DEFS, STAFF_TASK_TYPES, staffTaskCost, staffTasksForRole, STAFF_ROLE_ORDER } from "@okresni-masina/shared";
import { addDays, gameDay, individualTrainingMul, taskMatchMods } from "./staff-tasks";

describe("úkoly zaměstnanců: katalog", () => {
  it("každá role kromě skauta má aspoň jeden úkol", () => {
    for (const role of STAFF_ROLE_ORDER) {
      if (role === "skaut") expect(staffTasksForRole(role)).toHaveLength(0);
      else expect(staffTasksForRole(role).length).toBeGreaterThan(0);
    }
  });

  it("dlouhý úkol má délky, zápasový ne", () => {
    for (const t of STAFF_TASK_TYPES) {
      const def = STAFF_TASK_DEFS[t];
      if (def.kind === "weekly") expect(def.durations?.length).toBeGreaterThan(0);
      else expect(def.durations).toBeUndefined();
    }
  });

  it("cena: zápasový jednou, dlouhý za každých započatých 7 dní", () => {
    expect(staffTaskCost("doctor_checkup")).toBe(600);
    expect(staffTaskCost("youth_plan", 14)).toBe(1000);
    expect(staffTaskCost("youth_plan", 28)).toBe(2000);
    expect(staffTaskCost("psych_session", 7)).toBe(500);
  });
});

describe("úkoly zaměstnanců: zápasové bonusy", () => {
  it("prohlídka snižuje šanci na zranění, lepší lékař víc", () => {
    const slaby = taskMatchMods("doctor_checkup", 0.3, true).injurySeverityMod;
    const silny = taskMatchMods("doctor_checkup", 0.9, true).injurySeverityMod;
    expect(slaby).toBeGreaterThan(0);
    expect(silny).toBeGreaterThan(slaby);
    expect(silny).toBeLessThanOrEqual(0.15);
  });

  it("choreo platí jen doma", () => {
    expect(taskMatchMods("fan_choreo", 1, false).crowdMod).toBe(0);
    expect(taskMatchMods("fan_choreo", 1, true).crowdMod).toBeCloseTo(0.15);
  });

  it("úkoly bez zápasového účinku nic nepřidají", () => {
    const m = taskMatchMods("massage_prep", 1, true);
    expect(Object.values(m).every((v) => v === 0)).toBe(true);
  });

  it("nácvik standardek nepřekročí nejlepší tréninkovou zeď (+5)", () => {
    expect(taskMatchMods("set_piece_drill", 1, true).setPiecesMod).toBe(5);
    expect(taskMatchMods("set_piece_drill", 0, true).setPiecesMod).toBe(2);
  });
});

describe("úkoly zaměstnanců: individuální plán a data", () => {
  it("násobek tréninku 1,25–1,75", () => {
    expect(individualTrainingMul(0)).toBe(1.25);
    expect(individualTrainingMul(1)).toBe(1.75);
  });

  it("herní den a posun o dny přes konec měsíce", () => {
    expect(gameDay("2026-10-05T16:00:00.000Z")).toBe("2026-10-05");
    expect(addDays("2026-10-28", 7)).toBe("2026-11-04");
    expect(addDays("2026-10-05", -14)).toBe("2026-09-21");
  });
});
