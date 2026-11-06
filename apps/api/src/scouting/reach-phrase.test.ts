import { describe, it, expect } from "vitest";
import { reachPhrase, revisitSms } from "./report-text";

describe("věta skauta, kam to hráč dotáhne, podle věku", () => {
  it("mladý poroste (rozpětí), dospělý kolik ještě přidá, nebo drží", () => {
    expect(reachPhrase(22, 40, 44, 49)).toContain("Dotáhnout by to mohl");
    expect(reachPhrase(27, 40, 42, 44)).toBe("Ještě přidá asi 4 body.");
    expect(reachPhrase(27, 40, 42, 46)).toBe("Ještě přidá asi 6 bodů.");
    expect(reachPhrase(33, 40, 40, 42)).toContain("spíš drží");
  });

  it("SMS po další návštěvě u dospělého říká, kam to dotáhne, u mladého strop", () => {
    expect(revisitSms({ name: "Roman Tkačenko", age: 22, ratingLo: 44, ratingHi: 48, potentialLo: 50, potentialHi: 56, youth: false })).toContain("Dotáhnout by to mohl");
    expect(revisitSms({ name: "Kluk", age: 18, ratingLo: 30, ratingHi: 34, potentialLo: 45, potentialHi: 52, youth: true })).toContain("Strop vidím");
  });
});
