/**
 * Obálka pro sudího v enginu: zaplacený sudí nahraje plátci spornou situaci, a to jen
 * v zápase, kde mu profil obálku nese. Bez obálky se nesmí změnit nic, ani počet hodnot,
 * které zápas vytáhne z RNG.
 */
import { describe, expect, it } from "vitest";
import { createRng } from "../generators/rng";
import { simulateMatch } from "./simulation";
import { NEUTRAL_REFEREE, planRefereeError, type RefereeProfile } from "./referee";
import type { MatchPlayer, TeamSetup } from "./types";

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

function mkTeam(teamId: number, idBase: number): TeamSetup {
  const lineup = [mkPlayer(idBase, "GK", 50)];
  for (let i = 0; i < 4; i++) lineup.push(mkPlayer(idBase + 1 + i, "DEF", 50));
  for (let i = 0; i < 4; i++) lineup.push(mkPlayer(idBase + 5 + i, "MID", 50));
  for (let i = 0; i < 2; i++) lineup.push(mkPlayer(idBase + 9 + i, "FWD", 50));
  const subs = [mkPlayer(idBase + 11, "GK", 50), mkPlayer(idBase + 12, "DEF", 50), mkPlayer(idBase + 13, "MID", 50)];
  return { teamId, teamName: `T${teamId}`, lineup, subs, tactic: "balanced", formation: "4-4-2" };
}

const corruptReferee: RefereeProfile = { ...NEUTRAL_REFEREE, id: "ref-x", archetype: "bafunar", experience: 65, homeBias: 68 };

describe("obálka v plánu sporné situace", () => {
  it("spotřebuje stejný počet hodnot RNG s obálkou i bez ní", () => {
    const after = (r: RefereeProfile) => {
      const rng = createRng(4242);
      planRefereeError(rng, r);
      return rng.random();
    };
    expect(after({ ...corruptReferee, envelopeSide: "away" })).toBe(after(corruptReferee));
    expect(after({ ...corruptReferee, envelopeSide: "home" })).toBe(after(corruptReferee));
  });

  it("bez obálky (i s explicitním null) vychází plán stejně jako dřív", () => {
    for (let seed = 1; seed <= 300; seed++) {
      expect(planRefereeError(createRng(seed), { ...corruptReferee, envelopeSide: null }))
        .toEqual(planRefereeError(createRng(seed), corruptReferee));
    }
  });

  it("zaplacený sudí chybuje častěji a skoro vždy ve prospěch plátce", () => {
    let plain = 0;
    let paid = 0;
    let forAway = 0;
    for (let seed = 1; seed <= 2000; seed++) {
      if (planRefereeError(createRng(seed), corruptReferee)) plain++;
      const plan = planRefereeError(createRng(seed), { ...corruptReferee, envelopeSide: "away" });
      if (plan) {
        paid++;
        if (!plan.favourHome) forAway++;
      }
    }
    expect(paid).toBeGreaterThan(plain * 1.5);
    expect(forAway / paid).toBeGreaterThan(0.8);
  });
});

describe("obálka v celém zápase", () => {
  const play = (seed: number, referee: RefereeProfile) =>
    simulateMatch(createRng(seed), { home: mkTeam(1, 1), away: mkTeam(2, 100), weather: "sunny", isHomeAdvantage: true, referee });

  it("zápas bez obálky je ze stejného seedu totožný", () => {
    for (let seed = 1; seed <= 40; seed++) {
      const a = play(seed, corruptReferee);
      const b = play(seed, { ...corruptReferee, envelopeSide: null });
      expect([b.homeScore, b.awayScore, b.events.length]).toEqual([a.homeScore, a.awayScore, a.events.length]);
      expect(b.refereeIncidents).toEqual(a.refereeIncidents);
    }
  });

  it("sporné situace v zaplacených zápasech nahrávají plátci", () => {
    let forPayer = 0;
    let total = 0;
    for (let seed = 1; seed <= 300; seed++) {
      for (const i of play(seed, { ...corruptReferee, envelopeSide: "away" }).refereeIncidents) {
        total++;
        if (i.favourTeamId === 2) forPayer++;
      }
    }
    expect(total).toBeGreaterThan(100);
    expect(forPayer / total).toBeGreaterThan(0.8);
  });
});
