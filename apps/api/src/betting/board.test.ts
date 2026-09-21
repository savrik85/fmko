import { describe, it, expect } from "vitest";
import { matchOdds, MIN_OFFERED_ODDS, SCORERS_PER_TEAM } from "./board";

/** Vyrovnaný zápas dvou kádrů 4-4-2, každý hráč s pár starty a góly. */
function zapas(goalLevel: number) {
  const kadr = (isHome: boolean) => {
    const tym = isHome ? "Domácí" : "Hosté";
    const pozice = ["FWD", "FWD", "MID", "MID", "MID", "MID", "DEF", "DEF", "DEF", "DEF"];
    return pozice.map((position, i) => ({
      playerId: `${tym}-${i}`, name: `Hráč ${i}`, teamName: tym, isHome,
      position, goals: position === "FWD" ? 4 : 1, appearances: 8, rating: 40,
    }));
  };
  return matchOdds({
    matchId: "z1", homeName: "Domácí", awayName: "Hosté",
    homeStrength: 40, awayStrength: 40, homeForm: 0, awayForm: 0,
    scorers: [...kadr(true), ...kadr(false)],
    homeGoalsPerMatch: 2, awayGoalsPerMatch: 2,
    goalLevel,
  });
}

const kurz = (rows: ReturnType<typeof zapas>, market: string, selection: string) =>
  rows.find((r) => r.market === market && r.selection === selection)?.oddsX100;

describe("kurzový lístek zápasu", () => {
  it("v soutěži s víc góly jsou gólové tipy levnější", () => {
    // 1,4, ne 1,8: při 1,8 je „víc než 3,5" skoro jistota a na lístek nepatří.
    const bezne = zapas(1);
    const golova = zapas(1.4);
    expect(kurz(golova, "totals", "over65")!).toBeLessThan(kurz(bezne, "totals", "over65")!);
    expect(kurz(golova, "totals", "over35")!).toBeLessThan(kurz(bezne, "totals", "over35")!);
    expect(kurz(golova, "scorer", "Domácí-0")!).toBeLessThan(kurz(bezne, "scorer", "Domácí-0")!);
  });

  it("tém jisté tipy se nevypisují na žádné straně gólové linie", () => {
    // Při šesti gólech na zápas je „víc než 2,5" skoro jistota. Kurz nespadne
    // pod 1,05, takže by se vyplácel víc, než stojí.
    const golova = zapas(1.8);
    for (const r of golova.filter((x) => x.market === "totals")) {
      expect(r.oddsX100).toBeGreaterThanOrEqual(MIN_OFFERED_ODDS);
    }
    expect(kurz(golova, "totals", "over25")).toBeUndefined();
    // Opačná strana tamtéž dává smysl a zůstává.
    expect(kurz(golova, "totals", "under25")).toBeDefined();
  });

  it("z každého týmu se vypíše nejvýš šest střelců", () => {
    const strelci = zapas(1).filter((r) => r.market === "scorer");
    expect(strelci.filter((r) => r.selection.startsWith("Domácí")).length).toBeLessThanOrEqual(SCORERS_PER_TEAM);
    expect(strelci.filter((r) => r.selection.startsWith("Hosté")).length).toBeLessThanOrEqual(SCORERS_PER_TEAM);
  });
});
