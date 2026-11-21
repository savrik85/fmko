/**
 * Domácí pomezní s praporkem v enginu (F15).
 *
 * Pomezní smí posunout jen to, komu padne neuznaný gól (ofsajd). Bez pomezního musí
 * být zápas bit po bitu stejný jako před jeho zavedením: `planRefereeError` dál
 * spotřebuje přesně čtyři hodnoty RNG ve stejném pořadí.
 */
import { describe, expect, it } from "vitest";
import { createRng, type Rng } from "../generators/rng";
import { simulateMatch } from "./simulation";
import {
  NEUTRAL_REFEREE, REFEREE_ARCHETYPES, matchErrorChance, planRefereeError,
  type PlannedRefereeError, type RefereeArchetype, type RefereeProfile,
} from "./referee";
import type { MatchPlayer, TeamSetup } from "./types";

/**
 * Doslovná kopie `planRefereeError` z doby před pomezním (2026-11-21). Slouží jako
 * referenční výsledek: bez pomezního musí nová funkce vracet totéž.
 */
function legacyPlanRefereeError(rng: Rng, r: RefereeProfile): PlannedRefereeError | null {
  const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
  const table = [
    { kind: "neuznany_gol", weight: 0.25, severity: "high" },
    { kind: "vymyslena_penalta", weight: 0.25, severity: "high" },
    { kind: "neodpiskana_penalta", weight: 0.22, severity: "medium" },
    { kind: "chybna_cervena", weight: 0.08, severity: "high" },
    { kind: "prehlednuta_cervena", weight: 0.10, severity: "medium" },
    { kind: "sporny_primak", weight: 0.10, severity: "low" },
  ] as const;
  const roll = rng.random();
  const minuteRoll = rng.random();
  const typeRoll = rng.random();
  const sideRoll = rng.random();
  if (roll >= matchErrorChance(r)) return null;
  const favourHome = sideRoll < clamp(0.5 + (r.homeBias - 50) / 200, 0.15, 0.85);
  let acc = 0;
  let picked: (typeof table)[number] = table[table.length - 1];
  for (const row of table) {
    acc += row.weight;
    if (typeRoll <= acc) { picked = row; break; }
  }
  return { minute: 3 + Math.floor(minuteRoll * 85), kind: picked.kind, severity: picked.severity, favourHome };
}

function fromArchetype(key: RefereeArchetype): RefereeProfile {
  const a = REFEREE_ARCHETYPES[key];
  const mid = (r: readonly [number, number]) => Math.round((r[0] + r[1]) / 2);
  return {
    id: key, name: a.label, archetype: key,
    strictness: mid(a.strictness), cardHappiness: mid(a.cardHappiness), experience: mid(a.experience),
    homeBias: mid(a.homeBias), advantage: mid(a.advantage), fitness: mid(a.fitness),
  };
}

const PROFILES: RefereeProfile[] = [
  NEUTRAL_REFEREE,
  { ...NEUTRAL_REFEREE, experience: 0, homeBias: 100 },
  { ...NEUTRAL_REFEREE, experience: 0, homeBias: 0 },
  ...(Object.keys(REFEREE_ARCHETYPES) as RefereeArchetype[]).map(fromArchetype),
];

function mkPlayer(id: number, position: MatchPlayer["position"], level: number): MatchPlayer {
  return {
    id, firstName: "Hráč", lastName: `${id}`, nickname: null, position,
    speed: level, technique: level, shooting: level, passing: level, heading: level, defense: level,
    goalkeeping: level, stamina: level, strength: level, vision: level, creativity: level, setPieces: level,
    discipline: 50, alcohol: 30, temper: 40, leadership: 30, workRate: 50,
    aggression: 40, consistency: 50, clutch: 50, injuryProneness: 50,
    preferredFoot: "right", preferredSide: "center",
    condition: 100, morale: 50,
  };
}

function mkTeam(teamId: number, idBase: number, level: number): TeamSetup {
  const lineup = [mkPlayer(idBase, "GK", level)];
  for (let i = 0; i < 4; i++) lineup.push(mkPlayer(idBase + 1 + i, "DEF", level));
  for (let i = 0; i < 4; i++) lineup.push(mkPlayer(idBase + 5 + i, "MID", level));
  for (let i = 0; i < 2; i++) lineup.push(mkPlayer(idBase + 9 + i, "FWD", level));
  const subs = [mkPlayer(idBase + 11, "GK", level), mkPlayer(idBase + 12, "DEF", level), mkPlayer(idBase + 13, "MID", level)];
  return { teamId, teamName: `T${teamId}`, lineup, subs, tactic: "balanced", formation: "4-4-2" };
}

describe("domácí pomezní: plán sporné situace", () => {
  it("bez pomezního (tilt chybí nebo je 0) vrací přesně to, co původní funkce", () => {
    for (const r of PROFILES) {
      for (let seed = 1; seed <= 3000; seed++) {
        const expected = legacyPlanRefereeError(createRng(seed), r);
        expect(planRefereeError(createRng(seed), r)).toEqual(expected);
        expect(planRefereeError(createRng(seed), r, 0)).toEqual(expected);
      }
    }
  });

  it("s pomezním spotřebuje funkce pořád přesně čtyři hodnoty RNG", () => {
    for (const tilt of [0, 0.05, 0.3, -0.3, 1]) {
      for (let seed = 1; seed <= 200; seed++) {
        const plain = createRng(seed);
        for (let i = 0; i < 4; i++) plain.random();
        const rng = createRng(seed);
        planRefereeError(rng, { ...NEUTRAL_REFEREE, experience: 0 }, tilt);
        expect(rng.random()).toBe(plain.random());
      }
    }
  });

  it("pomezní mění jen stranu u neuznaného gólu, minuta, druh a ostatní situace zůstávají", () => {
    const r = { ...NEUTRAL_REFEREE, experience: 0 };
    let flipped = 0;
    for (let seed = 1; seed <= 4000; seed++) {
      const base = planRefereeError(createRng(seed), r);
      const tilted = planRefereeError(createRng(seed), r, 0.3);
      if (!base || !tilted) { expect(tilted).toEqual(base); continue; }
      expect(tilted.minute).toBe(base.minute);
      expect(tilted.kind).toBe(base.kind);
      expect(tilted.severity).toBe(base.severity);
      if (base.kind !== "neuznany_gol") { expect(tilted.favourHome).toBe(base.favourHome); continue; }
      // Domácí pomezní nikdy nepřepne neuznaný gól v neprospěch domácích.
      if (base.favourHome) expect(tilted.favourHome).toBe(true);
      if (tilted.favourHome !== base.favourHome) flipped++;
    }
    expect(flipped).toBeGreaterThan(0);
  });

  it("nadržující pomezní nakloní neuznané góly domácím, i když sudí sám nenadržuje", () => {
    const r = { ...NEUTRAL_REFEREE, experience: 0, homeBias: 50 };
    const share = (tilt: number) => {
      let home = 0;
      let total = 0;
      for (let seed = 1; seed <= 20000; seed++) {
        const p = planRefereeError(createRng(seed), r, tilt);
        if (p?.kind !== "neuznany_gol") continue;
        total++;
        if (p.favourHome) home++;
      }
      return home / total;
    };
    expect(share(0)).toBeGreaterThan(0.45);
    expect(share(0)).toBeLessThan(0.55);
    expect(share(0.3)).toBeGreaterThan(0.75);
  });
});

describe("domácí pomezní: celý zápas", () => {
  it("zápas bez pomezního a s nulovým tiltem dopadne se stejným seedem úplně stejně", () => {
    for (const r of [undefined, ...PROFILES.slice(0, 6)]) {
      for (let seed = 1; seed <= 25; seed++) {
        const config = () => ({
          home: mkTeam(1, 1, 50), away: mkTeam(2, 100, 50), weather: "sunny" as const,
          isHomeAdvantage: true, referee: r, attendance: 250,
        });
        const without = simulateMatch(createRng(seed * 31), config());
        const zero = simulateMatch(createRng(seed * 31), { ...config(), homeLinesmanTilt: 0 });
        expect(zero.homeScore).toBe(without.homeScore);
        expect(zero.awayScore).toBe(without.awayScore);
        expect(zero.events).toEqual(without.events);
        expect(zero.refereeIncidents).toEqual(without.refereeIncidents);
        expect(zero.refereeGrade).toBe(without.refereeGrade);
      }
    }
  });
});
