/** Úkol skauta na víc postů: zadání se srovná a starší úkoly s jedním postem fungují dál. */
import { describe, it, expect } from "vitest";
import { assignmentPositions, normalizePositions } from "./scout-work";

describe("posty úkolu", () => {
  it("nic nebo všechny čtyři = kdokoli", () => {
    expect(normalizePositions(null)).toBeNull();
    expect(normalizePositions([])).toBeNull();
    expect(normalizePositions(["GK", "DEF", "MID", "FWD"])).toBeNull();
  });

  it("víc postů se srovná do pořadí a bez opakování", () => {
    expect(normalizePositions(["MID", "DEF", "MID"])).toEqual(["DEF", "MID"]);
  });

  it("neznámý post je chyba", () => {
    expect(normalizePositions(["DEF", "XYZ"])).toBe(false);
    expect(normalizePositions([5])).toBe(false);
  });

  it("starší úkol s jedním postem i nový se seznamem", () => {
    expect(assignmentPositions({ position: "FWD", positions: null })).toEqual(["FWD"]);
    expect(assignmentPositions({ position: null, positions: '["DEF","MID"]' })).toEqual(["DEF", "MID"]);
    expect(assignmentPositions({ position: null, positions: null })).toBeNull();
  });
});
