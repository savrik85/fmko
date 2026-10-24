import { describe, expect, it } from "vitest";
import { leftOnReadChance, readDelayMs } from "./left-on-read";

const calm = { closing: false, relationship: 60, coachStreak: 1, atWork: false };

describe("přečteno: šance, že hráč jen přečte", () => {
  it("v klidném rozhovoru skoro nikdy, na konci rozhovoru častěji", () => {
    expect(leftOnReadChance(calm)).toBeCloseTo(0.04);
    expect(leftOnReadChance({ ...calm, closing: true })).toBeCloseTo(0.25);
  });

  it("naštvaný hráč, práce a třetí zpráva za sebou šanci zvednou", () => {
    expect(leftOnReadChance({ ...calm, relationship: 20 })).toBeGreaterThan(leftOnReadChance({ ...calm, relationship: 40 }));
    expect(leftOnReadChance({ ...calm, relationship: 40 })).toBeGreaterThan(leftOnReadChance(calm));
    expect(leftOnReadChance({ ...calm, atWork: true })).toBeGreaterThan(leftOnReadChance(calm));
    expect(leftOnReadChance({ ...calm, coachStreak: 2 })).toBe(leftOnReadChance(calm));
    expect(leftOnReadChance({ ...calm, coachStreak: 3 })).toBeGreaterThan(0.3);
  });

  it("nikdy víc než napůl, aby trenér nepsal do zdi", () => {
    expect(leftOnReadChance({ closing: false, relationship: 5, coachStreak: 6, atWork: true })).toBe(0.5);
    expect(leftOnReadChance({ closing: true, relationship: 5, coachStreak: 6, atWork: true })).toBeLessThanOrEqual(0.5);
  });

  it("přečte za pár vteřin, ne hned", () => {
    expect(readDelayMs(0)).toBe(3000);
    expect(readDelayMs(1)).toBe(15000);
    expect(readDelayMs(7)).toBe(15000);
  });
});
