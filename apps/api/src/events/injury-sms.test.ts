import { describe, expect, it } from "vitest";
import { daysPhrase, suspensionSms, matchesPhrase, injurySms } from "./injury-sms";

describe("SMS o zranění a stopce", () => {
  it("skloňuje dny a zápasy", () => {
    expect([1, 2, 4, 5, 12].map(daysPhrase)).toEqual(["den", "2 dny", "4 dny", "5 dní", "12 dní"]);
    expect([1, 3, 7].map(matchesPhrase)).toEqual(["1 zápas", "3 zápasy", "7 zápasů"]);
    expect(suspensionSms(2)).toBe("Mám stopku, nesmím hrát ještě 2 zápasy.");
  });

  it("typ zranění česky, ne jak leží v databázi", () => {
    const t = injurySms("hrac-1", "kotnik", 2);
    expect(t).toMatch(/kotník/);
    expect(t).not.toMatch(/kotnik|dní\./);
    expect(injurySms("hrac-1", "neznamy", 1)).toMatch(/zranění/);
  });

  it("stejný hráč má stejný text, různí hráči se střídají", () => {
    expect(injurySms("abc", "sval", 3)).toBe(injurySms("abc", "sval", 3));
    const texty = new Set(["a", "b", "c", "d", "e", "f"].map((id) => injurySms(id, "sval", 3)));
    expect(texty.size).toBeGreaterThan(1);
  });
});
