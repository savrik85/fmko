import { describe, expect, it } from "vitest";
import { calculateStandings as calculateIndexedStandings } from "../league/standings";
import { sortStandings, type RankedMatch, type RankedRow } from "./standings-order";

function row(teamId: string, points: number, gf: number, ga: number): RankedRow {
  return { teamId, points, gf, ga };
}

function match(homeTeamId: string, awayTeamId: string, homeScore: number, awayScore: number): RankedMatch {
  return { homeTeamId, awayTeamId, homeScore, awayScore };
}

describe("pořadí ligové tabulky", () => {
  it("řadí podle bodů", () => {
    const sorted = sortStandings([row("a", 3, 9, 0), row("b", 6, 1, 0)], []);
    expect(sorted.map((r) => r.teamId)).toEqual(["b", "a"]);
  });

  it("při shodě bodů rozhoduje vzájemný zápas, ne celkové skóre", () => {
    // B má lepší celkové skóre, ale A ho porazil.
    const sorted = sortStandings([row("b", 6, 10, 2), row("a", 6, 3, 2)], [match("a", "b", 1, 0), match("b", "c", 9, 0)]);
    expect(sorted.map((r) => r.teamId)).toEqual(["a", "b"]);
  });

  it("při shodě bodů ve vzájemných rozhoduje skóre ze vzájemných zápasů", () => {
    // Doma 2:0, venku 0:1: oba 3 body ze vzájemných, A má vzájemné skóre 2:1.
    const sorted = sortStandings([row("b", 6, 10, 2), row("a", 6, 3, 2)], [match("a", "b", 2, 0), match("b", "a", 1, 0)]);
    expect(sorted.map((r) => r.teamId)).toEqual(["a", "b"]);
  });

  it("tři týmy se stejnými body: minitabulka jen z jejich vzájemných zápasů", () => {
    const rows = [row("a", 6, 5, 5), row("b", 6, 5, 5), row("c", 6, 20, 0)];
    // A porazil B i C, B porazil C. C nasbíral skóre na týmu D, to se nepočítá.
    const matches = [match("a", "b", 1, 0), match("a", "c", 1, 0), match("b", "c", 1, 0), match("c", "d", 20, 0)];
    expect(sortStandings(rows, matches).map((r) => r.teamId)).toEqual(["a", "b", "c"]);
  });

  it("bez vzájemného zápasu rozhodne celkový rozdíl skóre a pak vstřelené góly", () => {
    expect(sortStandings([row("a", 3, 2, 1), row("b", 3, 4, 1)], []).map((r) => r.teamId)).toEqual(["b", "a"]);
    expect(sortStandings([row("a", 3, 2, 1), row("b", 3, 3, 2)], []).map((r) => r.teamId)).toEqual(["b", "a"]);
  });

  it("úplná shoda dopadne vždy stejně bez ohledu na pořadí řádků", () => {
    const one = sortStandings([row("b", 0, 0, 0), row("a", 0, 0, 0), row("c", 0, 0, 0)], []);
    const two = sortStandings([row("c", 0, 0, 0), row("b", 0, 0, 0), row("a", 0, 0, 0)], []);
    expect(one.map((r) => r.teamId)).toEqual(["a", "b", "c"]);
    expect(two.map((r) => r.teamId)).toEqual(["a", "b", "c"]);
  });

  it("vstup nemění a vrací tytéž objekty", () => {
    const rows = [row("a", 1, 0, 0), row("b", 3, 0, 0)];
    const sorted = sortStandings(rows, []);
    expect(rows.map((r) => r.teamId)).toEqual(["a", "b"]);
    expect(sorted[0]).toBe(rows[1]);
  });

  it("tabulka podle indexů týmů používá stejné pravidlo", () => {
    // Tým 1 má lepší skóre, tým 0 vyhrál vzájemný zápas; tým 2 je bez bodů.
    const standings = calculateIndexedStandings(3, [
      { homeTeamIndex: 0, awayTeamIndex: 1, homeScore: 1, awayScore: 0 },
      { homeTeamIndex: 1, awayTeamIndex: 2, homeScore: 5, awayScore: 0 },
      { homeTeamIndex: 2, awayTeamIndex: 0, homeScore: 3, awayScore: 0 },
      { homeTeamIndex: 0, awayTeamIndex: 2, homeScore: 0, awayScore: 0 },
    ]);
    // 0: 4 body, 1: 3 body, 2: 4 body. Mezi 0 a 2: 0:3 a 0:0, lepší je tým 2.
    expect(standings.map((s) => s.teamIndex)).toEqual([2, 0, 1]);
  });
});
