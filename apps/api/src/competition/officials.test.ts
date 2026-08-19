/**
 * Docházková podmínka pro kandidaturu.
 *
 * Regrese na konkrétní chybu: podmínka kousala už při dvou proběhlých zasedáních,
 * takže po zapnutí samosprávy nemohl kandidovat vůbec nikdo a soutěž by zůstala
 * bez vedení.
 */

import { describe, it, expect } from "vitest";
import { meetsAttendance, rolesFor } from "./officials";

describe("docházka kandidáta", () => {
  it("na začátku, kdy žádné zasedání neproběhlo, může kandidovat každý", () => {
    expect(meetsAttendance({ present: 0, of: 0 })).toBe(true);
  });

  it("dokud okno není plné, docházka nikoho neblokuje", () => {
    expect(meetsAttendance({ present: 0, of: 1 })).toBe(true);
    expect(meetsAttendance({ present: 1, of: 2 })).toBe(true);   // přesně případ z hlášky
    expect(meetsAttendance({ present: 0, of: 4 })).toBe(true);
  });

  it("po plném okně už se docházka vyžaduje", () => {
    expect(meetsAttendance({ present: 3, of: 5 })).toBe(true);   // 60 % přesně
    expect(meetsAttendance({ present: 2, of: 5 })).toBe(false);  // 40 %
    expect(meetsAttendance({ present: 5, of: 5 })).toBe(true);
    expect(meetsAttendance({ present: 0, of: 5 })).toBe(false);
  });
});

describe("odbory podle velikosti soutěže", () => {
  it("malá soutěž má jen prezidenta a generálního sekretáře", () => {
    expect(rolesFor(5)).toEqual(["predseda", "hospodarska"]);
    expect(rolesFor(8)).toEqual(["predseda", "hospodarska"]);
  });

  it("od devíti klubů se otevřou všechny čtyři", () => {
    expect(rolesFor(9)).toHaveLength(4);
    expect(rolesFor(14)).toContain("disciplinarni");
    expect(rolesFor(14)).toContain("rozhodcich");
  });
});
