import { describe, expect, it } from "vitest";
import { createRng } from "../generators/rng";
import { createPlayer } from "../generators/create-player";
import type { VillageInfo } from "../generators/player";
import { overallRatingFromFlat } from "../skills/generator";
import {
  findSkillShift, leveledFinance, measureNewcomerTop11, newPlayerPositions, quantile, shiftMember,
  stratifiedUnits, topAverage, TOP11_TOLERANCE, type SquadMember,
} from "./leveling";

const village: VillageInfo = { region_code: "CZ031", category: "obec", population: 900, district: "Prachatice" };
const names = {
  surnameData: { surnames: { Novák: 1, Dvořák: 1 }, female_forms: {} },
  firstnameData: { male: { "1990s": { Jan: 1, Petr: 1 }, "1980s": { Josef: 1 } }, female: {} },
};

function squad(seed: number, size = 20, shift = 0): SquadMember[] {
  const rng = createRng(seed);
  const positions = ["GK", "GK", "DEF", "DEF", "DEF", "DEF", "DEF", "DEF", "MID", "MID", "MID", "MID", "MID", "MID", "FWD", "FWD", "FWD", "FWD", "FWD", "DEF"] as const;
  return Array.from({ length: size }, (_, i) => {
    const p = createPlayer(rng, { position: positions[i % positions.length], village, names, level: "village", shift });
    return {
      id: `p-${seed}-${i}`, position: p.position, age: p.age,
      skills: { ...p.skills }, physical: { ...p.physical }, skillsMax: { ...p.skillsMax },
      hiddenTalent: p.hiddenTalent, rating: p.rating,
    };
  });
}

const top11Of = (members: SquadMember[], shift: number) => topAverage(members.map((m) => shiftMember(m, shift).rating), 11);

describe("kvantil vzoru", () => {
  it("[10, 20, 30, 40] v p = 0,5 je 25, kraje jsou minimum a maximum", () => {
    expect(quantile([10, 20, 30, 40], 0.5)).toBe(25);
    expect(quantile([40, 10, 30, 20], 0)).toBe(10);
    expect(quantile([10, 20, 30, 40], 1)).toBe(40);
    expect(quantile([10, 20, 30, 40], 0.25)).toBeCloseTo(17.5);
    expect(Number.isNaN(quantile([], 0.5))).toBe(true);
  });
});

describe("posun dovedností kádru", () => {
  it("trefí cíl nejlepší jedenáctky s přesností ±0,5", () => {
    for (const [seed, target] of [[1, 45], [2, 39], [3, 52], [4, 61], [5, 34]] as const) {
      const members = squad(seed);
      const shift = findSkillShift(members, target);
      expect(shift, `seed ${seed}`).toBeGreaterThan(0);
      expect(Math.abs(top11Of(members, shift) - target), `seed ${seed}, cíl ${target}`).toBeLessThanOrEqual(TOP11_TOLERANCE);
    }
  });

  it("počítá i s novými hráči, kteří se neposouvají", () => {
    const members = squad(7);
    const newcomers = [44, 43, 41];
    const shift = findSkillShift(members, 48, newcomers);
    const after = topAverage([...members.map((m) => shiftMember(m, shift).rating), ...newcomers], 11);
    expect(Math.abs(after - 48)).toBeLessThanOrEqual(TOP11_TOLERANCE);
  });

  it("jen nahoru: klub nad cílem se nesníží", () => {
    const members = squad(8, 20, 20);
    const before = top11Of(members, 0);
    expect(findSkillShift(members, before - 10)).toBe(0);
    for (const m of members) expect(shiftMember(m, 0).rating).toBe(m.rating);
  });

  it("hodnocení po posunu nikdy neklesne pod dosavadní, ani když bylo uložené výš", () => {
    const [m] = squad(9, 1);
    const stale = { ...m, rating: m.rating + 15 };
    expect(shiftMember(stale, 2).rating).toBe(stale.rating);
  });

  it("výdrž a síla jdou i do physical, skills_max dorovná a strop zůstane nad dnešní hodnotou", () => {
    const members = squad(10);
    const shift = 12.4;
    for (const m of members) {
      const s = shiftMember(m, shift);
      expect(s.physical.stamina).toBe(s.skills.stamina);
      expect(s.physical.strength).toBe(s.skills.strength);
      expect(s.skills.experience).toBe(m.skills.experience);
      if (m.position !== "GK") expect(s.skills.goalkeeping).toBe(m.skills.goalkeeping);
      for (const [key, entry] of Object.entries(s.skillsMax)) {
        const e = entry as { current: number; maxPotential: number };
        if (typeof s.skills[key] === "number") expect(e.current, key).toBe(s.skills[key]);
        expect(e.maxPotential, key).toBeGreaterThanOrEqual(e.current);
      }
      for (const [key, value] of Object.entries(s.skills)) {
        if (typeof value === "number") expect(value, key).toBeLessThanOrEqual(100);
      }
      // Hodnocení jediným vzorcem.
      expect(s.rating).toBe(Math.max(m.rating, overallRatingFromFlat(m.position, s.skills, s.physical, m.hiddenTalent, s.skillsMax)!));
    }
  });

  it("síla s posunem neklesá (binární hledání má smysl)", () => {
    const members = squad(11);
    let last = -Infinity;
    for (let d = 0; d <= 20; d += 0.25) {
      const v = top11Of(members, d);
      expect(v).toBeGreaterThanOrEqual(last);
      last = v;
    }
  });
});

describe("rozpočet a reputace", () => {
  it("převzatý klub nepřijde o rozpočet, původní AI klub jde na cíl i dolů", () => {
    expect(leveledFinance(204_000, 86_000, true)).toBe(204_000);
    expect(leveledFinance(30_000, 86_000, true)).toBe(86_000);
    expect(leveledFinance(204_000, 86_000, false)).toBe(86_000);
    expect(leveledFinance(30_000, 86_000, false)).toBe(86_000);
  });
});

describe("noví hráči a rozprostření klubů", () => {
  it("doplní nejdřív chybějící posty, velký kádr má tři brankáře", () => {
    const positions = newPlayerPositions({ GK: 1, DEF: 5, MID: 6, FWD: 3 }, 9, "senior");
    expect(positions).toHaveLength(9);
    const count = (p: string) => positions.filter((x) => x === p).length;
    expect(1 + count("GK")).toBe(3);
    expect(5 + count("DEF")).toBeGreaterThanOrEqual(7);
    expect(3 + count("FWD")).toBeGreaterThanOrEqual(5);
    expect(newPlayerPositions({ GK: 2, DEF: 5, MID: 5, FWD: 2 }, 2, "u21").filter((p) => p === "GK")).toHaveLength(0);
  });

  it("každý klub dostane jiný pás percentilu", () => {
    const units = stratifiedUnits(createRng(5), 14);
    expect(units).toHaveLength(14);
    const strata = units.map((u) => Math.floor(u * 14)).sort((a, b) => a - b);
    expect(strata).toEqual(Array.from({ length: 14 }, (_, i) => i));
  });

  it("nováček z větší obce je silnější a měření je stálé", () => {
    const hamlet = measureNewcomerTop11("hamlet", 3);
    const city = measureNewcomerTop11("small_city", 3);
    expect(city).toBeGreaterThan(hamlet);
    expect(measureNewcomerTop11("village", 99)).toBe(measureNewcomerTop11("village", 99));
    expect(measureNewcomerTop11("village", 99, "u21")).toBeLessThan(measureNewcomerTop11("village", 99));
  });
});
