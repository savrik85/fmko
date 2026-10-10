import { describe, it, expect } from "vitest";
import {
  matchOdds, writeOdds, isOffered, MIN_OFFERED_ODDS, SCORERS_PER_TEAM, TOTAL_LINES, EXTRA_MARKETS,
  ODDS_ROWS_PER_STATEMENT, type OddsRow,
} from "./board";
import { MAX_ODDS_X100 } from "./odds-model";
import { gradeSelection } from "./grade";

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

/** Zápas bez střelců s danou silou a úrovní gólů. */
function oddsWithoutScorers(homeStrength: number, awayStrength: number, goalLevel: number) {
  return matchOdds({
    matchId: "z2", homeName: "Sokol", awayName: "Lhota",
    homeStrength, awayStrength, homeForm: 0, awayForm: 0,
    scorers: [], homeGoalsPerMatch: 0, awayGoalsPerMatch: 0, goalLevel,
  });
}

/** Od vyrovnaného po jednoznačný zápas, od soutěže s málo góly po gólovou. */
const scenarios: Array<[string, number, number, number]> = [
  ["vyrovnaný", 40, 40, 1],
  ["favorit doma", 50, 38, 1],
  ["favorit venku", 33, 46, 1],
  ["gólová soutěž", 42, 40, 1.9],
  ["jednoznačný v gólové soutěži", 55, 35, 2.5],
  ["málo gólů", 40, 41, 0.5],
];

describe("doplňkové trhy na lístku", () => {
  it("vyrovnaný zápas má všech pět doplňkových trhů", () => {
    const rows = oddsWithoutScorers(40, 40, 1);
    for (const market of EXTRA_MARKETS) {
      expect(rows.some((r) => r.market === market)).toBe(true);
    }
  });

  it("kódy výběrů se v zápase neopakují ani napříč trhy", () => {
    for (const [, h, a, lvl] of scenarios) {
      const rows = oddsWithoutScorers(h, a, lvl);
      expect(new Set(rows.map((r) => r.selection)).size).toBe(rows.length);
    }
  });

  for (const [name, h, a, lvl] of scenarios) {
    it(`každý vypsaný kurz je v rozumných mezích a v neprospěch sázejícího (${name})`, () => {
      const rows = oddsWithoutScorers(h, a, lvl).filter((r) => r.market !== "1x2" && r.market !== "dchance");
      for (const r of rows) {
        expect(r.oddsX100).toBeGreaterThanOrEqual(MIN_OFFERED_ODDS);
        expect(r.oddsX100).toBeLessThan(MAX_ODDS_X100);
        // Očekávaná návratnost koruny vsazené naslepo musí být pod 1.
        expect(r.probability * r.oddsX100 / 100).toBeLessThan(1);
      }
    });

    it(`marže sedí: dvoucestné sázky nesou kolem 8 % (${name})`, () => {
      const rows = oddsWithoutScorers(h, a, lvl);
      const findRow = (market: string, selection: string) =>
        rows.find((r) => r.market === market && r.selection === selection);
      for (const [market, x, y] of [
        ["btts", "btts_yes", "btts_no"],
        ["handicap", "home_m15", "away_p15"],
        ["team_totals", "home_over15", "home_under15"],
      ] as const) {
        const p = findRow(market, x);
        const q = findRow(market, y);
        if (!p || !q) continue;   // jedna strana mimo meze, dvojice se neporovnává
        expect(p.probability + q.probability).toBeCloseTo(1, 10);
        const overround = 100 / p.oddsX100 + 100 / q.oddsX100;
        expect(overround).toBeGreaterThanOrEqual(1.07);
        expect(overround).toBeLessThan(1.11);
      }
    });
  }

  it("handicap favorita je levnější než outsidera a popisky mluví česky", () => {
    const rows = oddsWithoutScorers(45, 40, 1.38);
    const hcp = (selection: string) => rows.find((r) => r.market === "handicap" && r.selection === selection);
    const fav = hcp("home_m15")!;
    const out = hcp("away_p15")!;
    expect(fav.label).toBe("Sokol vyhraje o 2 a víc");
    expect(out.label).toBe("Lhota neprohraje o víc než 1 gól");
    expect(hcp("away_p25")!.label).toBe("Lhota neprohraje o víc než 2 góly");
    expect(fav.oddsX100).toBeLessThan(out.oddsX100);
    // Outsider s −1,5 je buď dražší než favorit, nebo se pro nesmyslný kurz nevypisuje.
    expect(hcp("away_m15")?.oddsX100 ?? Infinity).toBeGreaterThan(fav.oddsX100);
  });

  it("pásma gólů nesou pravděpodobnosti, které dají 1", () => {
    // Vyrovnaný zápas: všechna čtyři pásma jsou v mezích, nic se neodfiltruje.
    const bands = oddsWithoutScorers(40, 40, 1).filter((r) => r.market === "goals_band");
    expect(bands).toHaveLength(4);
    expect(bands.reduce((a, r) => a + r.probability, 0)).toBeCloseTo(1, 10);
  });

  it("výsledek s góly stojí na linii nejbližší půl na půl a vyhodnotí se na ní", () => {
    const rows = oddsWithoutScorers(42, 40, 1.9);
    const combo = rows.filter((r) => r.market === "result_total");
    const lines = new Set(combo.map((r) => r.selection.replace(/^.*(over|under)/, "")));
    expect(lines.size).toBe(1);
    const tag = [...lines][0];
    expect(TOTAL_LINES.map((l) => String(l * 10))).toContain(tag);
    // Tip se vyhodnotí na linii z vlastního kódu, ne na dnešní.
    const r = combo.find((x) => x.selection === `1_over${tag}`);
    if (r) {
      const line = Number(tag) / 10;
      expect(gradeSelection("result_total", r.selection, { homeScore: Math.ceil(line), awayScore: 0 }, new Map())).toBe("won");
      expect(gradeSelection("result_total", r.selection, { homeScore: Math.floor(line), awayScore: 0 }, new Map())).toBe("lost");
    }
  });

  it("gólové lines mají staré kódy, takže podané tipy se vyhodnotí dál", () => {
    const rows = oddsWithoutScorers(40, 40, 1).filter((r) => r.market === "totals");
    for (const r of rows) expect(r.selection).toMatch(/^(over|under)(15|25|35|45|55|65)$/);
    expect(rows.some((r) => r.selection === "over25")).toBe(true);
  });

  it("kurz na stropu se nevypisuje", () => {
    expect(isOffered(MAX_ODDS_X100)).toBe(false);
    expect(isOffered(MAX_ODDS_X100 - 1)).toBe(true);
    expect(isOffered(MIN_OFFERED_ODDS - 1)).toBe(false);
  });

  it("lístek kola zůstává rozumně velký", () => {
    // Kolem padesáti kurzů na zápas včetně dvanácti střelců.
    const rows = zapas(1);
    expect(rows.length).toBeLessThanOrEqual(70);
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

  it("píše víc řádků jedním příkazem a nepřekročí sto parametrů", async () => {
    const statements: Array<{ sql: string; params: unknown[] }> = [];
    const db = {
      prepare: (sql: string) => ({
        bind: (...params: unknown[]) => {
          const st = { sql, params, run: async () => ({ meta: { changes: 0 } }) };
          return st;
        },
      }),
      batch: async (stmts: Array<{ sql: string; params: unknown[] }>) => { statements.push(...stmts); return []; },
    } as unknown as D1Database;

    const rows = Array.from({ length: 350 }, (_, i) => radek(`over${i}`));
    await writeOdds(db, rows, "2026-10-10T16:00:00.000Z");

    expect(statements).toHaveLength(Math.ceil(350 / ODDS_ROWS_PER_STATEMENT));
    for (const p of statements) expect(p.params.length).toBeLessThanOrEqual(100);
    expect(statements.reduce((a, p) => a + p.params.length, 0)).toBe(350 * 11);
    expect(statements[0].sql).toContain("ON CONFLICT(match_id, market, selection)");
  });

  it("prázdný přepočet nemaže nic", async () => {
    const { db, dotazy } = falesnaDb(false);
    await writeOdds(db, [], "2026-09-22T16:00:00.000Z");
    expect(dotazy).toHaveLength(0);
  });
});
