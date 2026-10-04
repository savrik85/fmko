/**
 * Kam skaut jezdí: obce v okruhu, výběr klubů na týden, kolik hráčů v kádru odpovídá úkolu,
 * pořadí hráče v jeho klubu a texty hlášení.
 */
import { describe, it, expect } from "vitest";
import { createRng } from "../generators/rng";
import {
  clubMeanFor, clubRankOf, expectedMatches, pickClubsToVisit, villageClubName, villagesInRadius, type VillageRow,
} from "./candidates";
import { emptyWeekSms, finishedSms, reportCons, reportPros, reportSms, revisitSms } from "./report-text";

// Skutečné souřadnice: Prachatice, Husinec (~6 km), Strakonice (~26 km), Písek (~45 km).
const PRACHATICE = { id: "pt", lat: 49.0128, lng: 13.9975 };
const OBCE: VillageRow[] = [
  { id: "pt", name: "Prachatice", district: "Prachatice", population: 11049, size: "small_city", lat: 49.0128, lng: 13.9975 },
  { id: "hu", name: "Husinec", district: "Prachatice", population: 1400, size: "town", lat: 49.0547, lng: 13.9868 },
  { id: "st", name: "Strakonice", district: "Strakonice", population: 22355, size: "small_city", lat: 49.2614, lng: 13.9024 },
  { id: "pi", name: "Písek", district: "Písek", population: 31121, size: "small_city", lat: 49.3088, lng: 14.1475 },
];

describe("obce v okruhu", () => {
  it("bere jen obce do zadané vzdálenosti a vynechá vlastní", () => {
    expect(villagesInRadius(OBCE, PRACHATICE, 15).map((v) => v.id)).toEqual(["hu"]);
    expect(villagesInRadius(OBCE, PRACHATICE, 30).map((v) => v.id).sort()).toEqual(["hu", "st"]);
    expect(villagesInRadius(OBCE, PRACHATICE, 50).map((v) => v.id).sort()).toEqual(["hu", "pi", "st"]);
  });

  it("vzdálenost je v celých kilometrech", () => {
    const hu = villagesInRadius(OBCE, PRACHATICE, 15)[0];
    expect(hu.distanceKm).toBeGreaterThanOrEqual(4);
    expect(hu.distanceKm).toBeLessThanOrEqual(6);
  });
});

describe("kluby mimo hru", () => {
  it("větší obec má silnější kádr", () => {
    expect(clubMeanFor(31_000)).toBeGreaterThan(clubMeanFor(1_400));
    // Písek ~48,7 a Strakonice ~47,2 (tabulka ze specu).
    expect(clubMeanFor(31_121)).toBeCloseTo(48.7, 0);
    expect(clubMeanFor(22_355)).toBeCloseTo(47.2, 0);
  });

  it("stejná obec má pořád stejný název klubu", () => {
    expect(villageClubName({ id: "hu", name: "Husinec" })).toBe(villageClubName({ id: "hu", name: "Husinec" }));
    expect(villageClubName({ id: "hu", name: "Husinec" })).toMatch(/Husinec$/);
  });

  it("skaut objede každý klub nejvýš jednou a víc, než jich je, ne", () => {
    const rng = createRng(5);
    const inRange = villagesInRadius(OBCE, PRACHATICE, 50);
    const picked = pickClubsToVisit(rng, inRange, 10);
    expect(picked.length).toBe(3);
    expect(new Set(picked.map((v) => v.id)).size).toBe(3);
  });

  it("počet hráčů odpovídajících úkolu", () => {
    expect(expectedMatches(null, 16, 35)).toBeCloseTo(18, 5);
    expect(expectedMatches(["GK"], 16, 35)).toBeCloseTo(2, 5);
    // Kádr má věk 16–35 (20 ročníků), 17–21 je pět z nich.
    expect(expectedMatches(["DEF"], 17, 21)).toBeCloseTo(18 * (6 / 18) * (5 / 20), 5);
    expect(expectedMatches(["MID"], 40, 45)).toBe(0);
    // Víc postů: obránci a záložníci = 12 z 18
    expect(expectedMatches(["DEF", "MID"], 16, 35)).toBeCloseTo(12, 5);
  });

  it("pořadí v kádru: výrazně lepší hráč než průměr bývá nejlepší, slabší ne", () => {
    const rng = createRng(1);
    let topBest = 0, weakBest = 0;
    for (let i = 0; i < 500; i++) {
      if (clubRankOf(rng, 60, 45) === 1) topBest++;
      if (clubRankOf(rng, 40, 45) === 1) weakBest++;
    }
    expect(topBest).toBeGreaterThan(450);
    expect(weakBest).toBeLessThan(5);
  });
});

describe("texty hlášení", () => {
  const subject = {
    position: "FWD", age: 20, distanceKm: 35,
    skills: { shooting: 55, speed: 52, technique: 40, heading: 30, strength: 45 },
    personality: { leadership: 75, discipline: 20, alcohol: 80, temper: 50, workRate: 50 },
  };

  it("počet klubů se skloňuje", () => {
    expect(finishedSms(1, 0)).toContain("Objel jsem 1 klub ");
    expect(finishedSms(4, 1)).toContain("Objel jsem 4 kluby ");
    expect(finishedSms(8, 2)).toContain("Objel jsem 8 klubů ");
  });

  it("plusy a minusy vycházejí z dovedností a povahy", () => {
    const pros = reportPros(subject);
    const cons = reportCons(subject);
    expect(pros[0]).toBe("Silná stránka: střelba");
    expect(pros).toContain("Umí strhnout kabinu");
    expect(cons[0]).toBe("Slabina: hlavičky");
    expect(cons).toContain("Na tréninky chodí, jak se mu chce");
  });

  it("žádná dlouhá pomlčka a jména v 1. pádě", () => {
    const rng = createRng(2);
    const texts = [
      reportSms(rng, { name: "Jan Novák", age: 20, position: "FWD", ratingLo: 40, ratingHi: 50, potentialLo: 50, potentialHi: 60, youth: true, source: "village_club", clubName: "TJ Sokol Husinec", villageName: "Husinec", district: "Prachatice", askHint: 12000 }),
      reportSms(rng, { name: "Jan Novák", age: 20, position: "FWD", ratingLo: 40, ratingHi: 50, potentialLo: null, potentialHi: null, youth: false, source: "free_agent", clubName: null, villageName: "Husinec", district: "Strakonice", askHint: null }),
      emptyWeekSms(rng, ["Husinec", "Strakonice", "Písek"]),
      revisitSms({ name: "Jan Novák", ratingLo: 44, ratingHi: 48, potentialLo: null, potentialHi: null, youth: false }),
      ...reportPros(subject), ...reportCons(subject),
    ];
    for (const t of texts) expect(t).not.toContain("—");
    expect(texts[0]).toContain("Jan Novák, 20 let");
    expect(texts[2]).toContain("Husinec, Strakonice a Písek");
  });
});
