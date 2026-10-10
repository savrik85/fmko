import { describe, it, expect } from "vitest";
import { gradeSelection, gradeTicket, type Appearances } from "./grade";

const nikdo: Appearances = new Map();
const vyhraDomacich = { homeScore: 3, awayScore: 1 };
const remiza = { homeScore: 2, awayScore: 2 };
const vyhraHostu = { homeScore: 0, awayScore: 1 };

describe("výsledek 1/X/2", () => {
  it("pozná výhru domácích", () => {
    expect(gradeSelection("1x2", "1", vyhraDomacich, nikdo)).toBe("won");
    expect(gradeSelection("1x2", "X", vyhraDomacich, nikdo)).toBe("lost");
    expect(gradeSelection("1x2", "2", vyhraDomacich, nikdo)).toBe("lost");
  });

  it("pozná remízu", () => {
    expect(gradeSelection("1x2", "X", remiza, nikdo)).toBe("won");
    expect(gradeSelection("1x2", "1", remiza, nikdo)).toBe("lost");
  });

  it("pozná výhru hostů i při bezbrankovém poločase", () => {
    expect(gradeSelection("1x2", "2", vyhraHostu, nikdo)).toBe("won");
  });
});

describe("dvojtip (neprohra)", () => {
  // Úplná tabulka: tři možnosti proti třem výsledkům. Trh, kde se dá snadno
  // splést strana, si zaslouží vyčerpávající test.
  const pripady: Array<[string, { homeScore: number; awayScore: number }, string, string]> = [
    ["1X", vyhraDomacich, "won",  "domácí vyhráli"],
    ["1X", remiza,        "won",  "remíza"],
    ["1X", vyhraHostu,    "lost", "domácí prohráli"],
    ["X2", vyhraDomacich, "lost", "hosté prohráli"],
    ["X2", remiza,        "won",  "remíza"],
    ["X2", vyhraHostu,    "won",  "hosté vyhráli"],
    ["12", vyhraDomacich, "won",  "rozhodlo se"],
    ["12", remiza,        "lost", "remíza"],
    ["12", vyhraHostu,    "won",  "rozhodlo se"],
  ];

  for (const [tip, vysledek, ocekavano, popis] of pripady) {
    it(`${tip} při ${vysledek.homeScore}:${vysledek.awayScore} → ${ocekavano} (${popis})`, () => {
      expect(gradeSelection("dchance", tip, vysledek, nikdo)).toBe(ocekavano);
    });
  }

  it("neznámá varianta se anuluje", () => {
    expect(gradeSelection("dchance", "XY", remiza, nikdo)).toBe("void");
  });
});

describe("počet gólů", () => {
  it("linie je půlgólová, takže remíza na trhu nenastane", () => {
    // 4 góly celkem
    expect(gradeSelection("totals", "over25", vyhraDomacich, nikdo)).toBe("won");
    expect(gradeSelection("totals", "under25", vyhraDomacich, nikdo)).toBe("lost");
    expect(gradeSelection("totals", "over35", vyhraDomacich, nikdo)).toBe("won");
    expect(gradeSelection("totals", "over65", vyhraDomacich, nikdo)).toBe("lost");
  });

  it("přesně na hranici rozhoduje ve prospěch nižší strany", () => {
    const dvaGoly = { homeScore: 1, awayScore: 1 };
    expect(gradeSelection("totals", "over25", dvaGoly, nikdo)).toBe("lost");
    expect(gradeSelection("totals", "under25", dvaGoly, nikdo)).toBe("won");
  });

  it("bezbrankový zápas prohraje každou sázku na vyšší počet gólů", () => {
    const nula = { homeScore: 0, awayScore: 0 };
    expect(gradeSelection("totals", "over25", nula, nikdo)).toBe("lost");
    expect(gradeSelection("totals", "under25", nula, nikdo)).toBe("won");
  });

  it("poškozený kód linie tiket nezabije", () => {
    expect(gradeSelection("totals", "overXY", vyhraDomacich, nikdo)).toBe("void");
  });
});

describe("střelec", () => {
  it("kdo se trefil, vyhrává", () => {
    const apps: Appearances = new Map([["novak", 2]]);
    expect(gradeSelection("scorer", "novak", vyhraDomacich, apps)).toBe("won");
  });

  it("kdo nastoupil a nedal, prohrává", () => {
    const apps: Appearances = new Map([["novak", 0]]);
    expect(gradeSelection("scorer", "novak", vyhraDomacich, apps)).toBe("lost");
  });

  it("kdo vůbec nenastoupil, má tip anulovaný, ne prohraný", () => {
    const apps: Appearances = new Map([["nekdo_jiny", 1]]);
    expect(gradeSelection("scorer", "novak", vyhraDomacich, apps)).toBe("void");
  });
});

// ── Doplňkové trhy ─────────────────────────────────────────────────────────

const score = (homeScore: number, awayScore: number) => ({ homeScore, awayScore });
type GradeCase = [string, number, number, "won" | "lost"];

function gradeTable(market: string, cases: GradeCase[]) {
  for (const [selection, home, away, expected] of cases) {
    it(`${selection} při ${home}:${away} → ${expected}`, () => {
      expect(gradeSelection(market, selection, score(home, away), nikdo)).toBe(expected);
    });
  }
}

describe("handicap", () => {
  gradeTable("handicap", [
    // −1,5: vyhrát o 2 a víc
    ["home_m15", 0, 0, "lost"],
    ["home_m15", 1, 0, "lost"],
    ["home_m15", 2, 0, "won"],
    ["home_m15", 3, 3, "lost"],
    ["home_m15", 6, 0, "won"],
    ["home_m15", 0, 6, "lost"],
    // +1,5: neprohrát o víc než 1 gól
    ["away_p15", 0, 0, "won"],
    ["away_p15", 1, 0, "won"],
    ["away_p15", 2, 0, "lost"],
    ["away_p15", 3, 3, "won"],
    ["away_p15", 0, 6, "won"],
    // −2,5 a +2,5
    ["home_m25", 2, 0, "lost"],
    ["home_m25", 3, 0, "won"],
    ["home_m25", 6, 0, "won"],
    ["away_p25", 2, 0, "won"],
    ["away_p25", 3, 0, "lost"],
    ["away_p25", 3, 1, "won"],
    // Hosté s handicapem, domácí s náskokem
    ["away_m15", 0, 2, "won"],
    ["away_m15", 1, 2, "lost"],
    ["away_m15", 0, 6, "won"],
    ["home_p15", 0, 1, "won"],
    ["home_p15", 0, 2, "lost"],
    ["home_p15", 2, 0, "won"],
    ["away_m25", 0, 3, "won"],
    ["home_p25", 0, 3, "lost"],
    ["home_p25", 1, 3, "won"],
  ]);

  it("každá dvojice stran se vylučuje: vyhraje právě jedna", () => {
    for (const [h, a] of [[0, 0], [1, 0], [2, 0], [3, 3], [6, 0], [0, 6], [4, 1], [1, 4]]) {
      for (const [x, y] of [["home_m15", "away_p15"], ["away_m15", "home_p15"], ["home_m25", "away_p25"], ["away_m25", "home_p25"]]) {
        const winners = [x, y].filter((t) => gradeSelection("handicap", t, score(h, a), nikdo) === "won");
        expect(winners).toHaveLength(1);
      }
    }
  });

  it("poškozený kód tiket nezabije", () => {
    expect(gradeSelection("handicap", "home_q15", score(2, 0), nikdo)).toBe("void");
    expect(gradeSelection("handicap", "1", score(2, 0), nikdo)).toBe("void");
  });
});

describe("přesný počet gólů v pásmu", () => {
  gradeTable("goals_band", [
    ["goals_0_1", 0, 0, "won"],
    ["goals_0_1", 1, 0, "won"],
    ["goals_0_1", 2, 0, "lost"],
    ["goals_2_3", 2, 0, "won"],
    ["goals_2_3", 2, 1, "won"],
    ["goals_2_3", 1, 0, "lost"],
    ["goals_4_5", 3, 1, "won"],
    ["goals_4_5", 3, 2, "won"],
    ["goals_4_5", 3, 3, "lost"],
    ["goals_6_plus", 3, 3, "won"],
    ["goals_6_plus", 6, 0, "won"],
    ["goals_6_plus", 9, 4, "won"],
    ["goals_6_plus", 3, 2, "lost"],
  ]);

  it("při každém skóre vyhraje právě jedno pásmo", () => {
    for (let h = 0; h <= 8; h++) {
      for (let a = 0; a <= 8; a++) {
        const winners = ["goals_0_1", "goals_2_3", "goals_4_5", "goals_6_plus"]
          .filter((t) => gradeSelection("goals_band", t, score(h, a), nikdo) === "won");
        expect(winners).toHaveLength(1);
      }
    }
  });

  it("neznámé pásmo se anuluje", () => {
    expect(gradeSelection("goals_band", "goals_7_9", score(4, 4), nikdo)).toBe("void");
  });
});

describe("oba týmy dají gól", () => {
  gradeTable("btts", [
    ["btts_yes", 0, 0, "lost"],
    ["btts_yes", 1, 0, "lost"],
    ["btts_yes", 6, 0, "lost"],
    ["btts_yes", 1, 1, "won"],
    ["btts_yes", 3, 3, "won"],
    ["btts_no", 0, 0, "won"],
    ["btts_no", 2, 0, "won"],
    ["btts_no", 0, 6, "won"],
    ["btts_no", 3, 3, "lost"],
  ]);

  it("neznámá varianta se anuluje", () => {
    expect(gradeSelection("btts", "btts_maybe", score(1, 1), nikdo)).toBe("void");
  });
});

describe("góly týmu", () => {
  gradeTable("team_totals", [
    ["home_over15", 0, 0, "lost"],
    ["home_over15", 1, 0, "lost"],
    ["home_over15", 2, 0, "won"],
    ["home_under15", 1, 5, "won"],
    ["home_under15", 2, 0, "lost"],
    ["home_over25", 3, 3, "won"],
    ["home_over25", 2, 0, "lost"],
    ["home_under25", 2, 0, "won"],
    ["home_under25", 6, 0, "lost"],
    ["away_over15", 6, 0, "lost"],
    ["away_over15", 0, 2, "won"],
    ["away_under15", 6, 1, "won"],
    ["away_over25", 3, 3, "won"],
    ["away_under25", 0, 6, "lost"],
  ]);

  it("počítá jen góly sázeného týmu, ne celkové skóre", () => {
    // Celkem 6 gólů, ale hosté nedali ani jeden.
    expect(gradeSelection("team_totals", "away_over15", score(6, 0), nikdo)).toBe("lost");
    expect(gradeSelection("totals", "over15", score(6, 0), nikdo)).toBe("won");
  });

  it("poškozený kód se anuluje", () => {
    expect(gradeSelection("team_totals", "home_overXY", score(2, 0), nikdo)).toBe("void");
  });
});

describe("výsledek a počet gólů", () => {
  gradeTable("result_total", [
    ["1_over35", 3, 1, "won"],
    ["1_over35", 2, 1, "lost"],
    ["1_over35", 6, 0, "won"],
    ["1_under35", 2, 0, "won"],
    ["1_under35", 1, 0, "won"],
    ["1_under35", 0, 0, "lost"],
    ["X_under35", 0, 0, "won"],
    ["X_under35", 1, 1, "won"],
    ["X_under35", 2, 2, "lost"],
    ["X_over35", 2, 2, "won"],
    ["X_over35", 3, 3, "won"],
    ["X_over35", 1, 1, "lost"],
    ["2_over35", 0, 6, "won"],
    ["2_over35", 1, 2, "lost"],
    ["2_under35", 1, 2, "won"],
    ["2_under35", 6, 0, "lost"],
    // Linie je v kódu, takže tip vsazený na 4,5 se vyhodnotí na 4,5.
    ["1_over45", 3, 1, "lost"],
    ["1_over45", 4, 1, "won"],
    ["X_under45", 2, 2, "won"],
  ]);

  it("při každém skóre vyhraje právě jedna ze šesti možností", () => {
    const allSelections = ["1_over35", "1_under35", "X_over35", "X_under35", "2_over35", "2_under35"];
    for (let h = 0; h <= 7; h++) {
      for (let a = 0; a <= 7; a++) {
        const winners = allSelections.filter((t) => gradeSelection("result_total", t, score(h, a), nikdo) === "won");
        expect(winners).toHaveLength(1);
      }
    }
  });

  it("poškozený kód se anuluje", () => {
    expect(gradeSelection("result_total", "1_over", score(3, 1), nikdo)).toBe("void");
  });
});

describe("nové gólové linie trhu totals", () => {
  gradeTable("totals", [
    ["over15", 1, 0, "lost"],
    ["over15", 1, 1, "won"],
    ["under15", 0, 0, "won"],
    ["over45", 3, 1, "lost"],
    ["over45", 3, 2, "won"],
    ["under55", 3, 2, "won"],
    ["under55", 3, 3, "lost"],
    ["over55", 6, 0, "won"],
  ]);
});

describe("neznámý trh", () => {
  it("se anuluje, hráč za naši chybu neplatí", () => {
    expect(gradeSelection("neco_noveho", "cokoliv", vyhraDomacich, nikdo)).toBe("void");
  });
});

describe("tiket jako celek", () => {
  it("sólo vyhraný nese svůj kurz", () => {
    expect(gradeTicket([{ result: "won", oddsX100: 235 }]))
      .toEqual({ status: "won", effectiveOddsX100: 235 });
  });

  it("kombinovaný násobí kurzy všech noh", () => {
    const t = gradeTicket([
      { result: "won", oddsX100: 135 },
      { result: "won", oddsX100: 139 },
      { result: "won", oddsX100: 254 },
    ]);
    expect(t.status).toBe("won");
    expect(t.effectiveOddsX100).toBe(476);   // 1,35 × 1,39 × 2,54 = 4,766
  });

  it("jediná prohraná noha zabije celý tiket", () => {
    const t = gradeTicket([
      { result: "won", oddsX100: 500 },
      { result: "won", oddsX100: 500 },
      { result: "lost", oddsX100: 120 },
    ]);
    expect(t.status).toBe("lost");
    expect(t.effectiveOddsX100).toBe(0);
  });

  it("prohra přebije i anulaci", () => {
    const t = gradeTicket([
      { result: "void", oddsX100: 200 },
      { result: "lost", oddsX100: 200 },
    ]);
    expect(t.status).toBe("lost");
  });

  it("anulovaná noha jen sníží kurz, tiket nezabije", () => {
    const t = gradeTicket([
      { result: "won", oddsX100: 200 },
      { result: "void", oddsX100: 300 },
    ]);
    expect(t.status).toBe("won");
    expect(t.effectiveOddsX100).toBe(200);   // anulovaná noha se počítá jako 1,00
  });

  it("když jsou anulované všechny nohy, vrací se vklad", () => {
    const t = gradeTicket([
      { result: "void", oddsX100: 200 },
      { result: "void", oddsX100: 300 },
    ]);
    expect(t.status).toBe("void");
    expect(t.effectiveOddsX100).toBe(100);   // kurz 1,00 = zpátky přesně vklad
  });

  it("prázdný tiket se anuluje", () => {
    expect(gradeTicket([])).toEqual({ status: "void", effectiveOddsX100: 100 });
  });
});
