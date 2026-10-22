import { describe, it, expect } from "vitest";
import { u21RoundDates } from "./u21-generator";

describe("termíny kol U21", () => {
  it("kolo U21 je den po kole áčka", () => {
    const senior = [
      { id: "s1", scheduled_at: "2026-10-26T17:00:00.000Z" }, // pondělí
      { id: "s2", scheduled_at: "2026-10-29T17:00:00.000Z" }, // čtvrtek
    ];
    const d = u21RoundDates(senior, 2);
    expect(d.map((x) => x.at.toISOString())).toEqual(["2026-10-27T17:00:00.000Z", "2026-10-30T17:00:00.000Z"]);
    expect(d.map((x) => x.parentCalendarId)).toEqual(["s1", "s2"]);
  });

  it("kola navíc pokračují úterý a pátek", () => {
    const d = u21RoundDates([{ id: "s1", scheduled_at: "2026-10-26T17:00:00.000Z" }], 3);
    expect(d.map((x) => x.at.getUTCDay())).toEqual([2, 5, 2]);
    expect(d[2].parentCalendarId).toBeNull();
  });

  it("bez rozpisu áčka začne nejbližším úterkem nebo pátkem po startu", () => {
    const d = u21RoundDates([], 26, new Date("2026-10-21T10:00:00.000Z"));
    expect(d).toHaveLength(26);
    expect(d[0].at.toISOString()).toBe("2026-10-23T17:00:00.000Z");
    expect(new Set(d.map((x) => x.at.getUTCDay()))).toEqual(new Set([2, 5]));
  });
});
