import { describe, expect, it } from "vitest";
import { SPONSOR_PAYOUT_MULTIPLIER, sponsorMonthlyPayout, sponsorWeeklyPayout } from "./sponsor";

/**
 * Sponzor každé pondělí vyplácí měsíční částku ze smlouvy / 4,3 × 2 (finance-processor).
 * Majitel hry rozhodl, že peníze chodí dál takhle, ale hra musí ukazovat, co klub
 * opravdu dostane, ne polovinu.
 */
describe("výplata sponzora", () => {
  it("násobitel výplaty je 2", () => {
    expect(SPONSOR_PAYOUT_MULTIPLIER).toBe(2);
  });

  it("týdně přijde měsíční částka / 4,3 × 2, stejně jako ji připíše pondělní výplata", () => {
    expect(sponsorWeeklyPayout(4300)).toBe(2000);
    expect(sponsorWeeklyPayout(10000)).toBe(Math.round((10000 / 4.3) * 2));
    expect(sponsorWeeklyPayout(0)).toBe(0);
  });

  it("za měsíc přijde dvojnásobek částky ze smlouvy", () => {
    expect(sponsorMonthlyPayout(5000)).toBe(10000);
  });
});
