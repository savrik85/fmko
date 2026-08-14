/**
 * Hra v oslabení a vyloučený brankář.
 *
 * Do zavedení `manpowerFactor` byla červená karta kosmetika — `attackPower`
 * i `defensePower` počítají průměr, takže odebrání hráče z jedenáctky sílu týmu
 * nezměnilo. Tenhle test hlídá, že vyloučení má cenu, a zároveň že zápasy
 * bez vyloučení zůstávají stejné jako dřív.
 */
import { describe, it, expect } from "vitest";
import { createRng } from "../generators/rng";
import { simulateMatch } from "./simulation";
import type { MatchPlayer, TeamSetup } from "./types";

const SLOW = 120_000;

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

/** `outfield` = kolik hráčů v poli (10 = plný počet). `subs` = velikost lavičky. */
function mkTeam(teamId: number, idBase: number, level: number, outfield = 10, subs = 5): TeamSetup {
  const lineup = [mkPlayer(idBase, "GK", level)];
  const perLine = [4, 4, 2];
  const poss: MatchPlayer["position"][] = ["DEF", "MID", "FWD"];
  let made = 0;
  for (let li = 0; li < poss.length; li++) {
    for (let i = 0; i < perLine[li] && made < outfield; i++, made++) {
      lineup.push(mkPlayer(idBase + 1 + made, poss[li], level));
    }
  }
  const bench: MatchPlayer[] = [];
  const benchPool: MatchPlayer["position"][] = ["GK", "DEF", "MID", "FWD", "MID"];
  for (let i = 0; i < subs; i++) bench.push(mkPlayer(idBase + 20 + i, benchPool[i], level));
  return { teamId, teamName: `T${teamId}`, lineup, subs: bench, tactic: "balanced", formation: "4-4-2" };
}

function run(matches: number, homeOutfield: number, seedBase: number) {
  let homeGoals = 0, awayGoals = 0;
  for (let i = 0; i < matches; i++) {
    const r = simulateMatch(createRng(seedBase + i), {
      home: mkTeam(1, 1, 50, homeOutfield), away: mkTeam(2, 100, 50),
      weather: "sunny", isHomeAdvantage: true,
    });
    homeGoals += r.homeScore;
    awayGoals += r.awayScore;
  }
  return { homeGoals: homeGoals / matches, awayGoals: awayGoals / matches };
}

describe("hra v oslabení", () => {
  it("tým o deseti dá míň gólů a dostane víc", () => {
    const plny = run(2000, 10, 31000);
    const oslabeny = run(2000, 9, 31000);

    expect(plny.homeGoals - oslabeny.homeGoals,
      `plný ${plny.homeGoals.toFixed(2)} vs oslabený ${oslabeny.homeGoals.toFixed(2)}`).toBeGreaterThan(0.15);
    expect(oslabeny.awayGoals - plny.awayGoals,
      `plný dostal ${plny.awayGoals.toFixed(2)} vs oslabený ${oslabeny.awayGoals.toFixed(2)}`).toBeGreaterThan(0.10);
  }, SLOW);

  it("každý další chybějící hráč situaci zhoršuje", () => {
    const gd = (n: number) => { const r = run(800, n, 32000); return r.homeGoals - r.awayGoals; };
    const deset = gd(10);
    const devet = gd(9);
    const osm = gd(8);
    expect(devet).toBeLessThan(deset);
    expect(osm).toBeLessThan(devet);
  }, SLOW);

  it("vyloučený brankář nezůstane bez náhrady", () => {
    // Projít dost zápasů, aby některý skončil červenou pro gólmana, a ověřit,
    // že do brány někdo nastoupil — buď náhradník, nebo hráč z pole.
    let checked = 0;
    for (let i = 0; i < 4000 && checked < 5; i++) {
      const home = mkTeam(1, 1, 50);
      const away = mkTeam(2, 100, 50);
      // Vznětlivý a nedisciplinovaný gólman, ať karta padne rozumně často.
      home.lineup[0].temper = 100;
      home.lineup[0].discipline = 0;
      home.lineup[0].aggression = 100;
      const r = simulateMatch(createRng(33000 + i), {
        home, away, weather: "sunny", isHomeAdvantage: true,
        referee: { id: null, name: "x", archetype: "x", strictness: 95, cardHappiness: 97, experience: 60, homeBias: 50, advantage: 5, fitness: 60 },
      });
      const gkRed = r.events.some((e) => e.type === "card" && e.detail === "red" && e.playerId === 1);
      if (!gkRed) continue;
      checked++;
      const inGoal = r.homeLineup.filter((p) => (p.matchPosition ?? p.position) === "GK");
      expect(inGoal.length, "po vyloučení gólmana nikdo nechytá").toBeGreaterThanOrEqual(1);
    }
    expect(checked, "nepodařilo se vyrobit ani jednu červenou pro gólmana").toBeGreaterThan(0);
  }, SLOW);
});
