/**
 * Tvar souhrnu vypršelých sponzorských smluv.
 *
 * Věta se posílá jednou za sezónu a s číslem se v češtině mění i sloveso, takže
 * jediná šablona by u dvou i pěti smluv zněla špatně. Klub se sedmi sponzory
 * dřív dostal sedm stejných SMS během dvou sekund.
 */
import { describe, it, expect } from "vitest";
import { smlouvyVyprsely } from "./season-rollover";

describe("kolik sponzorských smluv vypršelo", () => {
  it("dva až čtyři mají tvar množného čísla se slovesem v množném", () => {
    expect(smlouvyVyprsely(2)).toBe("2 sponzorské smlouvy vypršely");
    expect(smlouvyVyprsely(4)).toBe("4 sponzorské smlouvy vypršely");
  });

  it("pět a víc přechází na počítaný tvar", () => {
    expect(smlouvyVyprsely(5)).toBe("5 sponzorských smluv vypršelo");
    expect(smlouvyVyprsely(7)).toBe("7 sponzorských smluv vypršelo");
    expect(smlouvyVyprsely(11)).toBe("11 sponzorských smluv vypršelo");
  });

  it("tvar se nikdy nerozejde s číslem", () => {
    for (let n = 2; n <= 20; n++) {
      const v = smlouvyVyprsely(n);
      if (n <= 4) expect(v).toContain("smlouvy vypršely");
      else expect(v).toContain("smluv vypršelo");
    }
  });
});
