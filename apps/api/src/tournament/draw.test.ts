import { describe, expect, it } from "vitest";
import {
  assignVenues, buildLeagueSchedule, computeStandings, drawOptions, leagueDays, playoffSeeding, playoffVenues,
  type DrawTeam, type DrawVenue, type LeagueSchedule,
} from "./draw";

function teams(n: number): DrawTeam[] {
  return Array.from({ length: n }, (_, i) => ({
    id: `t${i + 1}`,
    district: i % 3 === 0 ? "Praha" : "Prachatice",
    reputation: 30 + i * 3,
  }));
}

/** Každý tým přesně K zápasů, různí soupeři, nejvýš jednou za den. */
function expectValid(schedule: LeagueSchedule, ids: string[], k: number) {
  const count = new Map<string, number>();
  const pairs = new Set<string>();
  for (const day of schedule) {
    const today = new Set<string>();
    for (const m of day) {
      expect(m.home).not.toBe(m.away);
      for (const t of [m.home, m.away]) {
        expect(today.has(t)).toBe(false);
        today.add(t);
        count.set(t, (count.get(t) ?? 0) + 1);
      }
      const key = [m.home, m.away].sort().join("|");
      expect(pairs.has(key)).toBe(false);
      pairs.add(key);
    }
  }
  for (const id of ids) expect(count.get(id)).toBe(k);
}

describe("buildLeagueSchedule", () => {
  it.each([[8, 4], [10, 4], [10, 9], [16, 5], [12, 6]])("sudý počet: %i týmů, %i zápasů", (n, k) => {
    const t = teams(n);
    const s = buildLeagueSchedule(t, k, 42, 50);
    expect(s).toHaveLength(k);
    expectValid(s, t.map((x) => x.id), k);
  });

  it.each([[9, 4], [11, 6], [17, 4], [13, 8]])("lichý počet: %i týmů, %i zápasů za K+1 dní", (n, k) => {
    const t = teams(n);
    const s = buildLeagueSchedule(t, k, 7, 50);
    expect(s).toHaveLength(k + 1);
    expectValid(s, t.map((x) => x.id), k);
  });

  it("je deterministický podle seedu", () => {
    const t = teams(10);
    expect(buildLeagueSchedule(t, 4, 1, 30)).toEqual(buildLeagueSchedule(t, 4, 1, 30));
  });

  it("odmítne lichý počet zápasů při lichém počtu týmů", () => {
    expect(() => buildLeagueSchedule(teams(9), 3, 1)).toThrow();
  });

  it("dá přednost zápasům mezi okresy", () => {
    // 4 pražské + 4 prachatické: los by měl potkat okresy co nejvíc.
    const t: DrawTeam[] = Array.from({ length: 8 }, (_, i) => ({ id: `t${i}`, district: i < 4 ? "Praha" : "Prachatice", reputation: 40 }));
    const s = buildLeagueSchedule(t, 4, 3, 200);
    const cross = s.flat().filter((m) => (m.home < "t4") !== (m.away < "t4")).length;
    // Ze 16 zápasů aspoň 12 mezi okresy (metoda kruhu víc při 8 týmech nedovolí).
    expect(cross).toBeGreaterThanOrEqual(12);
  });
});

describe("drawOptions", () => {
  it("sudý počet nabízí 4..9 zápasů, aby turnaj trval 7 až 12 dní", () => {
    const opts = drawOptions(16);
    expect(opts.map((o) => o.matchesPerTeam)).toEqual([4, 5, 6, 7, 8, 9]);
    expect(opts.find((o) => o.matchesPerTeam === 4)?.totalDays).toBe(7);
  });

  it("lichý počet nabízí jen sudé počty zápasů a den navíc", () => {
    const opts = drawOptions(11);
    expect(opts.map((o) => o.matchesPerTeam)).toEqual([4, 6, 8]);
    expect(opts[0].leagueDays).toBe(5);
    expect(opts[0].totalDays).toBe(8);
  });

  it("malý turnaj (6 týmů) má play-off od semifinále a každý s každým", () => {
    const opts = drawOptions(6);
    expect(opts.at(-1)).toMatchObject({ matchesPerTeam: 5, roundRobin: true, totalDays: 7 });
  });

  it("pod 4 týmy se nehraje", () => {
    expect(drawOptions(3)).toEqual([]);
  });

  it("leagueDays", () => {
    expect(leagueDays(10, 4)).toBe(4);
    expect(leagueDays(9, 4)).toBe(5);
  });
});

describe("assignVenues", () => {
  const venues: DrawVenue[] = [
    { id: "arena", capacity: 4000, isMain: true },
    { id: "v1", capacity: 1500, isMain: false },
    { id: "v2", capacity: 900, isMain: false },
    { id: "v3", capacity: 500, isMain: false },
  ];
  const rep = new Map([["a", 90], ["b", 80], ["c", 20], ["d", 10], ["e", 50], ["f", 40]]);

  it("nejatraktivnější zápas jde na hlavní stadion, zbytek podle kapacity", () => {
    const out = assignVenues([{ home: "c", away: "d" }, { home: "a", away: "b" }, { home: "e", away: "f" }], venues, rep, new Map());
    expect(out).toEqual(["v2", "arena", "v1"]);
  });

  it("přednost na hlavním mají týmy, které tam ještě nehrály", () => {
    const history = new Map([["a", new Map([["arena", 1]])], ["b", new Map([["arena", 1]])]]);
    const out = assignVenues([{ home: "a", away: "b" }, { home: "e", away: "f" }], venues, rep, history);
    expect(out[1]).toBe("arena");
  });

  it("během turnaje se kluby na vedlejších hřištích střídají", () => {
    const history = new Map<string, Map<string, number>>();
    const day = [{ home: "a", away: "b" }, { home: "c", away: "d" }, { home: "e", away: "f" }];
    const first = assignVenues(day, venues, rep, history);
    const second = assignVenues(day, venues, rep, history);
    // c–d byl podruhé na jiném vedlejším hřišti než poprvé.
    expect(second[1]).not.toBe(first[1]);
  });

  it("nestačí-li hřiště, vyhodí chybu", () => {
    const day = Array.from({ length: 5 }, (_, i) => ({ home: `x${i}`, away: `y${i}` }));
    expect(() => assignVenues(day, venues, rep, new Map())).toThrow();
  });

  it("play-off hraje na hlavním a největších vedlejších", () => {
    expect(playoffVenues(2, venues)).toEqual(["arena", "v1"]);
  });
});

describe("play-off a tabulka", () => {
  it("čtvrtfinále 1–8, 4–5, 2–7, 3–6", () => {
    expect(playoffSeeding(["s1", "s2", "s3", "s4", "s5", "s6", "s7", "s8"], "qf")).toEqual([
      { home: "s1", away: "s8" }, { home: "s4", away: "s5" }, { home: "s2", away: "s7" }, { home: "s3", away: "s6" },
    ]);
  });

  it("tabulka řadí body, skóre, góly", () => {
    const t = [{ id: "a", name: "A", reputation: 10 }, { id: "b", name: "B", reputation: 10 }, { id: "c", name: "C", reputation: 10 }];
    const rows = computeStandings(t, [
      { home: "a", away: "b", homeScore: 2, awayScore: 0 },
      { home: "b", away: "c", homeScore: 1, awayScore: 1 },
      { home: "c", away: "a", homeScore: 3, awayScore: 0 },
    ]);
    expect(rows.map((r) => r.teamId)).toEqual(["c", "a", "b"]);
    expect(rows[0]).toMatchObject({ points: 4, goalsFor: 4, goalsAgainst: 1 });
  });
});
