import { describe, expect, it } from "vitest";
import {
  goalPeriods, lineAverages, outcome, periodIndex, recordFor, summarizeHeadToHead, lineupTactics,
} from "./rival-profile";

describe("výsledek vzájemného zápasu", () => {
  it("výhra, remíza a prohra podle skóre", () => {
    expect(outcome(3, 1)).toBe("W");
    expect(outcome(2, 2)).toBe("D");
    expect(outcome(0, 1)).toBe("L");
  });

  it("pohár rozhodnutý na penalty se počítá jako remíza", () => {
    expect(outcome(1, 1)).toBe("D");
  });
});

describe("souhrn vzájemných zápasů", () => {
  it("sečte výhry, remízy, prohry a skóre z mého pohledu", () => {
    const s = summarizeHeadToHead([
      { myScore: 3, rivalScore: 1 },
      { myScore: 0, rivalScore: 2 },
      { myScore: 1, rivalScore: 1 },
      { myScore: 2, rivalScore: 0 },
    ]);
    expect(s).toEqual({ played: 4, wins: 2, draws: 1, losses: 1, goalsFor: 6, goalsAgainst: 4 });
  });

  it("bez zápasů jsou všechno nuly", () => {
    expect(summarizeHeadToHead([])).toEqual({ played: 0, wins: 0, draws: 0, losses: 0, goalsFor: 0, goalsAgainst: 0 });
  });
});

describe("čtvrthodiny gólů", () => {
  it("rozdělí minuty do šesti čtvrthodin, nastavení patří do poslední čtvrthodiny poločasu", () => {
    expect(periodIndex(1)).toBe(0);
    expect(periodIndex(15)).toBe(0);
    expect(periodIndex(16)).toBe(1);
    expect(periodIndex(45)).toBe(2);
    expect(periodIndex(46)).toBe(3);
    expect(periodIndex(90)).toBe(5);
    expect(periodIndex(94)).toBe(5);
    expect(periodIndex(0)).toBe(0);
  });

  it("gól týmu na své straně je vstřelený, gól druhé strany obdržený", () => {
    const events = [
      { minute: 4, type: "goal", teamId: 1 },
      { minute: 20, type: "goal", teamId: 2 },
      { minute: 20, type: "chance", teamId: 1 },
      { minute: 88, type: "goal", teamId: 1 },
    ];
    expect(goalPeriods(events, 1)).toEqual({ scored: [1, 0, 0, 0, 0, 1], conceded: [0, 1, 0, 0, 0, 0] });
    expect(goalPeriods(events, 2)).toEqual({ scored: [0, 1, 0, 0, 0, 0], conceded: [1, 0, 0, 0, 0, 1] });
  });

  it("vynechá události bez minuty a rozbité záznamy", () => {
    expect(goalPeriods([{ type: "goal", teamId: 1 }, null as never, { minute: 10, type: "goal" }], 1))
      .toEqual({ scored: [0, 0, 0, 0, 0, 0], conceded: [0, 0, 0, 0, 0, 0] });
  });
});

describe("bilance v sezóně", () => {
  const matches = [
    { homeTeamId: "a", awayTeamId: "b", homeScore: 2, awayScore: 0 },
    { homeTeamId: "c", awayTeamId: "a", homeScore: 1, awayScore: 1 },
    { homeTeamId: "a", awayTeamId: "c", homeScore: 0, awayScore: 3 },
    { homeTeamId: "b", awayTeamId: "a", homeScore: 0, awayScore: 1 },
  ];

  it("spočítá zvlášť zápasy doma a venku", () => {
    const r = recordFor(matches, "a");
    expect(r.home).toEqual({ played: 2, wins: 1, draws: 0, losses: 1, goalsFor: 2, goalsAgainst: 3 });
    expect(r.away).toEqual({ played: 2, wins: 1, draws: 1, losses: 0, goalsFor: 2, goalsAgainst: 1 });
  });

  it("forma je posledních pět zápasů, nejnovější první", () => {
    // Zápasy jdou od nejstaršího, forma se čte od posledního.
    expect(recordFor(matches, "a").form).toEqual(["W", "L", "D", "W"]);
    const many = Array.from({ length: 7 }, (_, i) => ({ homeTeamId: "a", awayTeamId: "b", homeScore: i, awayScore: 3 }));
    expect(recordFor(many, "a").form).toEqual(["W", "W", "W", "D", "L"]);
  });
});

describe("průměry řad", () => {
  it("průměr hodnocení po postech a celkem, zaokrouhlený", () => {
    const players = [
      { position: "GK", rating: 50 },
      { position: "DEF", rating: 40 }, { position: "DEF", rating: 45 },
      { position: "MID", rating: 60 },
      { position: "FWD", rating: 55 },
    ];
    expect(lineAverages(players)).toEqual({ overall: 50, GK: 50, DEF: 43, MID: 60, FWD: 55 });
  });

  it("chybějící post je null, ne nula", () => {
    expect(lineAverages([{ position: "GK", rating: 40 }])).toEqual({ overall: 40, GK: 40, DEF: null, MID: null, FWD: null });
    expect(lineAverages([])).toEqual({ overall: null, GK: null, DEF: null, MID: null, FWD: null });
  });
});

describe("rozestavení ze záznamu sestavy", () => {
  it("vytáhne rozestavení a taktiku", () => {
    expect(lineupTactics(JSON.stringify({ starters: [], formation: "4-4-2", tactic: "offensive" })))
      .toEqual({ formation: "4-4-2", tactic: "offensive" });
  });

  it("chybějící nebo rozbitá data vrátí null", () => {
    expect(lineupTactics(null)).toBeNull();
    expect(lineupTactics("{nejde")).toBeNull();
    expect(lineupTactics(JSON.stringify({ starters: [] }))).toBeNull();
  });
});
