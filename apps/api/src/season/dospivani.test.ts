/**
 * Dospívání mladých hráčů.
 *
 * Nejdůležitější je, že přírůstek řídí TALENT — bez toho byl rozdíl mezi průměrným
 * klukem a výjimečným talentem jen dvě sezóny a piplání klenotu nemělo smysl.
 */
import { describe, it, expect } from "vitest";
import { bodyDospivani, DOSPIVANI_DO_VEKU } from "./dospivani";

describe("bodyDospivani", () => {
  it("po dvacítce už se nedospívá", () => {
    expect(bodyDospivani(DOSPIVANI_DO_VEKU + 1, 90)).toBe(0);
    expect(bodyDospivani(30, 90)).toBe(0);
  });

  it("mladík dospívá až do hraničního věku včetně", () => {
    expect(bodyDospivani(DOSPIVANI_DO_VEKU, 50)).toBeGreaterThan(0);
    expect(bodyDospivani(16, 50)).toBeGreaterThan(0);
  });

  it("talent rozhoduje, wonderkid roste výrazně rychleji než průměrný kluk", () => {
    const bezny = bodyDospivani(17, 15);
    const wonderkid = bodyDospivani(17, 90);
    expect(wonderkid).toBeGreaterThan(bezny * 2);
  });

  it("i kluk bez talentu povyroste, dospívání není jen pro vyvolené", () => {
    expect(bodyDospivani(17, 0)).toBeGreaterThanOrEqual(2);
  });

  it("přírůstek roste s talentem monotónně", () => {
    const rada = [0, 20, 40, 60, 80, 100].map((t) => bodyDospivani(17, t));
    for (let i = 1; i < rada.length; i++) {
      expect(rada[i]).toBeGreaterThanOrEqual(rada[i - 1]);
    }
  });

  it("nesmyslný talent nerozbije výpočet", () => {
    expect(bodyDospivani(17, -50)).toBe(2);
    expect(bodyDospivani(17, 500)).toBe(8);
  });

  it("dospívání samo hráče do sestavy nedostane, musí i trénovat", () => {
    // Od 2026-10-20 poloviční: slibný kluk (talent 40) za tři léta +12 bodů dovedností,
    // zbytek k laťce sestavy musí natrénovat.
    const zaTriSezony = bodyDospivani(17, 40) + bodyDospivani(18, 40) + bodyDospivani(19, 40);
    expect(zaTriSezony).toBeGreaterThanOrEqual(10);
    expect(zaTriSezony).toBeLessThan(20);
  });
});
