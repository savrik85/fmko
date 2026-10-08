import { describe, expect, it } from "vitest";
import { occupationMatchAbsence, occupationTrainingAttendance } from "./occupations";

describe("povolání a docházka", () => {
  it("hospodský chybí na večerním tréninku víc než student", () => {
    expect(occupationTrainingAttendance("Hospodský")).toBeLessThan(occupationTrainingAttendance("Student") - 0.15);
  });

  it("směnař chybí u víkendového zápasu víc než student", () => {
    expect(occupationMatchAbsence("Hasič")).toBeGreaterThan(occupationMatchAbsence("Student") + 0.02);
  });

  it("neznámé povolání je denní směna bez přesčasů", () => {
    expect(occupationMatchAbsence("Fotbalista")).toBe(0);
    expect(occupationTrainingAttendance("Fotbalista")).toBe(0);
    expect(occupationTrainingAttendance(undefined)).toBe(0);
  });
});
