import { describe, expect, it } from "vitest";
import { totalRounds } from "../league/schedule";
import { u21RoundDates } from "../league/u21-generator";
import { generateRemainingSeasonCalendar, generateSeasonCalendar, isHolidayBreak, isSeniorHolidayBlocked } from "./calendar";
import { planHolidayShift, type ShiftLeague, type ShiftRound } from "./holiday-shift";

const DAY_MS = 86_400_000;

function at(iso: string): Date {
  return new Date(iso);
}

describe("vánoční přestávka v generátorech rozpisu", () => {
  it("okno je 22. 12. až 2. 1. včetně; áčko nehraje ani den před ním", () => {
    expect(isHolidayBreak(at("2026-12-21T17:00:00Z"))).toBe(false);
    expect(isHolidayBreak(at("2026-12-22T17:00:00Z"))).toBe(true);
    expect(isHolidayBreak(at("2027-01-02T17:00:00Z"))).toBe(true);
    expect(isHolidayBreak(at("2027-01-03T17:00:00Z"))).toBe(false);
    expect(isSeniorHolidayBlocked(at("2026-12-21T17:00:00Z"))).toBe(true);
    expect(isSeniorHolidayBlocked(at("2026-12-20T17:00:00Z"))).toBe(false);
  });

  it("sezóna od 21. 10. nemá ve svátcích žádné kolo a přestávka po polovině se nepřidává", () => {
    const c = generateSeasonCalendar("L", 3, at("2026-10-21T18:00:00Z"), totalRounds(14));
    expect(c.entries).toHaveLength(26);
    for (const e of c.entries) expect(isSeniorHolidayBlocked(at(e.scheduledAt)), e.scheduledAt).toBe(false);
    // Do svátků se hraje bez mezery, poslední kolo před nimi je 17. 12., první po nich 4. 1.
    const days = c.entries.map((e) => e.scheduledAt.slice(0, 10));
    expect(days[14]).toBe("2026-12-14");
    expect(days[15]).toBe("2026-12-17");
    expect(days[16]).toBe("2027-01-04");
    expect(c.springStart.slice(0, 10)).toBe("2027-01-04");
    // Mezi ostatními koly je nejvýš obvyklý rozestup hracích dnů.
    for (let i = 1; i < days.length; i++) {
      if (i === 16) continue;
      expect((Date.parse(c.entries[i].scheduledAt) - Date.parse(c.entries[i - 1].scheduledAt)) / DAY_MS).toBeLessThanOrEqual(4);
    }
  });

  it("sezóna mimo svátky má dál týdenní přestávku po polovině kol", () => {
    const c = generateSeasonCalendar("L", 4, at("2027-02-15T17:00:00Z"), 26);
    const gap = (Date.parse(c.entries[13].scheduledAt) - Date.parse(c.entries[12].scheduledAt)) / DAY_MS;
    expect(gap).toBeGreaterThanOrEqual(7);
    expect(c.entries.some((e) => isHolidayBreak(at(e.scheduledAt)))).toBe(false);
  });

  it("start těsně před svátky: první kolo až po nich a přestávka po polovině zůstává", () => {
    const c = generateSeasonCalendar("L", 4, at("2026-12-19T17:00:00Z"), 26);
    expect(c.entries[0].scheduledAt.slice(0, 10)).toBe("2027-01-04");
    const gap = (Date.parse(c.entries[13].scheduledAt) - Date.parse(c.entries[12].scheduledAt)) / DAY_MS;
    expect(gap).toBeGreaterThanOrEqual(7);
  });

  it("rozpis na zbytek sezóny svátky vynechá", () => {
    const entries = generateRemainingSeasonCalendar({
      leagueId: "L", seasonNumber: 3, from: at("2026-12-10T10:00:00Z"), lastDate: at("2027-01-28T17:00:00Z"),
      rounds: 10, weekdays: [3, 0], extraWeekday: 5,
    });
    expect(entries).toHaveLength(10);
    for (const e of entries) expect(isSeniorHolidayBlocked(at(e.scheduledAt)), e.scheduledAt).toBe(false);
  });

  it("U21 den po áčku do svátků nespadne ani u kol navíc", () => {
    const dates = u21RoundDates([{ id: "s1", scheduled_at: "2026-12-17T17:00:00.000Z" }], 4);
    expect(dates.map((d) => d.at.toISOString().slice(0, 10))).toEqual(["2026-12-18", "2027-01-05", "2027-01-08", "2027-01-12"]);
    // Starý rozpis áčka s kolem 24. 12.: U21 se odehraje hned po přestávce.
    expect(u21RoundDates([{ id: "s1", scheduled_at: "2026-12-24T17:00:00.000Z" }], 1)[0].at.toISOString().slice(0, 10)).toBe("2027-01-03");
  });
});

/** Rozpis sezóny 3 tak, jak je na produkci: přebor po/čt, jeho U21 út/pá, III. třída st/ne, její U21 po/čt. */
function productionLikeSeason(): { leagues: ShiftLeague[]; rounds: ShiftRound[] } {
  const senior = ["2026-12-10", "2026-12-14", "2026-12-24", "2026-12-28", "2026-12-31", "2027-01-04", "2027-01-07", "2027-01-11", "2027-01-14", "2027-01-18", "2027-01-21", "2027-01-25", "2027-01-28"];
  const lower = ["2026-12-16", "2026-12-20", "2026-12-23", "2026-12-27", "2026-12-30", "2027-01-03", "2027-01-06", "2027-01-10", "2027-01-13", "2027-01-17", "2027-01-20", "2027-01-24"];
  const rounds: ShiftRound[] = [];
  const add = (leagueId: string, days: string[], firstWeek: number, parentLeague: string | null) => days.forEach((day, i) => rounds.push({
    id: `${leagueId}-${firstWeek + i}`, leagueId, gameWeek: firstWeek + i, scheduledAt: `${day}T17:00:00.000Z`, status: "scheduled",
    parentCalendarId: parentLeague ? `${parentLeague}-${firstWeek + i - (parentLeague === "top" ? 1 : 0)}` : null,
  }));
  add("top", senior, 14, null);
  // U21 přeboru hraje den po kole áčka s číslem o jedna nižším (kolo 15 U21 po kole 14 áčka).
  add("top-u21", senior.slice(0, -1).map((d) => new Date(Date.parse(`${d}T17:00:00Z`) + DAY_MS).toISOString().slice(0, 10)), 15, "top");
  add("low", lower, 15, null);
  add("low-u21", lower.map((d) => new Date(Date.parse(`${d}T17:00:00Z`) + DAY_MS).toISOString().slice(0, 10)), 15, "low");
  return {
    leagues: [
      { id: "top", name: "Okresní přebor", leagueType: "senior", weekdays: [1, 4] },
      { id: "top-u21", name: "Okresní přebor U21", leagueType: "u21", weekdays: [1, 4] },
      { id: "low", name: "III. třída", leagueType: "senior", weekdays: [3, 0] },
      { id: "low-u21", name: "III. třída U21", leagueType: "u21", weekdays: [1, 4] },
    ],
    rounds,
  };
}

describe("posun kol z vánoční přestávky", () => {
  it("kola ze svátků a všechna následující jdou za svátky, rytmus hracích dnů zůstává", () => {
    const { leagues, rounds } = productionLikeSeason();
    const plan = planHolidayShift(leagues, rounds);
    const after = new Map(rounds.map((r) => [r.id, r.scheduledAt]));
    for (const s of plan.shifts) after.set(s.calendarId, s.to);

    // Žádné kolo ve svátcích, áčko ani den před nimi.
    for (const [id, iso] of after) expect(isHolidayBreak(at(iso)), `${id} ${iso}`).toBe(false);
    // Kola před svátky se nehýbou.
    expect(after.get("top-15")).toBe("2026-12-14T17:00:00.000Z");
    expect(after.get("low-16")).toBe("2026-12-20T17:00:00.000Z");
    // Přebor: 11 kol od 4. 1. po pondělcích a čtvrtcích, konec 8. 2. místo 28. 1.
    const top = rounds.filter((r) => r.leagueId === "top").map((r) => after.get(r.id)!);
    expect(top.slice(2).map((iso) => iso.slice(0, 10))).toEqual(["2027-01-04", "2027-01-07", "2027-01-11", "2027-01-14", "2027-01-18", "2027-01-21", "2027-01-25", "2027-01-28", "2027-02-01", "2027-02-04", "2027-02-08"]);
    for (const iso of top) expect([1, 4]).toContain(at(iso).getUTCDay());
    // III. třída dál středa a neděle.
    for (const r of rounds.filter((x) => x.leagueId === "low")) expect([0, 3]).toContain(at(after.get(r.id)!).getUTCDay());

    // U21 hraje den po kole áčka, na které je navázaná.
    for (const r of rounds.filter((x) => x.parentCalendarId)) {
      expect(Date.parse(after.get(r.id)!) - Date.parse(after.get(r.parentCalendarId!)!), r.id).toBe(DAY_MS);
    }

    const summary = Object.fromEntries(plan.leagues.map((l) => [l.leagueId, l]));
    expect(summary.top).toMatchObject({ movedRounds: 11, firstMovedRound: 16, endShiftDays: 11 });
    expect(summary["top-u21"]).toMatchObject({ movedRounds: 10, endShiftDays: 10 });
    expect(summary.low).toMatchObject({ movedRounds: 10, firstMovedRound: 17, endShiftDays: 10 });
    expect(summary["low-u21"]).toMatchObject({ movedRounds: 10, endShiftDays: 10 });
  });

  it("s využitím volných dnů před svátky skončí přebor o týden později místo o jedenáct dní", () => {
    const { leagues, rounds } = productionLikeSeason();
    const plan = planHolidayShift(leagues, rounds, { useFreeDaysBefore: true });
    const top = plan.leagues.find((l) => l.leagueId === "top")!;
    expect(plan.shifts.find((s) => s.calendarId === "top-16")?.to).toBe("2026-12-17T17:00:00.000Z");
    expect(plan.shifts.find((s) => s.calendarId === "top-17")?.to).toBe("2027-01-04T17:00:00.000Z");
    expect(top.endShiftDays).toBe(7);
    for (const s of plan.shifts) expect(isHolidayBreak(at(s.to)), s.calendarId).toBe(false);
  });

  it("odehraná kola a ligy bez kola ve svátcích nechá být; druhý běh nic nemění", () => {
    const { leagues, rounds } = productionLikeSeason();
    const played = rounds.map((r) => (r.scheduledAt < "2026-12-21" ? { ...r, status: "simulated" } : r));
    const plan = planHolidayShift(leagues, played);
    expect(plan.shifts.every((s) => s.from >= "2026-12-22")).toBe(true);

    const moved = new Map(plan.shifts.map((s) => [s.calendarId, s.to]));
    const again = planHolidayShift(leagues, played.map((r) => ({ ...r, scheduledAt: moved.get(r.id) ?? r.scheduledAt })));
    expect(again.shifts).toEqual([]);

    const summer = planHolidayShift([leagues[0]], [{ id: "x", leagueId: "top", gameWeek: 1, scheduledAt: "2027-03-01T17:00:00.000Z", status: "scheduled", parentCalendarId: null }]);
    expect(summer.shifts).toEqual([]);
  });

  it("liga s už zamčeným kolem za svátky se neposune a řekne proč", () => {
    const plan = planHolidayShift(
      [{ id: "top", name: "Přebor", leagueType: "senior", weekdays: [1, 4] }],
      [
        { id: "a", leagueId: "top", gameWeek: 1, scheduledAt: "2026-12-24T17:00:00.000Z", status: "scheduled", parentCalendarId: null },
        { id: "b", leagueId: "top", gameWeek: 2, scheduledAt: "2026-12-28T17:00:00.000Z", status: "simulated", parentCalendarId: null },
      ],
    );
    expect(plan.shifts).toEqual([]);
    expect(plan.leagues[0].skipped).toBeTruthy();
  });
});
