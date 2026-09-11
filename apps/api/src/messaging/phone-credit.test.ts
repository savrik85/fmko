/** Testy popisku kreditu — zbytek modulu sahá na DB a testuje se na testingu. */
import { describe, it, expect } from "vitest";
import { creditWord, DENNI_KREDIT } from "./phone-credit";

describe("kredit na telefonu", () => {
  it("denní příděl je rozumný — ani jeden hovor, ani neomezeno", () => {
    expect(DENNI_KREDIT).toBeGreaterThanOrEqual(5);
    expect(DENNI_KREDIT).toBeLessThanOrEqual(30);
  });

  it("rozliší tři stavy a nikde nemlčí", () => {
    expect(creditWord(0, 12)).toBe("Kredit došel");
    expect(creditWord(-3, 12)).toBe("Kredit došel");
    expect(creditWord(2, 12)).toBe("Dochází kredit");
    expect(creditWord(12, 12)).toBe("Kredit v pořádku");
  });

  it("varuje včas i při malém přídělu", () => {
    // Se čtyřmi kredity musí varování přijít nejpozději u posledního.
    expect(creditWord(1, 4)).toBe("Dochází kredit");
    expect(creditWord(4, 4)).toBe("Kredit v pořádku");
  });
});
