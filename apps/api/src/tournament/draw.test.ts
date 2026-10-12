import { describe, expect, it } from "vitest";
import {
  assignVenues, buildGroupSchedule, buildLeagueSchedule, computeStandings, drawGroups, drawOptions, groupPlayoffSeeding,
  groupSizes, leagueDays, playoffSeeding, playoffVenues,
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
    const opts = drawOptions(16).filter((o) => o.format === "league");
    expect(opts.map((o) => o.matchesPerTeam)).toEqual([4, 5, 6, 7, 8, 9]);
    expect(opts.find((o) => o.matchesPerTeam === 4)?.totalDays).toBe(7);
  });

  it("lichý počet nabízí jen sudé počty zápasů a den navíc", () => {
    const opts = drawOptions(11).filter((o) => o.format === "league");
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

// Skutečné přihlášky 1. ročníku po vyřazení Klamovky (reputace, okres, obec).
const ENTRANTS: DrawTeam[] = [
  ["dvorce", 100, "Praha", "Dvorce"], ["greenwatt", 93, "Prachatice", "Čkyně"], ["appyours", 93, "Prachatice", "Čkyně"],
  ["jitona", 91, "Prachatice", "Spůle"], ["engel", 91, "Prachatice", "Vimperk"], ["bachl", 88, "Prachatice", "Vlachovo Březí"],
  ["fasta", 87, "Prachatice", "Vimperk"], ["forpsi", 87, "Prachatice", "Čkyně"], ["kmp", 87, "Prachatice", "Čkyně"],
  ["fezko", 86, "Prachatice", "Výškovice"], ["budvar", 85, "Prachatice", "Spůle"], ["loffler", 85, "Prachatice", "Hradčany"],
  ["reznictvi", 85, "České Budějovice", "České Budějovice"], ["rohlik", 84, "Praha", "Břevnov"], ["alza", 81, "Praha", "Vinohrady"],
  ["volary", 79, "Prachatice", "Volary"], ["lcovice", 70, "Prachatice", "Lčovice"], ["jihostroj", 65, "Prachatice", "Spůle"],
].map(([id, reputation, district, village]) => ({ id: id as string, reputation: reputation as number, district: district as string, village: village as string }));

describe("skupiny", () => {
  it("18 týmů = skupiny 5, 5, 4, 4 a turnaj na 8 dní", () => {
    expect(groupSizes(18)).toEqual([5, 5, 4, 4]);
    expect(drawOptions(18).find((o) => o.format === "groups")).toMatchObject({ leagueDays: 5, totalDays: 8, matchesPerTeam: 4, groupSizes: [5, 5, 4, 4] });
  });

  it("skupiny se nenabídnou, když by turnaj nevyšel na 7 až 12 dní nebo by skupina měla pod 3 týmy", () => {
    expect(drawOptions(16).some((o) => o.format === "groups")).toBe(false); // 4×4 = 3 kola + play-off = 6 dní
    expect(drawOptions(10).some((o) => o.format === "groups")).toBe(false);
    expect(drawOptions(20).some((o) => o.format === "groups")).toBe(true);
  });

  it.each([1, 2, 3, 42, 2024])("los z košů: nasazení v různých skupinách, nejslabší v pětkách, okresy a obce rozprostřené (seed %i)", (seed) => {
    const groups = drawGroups(ENTRANTS, seed);
    const byId = new Map(ENTRANTS.map((t) => [t.id, t]));
    expect(groups.map((g) => g.length)).toEqual([5, 5, 4, 4]);
    expect(new Set(groups.flat()).size).toBe(18);
    // Koš 1 (Dvorce, Greenwatt, AppYours a jeden z dvojice Jitona/Engel) je rozdělený do čtyř skupin.
    const pot1 = groups.map((g) => g.filter((id) => ["dvorce", "greenwatt", "appyours"].includes(id)).length);
    expect(Math.max(...pot1)).toBe(1);
    // Dva nejslabší (koš 5) jdou do větších skupin A a B, každý do jiné.
    expect([groups[0], groups[1]].map((g) => g.filter((id) => id === "lcovice" || id === "jihostroj").length)).toEqual([1, 1]);
    // V každé skupině právě jeden klub odjinud než z Prachaticka.
    for (const g of groups) expect(g.filter((id) => byId.get(id)?.district !== "Prachatice")).toHaveLength(1);
    // Kluby ze stejné obce v různých skupinách.
    for (const g of groups) {
      const villages = g.map((id) => byId.get(id)?.village);
      expect(new Set(villages).size).toBe(villages.length);
    }
  });

  it("los je deterministický podle seedu", () => {
    expect(drawGroups(ENTRANTS, 7)).toEqual(drawGroups(ENTRANTS, 7));
  });

  it("rozpis: ve skupině každý s každým, nikdo dvakrát za den, čtyřky hrají 1., 3. a 5. den", () => {
    const groups = drawGroups(ENTRANTS, 5);
    const s = buildGroupSchedule(groups, 9);
    expect(s).toHaveLength(5);
    for (const day of s) {
      const today = day.flatMap((m) => [m.home, m.away]);
      expect(new Set(today).size).toBe(today.length);
    }
    groups.forEach((g, gi) => {
      const inGroup = new Set(g);
      const matches = s.flat().filter((m) => inGroup.has(m.home) || inGroup.has(m.away));
      // Žádný zápas mimo skupinu.
      for (const m of matches) expect(inGroup.has(m.home) && inGroup.has(m.away)).toBe(true);
      const pairs = new Set(matches.map((m) => [m.home, m.away].sort().join("|")));
      expect(pairs.size).toBe((g.length * (g.length - 1)) / 2);
      expect(matches).toHaveLength(pairs.size);
      const days = s.map((day, i) => (day.some((m) => inGroup.has(m.home)) ? i + 1 : null)).filter((d) => d != null);
      expect(days).toEqual(gi < 2 ? [1, 2, 3, 4, 5] : [1, 3, 5]);
    });
    // Nejvíc 8 zápasů za den, Tábor má 10 hřišť.
    expect(Math.max(...s.map((d) => d.length))).toBe(8);
  });

  it("čtvrtfinále A1–B2, C1–D2, B1–A2, D1–C2: týmy jedné skupiny se znovu potkají nejdřív ve finále", () => {
    const qf = groupPlayoffSeeding([["a1", "a2", "a3"], ["b1", "b2"], ["c1", "c2"], ["d1", "d2"]]);
    expect(qf).toEqual([
      { home: "a1", away: "b2" }, { home: "c1", away: "d2" }, { home: "b1", away: "a2" }, { home: "d1", away: "c2" },
    ]);
    // Semifinále páruje vítěze 1.+2. a 3.+4. čtvrtfinále: polovina pavouka bez spoluhráčů ze skupiny.
    const half = (i: number) => (i < 2 ? 0 : 1);
    for (const g of ["a", "b", "c", "d"]) {
      const sides = qf.flatMap((m, i) => [m.home, m.away].filter((id) => id.startsWith(g)).map(() => half(i)));
      expect(new Set(sides).size).toBe(2);
    }
  });
});
