import { describe, it, expect } from "vitest";
import { pitchWearForMatch } from "./pitch-wear";

describe("opotřebení trávníku zápasem", () => {
  it("přírodní trávník bere nejvíc, hybrid míň, umělka nic", () => {
    expect(pitchWearForMatch("natural", "cloudy")).toBe(5);
    expect(pitchWearForMatch("hybrid", "cloudy")).toBe(3);
    expect(pitchWearForMatch("artificial", "cloudy")).toBe(0);
  });

  it("déšť a sníh trávník rozbahní víc", () => {
    expect(pitchWearForMatch("natural", "rain")).toBe(7);
    expect(pitchWearForMatch("natural", "snow")).toBe(9);
    expect(pitchWearForMatch("hybrid", "snow")).toBe(5);
  });

  it("vítr trávníku neuškodí nad rámec běžného zápasu", () => {
    expect(pitchWearForMatch("natural", "wind")).toBe(pitchWearForMatch("natural", "cloudy"));
  });

  it("umělka neutrpí ani v nejhorším počasí", () => {
    expect(pitchWearForMatch("artificial", "snow")).toBe(0);
    expect(pitchWearForMatch("artificial", "rain")).toBe(0);
  });

  it("chybějící povrch i počasí spadnou na přírodní za sucha", () => {
    expect(pitchWearForMatch(null, null)).toBe(5);
    expect(pitchWearForMatch(undefined, undefined)).toBe(5);
    expect(pitchWearForMatch("neznamy_povrch", "cloudy")).toBe(5);
  });

  it("vyhřívání tlumí jen navýšení z nečasu, běžné opotřebení ne", () => {
    // Lv3 v plné kondici (mod 1.0) — sníh se chová jako sucho…
    expect(pitchWearForMatch("natural", "snow", { heatingMod: 1.0 })).toBe(5);
    expect(pitchWearForMatch("natural", "rain", { heatingMod: 1.0 })).toBe(5);
    // …ale zápas trávník pořád stojí svých pět bodů.
    expect(pitchWearForMatch("natural", "cloudy", { heatingMod: 1.0 })).toBe(5);
  });

  it("částečné vyhřívání ubere část rozbahnění", () => {
    const bez = pitchWearForMatch("natural", "snow", { heatingMod: 0 });
    const pul = pitchWearForMatch("natural", "snow", { heatingMod: 0.5 });
    const plne = pitchWearForMatch("natural", "snow", { heatingMod: 1.0 });

    expect(pul).toBeLessThan(bez);
    expect(pul).toBeGreaterThan(plne);
  });

  it("vyhřívání umělce nepomůže ani neuškodí", () => {
    expect(pitchWearForMatch("artificial", "snow", { heatingMod: 0 })).toBe(0);
    expect(pitchWearForMatch("artificial", "snow", { heatingMod: 1.0 })).toBe(0);
  });

  it("nesmyslný heatingMod se ořízne, ne aby trávník rostl", () => {
    expect(pitchWearForMatch("natural", "snow", { heatingMod: -5 })).toBe(9);
    expect(pitchWearForMatch("natural", "snow", { heatingMod: 99 })).toBe(5);
  });

  it("výheň trávník vysuší a zavlažování to tlumí", () => {
    expect(pitchWearForMatch("natural", "sunny")).toBe(7);
    expect(pitchWearForMatch("natural", "sunny", { irrigationMod: 1.0 })).toBe(5);
    expect(pitchWearForMatch("natural", "sunny", { irrigationMod: 0.5 })).toBe(6);
  });

  it("péče funguje jen proti svému počasí", () => {
    // Vyhřívání proti výhni nepomůže…
    expect(pitchWearForMatch("natural", "sunny", { heatingMod: 1.0 })).toBe(7);
    // …a zavlažování proti sněhu taky ne.
    expect(pitchWearForMatch("natural", "snow", { irrigationMod: 1.0 })).toBe(9);
  });

  it("sezónní dopad na přírodní trávník je znatelný", () => {
    // 30 herních týdnů => ~15 domácích zápasů. Pár jich padne do nečasu.
    const bezneCasy = 12 * pitchWearForMatch("natural", "cloudy");
    const necas = 2 * pitchWearForMatch("natural", "rain") + 1 * pitchWearForMatch("natural", "snow");
    const zaSezonu = bezneCasy + necas;

    // Musí to bolet natolik, aby se údržba nedala ignorovat…
    expect(zaSezonu).toBeGreaterThan(50);
    // …ale ne tolik, aby jedna sezóna sama o sobě srazila hřiště ze 100 na podlahu.
    expect(zaSezonu).toBeLessThan(95);
  });
});
