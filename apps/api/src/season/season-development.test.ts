import { describe, expect, it } from "vitest";
import { applySeasonDevelopment } from "./season-development";

describe("applySeasonDevelopment", () => {
  it("zkušenost se věkem nemění", () => {
    const skills = { speed: 50, experience: 40 };
    applySeasonDevelopment(skills, {}, 0.9);
    expect(skills).toEqual({ speed: 45, experience: 40 });
  });

  it("růst se zastaví na potenciálu", () => {
    const skills = { speed: 40, shooting: 40 };
    applySeasonDevelopment(skills, {}, 1.2, { speed: { maxPotential: 44 } });
    expect(skills.speed).toBe(44);
    expect(skills.shooting).toBe(48);
  });

  it("hodnotu nad potenciálem růst nesníží", () => {
    const skills = { speed: 60 };
    applySeasonDevelopment(skills, {}, 1.1, { speed: { maxPotential: 50 } });
    expect(skills.speed).toBe(60);
  });

  it("pokles potenciál neomezuje", () => {
    const skills = { speed: 60 };
    applySeasonDevelopment(skills, {}, 0.9, { speed: { maxPotential: 50 } });
    expect(skills.speed).toBe(54);
  });

  it("výdrž a síla se propíšou do physical", () => {
    const skills = { stamina: 50, strength: 40 };
    const physical: Record<string, unknown> = { stamina: 50, strength: 40, height: 180 };
    applySeasonDevelopment(skills, physical, 0.9);
    expect(physical).toEqual({ stamina: 45, strength: 36, height: 180 });
  });

  it("výdrž jen v physical se taky změní", () => {
    const physical: Record<string, unknown> = { stamina: 50 };
    applySeasonDevelopment({ speed: 50 }, physical, 0.9);
    expect(physical.stamina).toBe(45);
  });
});

describe("vývoj za celou sezónu", () => {
  it("hodnocení na začátku sezóny je bez toho, co hráč za sezónu natrénoval", async () => {
    const { seasonStartRating } = await import("./season-development");
    const { overallRatingFromFlat } = await import("../skills/generator");
    const skills = { speed: 60, technique: 62, shooting: 55, passing: 64, heading: 50, defense: 45, vision: 63, creativity: 60, setPieces: 50, goalkeeping: 5, experience: 30 };
    const physical = { stamina: 60, strength: 55 };
    const now = overallRatingFromFlat("MID", skills, physical, 0, undefined)!;
    const start = seasonStartRating("MID", skills, physical, 0, undefined, new Map([["passing", 12], ["vision", 10], ["technique", 8], ["stamina", 6]]));
    expect(start).not.toBeNull();
    expect(now - start!).toBeGreaterThanOrEqual(4);
    // Bez záznamů o růstu nic nedopočítává.
    expect(seasonStartRating("MID", skills, physical, 0, undefined, undefined)).toBeNull();
  });
});
