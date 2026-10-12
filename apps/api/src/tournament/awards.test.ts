import { describe, expect, it } from "vitest";
import { awardScore, pickAwards, type AwardCandidate } from "./awards";

function p(id: string, o: Partial<AwardCandidate> = {}): AwardCandidate {
  return {
    playerId: id, teamId: `t-${id}`, name: id, teamName: `Tým ${id}`, position: "MID", age: 25,
    apps: 6, goals: 0, assists: 0, avgRating: 6.5, cleanSheets: 0, ...o,
  };
}

describe("ceny turnaje", () => {
  it("skóre jako Hráč sezóny: známka + góly × 0,08 + asistence × 0,04 + zápasy × 0,03", () => {
    expect(awardScore(p("a", { avgRating: 7, goals: 5, assists: 2, apps: 6 }))).toBeCloseTo(7 + 0.4 + 0.08 + 0.18);
  });

  it("každý dostane nejvýš jednu cenu, gólman podle známky, mladý do 21, osobnost 30+", () => {
    const awards = pickAwards([
      p("hvezda", { avgRating: 7.6, goals: 6, age: 20 }),
      p("mlady", { avgRating: 7.0, age: 19 }),
      p("veteran", { avgRating: 6.9, age: 33 }),
      p("brankar", { position: "GK", avgRating: 7.2, cleanSheets: 3 }),
      p("brankar2", { position: "GK", avgRating: 7.2, cleanSheets: 1 }),
      p("stredni", { avgRating: 7.1 }),
    ]);
    expect(awards.map((a) => [a.award, a.winner.playerId])).toEqual([
      ["player", "hvezda"],
      ["goalkeeper", "brankar"],
      ["young", "mlady"],
      ["veteran", "veteran"],
    ]);
  });

  it("málo zápasů = bez ceny; chybí-li kandidát, cena se nevyhlásí", () => {
    const awards = pickAwards([
      p("hvezda", { avgRating: 9, apps: 3 }),
      p("solidni", { avgRating: 6.8, apps: 5 }),
      p("mlady", { avgRating: 7, age: 20, apps: 2 }),
    ]);
    expect(awards.map((a) => [a.award, a.winner.playerId])).toEqual([["player", "solidni"]]);
  });
});
