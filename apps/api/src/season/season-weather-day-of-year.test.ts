import { describe, expect, it } from "vitest";
import { resolveWeatherForDate, seasonTemperature, weatherForDay, winternessForDate } from "./season-weather";

/** Počasí se na databázi neptá; kdyby se zeptalo, test spadne. */
const noDb = { prepare: () => { throw new Error("počasí nesmí číst databázi"); } } as unknown as D1Database;

function temperatureOn(isoDate: string): number {
  return Math.round(seasonTemperature(winternessForDate(isoDate)));
}

describe("zimavost podle dne v roce", () => {
  it("nejchladněji je v půlce ledna, nejtepleji v půlce července", () => {
    expect(winternessForDate("2027-01-15T17:00:00.000Z")).toBeCloseTo(1, 3);
    expect(winternessForDate("2027-07-16T16:00:00.000Z")).toBeCloseTo(0, 3);
    expect(temperatureOn("2027-01-15T17:00:00.000Z")).toBe(-2);
    expect(temperatureOn("2027-07-16T16:00:00.000Z")).toBe(24);
  });

  it("konec sezóny 28. ledna je zima, ne léto", () => {
    // Dřív se zimavost počítala z pozice v sezóně a poslední kolo vycházelo na 23 °C.
    expect(temperatureOn("2027-01-28T17:00:00.000Z")).toBeLessThan(0);
    expect(temperatureOn("2026-12-24T17:00:00.000Z")).toBeLessThan(2);
  });

  it("jaro a podzim jsou mezi, teplota přes rok plynule klesá a stoupá", () => {
    expect(temperatureOn("2027-04-15T16:00:00.000Z")).toBeGreaterThan(8);
    expect(temperatureOn("2027-04-15T16:00:00.000Z")).toBeLessThan(14);
    expect(temperatureOn("2026-10-15T16:00:00.000Z")).toBeGreaterThan(8);
    expect(temperatureOn("2026-10-15T16:00:00.000Z")).toBeLessThan(14);
    let previous = seasonTemperature(winternessForDate("2026-07-20T00:00:00.000Z"));
    for (let day = 1; day <= 175; day++) {
      const iso = new Date(Date.parse("2026-07-20T00:00:00.000Z") + day * 86400000).toISOString();
      const now = seasonTemperature(winternessForDate(iso));
      expect(now, iso).toBeLessThanOrEqual(previous);
      previous = now;
    }
  });

  it("stejný den v roce dává stejnou zimavost bez ohledu na rok a hodinu", () => {
    expect(winternessForDate("2026-11-09T05:00:00.000Z")).toBeCloseTo(winternessForDate("2027-11-09T22:00:00.000Z"), 5);
  });

  it("nečitelné datum nespadne", () => {
    expect(winternessForDate("")).toBe(0);
    expect(winternessForDate("nesmysl")).toBe(0);
  });
});

describe("počasí dne z jediného zdroje", () => {
  it("nepotřebuje hranice sezóny ani databázi", async () => {
    const w = await resolveWeatherForDate(noDb, "2027-01-28T17:00:00.000Z");
    expect(w).toEqual(weatherForDay("2027-01-28T17:00:00.000Z", winternessForDate("2027-01-28T17:00:00.000Z")));
    expect(w!.temperature).toBeLessThan(0);
  });

  it("bez data nebo s nečitelným datem vrací null", async () => {
    expect(await resolveWeatherForDate(noDb, "")).toBeNull();
    expect(await resolveWeatherForDate(noDb, "nesmysl")).toBeNull();
  });

  it("v lednu sněží, v červenci nikdy", () => {
    const weatherIn = (month: string) => Array.from({ length: 28 }, (_, i) => {
      const iso = `2027-${month}-${String(i + 1).padStart(2, "0")}T16:00:00.000Z`;
      return weatherForDay(iso, winternessForDate(iso)).weather;
    });
    expect(weatherIn("01")).toContain("snow");
    expect(weatherIn("07")).not.toContain("snow");
  });
});
