import { describe, expect, it } from "vitest";
import { createRng } from "../generators/rng";
import { FIRSTNAMES } from "../data/czech-names";
import { buildOutsideSquad, OUTSIDE_AGE_MAX, OUTSIDE_AGE_MIN, outsideClubMean, type SquadNames } from "./outside-clubs";

const NAMES: SquadNames = { surnameData: { surnames: { Novák: 1, Svoboda: 1 }, female_forms: {} }, firstnameData: { male: FIRSTNAMES, female: {} } };
const PISEK = { id: "pisek", name: "Písek", district: "Písek", population: 31_121, size: "mesto" };

describe("stálý kádr klubu mimo hru", () => {
  it("18 hráčů: 2 brankáři, 6 obránců, 6 záložníků, 4 útočníci, věk 16–35, pořadí podle hodnocení", () => {
    const squad = buildOutsideSquad(createRng(7), PISEK, 58, NAMES);
    expect(squad).toHaveLength(18);
    const count = (pos: string) => squad.filter((p) => p.position === pos).length;
    expect([count("GK"), count("DEF"), count("MID"), count("FWD")]).toEqual([2, 6, 6, 4]);
    for (const p of squad) {
      expect(p.age).toBeGreaterThanOrEqual(OUTSIDE_AGE_MIN);
      expect(p.age).toBeLessThanOrEqual(OUTSIDE_AGE_MAX);
      expect(p.player.fromTeam).toMatch(/Písek$/);
      expect(p.player.overallRating).toBe(p.rating);
    }
    expect(squad.map((p) => p.clubRank).sort((a, b) => a - b)).toEqual(Array.from({ length: 18 }, (_, i) => i + 1));
    const best = squad.find((p) => p.clubRank === 1)!;
    expect(squad.every((p) => p.rating <= best.rating)).toBe(true);
  });

  it("stejná obec a sezóna = stejný kádr (souběžné vytvoření dá totéž)", () => {
    const a = buildOutsideSquad(createRng(42), PISEK, 58, NAMES);
    const b = buildOutsideSquad(createRng(42), PISEK, 58, NAMES);
    expect(a.map((p) => [p.player.firstName, p.player.lastName, p.rating, p.age])).toEqual(b.map((p) => [p.player.firstName, p.player.lastName, p.rating, p.age]));
  });

  it("silnější klub má silnější kádr", () => {
    const avg = (mean: number) => {
      const squad = buildOutsideSquad(createRng(3), PISEK, mean, NAMES);
      return squad.reduce((sum, p) => sum + p.rating, 0) / squad.length;
    };
    expect(avg(58)).toBeGreaterThan(avg(30) + 15);
  });

  it("síla klubu: vesnice podle obyvatel nejvýš liga + 2, města od 5 tisíc liga + až 12", () => {
    expect(outsideClubMean(500, 48.8)).toBeCloseTo(4.71 * Math.log(500), 5);
    expect(outsideClubMean(4_000, 30)).toBeCloseTo(32, 5);
    expect(outsideClubMean(31_121, 48.8)).toBeCloseTo(60.8, 5);
    expect(outsideClubMean(11_049, 48.8)).toBeCloseTo(54.1, 0);
    // Bez ligy (žádný klub ve hře) jen vesnický vzorec.
    expect(outsideClubMean(31_121, null)).toBeCloseTo(4.71 * Math.log(31_121), 5);
  });
});
