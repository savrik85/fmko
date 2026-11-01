import { describe, expect, it } from "vitest";
import { createRng } from "../generators/rng";
import { factorBreakdown, parseMatchFactors, type TeamMatchFactors } from "./match-factors";
import { NEUTRAL_REFEREE } from "./referee";
import { simulateMatch } from "./simulation";
import type { EquipmentMods, MatchPlayer, TeamSetup } from "./types";

function mkPlayer(id: number, position: MatchPlayer["position"], morale: number): MatchPlayer {
  const v = 50;
  return {
    id, firstName: "Hráč", lastName: `${id}`, nickname: null, position,
    speed: v, technique: v, shooting: v, passing: v, heading: v, defense: v,
    goalkeeping: v, stamina: v, strength: v, vision: v, creativity: v, setPieces: v,
    discipline: 50, alcohol: 30, temper: 50, leadership: 30,
    workRate: 50, aggression: 50, consistency: 50, clutch: 50,
    injuryProneness: 50, preferredFoot: "right", preferredSide: "center",
    condition: 100, morale,
  };
}

function mkTeam(teamId: number, idBase: number, morale = 50): TeamSetup {
  const lineup = [mkPlayer(idBase, "GK", morale)];
  for (let i = 0; i < 4; i++) lineup.push(mkPlayer(idBase + 1 + i, "DEF", morale));
  for (let i = 0; i < 4; i++) lineup.push(mkPlayer(idBase + 5 + i, "MID", morale));
  for (let i = 0; i < 2; i++) lineup.push(mkPlayer(idBase + 9 + i, "FWD", morale));
  return { teamId, teamName: `T${teamId}`, lineup, subs: [], tactic: "balanced", formation: "4-4-2", hardness: "normal" };
}

const NEUTRAL_EQ: EquipmentMods = { techniqueMod: 0, gkBonus: 0, injurySeverityMod: 0, conditionDrainMod: 0, moraleMod: 0 };

function play(seed: number, homeMorale = 50, weather: "sunny" | "rain" = "sunny") {
  return simulateMatch(createRng(seed), {
    home: mkTeam(1, 1, homeMorale), away: mkTeam(2, 100), weather, isHomeAdvantage: true,
    referee: NEUTRAL_REFEREE, homeEquipment: NEUTRAL_EQ, awayEquipment: NEUTRAL_EQ,
  });
}

const neutral: TeamMatchFactors = { form: 1, morale: 1, familiarity: 1, chemistry: 1, ground: 1, tactic: 1, intimidation: 1, condition: 1 };

describe("čím se zápas lámal", () => {
  it("engine vrací průměrné vlivy obou týmů v rozumných mezích", () => {
    const r = play(4242);
    for (const side of [r.factors!.home, r.factors!.away]) {
      expect(side.form).toBeGreaterThan(0.7);
      expect(side.form).toBeLessThan(1.3);
      expect(side.morale).toBeGreaterThanOrEqual(0.94);
      expect(side.morale).toBeLessThanOrEqual(1.06);
      expect(side.condition).toBeLessThanOrEqual(1);
    }
  });

  it("sběr nemění výsledek: stejný seed, stejný zápas", () => {
    const a = play(777);
    const b = play(777);
    expect([a.homeScore, a.awayScore, a.events.length]).toEqual([b.homeScore, b.awayScore, b.events.length]);
    expect(a.factors).toEqual(b.factors);
  });

  it("vyšší morálka a déšť se v rozpisu projeví", () => {
    const happy = play(9001, 95);
    expect(happy.factors!.home.morale).toBeGreaterThan(happy.factors!.away.morale);
    const wet = play(9001, 50, "rain");
    expect(wet.factors!.home.ground).toBeLessThan(1);
  });

  it("rozpis řadí od faktoru, který týmy rozdělil nejvíc, a vynechá nulové", () => {
    const own = { ...neutral, form: 1.12, morale: 1.02 };
    const opp = { ...neutral, form: 0.95, tactic: 0.97 };
    const b = factorBreakdown(own, opp);
    expect(b[0]).toMatchObject({ key: "form", own: 12, opp: -5, edge: 17 });
    expect(b.map((x) => x.key)).toEqual(["form", "tactic", "morale"]);
  });

  it("uložené faktory se přečtou, starý zápas bez nich dá null", () => {
    expect(parseMatchFactors(JSON.stringify({ home: neutral, away: neutral }))?.home.form).toBe(1);
    expect(parseMatchFactors(null)).toBeNull();
    expect(parseMatchFactors("{rozbité")).toBeNull();
  });
});
