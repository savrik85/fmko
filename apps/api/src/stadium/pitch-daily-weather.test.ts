import { describe, expect, it } from "vitest";
import { MOISTURE_NORMAL, moistureDaily, pitchFrostDamage } from "./pitch-moisture";

/**
 * Počasí je vlastnost dne, ne zápasu. Do 2026-08 hřiště počasí vnímalo jen
 * v zápasový den — šest dní v týdnu déšť trávník nenamočil a slunce nevysušilo.
 */
describe("denní vliv počasí na vlhkost", () => {
  it("déšť namočí, slunce vysuší", () => {
    expect(moistureDaily(50, "rain")).toBeGreaterThan(50);
    expect(moistureDaily(50, "sunny")).toBeLessThan(50);
  });

  it("vítr suší, ale míň než slunce", () => {
    expect(moistureDaily(50, "wind")).toBeLessThan(50);
    expect(moistureDaily(50, "wind")).toBeGreaterThan(moistureDaily(50, "sunny"));
  });

  it("denní posun je mírnější než zápasový — zápas půdu navíc rozdupe", () => {
    expect(moistureDaily(50, "rain") - 50).toBeLessThan(18);
    expect(50 - moistureDaily(50, "sunny")).toBeLessThan(14);
  });

  it("bez počasí se jen driftuje k normálu", () => {
    expect(moistureDaily(80, undefined)).toBeLessThan(80);
    expect(moistureDaily(20, undefined)).toBeGreaterThan(20);
    expect(moistureDaily(MOISTURE_NORMAL, undefined)).toBe(MOISTURE_NORMAL);
  });

  it("extrémy neutečou z rozsahu 0–100", () => {
    for (const w of ["sunny", "cloudy", "rain", "wind", "snow"] as const) {
      let mokro = 100, sucho = 0;
      for (let d = 0; d < 40; d++) { mokro = moistureDaily(mokro, w); sucho = moistureDaily(sucho, w); }
      expect(mokro, w).toBeLessThanOrEqual(100);
      expect(mokro, w).toBeGreaterThanOrEqual(0);
      expect(sucho, w).toBeLessThanOrEqual(100);
      expect(sucho, w).toBeGreaterThanOrEqual(0);
    }
  });

  it("týden veder vysuší hřiště znatelně, ne o dva body", () => {
    let m = MOISTURE_NORMAL;
    for (let d = 0; d < 7; d++) m = moistureDaily(m, "sunny");
    expect(m).toBeLessThan(30);
  });
});

describe("mráz ničí trávník", () => {
  it("ve sněhu trávník trpí, za slunce ne", () => {
    expect(pitchFrostDamage("snow")).toBeGreaterThan(0);
    expect(pitchFrostDamage("sunny")).toBe(0);
    expect(pitchFrostDamage("rain")).toBe(0);
  });

  it("poškození je mírné — hřiště nesmí zmizet za týden", () => {
    expect(pitchFrostDamage("snow")).toBeLessThanOrEqual(2);
  });

  it("neznámé počasí neničí nic", () => {
    expect(pitchFrostDamage(undefined)).toBe(0);
  });
});
