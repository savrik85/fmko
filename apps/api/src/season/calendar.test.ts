import { describe, expect, it } from "vitest";
import { generateRemainingSeasonCalendar, generateSeasonCalendar, MAX_ROUNDS_PER_WEEK, parseMatchWeekdays } from "./calendar";
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

describe("hrací dny podle ligy", () => {
  it("výchozí rozpis je dál pondělí a čtvrtek v 18:00 v Praze", () => {
    const c = generateSeasonCalendar("L", 3, new Date("2026-10-21T18:00:00Z"), 26);
    expect(new Set(c.entries.map((e) => new Date(e.scheduledAt).getUTCDay()))).toEqual(new Set([1, 4]));
    expect(new Set(c.entries.map((e) => e.matchDay))).toEqual(new Set(["monday", "thursday"]));
    // První kolo: první pondělí nebo čtvrtek aspoň 5 dní po startu (po 26. 10. 2026, 18:00 SEČ).
    expect(c.entries[0].scheduledAt).toBe("2026-10-26T17:00:00.000Z");
  });

  it("liga se středou a nedělí hraje jen v ty dny, se zimní přestávkou jako ostatní", () => {
    const c = generateSeasonCalendar("L", 4, new Date("2027-02-04T17:00:00Z"), 26, [3, 0]);
    expect(c.entries).toHaveLength(26);
    for (const e of c.entries) {
      const at = new Date(e.scheduledAt);
      expect([0, 3]).toContain(at.getUTCDay());
      expect(e.matchDay).toBe(at.getUTCDay() === 0 ? "sunday" : "wednesday");
      // 18:00 v Praze: v zimě 17:00 UTC, od poslední neděle v březnu 16:00 UTC.
      expect(at.getUTCHours()).toBe(at.getTime() >= Date.UTC(2027, 2, 28) ? 16 : 17);
    }
    const gap = (new Date(c.entries[13].scheduledAt).getTime() - new Date(c.entries[12].scheduledAt).getTime()) / 86_400_000;
    expect(gap).toBeGreaterThanOrEqual(7);
  });

  it("match_weekdays z ligy: \"3,0\" je středa a neděle, prázdné nebo nesmysl pondělí a čtvrtek", () => {
    expect(parseMatchWeekdays("3,0")).toEqual([3, 0]);
    expect(parseMatchWeekdays(" 3, 0 ,3")).toEqual([3, 0]);
    expect(parseMatchWeekdays(null)).toEqual([1, 4]);
    expect(parseMatchWeekdays("")).toEqual([1, 4]);
    expect(parseMatchWeekdays("x,9")).toEqual([1, 4]);
  });
});

describe("rozpis na zbytek sezóny (III. třída)", () => {
  const base = {
    leagueId: "L3", seasonNumber: 3, rounds: 26, weekdays: [3, 0], extraWeekday: 5,
    lastDate: new Date("2027-01-28T17:00:00.000Z"),
  };

  it("od středy 28. 10. 2026 do čtvrtka 28. 1. 2027 se 26 kol vejde do středy a neděle", () => {
    const entries = generateRemainingSeasonCalendar({ ...base, from: new Date("2026-10-28T00:00:00.000Z") });
    expect(entries).toHaveLength(26);
    expect(entries.map((e) => e.gameWeek)).toEqual(Array.from({ length: 26 }, (_, i) => i + 1));
    expect(entries[0].scheduledAt).toBe("2026-10-28T17:00:00.000Z");
    for (const e of entries) {
      const at = new Date(e.scheduledAt);
      expect([0, 3]).toContain(at.getUTCDay());
      expect(at.getUTCHours()).toBe(17); // 18:00 v Praze v zimě
      expect(at.getTime()).toBeLessThanOrEqual(base.lastDate.getTime());
    }
    // Bez vánoční přestávky: mezi koly nejvýš čtyři dny.
    for (let i = 1; i < entries.length; i++) {
      expect(new Date(entries[i].scheduledAt).getTime() - new Date(entries[i - 1].scheduledAt).getTime()).toBeLessThanOrEqual(4 * 86_400_000);
    }
  });

  it("chybějící kola doplní pátky od konce, nejvýš tři kola týdně", () => {
    const entries = generateRemainingSeasonCalendar({ ...base, from: new Date("2026-11-08T16:00:00.000Z") });
    expect(entries).toHaveLength(26);
    const fridays = entries.filter((e) => e.matchDay === "friday").map((e) => e.scheduledAt.slice(0, 10));
    // Středy a neděle od 8. 11. dají 24 termínů, dva pátky přibudou v posledních týdnech
    // (29. 1. už je po posledním kole přeboru).
    expect(fridays).toEqual(["2027-01-15", "2027-01-22"]);
    const perWeek = new Map<string, number>();
    for (const e of entries) {
      const d = new Date(e.scheduledAt);
      const monday = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - ((d.getUTCDay() + 6) % 7)));
      const key = monday.toISOString().slice(0, 10);
      perWeek.set(key, (perWeek.get(key) ?? 0) + 1);
    }
    expect(Math.max(...perWeek.values())).toBeLessThanOrEqual(MAX_ROUNDS_PER_WEEK);
    expect(entries[entries.length - 1].scheduledAt <= base.lastDate.toISOString()).toBe(true);
    // Kola jdou po sobě v čase.
    const times = entries.map((e) => e.scheduledAt);
    expect([...times].sort()).toEqual(times);
  });

  it("málo dní: výjimka, liga nesmí zdržet konec sezóny", () => {
    expect(() => generateRemainingSeasonCalendar({ ...base, from: new Date("2026-12-20T00:00:00.000Z") })).toThrow(/nevejde/);
  });

  it("v létě je 18:00 v Praze 16:00 UTC", () => {
    const entries = generateRemainingSeasonCalendar({
      ...base, rounds: 4, from: new Date("2027-03-22T00:00:00.000Z"), lastDate: new Date("2027-04-30T16:00:00.000Z"),
    });
    expect(entries.map((e) => e.scheduledAt)).toEqual([
      "2027-03-24T17:00:00.000Z", "2027-03-28T16:00:00.000Z", "2027-03-31T16:00:00.000Z", "2027-04-04T16:00:00.000Z",
    ]);
  });
});
