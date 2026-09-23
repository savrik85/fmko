/**
 * Odpovědi majitele při jednání: každá povaha má text pro každý výsledek kola, bez dlouhé pomlčky.
 */
import { describe, expect, it } from "vitest";
import { OWNER_PERSONALITIES } from "./owners";
import { ownerResponse, RESPONSE_KINDS, WISH_ACCUSATIVE } from "./negotiation-texts";
import { PROMISE_KINDS } from "./promise-kinds";

describe("ownerResponse", () => {
  it("každá povaha a výsledek má neprázdný text bez dlouhé pomlčky", () => {
    for (const p of OWNER_PERSONALITIES) {
      for (const k of RESPONSE_KINDS) {
        for (let i = 0; i < 3; i++) {
          const t = ownerResponse(p, k, i, "youth");
          expect(t.length).toBeGreaterThan(5);
          expect(t).not.toContain("—");
          expect(t).not.toContain("{wish}");
        }
      }
    }
  });
  it("protinabídka za přání dosadí přání ve 4. pádě", () => {
    expect(ownerResponse("fan", "counter_wish", 0, "no_riots")).toContain(WISH_ACCUSATIVE.no_riots);
  });
  it("každý druh slibu má tvar ve 4. pádě", () => {
    for (const k of PROMISE_KINDS) expect(WISH_ACCUSATIVE[k].length).toBeGreaterThan(2);
  });
});
