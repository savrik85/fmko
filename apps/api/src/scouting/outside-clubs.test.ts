import { describe, expect, it } from "vitest";
import { createRng } from "../generators/rng";
import { FIRSTNAMES } from "../data/czech-names";
import { GERMAN_FIRSTNAMES } from "../data/german-names";
import { clubValuation } from "./youth-growth";
import { FOREIGN_CLUB_BONUS, FOREIGN_PRICE_FACTOR, FOREIGN_WAGE_FACTOR } from "./foreign";
import { buildOutsideSquad, OUTSIDE_AGE_MAX, OUTSIDE_AGE_MIN, outsideClubMean, outsideClubValuation, type SquadNames } from "./outside-clubs";

const NAMES: SquadNames = { surnameData: { surnames: { Novák: 1, Svoboda: 1 }, female_forms: {} }, firstnameData: { male: FIRSTNAMES, female: {} } };
const PISEK = { id: "pisek", name: "Písek", district: "Písek", population: 31_121, size: "mesto" };
const BAVARIAN_NAMES: SquadNames = { ...NAMES, surnameData: { surnames: { Huber: 3, Zellner: 1, Kölbl: 1 }, female_forms: {} } };
const WALDKIRCHEN = { id: "de-waldkirchen", name: "Waldkirchen", district: "Freyung-Grafenau", population: 11_326, size: "small_city", country: "DE" };
const germanFirstNames = new Set(Object.values(GERMAN_FIRSTNAMES).flatMap((d) => Object.keys(d)));

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
    // Bavorský klub je o FOREIGN_CLUB_BONUS silnější než český stejně velký.
    expect(outsideClubMean(11_049, 48.8, "DE")).toBeCloseTo(outsideClubMean(11_049, 48.8) + FOREIGN_CLUB_BONUS, 5);
    expect(outsideClubMean(800, 48.8, "DE")).toBeCloseTo(outsideClubMean(800, 48.8) + FOREIGN_CLUB_BONUS, 5);
  });
});

describe("klub v německém okrese", () => {
  it("německý název klubu, německá jména a národnost, plat ×1,5", () => {
    const squad = buildOutsideSquad(createRng(11), WALDKIRCHEN, 55, BAVARIAN_NAMES);
    const czech = buildOutsideSquad(createRng(11), { ...WALDKIRCHEN, country: undefined }, 55, BAVARIAN_NAMES);
    for (const p of squad) {
      expect(p.player.fromTeam).toMatch(/^(TSV|SV|FC|SpVgg|DJK|TuS|1\. FC) Waldkirchen$/);
      expect(p.player.nationality).toBe("DE");
      expect(p.player.fromCountry).toBe("DE");
      expect(germanFirstNames.has(p.player.firstName)).toBe(true);
      expect(["Huber", "Zellner", "Kölbl"]).toContain(p.player.lastName);
      expect(p.player.weeklyWage).toBe(Math.round(Math.round(10 + (p.rating / 100) * 400) * FOREIGN_WAGE_FACTOR));
    }
    // Česká obec téhož jména zůstává česká.
    expect(czech.every((p) => p.player.fromCountry === undefined)).toBe(true);
    expect(czech.some((p) => p.player.nationality === "CZ")).toBe(true);
  });

  it("ani v německém kádru dvakrát stejné jméno a příjmení", () => {
    for (let seed = 1; seed <= 30; seed++) {
      const squad = buildOutsideSquad(createRng(seed), WALDKIRCHEN, 50, BAVARIAN_NAMES);
      const full = squad.map((p) => `${p.player.firstName} ${p.player.lastName}`);
      expect(new Set(full).size).toBe(full.length);
    }
  });

  it("německý klub chce za hráče dvakrát víc než český", () => {
    const [p] = buildOutsideSquad(createRng(5), WALDKIRCHEN, 55, BAVARIAN_NAMES).map((x) => x.player);
    const base = clubValuation({ age: p.age, rating: p.overallRating, position: p.position, talent: p.hiddenTalent ?? 0, skillsMax: p.skillCaps ?? {} });
    expect(outsideClubValuation(p)).toBe(Math.round(base * FOREIGN_PRICE_FACTOR));
    expect(outsideClubValuation({ ...p, fromCountry: undefined })).toBe(base);
  });
});
