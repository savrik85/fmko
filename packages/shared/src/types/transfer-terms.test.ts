import { describe, it, expect } from "vitest";
import { transferTermsError, transferSchedule, sellOnShare, formatTermsSummary, termsFromRow } from "./transfer-terms";

const nb = (s: string) => s.replace(/ /g, " ");

describe("podmínky přestupu", () => {
  it("jednorázová platba je platná a záloha je celá cena", () => {
    const t = { amount: 45_000, upfrontPct: 100, installments: 0, sellOnPct: 0 };
    expect(transferTermsError(t)).toBeNull();
    expect(transferSchedule(t)).toMatchObject({ upfront: 45_000, installments: 0, remainingAfterUpfront: 0 });
  });

  it("záloha + splátky dávají přesně cenu, poslední splátka doplatí zbytek", () => {
    const s = transferSchedule({ amount: 45_001, upfrontPct: 30, installments: 3, sellOnPct: 0 });
    expect(s.upfront).toBe(13_500);
    expect(s.upfront + s.installmentAmount * 2 + s.lastInstallment).toBe(45_001);
    expect(s.lastInstallment).toBeGreaterThanOrEqual(s.installmentAmount);
  });

  it.each([
    [{ amount: 1000, upfrontPct: 5, installments: 3, sellOnPct: 0 }],
    [{ amount: 1000, upfrontPct: 50, installments: 0, sellOnPct: 0 }],
    [{ amount: 1000, upfrontPct: 100, installments: 3, sellOnPct: 0 }],
    [{ amount: 1000, upfrontPct: 50, installments: 21, sellOnPct: 0 }],
    [{ amount: 1000, upfrontPct: 50, installments: 1, sellOnPct: 0 }],
    [{ amount: 1000, upfrontPct: 100, installments: 0, sellOnPct: 55 }],
    [{ amount: 1000, upfrontPct: 100, installments: 0, sellOnPct: 12 }],
  ])("neplatné podmínky odmítne: %j", (t) => {
    expect(transferTermsError(t)).not.toBeNull();
  });

  it("procenta z prodeje zaokrouhlí na koruny", () => {
    expect(sellOnShare(60_000, 15)).toBe(9_000);
    expect(sellOnShare(10_001, 15)).toBe(1_500);
  });

  it("souhrn podmínek", () => {
    expect(nb(formatTermsSummary({ amount: 45_000, upfrontPct: 30, installments: 3, sellOnPct: 15 })))
      .toBe("45 000 Kč · záloha 13 500 + 3× 10 500 · 15 % z dalšího prodeje");
    expect(nb(formatTermsSummary({ amount: 45_000, upfrontPct: 100, installments: 0, sellOnPct: 0 }))).toBe("45 000 Kč");
  });

  it("starý řádek bez sloupců je jednorázová platba", () => {
    expect(termsFromRow({}, 5000)).toEqual({ amount: 5000, upfrontPct: 100, installments: 0, sellOnPct: 0 });
  });
});
