import { describe, expect, it } from "vitest";
import { injuryPronenessOf } from "./proneness";

describe("injuryPronenessOf", () => {
  it("bere náchylnost z physical, kam ji ukládá generátor", () => {
    expect(injuryPronenessOf({ injuryProneness: 85 }, {})).toBe(85);
  });

  it("physical má přednost před personality", () => {
    expect(injuryPronenessOf({ injuryProneness: 10 }, { injuryProneness: 90 })).toBe(10);
  });

  it("starý záznam jen v personality se pořád přečte", () => {
    expect(injuryPronenessOf({}, { injuryProneness: 70 })).toBe(70);
  });

  it("bez údaje vrátí 50", () => {
    expect(injuryPronenessOf(null, null)).toBe(50);
    expect(injuryPronenessOf({ stamina: 40 })).toBe(50);
  });
});
