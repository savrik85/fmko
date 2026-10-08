import { describe, expect, it } from "vitest";
import { createRng } from "../generators/rng";
import { freshness, simulateMatch } from "./simulation";
import { createPlayer, createTeam } from "./test-helpers/lineup";

describe("kondice jednotlivce", () => {
  it("svěžest: plná kondice 1,0, polovina 0,925, nula 0,85", () => {
    expect(freshness({ ...createPlayer(1, "FWD"), condition: 100 })).toBe(1);
    expect(freshness({ ...createPlayer(1, "FWD"), condition: 50 })).toBeCloseTo(0.925);
    expect(freshness({ ...createPlayer(1, "FWD"), condition: 0 })).toBeCloseTo(0.85);
  });

  it("brankář se za zápas unaví mnohem méně než hráči v poli", () => {
    const home = createTeam(1, "D", 37);
    const away = createTeam(2, "H", 37);
    simulateMatch(createRng(42), { home, away, weather: "cloudy", isHomeAdvantage: true });
    const gk = home.lineup.find((p) => p.position === "GK")!;
    const outfield = home.lineup.filter((p) => p.position !== "GK");
    const outfieldAvg = outfield.reduce((s, p) => s + p.condition, 0) / outfield.length;
    expect(100 - gk.condition).toBeLessThan((100 - outfieldAvg) / 2);
  });
});
