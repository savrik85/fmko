import { describe, expect, it } from "vitest";
import { generateSeasonCalendar } from "./calendar";
import { totalRounds } from "../league/schedule";

describe("rozpis sezóny", () => {
  it("liga se 14 týmy má 26 kol, žádná prázdná na konci", () => {
    const c = generateSeasonCalendar("L", 3, new Date("2026-10-21T18:00:00Z"), totalRounds(14));
    expect(c.entries).toHaveLength(26);
    expect(c.entries.map((e) => e.gameWeek)).toEqual(Array.from({ length: 26 }, (_, i) => i + 1));
  });

  it("půlka kol na podzim, pak zimní přestávka aspoň týden", () => {
    const c = generateSeasonCalendar("L", 3, new Date("2026-10-21T18:00:00Z"), 26);
    const gap = (new Date(c.entries[13].scheduledAt).getTime() - new Date(c.entries[12].scheduledAt).getTime()) / 86_400_000;
    expect(gap).toBeGreaterThanOrEqual(7);
    // Konec sezóny týden po posledním kole.
    expect(new Date(c.seasonEnd).getTime() - new Date(c.entries[25].scheduledAt).getTime()).toBe(7 * 86_400_000);
  });

  it("bez počtu kol zůstává 30 (16 týmů)", () => {
    expect(generateSeasonCalendar("L", 3, new Date("2026-10-21T18:00:00Z")).entries).toHaveLength(30);
    expect(totalRounds(16)).toBe(30);
  });
});
