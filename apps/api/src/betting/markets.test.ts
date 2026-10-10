import { describe, it, expect } from "vitest";
import {
  expectedGoals, outcomeProbabilities, totalsProbabilities, goalDistribution, type Lambdas,
} from "./odds-model";
import {
  scoreGrid, handicapProbabilities, goalBandProbabilities, bothTeamsScoreProbability,
  teamTotalProbabilities, resultTotalProbabilities, mainTotalLine,
  handicapCode, parseHandicap, teamTotalCode, parseTeamTotal, resultTotalCode, parseResultTotal,
  parseGoalBand, GOAL_BANDS, handicapLabel, goalsWord, lineTag, parseLineTag,
} from "./markets";

/** Zápasy od vyrovnaného po jednoznačný, v běžné i gólové soutěži. */
const cases: Array<[string, Lambdas]> = [
  ["vyrovnaný", expectedGoals({ strength: 40, form: 0 }, { strength: 40, form: 0 })],
  ["favorit doma", expectedGoals({ strength: 48, form: 1 }, { strength: 38, form: -1 })],
  ["favorit venku", expectedGoals({ strength: 33, form: 0 }, { strength: 45, form: 0 })],
  ["gólová soutěž", expectedGoals({ strength: 42, form: 0 }, { strength: 40, form: 0 }, 1.9)],
  ["málo gólů", expectedGoals({ strength: 40, form: 0 }, { strength: 41, form: 0 }, 0.6)],
];

const LINES = [1.5, 2.5, 3.5, 4.5, 5.5, 6.5];

/** Pravděpodobnost podmínky přímo z mřížky skóre, bez chytristiky. */
function bruteForce(l: Lambdas, pred: (h: number, a: number) => boolean): number {
  const g = scoreGrid(l);
  let s = 0;
  g.forEach((row, h) => row.forEach((p, a) => { if (pred(h, a)) s += p; }));
  return s;
}

describe("mřížka skóre", () => {
  for (const [name, l] of cases) {
    it(`sečte se na 1 a souhlasí s 1/X/2 (${name})`, () => {
      const o = outcomeProbabilities(l);
      expect(bruteForce(l, () => true)).toBeCloseTo(1, 10);
      expect(bruteForce(l, (h, a) => h > a)).toBeCloseTo(o.home, 10);
      expect(bruteForce(l, (h, a) => h === a)).toBeCloseTo(o.draw, 10);
    });
  }
});

describe("handicap", () => {
  for (const [name, l] of cases) {
    it(`−1,5 je výhra o 2 a víc, +1,5 je doplněk (${name})`, () => {
      const h = handicapProbabilities(l, 1.5);
      expect(h.homeMinus).toBeCloseTo(bruteForce(l, (x, y) => x - y >= 2), 10);
      expect(h.awayMinus).toBeCloseTo(bruteForce(l, (x, y) => y - x >= 2), 10);
      expect(h.homeMinus + h.awayPlus).toBeCloseTo(1, 12);
      expect(h.awayMinus + h.homePlus).toBeCloseTo(1, 12);
    });

    it(`−2,5 je výhra o 3 a víc a je vzácnější než −1,5 (${name})`, () => {
      const h15 = handicapProbabilities(l, 1.5);
      const h25 = handicapProbabilities(l, 2.5);
      expect(h25.homeMinus).toBeCloseTo(bruteForce(l, (x, y) => x - y >= 3), 10);
      expect(h25.homeMinus).toBeLessThan(h15.homeMinus);
      expect(h25.awayPlus).toBeGreaterThan(h15.awayPlus);
    });

    it(`na linii 0,5 je to přesně výhra z trhu 1/X/2 (${name})`, () => {
      const o = outcomeProbabilities(l);
      const h = handicapProbabilities(l, 0.5);
      expect(h.homeMinus).toBeCloseTo(o.home, 10);
      expect(h.awayMinus).toBeCloseTo(o.away, 10);
      // +0,5 = neprohra = dvojtip
      expect(h.homePlus).toBeCloseTo(o.home + o.draw, 10);
    });
  }

  it("favorit má na −1,5 větší šanci než outsider", () => {
    const h = handicapProbabilities(cases[1][1], 1.5);
    expect(h.homeMinus).toBeGreaterThan(h.awayMinus);
  });
});

describe("pásma gólů", () => {
  for (const [name, l] of cases) {
    it(`dají dohromady 1 a sedí s gólovými liniemi (${name})`, () => {
      const b = goalBandProbabilities(l);
      expect(b).toHaveLength(4);
      expect(b.reduce((a, x) => a + x, 0)).toBeCloseTo(1, 12);
      expect(b[0]).toBeCloseTo(totalsProbabilities(l, 1.5).under, 12);
      expect(b[0] + b[1]).toBeCloseTo(totalsProbabilities(l, 3.5).under, 12);
      expect(b[0] + b[1] + b[2]).toBeCloseTo(totalsProbabilities(l, 5.5).under, 12);
      expect(b[3]).toBeCloseTo(totalsProbabilities(l, 5.5).over, 12);
    });
  }

  it("v gólové soutěži je 6 a víc pravděpodobnější než v soutěži s málo góly", () => {
    expect(goalBandProbabilities(cases[3][1])[3]).toBeGreaterThan(goalBandProbabilities(cases[4][1])[3]);
  });
});

describe("oba týmy dají gól", () => {
  for (const [name, l] of cases) {
    it(`odpovídá mřížce skóre (${name})`, () => {
      expect(bothTeamsScoreProbability(l)).toBeCloseTo(bruteForce(l, (h, a) => h > 0 && a > 0), 10);
    });
  }
});

describe("góly týmu", () => {
  for (const [name, l] of cases) {
    it(`víc a míň dají 1 a sedí s rozdělením gólů týmu (${name})`, () => {
      for (const line of [1.5, 2.5]) {
        const t = teamTotalProbabilities(l.home, line);
        expect(t.over + t.under).toBeCloseTo(1, 12);
        expect(t.over).toBeCloseTo(bruteForce(l, (h) => h > line), 10);
        const d = goalDistribution(l.away);
        expect(teamTotalProbabilities(l.away, line).under)
          .toBeCloseTo(d.slice(0, Math.ceil(line)).reduce((a, x) => a + x, 0), 12);
      }
    });
  }
});

describe("výsledek a počet gólů", () => {
  for (const [name, l] of cases) {
    it(`šest možností dá 1 a po sečtení vrátí 1/X/2 i gólovou linii (${name})`, () => {
      const line = mainTotalLine(l, LINES);
      const r = resultTotalProbabilities(l, line);
      const o = outcomeProbabilities(l);
      const t = totalsProbabilities(l, line);
      expect(r.homeOver + r.homeUnder + r.drawOver + r.drawUnder + r.awayOver + r.awayUnder).toBeCloseTo(1, 10);
      expect(r.homeOver + r.homeUnder).toBeCloseTo(o.home, 10);
      expect(r.drawOver + r.drawUnder).toBeCloseTo(o.draw, 10);
      expect(r.awayOver + r.awayUnder).toBeCloseTo(o.away, 10);
      // Mřížka je useknutá na MAX_GOALS po týmech, linie po součtu (odds-model).
      // V gólové soutěži se to liší v desetitisícinách, na kurzu v setinách nic.
      expect(r.homeOver + r.drawOver + r.awayOver).toBeCloseTo(t.over, 3);
    });
  }

  it("hlavní linie je ta nejblíž půl na půl", () => {
    for (const [, l] of cases) {
      const line = mainTotalLine(l, LINES);
      const gap = Math.abs(totalsProbabilities(l, line).over - 0.5);
      for (const other of LINES) {
        expect(gap).toBeLessThanOrEqual(Math.abs(totalsProbabilities(l, other).over - 0.5) + 1e-12);
      }
    }
  });

  it("v gólové soutěži je hlavní linie výš než v soutěži s málo góly", () => {
    expect(mainTotalLine(cases[3][1], LINES)).toBeGreaterThan(mainTotalLine(cases[4][1], LINES));
  });
});

describe("kódy výběrů", () => {
  it("linie se do kódu skládá stejně jako u trhu totals", () => {
    expect(lineTag(2.5)).toBe("25");
    expect(lineTag(1.5)).toBe("15");
    expect(parseLineTag("45")).toBe(4.5);
    expect(parseLineTag("4,5")).toBeNull();
  });

  it("handicap jde tam a zpátky", () => {
    expect(handicapCode("home", "m", 1.5)).toBe("home_m15");
    expect(handicapCode("away", "p", 2.5)).toBe("away_p25");
    expect(parseHandicap("away_p25")).toEqual({ side: "away", sign: "p", line: 2.5 });
    expect(parseHandicap("home_x15")).toBeNull();
    expect(parseHandicap("1X")).toBeNull();
  });

  it("góly týmu jdou tam a zpátky a nepletou se s celkovými góly", () => {
    expect(teamTotalCode("home", "over", 1.5)).toBe("home_over15");
    expect(parseTeamTotal("away_under25")).toEqual({ side: "away", dir: "under", line: 2.5 });
    expect(parseTeamTotal("over25")).toBeNull();
  });

  it("výsledek s góly nese linii v kódu", () => {
    expect(resultTotalCode("X", "under", 3.5)).toBe("X_under35");
    expect(parseResultTotal("2_over45")).toEqual({ outcome: "2", dir: "over", line: 4.5 });
    expect(parseResultTotal("3_over45")).toBeNull();
  });

  it("pásma gólů znají jen své kódy", () => {
    expect(GOAL_BANDS.map((b) => b.code)).toEqual(["goals_0_1", "goals_2_3", "goals_4_5", "goals_6_plus"]);
    expect(parseGoalBand("goals_6_plus")).toEqual({ min: 6, max: null });
    expect(parseGoalBand("goals_7_8")).toBeNull();
  });
});

describe("popisky", () => {
  it("handicap mluví z pohledu sázejícího", () => {
    expect(handicapLabel("Sokol", "m", 1.5)).toBe("Sokol vyhraje o 2 a víc");
    expect(handicapLabel("Sokol", "m", 2.5)).toBe("Sokol vyhraje o 3 a víc");
    expect(handicapLabel("Lhota", "p", 1.5)).toBe("Lhota neprohraje o víc než 1 gól");
    expect(handicapLabel("Lhota", "p", 2.5)).toBe("Lhota neprohraje o víc než 2 góly");
  });

  it("skloňuje góly", () => {
    expect([1, 2, 4, 5, 0].map(goalsWord)).toEqual(["gól", "góly", "góly", "gólů", "gólů"]);
  });
});
