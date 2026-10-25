import { describe, expect, it } from "vitest";
import { coachDisplayName } from "../../../web/src/lib/coach-name";

/**
 * Robot za jménem trenéra je jediný viditelný rozdíl mezi AI klubem a lidským klubem.
 * Tahle textová varianta platí tam, kde se nedá vykreslit odznak (popisek grafu, meta popis).
 * Pomocná funkce žije na webu (web vlastní testy nemá), proto se testuje odtud, stejně jako
 * ostatní kontroly webu v této složce.
 */
describe("coachDisplayName", () => {
  it("AI trenér dostane za jméno robota", () => {
    expect(coachDisplayName("Jan Novák", true)).toBe("Jan Novák 🤖");
  });

  it("lidský trenér zůstane beze změny", () => {
    expect(coachDisplayName("Jan Novák", false)).toBe("Jan Novák");
  });

  it("robot se nepřidá dvakrát", () => {
    expect(coachDisplayName("Jan Novák 🤖", true)).toBe("Jan Novák 🤖");
  });

  it("mezery okolo jména se oříznou, aby robot seděl hned za jménem", () => {
    expect(coachDisplayName("  Jan Novák ", true)).toBe("Jan Novák 🤖");
    expect(coachDisplayName(" Jan Novák ", false)).toBe("Jan Novák");
  });

  it("prázdné jméno zůstane prázdné, samotný robot se neukáže", () => {
    expect(coachDisplayName("", true)).toBe("");
    expect(coachDisplayName("   ", true)).toBe("");
  });
});
