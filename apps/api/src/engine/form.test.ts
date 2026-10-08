import { describe, expect, it } from "vitest";
import { playerFormFromRatings, teamFormFactor } from "./form";
import { createPlayer } from "./test-helpers/lineup";

describe("playerFormFromRatings", () => {
  it("nováček bez tří zápasů formu nemá", () => {
    expect(playerFormFromRatings([8, 8])).toBe(0);
  });

  it("hráč, který hraje pořád stejně, má formu 0 bez ohledu na kvalitu", () => {
    expect(playerFormFromRatings(Array(20).fill(8))).toBe(0);
    expect(playerFormFromRatings(Array(20).fill(5))).toBe(0);
  });

  it("série lepších výkonů než obvykle je dobrá forma, horších krize", () => {
    const hot = [8, 8, 8, 8, 8, ...Array(15).fill(6)];
    const cold = [5, 5, 5, 5, 5, ...Array(15).fill(6.5)];
    expect(playerFormFromRatings(hot)).toBeGreaterThan(0.5);
    expect(playerFormFromRatings(cold)).toBeLessThan(-0.5);
  });

  it("forma je oříznutá na −1 až +1", () => {
    expect(playerFormFromRatings([10, 10, 10, 10, 10, ...Array(15).fill(3)])).toBe(1);
  });
});

describe("teamFormFactor", () => {
  it("sestava bez formy je neutrální, plná forma dá nejvýš ±10 %", () => {
    const lineup = Array.from({ length: 11 }, (_, i) => createPlayer(i, "MID"));
    expect(teamFormFactor(lineup)).toBe(1);
    expect(teamFormFactor(lineup.map((p) => ({ ...p, form: 1 })))).toBeCloseTo(1.1);
    expect(teamFormFactor(lineup.map((p) => ({ ...p, form: -1 })))).toBeCloseTo(0.9);
  });
});
