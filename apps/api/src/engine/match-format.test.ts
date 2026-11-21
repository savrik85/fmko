/**
 * Formát zápasu: sálovka 5+1 na 2 × 10 minut.
 *
 * Velký fotbal bez formátu musí zůstat bit po bitu stejný (ligové výsledky, kurzy i balanc
 * stojí na stejném sledu náhody). Sálovka má plný počet 6, takže šest hráčů není oslabení,
 * a zápis má skutečné minuty do 20.
 */
import { describe, it, expect } from "vitest";
import { createRng } from "../generators/rng";
import { simulateMatch } from "./simulation";
import type { MatchFormat, MatchPlayer, TeamSetup } from "./types";

const SLOW = 120_000;
const HALL: MatchFormat = { squadSize: 6, durationMinutes: 20, chanceScale: 1.3 };

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

function bigTeam(teamId: number, idBase: number, level: number): TeamSetup {
  const lineup = [mkPlayer(idBase, "GK", level)];
  const plan: MatchPlayer["position"][] = ["DEF", "DEF", "DEF", "DEF", "MID", "MID", "MID", "MID", "FWD", "FWD"];
  plan.forEach((pos, i) => lineup.push(mkPlayer(idBase + 1 + i, pos, level)));
  const subs = (["GK", "DEF", "MID", "FWD", "MID"] as const).map((pos, i) => mkPlayer(idBase + 20 + i, pos, level));
  return { teamId, teamName: `T${teamId}`, lineup, subs, tactic: "balanced", formation: "4-4-2" };
}

/** 5+1: brankář, dva vzadu, jeden uprostřed, dva vpředu, lavička čtyři. */
function hallTeam(teamId: number, idBase: number, level: number, outfield = 5): TeamSetup {
  const plan: MatchPlayer["position"][] = ["DEF", "DEF", "MID", "FWD", "FWD"].slice(0, outfield) as MatchPlayer["position"][];
  const lineup = [mkPlayer(idBase, "GK", level), ...plan.map((pos, i) => mkPlayer(idBase + 1 + i, pos, level))];
  const subs = (["GK", "DEF", "MID", "FWD"] as const).map((pos, i) => mkPlayer(idBase + 20 + i, pos, level));
  return { teamId, teamName: `T${teamId}`, lineup, subs, tactic: "balanced", formation: "2-1-2" };
}

describe("formát zápasu", () => {
  it("velký fotbal s formátem 11/90/1 dá stejný zápas jako bez formátu", () => {
    for (let seed = 500; seed < 540; seed++) {
      const plain = simulateMatch(createRng(seed), { home: bigTeam(1, 1, 55), away: bigTeam(2, 100, 50), weather: "rain", isHomeAdvantage: true });
      const same = simulateMatch(createRng(seed), {
        home: bigTeam(1, 1, 55), away: bigTeam(2, 100, 50), weather: "rain", isHomeAdvantage: true,
        format: { squadSize: 11, durationMinutes: 90, chanceScale: 1 },
      });
      expect(same.homeScore).toBe(plain.homeScore);
      expect(same.awayScore).toBe(plain.awayScore);
      expect(same.events.map((e) => `${e.minute}:${e.type}`)).toEqual(plain.events.map((e) => `${e.minute}:${e.type}`));
    }
  });

  it("sálovka má minuty v zápisu nejvýš do 20 a konec zápasu ve 20. minutě", () => {
    for (let seed = 700; seed < 760; seed++) {
      const r = simulateMatch(createRng(seed), { home: hallTeam(1, 1, 50), away: hallTeam(2, 100, 50), weather: "sunny", isHomeAdvantage: false, format: HALL });
      for (const e of r.events) {
        expect(e.minute).toBeGreaterThanOrEqual(1);
        expect(e.minute).toBeLessThanOrEqual(20);
      }
      expect(r.events.at(-1)?.minute).toBe(20);
      for (const track of Object.values(r.playerMinutes)) {
        if (track.left != null) expect(track.left).toBeLessThanOrEqual(20);
      }
      for (const i of r.refereeIncidents) expect(i.minute).toBeLessThanOrEqual(20);
    }
  });

  it("sálovka dává víc gólů než velký fotbal (malé hřiště, rychlé zakončení)", () => {
    let hallGoals = 0;
    let bigGoals = 0;
    const n = 600;
    for (let i = 0; i < n; i++) {
      const hall = simulateMatch(createRng(9000 + i), { home: hallTeam(1, 1, 50), away: hallTeam(2, 100, 50), weather: "sunny", isHomeAdvantage: false, format: HALL });
      const big = simulateMatch(createRng(9000 + i), { home: bigTeam(1, 1, 50), away: bigTeam(2, 100, 50), weather: "sunny", isHomeAdvantage: false });
      hallGoals += hall.homeScore + hall.awayScore;
      bigGoals += big.homeScore + big.awayScore;
    }
    const hallAvg = hallGoals / n;
    expect(hallAvg, `sálovka ${hallAvg.toFixed(2)}, velký fotbal ${(bigGoals / n).toFixed(2)}`).toBeGreaterThan(bigGoals / n + 0.6);
    expect(hallAvg).toBeGreaterThan(4);
    expect(hallAvg).toBeLessThan(10);
  }, SLOW);

  it("šest hráčů v sálovce není oslabení, pět ano", () => {
    let fullDiff = 0;
    let shortDiff = 0;
    const n = 800;
    for (let i = 0; i < n; i++) {
      const full = simulateMatch(createRng(12000 + i), { home: hallTeam(1, 1, 50), away: hallTeam(2, 100, 50), weather: "sunny", isHomeAdvantage: false, format: HALL });
      const short = simulateMatch(createRng(12000 + i), { home: hallTeam(1, 1, 50, 4), away: hallTeam(2, 100, 50), weather: "sunny", isHomeAdvantage: false, format: HALL });
      fullDiff += full.homeScore - full.awayScore;
      shortDiff += short.homeScore - short.awayScore;
    }
    expect(Math.abs(fullDiff / n), "vyrovnané týmy 6 na 6").toBeLessThan(0.5);
    expect(shortDiff / n).toBeLessThan(fullDiff / n - 0.3);
  }, SLOW);
});
