import { describe, it, expect } from "vitest";
import { matchOdds, writeOdds, MIN_OFFERED_ODDS, SCORERS_PER_TEAM, type OddsRow } from "./board";

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

/** Falešná D1: zaznamená dotazy, dávky podle přání selžou. */
function falesnaDb(batchSelze: boolean) {
  const dotazy: Array<{ sql: string; params: unknown[] }> = [];
  const db = {
    prepare: (sql: string) => {
      const stmt = {
        bind: (...params: unknown[]) => ({ ...stmt, params, run: async () => {
          dotazy.push({ sql, params });
          return { meta: { changes: 2 } };
        } }),
        run: async () => { dotazy.push({ sql, params: [] }); return { meta: { changes: 0 } }; },
      };
      return stmt;
    },
    batch: async () => {
      if (batchSelze) throw new Error("D1 nedostupná");
      return [];
    },
  };
  return { db: db as unknown as D1Database, dotazy };
}

const radek = (selection: string): OddsRow => ({
  leagueId: "l1", seasonNumber: 2, calendarId: "kolo-1", matchId: "z1",
  market: "totals", selection, oddsX100: 191, probability: 0.49, label: "Víc než 6,5 gólu",
});

describe("zápis lístku", () => {
  it("po zápisu z kola zmizí tipy, které nový přepočet nevypsal", async () => {
    const { db, dotazy } = falesnaDb(false);
    await writeOdds(db, [radek("over65"), radek("under35")], "2026-09-22T16:00:00.000Z");
    const uklid = dotazy.find((d) => d.sql.includes("DELETE FROM bet_odds"));
    expect(uklid).toBeDefined();
    expect(uklid!.params[0]).toBe("kolo-1");
    expect(JSON.parse(uklid!.params[2] as string)).toEqual(["z1|totals|over65", "z1|totals|under35"]);
    // Jen nesehrané zápasy kola: kurzy odehraných potřebuje hlídač kurzů.
    expect(uklid!.sql).toContain("status = 'scheduled'");
  });

  it("když zápis selže, nic se nemaže a lístek zůstane celý", async () => {
    const { db, dotazy } = falesnaDb(true);
    await writeOdds(db, [radek("over65")], "2026-09-22T16:00:00.000Z");
    expect(dotazy.some((d) => d.sql.includes("DELETE"))).toBe(false);
  });

  it("prázdný přepočet nemaže nic", async () => {
    const { db, dotazy } = falesnaDb(false);
    await writeOdds(db, [], "2026-09-22T16:00:00.000Z");
    expect(dotazy).toHaveLength(0);
  });
});
