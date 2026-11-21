/**
 * Proslov trenéra posouvá formu dne (engine/form.ts speechAdjustedRoll). Hlídá, že:
 *  - bez proslovu (posun 0) je zápas bit po bitu stejný jako dřív,
 *  - výborný proslov znatelně zvedne šanci na výhru, ale zápasy sám nerozhoduje,
 *  - urážlivý proslov šanci sníží.
 */
import { describe, it, expect } from "vitest";
import { createRng } from "../generators/rng";
import { speechAdjustedRoll } from "./form";
import { simulateMatch } from "./simulation";
import type { MatchPlayer, TeamSetup } from "./types";

const SLOW = 180_000;

function mkPlayer(id: number, position: MatchPlayer["position"], level: number): MatchPlayer {
  const v = Math.max(5, Math.min(100, Math.round(level)));
  return {
    id, firstName: "Hráč", lastName: `${id}`, nickname: null, position,
    speed: v, technique: v, shooting: v, passing: v, heading: v, defense: v,
    goalkeeping: v, stamina: v, strength: v, vision: v, creativity: v, setPieces: v,
    discipline: 50, alcohol: 30, temper: 40, leadership: 30, workRate: 50,
    aggression: 40, consistency: 50, clutch: 50, injuryProneness: 50,
    preferredFoot: "right", preferredSide: "center",
    condition: 100, morale: 50,
  };
}

function mkTeam(teamId: number, idBase: number, level: number): TeamSetup {
  const lineup = [mkPlayer(idBase, "GK", level)];
  const poss: MatchPlayer["position"][] = ["DEF", "DEF", "DEF", "DEF", "MID", "MID", "MID", "MID", "FWD", "FWD"];
  poss.forEach((p, i) => lineup.push(mkPlayer(idBase + 1 + i, p, level)));
  const subs = (["GK", "DEF", "MID", "FWD", "MID"] as const).map((p, i) => mkPlayer(idBase + 20 + i, p, level));
  return { teamId, teamName: `T${teamId}`, lineup, subs, tactic: "balanced", formation: "4-4-2" };
}

function homeWinRate(matches: number, homeShift: number | undefined, awayShift?: number): number {
  let wins = 0;
  for (let i = 0; i < matches; i++) {
    const r = simulateMatch(createRng(7000 + i), {
      home: mkTeam(1, 1, 50), away: mkTeam(2, 100, 50), weather: "sunny", isHomeAdvantage: false,
      homeSpeechShift: homeShift, awaySpeechShift: awayShift,
    });
    if (r.homeScore > r.awayScore) wins++;
  }
  return wins / matches;
}

describe("proslov trenéra a forma dne", () => {
  it("posun 0 nebo bez proslovu: stejný hod jako dřív", () => {
    for (const r of [0, 0.1, 0.5, 0.99]) {
      expect(speechAdjustedRoll(r, undefined)).toBe(r);
      expect(speechAdjustedRoll(r, 0)).toBe(r);
    }
    expect(speechAdjustedRoll(0, 0.36)).toBeCloseTo(0.36);
    expect(speechAdjustedRoll(1, -0.24)).toBeCloseTo(0.76);
  });

  it("zápas bez proslovu je stejný jako s posunem 0", () => {
    for (let seed = 1; seed <= 20; seed++) {
      // Engine hráče během zápasu mění (kondice, nálada): každý běh dostane čerstvé týmy.
      const cfg = () => ({ home: mkTeam(1, 1, 50), away: mkTeam(2, 100, 50), weather: "sunny" as const, isHomeAdvantage: true });
      const a = simulateMatch(createRng(seed), cfg());
      const b = simulateMatch(createRng(seed), { ...cfg(), homeSpeechShift: 0, awaySpeechShift: 0 });
      expect(b.homeScore).toBe(a.homeScore);
      expect(b.awayScore).toBe(a.awayScore);
      expect(b.events.length).toBe(a.events.length);
    }
  });

  it("výborný proslov (+3) zvedne šanci na výhru o 3 až 10 bodů, urážka (−2) ji sníží", { timeout: SLOW }, () => {
    const n = 1500;
    const base = homeWinRate(n, undefined);
    const great = homeWinRate(n, 0.36);
    const insult = homeWinRate(n, -0.24);
    expect(great - base).toBeGreaterThanOrEqual(0.03);
    expect(great - base).toBeLessThanOrEqual(0.10);
    expect(insult).toBeLessThan(base);
    console.log(`výhra domácích: bez proslovu ${(base * 100).toFixed(1)} %, +3 ${(great * 100).toFixed(1)} %, −2 ${(insult * 100).toFixed(1)} %`);
  });
});
