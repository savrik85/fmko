/**
 * Přehled oblíbenosti klubu u firem v okrese (čisté funkce).
 */
import { describe, it, expect } from "vitest";
import {
  averageFavor, countBands, favorBand, pickExtremes, rankAmongClubs, seasonAtDate, type FirmFavor,
} from "./overview";

describe("pásma náklonnosti", () => {
  it("hranice shodné s webovým favorLabel", () => {
    expect(favorBand(100)).toBe("loves");
    expect(favorBand(80)).toBe("loves");
    expect(favorBand(79)).toBe("friendly");
    expect(favorBand(60)).toBe("friendly");
    expect(favorBand(59)).toBe("neutral");
    expect(favorBand(40)).toBe("neutral");
    expect(favorBand(39)).toBe("cold");
    expect(favorBand(20)).toBe("cold");
    expect(favorBand(19)).toBe("hostile");
    expect(favorBand(0)).toBe("hostile");
  });

  it("počty ve všech pěti pásmech, i nulové", () => {
    expect(countBands([85, 61, 40, 40, 10])).toEqual({ loves: 1, friendly: 1, neutral: 2, cold: 0, hostile: 1 });
    expect(countBands([])).toEqual({ loves: 0, friendly: 0, neutral: 0, cold: 0, hostile: 0 });
  });
});

describe("průměr", () => {
  it("na jedno desetinné místo, prázdný okres = null", () => {
    expect(averageFavor([])).toBeNull();
    expect(averageFavor([40, 45, 50])).toBe(45);
    expect(averageFavor([40, 41])).toBe(40.5);
    expect(averageFavor([40, 40, 41])).toBe(40.3);
  });
});

describe("pořadí mezi kluby", () => {
  const clubs = [
    { teamId: "a", avgFavor: 50 },
    { teamId: "b", avgFavor: 45 },
    { teamId: "c", avgFavor: 50 },
    { teamId: "d", avgFavor: 40 },
  ];
  it("shodný průměr = shodné pořadí", () => {
    expect(rankAmongClubs(clubs, "a")).toEqual({ rank: 1, clubsInDistrict: 4 });
    expect(rankAmongClubs(clubs, "c")).toEqual({ rank: 1, clubsInDistrict: 4 });
    expect(rankAmongClubs(clubs, "b")).toEqual({ rank: 3, clubsInDistrict: 4 });
    expect(rankAmongClubs(clubs, "d")).toEqual({ rank: 4, clubsInDistrict: 4 });
  });
  it("rozdíl pod desetinu se nepočítá", () => {
    expect(rankAmongClubs([{ teamId: "x", avgFavor: 40.01 }, { teamId: "y", avgFavor: 40.02 }], "x"))
      .toEqual({ rank: 1, clubsInDistrict: 2 });
  });
  it("klub mimo seznam = null", () => {
    expect(rankAmongClubs(clubs, "z")).toBeNull();
  });
});

describe("nejoblíbenější a nejchladnější", () => {
  const f = (sponsorId: number, name: string, favor: number): FirmFavor => ({ sponsorId, name, ownerName: null, favor });
  it("nahoře jen nad 40, dole jen pod 40, nejvýš tři", () => {
    const firms = [f(1, "A", 90), f(2, "B", 70), f(3, "C", 41), f(4, "D", 40), f(5, "E", 39), f(6, "F", 10), f(7, "G", 55)];
    const { top, coldest } = pickExtremes(firms);
    expect(top.map((x) => x.name)).toEqual(["A", "B", "G"]);
    expect(coldest.map((x) => x.name)).toEqual(["F", "E"]);
  });
  it("shodná náklonnost se řadí podle názvu", () => {
    const { top } = pickExtremes([f(1, "Žabka", 60), f(2, "Autoservis", 60)]);
    expect(top.map((x) => x.name)).toEqual(["Autoservis", "Žabka"]);
  });
  it("všichni na výchozí hodnotě = prázdné seznamy", () => {
    expect(pickExtremes([f(1, "A", 40), f(2, "B", 40)])).toEqual({ top: [], coldest: [] });
  });
});

describe("sezóna podpisu", () => {
  const seasons = [
    { number: 2, createdAt: "2026-07-04 08:53:56" },
    { number: 1, createdAt: "2026-03-29 09:17:29" },
  ];
  it("poslední sezóna založená nejpozději v okamžiku podpisu", () => {
    expect(seasonAtDate(seasons, "2026-05-01 10:00:00")).toBe(1);
    expect(seasonAtDate(seasons, "2026-07-04 08:53:56")).toBe(2);
    expect(seasonAtDate(seasons, "2026-09-07 18:43:10")).toBe(2);
  });
  it("podpis těsně před založením první sezóny patří do první", () => {
    expect(seasonAtDate(seasons, "2026-03-29 09:17:27")).toBe(1);
  });
  it("bez sezón = null", () => {
    expect(seasonAtDate([], "2026-05-01 10:00:00")).toBeNull();
  });
});
