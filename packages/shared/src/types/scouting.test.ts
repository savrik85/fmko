import { describe, expect, it } from "vitest";
import {
  maxScoutsForLicence,
  SCOUT_ASSIGNMENT_TYPE_LABELS,
  type ScoutAssignmentType,
} from "./scouting";

describe("maxScoutsForLicence", () => {
  it("vrátí 2 pro trenéra bez licence (level 0) i s Licencí C (level 1)", () => {
    expect(maxScoutsForLicence(0)).toBe(2);
    expect(maxScoutsForLicence(1)).toBe(2);
  });

  it("vrátí 3 pro trenéra s UEFA B (level 2)", () => {
    expect(maxScoutsForLicence(2)).toBe(3);
  });

  it("vrátí 4 pro trenéra s UEFA A (level 3)", () => {
    expect(maxScoutsForLicence(3)).toBe(4);
  });

  it("vrátí 5 pro trenéra s UEFA Pro (level 4)", () => {
    expect(maxScoutsForLicence(4)).toBe(5);
  });

  it("správně ošetřuje záporné hodnoty nebo vyšší hodnoty", () => {
    expect(maxScoutsForLicence(-1)).toBe(2);
    expect(maxScoutsForLicence(10)).toBe(5);
  });
});

describe("SCOUT_ASSIGNMENT_TYPE_LABELS", () => {
  it("obsahuje všechny 3 typy misí s českými popisky", () => {
    const types: ScoutAssignmentType[] = ["area", "player", "match"];
    for (const t of types) {
      expect(SCOUT_ASSIGNMENT_TYPE_LABELS[t]).toBeDefined();
      expect(typeof SCOUT_ASSIGNMENT_TYPE_LABELS[t]).toBe("string");
    }
  });
});
