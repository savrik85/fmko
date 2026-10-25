import { describe, expect, it } from "vitest";
import { coachDisplayName } from "../../../web/src/lib/coach-name";

/**
 * Štítek „(AI)“ za jménem trenéra je jediný viditelný rozdíl mezi AI klubem
 * a lidským klubem. Pomocná funkce žije na webu (web vlastní testy nemá),
 * proto se testuje odtud, stejně jako ostatní kontroly webu v této složce.
 */
describe("coachDisplayName", () => {
  it("AI trenér dostane za jméno štítek (AI)", () => {
    expect(coachDisplayName("Jan Novák", true)).toBe("Jan Novák (AI)");
  });

  it("lidský trenér zůstane beze změny", () => {
    expect(coachDisplayName("Jan Novák", false)).toBe("Jan Novák");
  });

  it("štítek se nepřidá dvakrát", () => {
    expect(coachDisplayName("Jan Novák (AI)", true)).toBe("Jan Novák (AI)");
  });

  it("mezery okolo jména se oříznou, aby štítek seděl hned za jménem", () => {
    expect(coachDisplayName("  Jan Novák ", true)).toBe("Jan Novák (AI)");
    expect(coachDisplayName(" Jan Novák ", false)).toBe("Jan Novák");
  });

  it("prázdné jméno zůstane prázdné, samotný štítek se neukáže", () => {
    expect(coachDisplayName("", true)).toBe("");
    expect(coachDisplayName("   ", true)).toBe("");
  });
});
