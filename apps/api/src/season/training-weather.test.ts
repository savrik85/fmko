import { describe, expect, it } from "vitest";
import { trainingWeatherMod } from "./training";

/**
 * Počasí je vlastnost dne, ne zápasu. Ve slotě se na trénink chodí líp než
 * v plískanici — a je to tentýž údaj, jaký hráč vidí v předpovědi.
 */
describe("vliv počasí na docházku na trénink", () => {
  it("ve sněhu chodí na trénink hůř než na slunci", () => {
    expect(trainingWeatherMod("snow")).toBeLessThan(trainingWeatherMod("sunny"));
  });

  it("déšť a vítr docházku sráží, zataženo je neutrální", () => {
    expect(trainingWeatherMod("cloudy")).toBe(0);
    expect(trainingWeatherMod("rain")).toBeLessThan(0);
    expect(trainingWeatherMod("wind")).toBeLessThan(0);
  });

  it("slunce docházku mírně zvedá", () => {
    expect(trainingWeatherMod("sunny")).toBeGreaterThan(0);
  });

  it("žádné počasí nepohne docházkou o víc než 15 bodů", () => {
    for (const w of ["sunny", "cloudy", "rain", "wind", "snow"] as const) {
      expect(Math.abs(trainingWeatherMod(w)), w).toBeLessThanOrEqual(0.15);
    }
  });

  it("neznámé počasí je neutrální, ne NaN", () => {
    expect(trainingWeatherMod(undefined)).toBe(0);
  });
});
