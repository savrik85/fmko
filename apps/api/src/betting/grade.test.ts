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

  it("kdo vůbec nenastoupil, má tip anulovaný — ne prohraný", () => {
    const apps: Appearances = new Map([["nekdo_jiny", 1]]);
    expect(gradeSelection("scorer", "novak", vyhraDomacich, apps)).toBe("void");
  });
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
