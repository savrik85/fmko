import { describe, expect, it } from "vitest";
import { createRng } from "../generators/rng";
import { generateAbsences, type PlayerForAbsence } from "./absence";

const SQUAD: PlayerForAbsence[] = Array.from({ length: 18 }, (_, i) => ({
  firstName: "Hráč",
  lastName: `Č${i}`,
  age: 22 + (i % 20),
  occupation: i % 3 === 0 ? "Zedník" : i % 3 === 1 ? "Traktorista" : "Účetní",
  discipline: 30 + i * 3,
  patriotism: 50,
  alcohol: 40,
  temper: 45,
  morale: 50,
  stamina: 70,
  injuryProneness: 40,
  commuteKm: i % 12,
}));

/**
 * Absence se pro jeden zápas generují dvakrát — jednou pro SMS hráči, jednou
 * pro simulaci. Když se vstupy rozejdou, hráč dostane omluvenku od někoho,
 * kdo ve skutečnosti nastoupil. Tenhle test je pojistka přesně proti tomu.
 */
describe("determinismus absencí", () => {
  it("stejný seed a stejné options dají identický výsledek", () => {
    const opts = { timing: "match_day" as const, district: "Prachatice", commuteMod: 0.2 };
    expect(generateAbsences(createRng(12345), SQUAD, opts))
      .toEqual(generateAbsences(createRng(12345), SQUAD, opts));
  });

  it("chybějící commuteMod se chová jako nula, ne jako undefined", () => {
    expect(generateAbsences(createRng(777), SQUAD, { timing: "match_day" }))
      .toEqual(generateAbsences(createRng(777), SQUAD, { timing: "match_day", commuteMod: 0 }));
  });

  it("dodávka opravdu ubírá absence z dojíždění", () => {
    // U jednoho seedu se rozdíl projevit nemusí — vliv je malý a musí překlopit
    // práh. Přes stovku seedů ale dodávka absencí nasčítá znatelně míň.
    const celkem = (commuteMod: number) => {
      let n = 0;
      for (let seed = 1; seed <= 200; seed++) {
        n += generateAbsences(createRng(seed), SQUAD, { timing: "match_day", commuteMod }).length;
      }
      return n;
    };
    expect(celkem(0.45)).toBeLessThan(celkem(0));
  });

  it("prázdné options nespadnou a chovají se jako výchozí", () => {
    expect(() => generateAbsences(createRng(1), SQUAD)).not.toThrow();
    expect(generateAbsences(createRng(1), SQUAD)).toEqual(generateAbsences(createRng(1), SQUAD, {}));
  });

  it("dodávka a řidič dohromady nepřekročí strop 0,55", () => {
    // Nad stropem by absence z dojíždění zmizely úplně. Vstup 0,9 se musí
    // chovat stejně jako 0,55, jinak strop neplatí.
    expect(generateAbsences(createRng(4242), SQUAD, { timing: "match_day", commuteMod: 0.9 }))
      .toEqual(generateAbsences(createRng(4242), SQUAD, { timing: "match_day", commuteMod: 0.55 }));
  });
});
