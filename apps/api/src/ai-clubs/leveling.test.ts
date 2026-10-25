import { describe, expect, it } from "vitest";
import { createRng } from "../generators/rng";
import { createPlayer } from "../generators/create-player";
import type { VillageInfo } from "../generators/player";
import { overallRatingFromFlat } from "../skills/generator";
import {
  findCapShare, findSkillShift, leveledFinance, measureNewcomerTop11, memberHeadroom, modestBudgetTarget, newClubBudget,
  newPlayerPositions, populationRankedUnits, quantile, shiftMember, squadHeadroom, stratifiedUnits, topAverage, TOP11_TOLERANCE, type SquadMember,
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

  it("strop se posune s dovedností, hráči zůstane stejný prostor k růstu", () => {
    // Typický hráč AI klubu: trénink zvedl plochou rychlost nad `skills_max.current`.
    const player: SquadMember = {
      id: "typical", position: "MID", age: 24,
      skills: { speed: 21, technique: 41, passing: 30, vision: 28, stamina: 25, strength: 30, shooting: 22, heading: 20, defense: 18, creativity: 33, setPieces: 20, goalkeeping: 1, experience: 30 },
      physical: { stamina: 25, strength: 30 },
      skillsMax: {
        speed: { current: 18, maxPotential: 47 }, technique: { current: 40, maxPotential: 47 },
        passing: { current: 30, maxPotential: 52 }, vision: { current: 25, maxPotential: 44 },
        stamina: { current: 25, maxPotential: 41 }, strength: { current: 28, maxPotential: 45 },
        shooting: { current: 22, maxPotential: 40 }, heading: { current: 20, maxPotential: 35 },
        defense: { current: 18, maxPotential: 30 }, creativity: { current: 30, maxPotential: 50 },
        setPieces: { current: 20, maxPotential: 38 }, experience: { current: 20, maxPotential: 100 },
      },
      hiddenTalent: 20, rating: 28,
    };
    const s = shiftMember(player, 12);
    const max = (key: string) => (s.skillsMax[key] as { current: number; maxPotential: number });
    // Posun z ploché hodnoty: rychlost 21 → 33, strop 47 → 59 (prostor 26 jako předtím).
    expect(s.skills.speed).toBe(33);
    expect(max("speed")).toEqual({ current: 33, maxPotential: 59 });
    expect(max("technique")).toEqual({ current: 53, maxPotential: 59 });
    for (const key of ["passing", "vision", "stamina", "strength", "shooting", "heading", "defense", "creativity", "setPieces"]) {
      const before = (player.skillsMax[key] as { maxPotential: number }).maxPotential - (player.skills[key] as number);
      expect(max(key).maxPotential - max(key).current, key).toBe(before);
    }
    // Zkušenost se neposouvá, jen se dorovná current na plochou hodnotu.
    expect(max("experience")).toEqual({ current: 30, maxPotential: 100 });
  });

  it("strop nad 99 nezvedne, vyšší strop nesníží a hodnocení nepustí přes strop Pralesu", () => {
    const high: SquadMember = {
      id: "high", position: "FWD", age: 26,
      skills: { speed: 80, technique: 92, shooting: 70, passing: 60, heading: 60, defense: 30, vision: 60, creativity: 60, setPieces: 50, stamina: 60, strength: 60, goalkeeping: 1, experience: 50 },
      physical: { stamina: 60, strength: 60 },
      skillsMax: {
        speed: { current: 80, maxPotential: 95 }, technique: { current: 92, maxPotential: 100 },
        shooting: { current: 70, maxPotential: 80 }, passing: { current: 60, maxPotential: 75 },
        heading: { current: 60, maxPotential: 70 }, defense: { current: 30, maxPotential: 40 },
        vision: { current: 60, maxPotential: 72 }, creativity: { current: 60, maxPotential: 75 },
        setPieces: { current: 50, maxPotential: 60 }, stamina: { current: 60, maxPotential: 70 },
        strength: { current: 60, maxPotential: 70 }, experience: { current: 50, maxPotential: 100 },
      },
      hiddenTalent: 30, rating: 64,
    };
    const s = shiftMember(high, 10);
    const max = (key: string) => (s.skillsMax[key] as { current: number; maxPotential: number });
    expect(max("speed").maxPotential).toBeLessThanOrEqual(99);
    expect(max("technique").maxPotential).toBe(100);
    for (const [key, entry] of Object.entries(high.skillsMax)) {
      expect(max(key).maxPotential, key).toBeGreaterThanOrEqual((entry as { maxPotential: number }).maxPotential);
      expect(max(key).maxPotential, key).toBeGreaterThanOrEqual(max(key).current);
    }
    // Vážený průměr stropů (nejvyšší možné hodnocení) nejde přes 85, kde to dovolí původní stropy.
    const ceiling = overallRatingFromFlat("FWD", {}, {}, 0, Object.fromEntries(
      Object.entries(s.skillsMax).map(([k, e]) => [k, { current: (e as { maxPotential: number }).maxPotential }]),
    ));
    expect(ceiling!).toBeLessThanOrEqual(85);
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

describe("rezerva do stropu dovedností", () => {
  const player: SquadMember = {
    id: "reserve", position: "MID", age: 25,
    skills: { speed: 30, technique: 40, passing: 35, goalkeeping: 1, experience: 20 },
    physical: {},
    skillsMax: {
      speed: { current: 30, maxPotential: 50 }, technique: { current: 38, maxPotential: 46 },
      passing: { current: 35, maxPotential: 35 }, goalkeeping: { current: 1, maxPotential: 40 },
      experience: { current: 20, maxPotential: 100 },
    },
    hiddenTalent: 20, rating: 35,
  };

  it("měří jen dovednosti, které trénink zvedá, z ploché hodnoty", () => {
    // Rychlost 20, technika 6 (plochá 40, ne current 38), přihrávky 0; zkušenost a chytání hráče v poli ne.
    expect(memberHeadroom(player)).toBeCloseTo(26 / 3, 5);
    expect(memberHeadroom({ ...player, skillsMax: {} })).toBeNull();
    expect(squadHeadroom([])).toBeNaN();
  });

  it("strop dostane jen díl přírůstku, nikdy neklesne pod původní ani pod dovednost", () => {
    const half = shiftMember(player, 10, 0.5);
    const cap = (s: ReturnType<typeof shiftMember>, key: string) => (s.skillsMax[key] as { maxPotential: number }).maxPotential;
    expect(half.skills.speed).toBe(40);
    expect(cap(half, "speed")).toBe(55);
    expect(cap(half, "technique")).toBe(51);
    const none = shiftMember(player, 10, 0);
    expect(cap(none, "speed")).toBe(50);
    // Technika 50 je nad původním stropem 46: strop jde na dovednost, ne pod ni.
    expect(cap(none, "technique")).toBe(50);
    expect(cap(none, "passing")).toBe(45);
    // Hodnocení na stropu nezávisí.
    expect(none.rating).toBe(shiftMember(player, 10).rating);
  });

  it("díl stropu trefí cílovou rezervu kádru a rezervu jen ubírá", () => {
    const members = squad(21);
    const shift = 12;
    const full = squadHeadroom(members.map((m) => ({ position: m.position, ...shiftMember(m, shift) })));
    const target = full / 2;
    const share = findCapShare(members, shift, target);
    expect(share).toBeGreaterThan(0);
    expect(share).toBeLessThan(1);
    const after = squadHeadroom(members.map((m) => ({ position: m.position, ...shiftMember(m, shift, share) })));
    expect(Math.abs(after - target)).toBeLessThan(0.5);
    // Kádr s menší rezervou, než je cíl, dostane celý posun; bez cíle nebo bez posunu taky.
    expect(findCapShare(members, shift, full + 5)).toBe(1);
    expect(findCapShare(members, shift, null)).toBe(1);
    expect(findCapShare(members, 0, 1)).toBe(1);
    // Pod rezervu, kterou dává samotný původní strop, nejde.
    expect(findCapShare(members, shift, 0)).toBe(0);
  });
});

describe("rozpočet a reputace", () => {
  it("převzatý klub nepřijde o rozpočet, původní AI klub jde na cíl i dolů", () => {
    expect(leveledFinance(204_000, 86_000, true)).toBe(204_000);
    expect(leveledFinance(30_000, 86_000, true)).toBe(86_000);
    expect(leveledFinance(204_000, 86_000, false)).toBe(86_000);
    expect(leveledFinance(30_000, 86_000, false)).toBe(86_000);
  });

  it("nižší soutěž a nováčci: startovní rozpočet nového klubu v obci × (1 + percentil)", () => {
    // Stejné hranice jako POST /api/teams: nad 5 000 obyvatel 80 000, nad 1 000 40 000, jinak 20 000.
    expect(newClubBudget(11_049)).toBe(80_000);
    expect(newClubBudget(2_744)).toBe(40_000);
    expect(newClubBudget(1_000)).toBe(20_000);
    expect(newClubBudget(400)).toBe(20_000);
    expect(modestBudgetTarget(2_744, 0)).toBe(40_000);
    expect(modestBudgetTarget(2_744, 0.2)).toBe(48_000);
    expect(modestBudgetTarget(400, 0.35)).toBe(27_000);
    expect(modestBudgetTarget(6_000, 0.123)).toBe(89_800);
    // Rozpočet nikdy pod startovní rozpočet nového klubu (dřív končil na podlaze 10 000).
    for (const p of [0, 0.1, 0.35]) expect(modestBudgetTarget(300, p)).toBeGreaterThanOrEqual(20_000);
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

describe("pořadí síly podle velikosti obce", () => {
  it("větší obec dostane vyšší pásmo, podobně velké rozhodne los", () => {
    // ČB: krajské město, malé město, vesnice, osada.
    const populations = [1_800, 94_463, 510, 8_088, 1_900, 4_688];
    const units = populationRankedUnits(createRng(20261025), populations);
    expect(units).toHaveLength(populations.length);
    for (const u of units) expect(u).toBeGreaterThanOrEqual(0);
    for (const u of units) expect(u).toBeLessThan(1);
    // České Budějovice nejvýš, osada Záboří nejníž, Týn nad Dříteň.
    expect(units[1]).toBe(Math.max(...units));
    expect(units[2]).toBe(Math.min(...units));
    expect(units[3]).toBeGreaterThan(units[0]);
    // Každé pásmo jednou (stejně jako stratifiedUnits).
    expect(units.map((u) => Math.floor(u * populations.length)).sort()).toEqual([0, 1, 2, 3, 4, 5]);
  });
});
