/**
 * Testy generátoru poolu a rotace delegací — obojí čisté funkce, bez DB.
 */
import { describe, it, expect } from "vitest";
import { createRng } from "../generators/rng";
import { seedFromString } from "../lib/seed";
import {
  generateRefereePool, normalizeDistrict, refereeFullName, rowToProfile,
  REFEREES_PER_DISTRICT, type RefereeRow,
} from "./referee-generator";
import { pickRefereesForRound, type DelegationMatch, type DelegationState } from "./delegation";
import { REFEREE_ARCHETYPES, type RefereeArchetype } from "../engine/referee";

const SURNAMES: Record<string, number> = {
  "Novák": 45, "Svoboda": 38, "Novotný": 36, "Dvořák": 35, "Černý": 32,
  "Procházka": 30, "Kučera": 28, "Veselý": 25, "Horák": 24, "Němec": 22,
  "Pokorný": 20, "Marek": 19, "Pospíšil": 18, "Hájek": 17, "Jelínek": 16,
  "Král": 15, "Růžička": 15, "Beneš": 14, "Fiala": 13, "Sedláček": 12,
};

/**
 * Skutečná ID prachatické komise z databáze, zaznamenaná před rozšířením listiny
 * na 24 sudích. Fixture, ne odvozená hodnota — viz test níž.
 */
const ID_PRACHATICE = [
  "ref-1053551775-9", "ref-1245657886-7", "ref-1245657889-4", "ref-1287932300-10",
  "ref-1526600609-12", "ref-155784469-13", "ref-155784470-14", "ref-1759569117-0",
  "ref-1898507992-5", "ref-1898507996-1", "ref-255010082-11", "ref-455112021-8",
  "ref-884376506-2", "ref-884376507-3", "ref-896184097-6",
];

/** Sedm zápasů seniorů plus sedm U21 ve stejný den. */
const DENNI_ZAPASY_OKRESU = 14;

describe("generátor rozhodčích", () => {
  const pool = generateRefereePool("Prachatice", SURNAMES);

  it("vygeneruje celou listinu okresu", () => {
    expect(pool).toHaveLength(REFEREES_PER_DISTRICT);
    expect(REFEREES_PER_DISTRICT).toBeGreaterThan(DENNI_ZAPASY_OKRESU);
  });

  /**
   * Zámek na ID základní patnáctky.
   *
   * Tohle jsou skutečná ID z běžící databáze, ne vypočítaná očekávání. ID sudího
   * visí na odpískaných zápasech, známkách a vztazích ke klubům — kdyby se
   * generátor rozjel, tiše by se rozpadly. Když tenhle test spadne, NEPŘEPISUJ
   * fixture: rozbil se generátor.
   */
  it("základní patnáctka má pořád stejná ID", () => {
    expect(pool.slice(0, 15).map((r) => r.id).sort()).toEqual([...ID_PRACHATICE].sort());
  });

  it("doplněk listiny nesahá na základní patnáctku", () => {
    const zakladni = new Set(ID_PRACHATICE);
    const doplnek = pool.slice(15);
    expect(doplnek).toHaveLength(REFEREES_PER_DISTRICT - 15);
    for (const r of doplnek) expect(zakladni.has(r.id)).toBe(false);
  });

  it("všechny osy leží v rozsahu deklarovaném archetypem", () => {
    for (const r of pool) {
      const a = REFEREE_ARCHETYPES[r.archetype];
      const within = (v: number, range: readonly [number, number], name: string) => {
        expect(v, `${r.archetype}.${name}`).toBeGreaterThanOrEqual(range[0]);
        expect(v, `${r.archetype}.${name}`).toBeLessThanOrEqual(range[1]);
      };
      within(r.age, a.ageRange, "age");
      within(r.strictness, a.strictness, "strictness");
      within(r.cardHappiness, a.cardHappiness, "cardHappiness");
      within(r.experience, a.experience, "experience");
      within(r.homeBias, a.homeBias, "homeBias");
      within(r.advantage, a.advantage, "advantage");
      within(r.fitness, a.fitness, "fitness");
    }
  });

  it("nikdo nemá prázdné povolání, bio, hlášku ani avatar", () => {
    for (const r of pool) {
      expect(r.occupation.length).toBeGreaterThan(0);
      expect(r.bio.length).toBeGreaterThan(0);
      expect(r.hlaska.length).toBeGreaterThan(0);
      expect(Object.keys(r.avatar).length).toBeGreaterThan(0);
    }
  });

  it("jména se v okrese neopakují", () => {
    const names = pool.map((r) => `${r.firstName} ${r.lastName}`);
    expect(new Set(names).size).toBe(names.length);
  });

  it("ženy mají přechýlené příjmení", () => {
    for (const r of pool.filter((x) => x.gender === "f")) {
      expect(r.lastName, r.lastName).toMatch(/(á|ová)$/);
    }
  });

  it("stejný okres dá vždy tytéž lidi", () => {
    const again = generateRefereePool("Prachatice", SURNAMES);
    expect(JSON.stringify(again)).toBe(JSON.stringify(pool));
  });

  it("různé okresy dají různé lidi", () => {
    const praha = generateRefereePool("Praha", SURNAMES);
    const jmenaA = pool.map((r) => `${r.firstName} ${r.lastName}`).join("|");
    const jmenaB = praha.map((r) => `${r.firstName} ${r.lastName}`).join("|");
    expect(jmenaB).not.toBe(jmenaA);
  });

  it("U21 liga sdílí pool se seniory", () => {
    expect(normalizeDistrict("Prachatice U21")).toBe("Prachatice");
    expect(normalizeDistrict("Prachatice")).toBe("Prachatice");
    const u21 = generateRefereePool("Prachatice U21", SURNAMES);
    expect(u21.map((r) => r.id)).toEqual(pool.map((r) => r.id));
  });

  it("v okrese je právě jeden pískavý kohout a jeden kartový cvok", () => {
    const count = (a: RefereeArchetype) => pool.filter((r) => r.archetype === a).length;
    expect(count("piskavy_kohout")).toBe(1);
    expect(count("kartovy_cvok")).toBe(1);
  });

  it("jméno s přezdívkou se skládá čitelně", () => {
    expect(refereeFullName({ first_name: "Jan", last_name: "Novák", nickname: "Píšťala" }))
      .toBe('Jan „Píšťala" Novák');
    expect(refereeFullName({ first_name: "Jan", last_name: "Novák", nickname: null }))
      .toBe("Jan Novák");
  });
});

// ── Delegace ─────────────────────────────────────────────────────────────────

function mkPool(n = REFEREES_PER_DISTRICT): RefereeRow[] {
  return generateRefereePool("Prachatice", SURNAMES).slice(0, n).map((r) => ({
    id: r.id, district: r.district, first_name: r.firstName, last_name: r.lastName,
    nickname: r.nickname, gender: r.gender, age: r.age, occupation: r.occupation,
    archetype: r.archetype, strictness: r.strictness, card_happiness: r.cardHappiness,
    experience: r.experience, home_bias: r.homeBias, advantage: r.advantage,
    fitness: r.fitness, avatar: JSON.stringify(r.avatar), bio: r.bio, hlaska: r.hlaska,
    status: "active",
  }));
}

/** Kolo 7 zápasů ze 14 týmů, dvojice se každé kolo posunou. */
function mkRound(week: number, teamCount = 14): DelegationMatch[] {
  const out: DelegationMatch[] = [];
  for (let i = 0; i < teamCount / 2; i++) {
    const home = (i + week) % teamCount;
    const away = (teamCount - 1 - i + week) % teamCount;
    out.push({ id: `m-${week}-${i}`, homeTeamId: `t${home}`, awayTeamId: `t${away}` });
  }
  return out;
}

const emptyState = (week: number): DelegationState => ({
  assignedCount: {}, lastWeekOf: {}, lastRefOfTeam: {}, busyToday: new Set(), currentWeek: week,
});

describe("delegace rozhodčích", () => {
  it("nikdo nepíská dva zápasy v jednom kole", () => {
    const pool = mkPool();
    const picks = pickRefereesForRound(createRng(1), pool, mkRound(1), emptyState(1));
    expect(picks).toHaveLength(7);
    expect(new Set(picks.map((p) => p.refereeId)).size).toBe(7);
  });

  it("zátěž je přes sezónu rozdělená férově", () => {
    const pool = mkPool();
    const state = emptyState(1);
    for (let week = 1; week <= 26; week++) {
      state.currentWeek = week;
      const picks = pickRefereesForRound(createRng(seedFromString(`w${week}`)), pool, mkRound(week), state);
      for (const p of picks) {
        state.assignedCount[p.refereeId] = (state.assignedCount[p.refereeId] ?? 0) + 1;
        state.lastWeekOf[p.refereeId] = week;
      }
      for (const m of mkRound(week)) {
        const pick = picks.find((p) => p.matchId === m.id)!;
        state.lastRefOfTeam[m.homeTeamId] = pick.refereeId;
        state.lastRefOfTeam[m.awayTeamId] = pick.refereeId;
      }
    }
    const counts = pool.map((r) => state.assignedCount[r.id] ?? 0);
    expect(counts.reduce((a, b) => a + b, 0)).toBe(26 * 7);
    expect(Math.max(...counts) - Math.min(...counts)).toBeLessThanOrEqual(3);
  });

  it("týž sudí nepíská témuž týmu dvě kola po sobě (skoro nikdy)", () => {
    const pool = mkPool();
    const state = emptyState(1);
    let repeats = 0;
    let checks = 0;
    for (let week = 1; week <= 26; week++) {
      state.currentWeek = week;
      const round = mkRound(week);
      const picks = pickRefereesForRound(createRng(seedFromString(`r${week}`)), pool, round, state);
      for (const m of round) {
        const pick = picks.find((p) => p.matchId === m.id)!;
        for (const team of [m.homeTeamId, m.awayTeamId]) {
          if (state.lastRefOfTeam[team]) {
            checks++;
            if (state.lastRefOfTeam[team] === pick.refereeId) repeats++;
          }
        }
      }
      for (const m of round) {
        const pick = picks.find((p) => p.matchId === m.id)!;
        state.lastRefOfTeam[m.homeTeamId] = pick.refereeId;
        state.lastRefOfTeam[m.awayTeamId] = pick.refereeId;
        state.assignedCount[pick.refereeId] = (state.assignedCount[pick.refereeId] ?? 0) + 1;
        state.lastWeekOf[pick.refereeId] = week;
      }
    }
    expect(checks).toBeGreaterThan(200);
    expect(repeats / checks).toBeLessThan(0.02);
  });

  it("stejný seed dá stejné přiřazení", () => {
    const pool = mkPool();
    const a = pickRefereesForRound(createRng(42), pool, mkRound(3), emptyState(3));
    const b = pickRefereesForRound(createRng(42), pool, mkRound(3), emptyState(3));
    expect(a).toEqual(b);
  });

  it("neuvázne, když je zápasů víc než volných sudích (senior + U21 tentýž den)", () => {
    const pool = mkPool();
    const state = emptyState(5);
    // Sedm sudích už má ten den seniorský zápas.
    for (const r of pool.slice(0, 7)) state.busyToday.add(r.id);
    const picks = pickRefereesForRound(createRng(7), pool, mkRound(5), state);
    expect(picks).toHaveLength(7);
    for (const p of picks) expect(state.busyToday.has(p.refereeId)).toBe(false);
  });

  it("zvládne i případ, kdy je zápasů víc než celý pool", () => {
    const pool = mkPool(4);
    const many = Array.from({ length: 7 }, (_, i) => ({
      id: `x${i}`, homeTeamId: `h${i}`, awayTeamId: `a${i}`,
    }));
    const picks = pickRefereesForRound(createRng(9), pool, many, emptyState(1));
    expect(picks).toHaveLength(7);
    for (const p of picks) expect(pool.some((r) => r.id === p.refereeId)).toBe(true);
  });

  it("prázdný pool nespadne, jen nic nedeleguje", () => {
    expect(pickRefereesForRound(createRng(1), [], mkRound(1), emptyState(1))).toEqual([]);
  });

  it("řádek z DB se převede na profil pro engine", () => {
    const row = mkPool(1)[0];
    const profile = rowToProfile(row);
    expect(profile.id).toBe(row.id);
    expect(profile.strictness).toBe(row.strictness);
    expect(profile.cardHappiness).toBe(row.card_happiness);
    expect(profile.homeBias).toBe(row.home_bias);
  });
});
