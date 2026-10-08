import { describe, expect, it } from "vitest";
import { STAFF_TASK_DEFS, STAFF_TASK_TYPES, staffTaskCost, staffTasksForRole, STAFF_ROLE_ORDER } from "@okresni-masina/shared";
import { addDays, gameDay, individualTrainingMul, refundAmount, taskMatchMods } from "./staff-tasks";

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

describe("úkoly zaměstnanců: vratka", () => {
  const weekly = { kind: "weekly" as const, cost_paid: 1000, starts_game_date: "2026-10-05", ends_game_date: "2026-10-19" };
  const match = { kind: "match" as const, cost_paid: 300, starts_game_date: "2026-10-05", ends_game_date: "2026-10-08" };

  it("nezačatý úkol vrací všechno", () => {
    expect(refundAmount({ ...weekly, last_work_game_date: null }, false)).toBe(1000);
    expect(refundAmount({ ...match, last_work_game_date: null }, false)).toBe(300);
  });

  it("zrušení manažerem po začátku nevrací nic", () => {
    expect(refundAmount({ ...weekly, last_work_game_date: "2026-10-06" }, false)).toBe(0);
  });

  it("propuštění vrací jen neodpracované dny, ne celou cenu", () => {
    expect(refundAmount({ ...weekly, last_work_game_date: "2026-10-18" }, true)).toBe(71);
    expect(refundAmount({ ...weekly, last_work_game_date: "2026-10-12" }, true)).toBe(500);
    expect(refundAmount({ ...weekly, last_work_game_date: "2026-10-19" }, true)).toBe(0);
  });

  it("zápasový úkol po ranní práci nevrací nic ani při propuštění", () => {
    expect(refundAmount({ ...match, last_work_game_date: "2026-10-08" }, true)).toBe(0);
  });
});

describe("úkoly zaměstnanců: plán hubnutí", () => {
  it("kondiční trenér má týdenní plán hubnutí na 14 nebo 28 dní za 400 Kč týdně", () => {
    const def = STAFF_TASK_DEFS.weight_plan;
    expect(def.role).toBe("kondicni_trener");
    expect(def.kind).toBe("weekly");
    expect(def.target).toBe("player");
    expect(def.durations).toEqual([14, 28]);
    expect(staffTaskCost("weight_plan", 28)).toBe(1600);
  });

  it("na plán smí jen hráč s nadváhou", async () => {
    const { weightPlanEligible } = await import("./staff-tasks");
    expect(weightPlanEligible({ height: 180, weight: 90 })).toBe(true);
    expect(weightPlanEligible({ height: 180, weight: 78 })).toBe(false);
    expect(weightPlanEligible({ height: 189, weight: 93, strength: 70 })).toBe(false);
    expect(weightPlanEligible({})).toBe(false);
  });

  it("souhrn: kolik shodil, nebo že nechodil", async () => {
    const { weightPlanSummary } = await import("./staff-tasks");
    expect(weightPlanSummary("Jan Novák", 92, 89.6, 28)).toBe("🏃 Plán hubnutí: Jan Novák za 28 dní shodil 2,4 kg, teď váží 89,6 kg.");
    expect(weightPlanSummary("Jan Novák", 92, 91.8, 14)).toBe("🏃 Plán hubnutí: Jan Novák za 14 dní skoro nezhubl. Na trénink chodit musí, jinak plán nepomůže.");
    expect(weightPlanSummary("Jan Novák", null, 90, 14)).not.toContain("—");
  });
});

describe("úkoly zaměstnanců: plán nabírání", () => {
  it("kondiční trenér má plán nabírání na 14 nebo 28 dní za 400 Kč týdně", () => {
    const def = STAFF_TASK_DEFS.weight_gain;
    expect(def.role).toBe("kondicni_trener");
    expect(def.kind).toBe("weekly");
    expect(def.target).toBe("player");
    expect(def.durations).toEqual([14, 28]);
    expect(staffTaskCost("weight_gain", 14)).toBe(800);
  });

  it("na plán nabírání smí jen hráč s podváhou", async () => {
    const { weightGainEligible } = await import("./staff-tasks");
    expect(weightGainEligible({ height: 190, weight: 70 })).toBe(true);
    expect(weightGainEligible({ height: 180, weight: 78 })).toBe(false);
    expect(weightGainEligible({ height: 180, weight: 90 })).toBe(false);
    expect(weightGainEligible({})).toBe(false);
  });

  it("souhrn: kolik nabral, nebo že skoro nic", async () => {
    const { weightGainSummary } = await import("./staff-tasks");
    expect(weightGainSummary("Jan Novák", 68, 70.1, 28)).toBe("💪 Plán nabírání: Jan Novák za 28 dní nabral 2,1 kg, teď váží 70,1 kg.");
    expect(weightGainSummary("Jan Novák", 68, 68.2, 14)).toBe("💪 Plán nabírání: Jan Novák za 14 dní skoro nenabral. Bez tréninku plán nepomůže.");
    expect(weightGainSummary("Jan Novák", null, 70, 14)).not.toContain("—");
  });
});
