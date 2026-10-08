import { describe, expect, it } from "vitest";
import { calcTacticFit } from "./tactics";
import type { Tactic } from "./types";
import { createTeam } from "./test-helpers/lineup";

const TACTICS: Tactic[] = ["offensive", "defensive", "long_ball", "possession", "pressing"];

describe("shoda taktiky s kádrem na skutečné škále dovedností", () => {
  it("průměrný okresní tým (dovednosti kolem 37) zvládá taktiky zhruba nominálně", () => {
    const lineup = createTeam(1, "Průměr", 37).lineup.map((p) => ({ ...p, stamina: 37, workRate: 48, aggression: 56 }));
    for (const t of TACTICS) {
      expect(calcTacticFit(lineup, t)).toBeGreaterThan(0.9);
      expect(calcTacticFit(lineup, t)).toBeLessThanOrEqual(1.15);
    }
  });

  it("slabý tým spadne na podlahu, silný dojde ke stropu", () => {
    const weak = createTeam(1, "Slabí", 18).lineup.map((p) => ({ ...p, stamina: 18 }));
    const strong = createTeam(2, "Silní", 65).lineup.map((p) => ({ ...p, stamina: 65 }));
    expect(calcTacticFit(weak, "offensive")).toBe(0.7);
    expect(calcTacticFit(strong, "offensive")).toBe(1.15);
  });
});
