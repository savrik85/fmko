import { describe, expect, it } from "vitest";
import { catchUpCondition, catchUpInjuryDaysRemaining, catchUpLagDays, dailyConditionRecovery } from "./catch-up-round";

describe("dohnané kolo", () => {
  it("zpoždění se počítá v celých dnech od termínu, kolo v den termínu má nulu", () => {
    const played = new Date("2026-11-16T17:05:08Z");
    expect(catchUpLagDays("2026-10-26T17:00:00.000Z", played)).toBe(21);
    expect(catchUpLagDays("2026-11-12T17:00:00.000Z", played)).toBe(4);
    expect(catchUpLagDays("2026-11-16T17:00:00.000Z", played)).toBe(0);
    expect(catchUpLagDays("2026-11-19T17:00:00.000Z", played)).toBe(0);
    expect(catchUpLagDays(null, played)).toBe(0);
    expect(catchUpLagDays("nesmysl", played)).toBe(0);
  });

  it("zranění se zkrátí o zpoždění a nikdy neklesne pod nulu", () => {
    expect(catchUpInjuryDaysRemaining(28, 21)).toBe(7);
    expect(catchUpInjuryDaysRemaining(10, 21)).toBe(0);
    expect(catchUpInjuryDaysRemaining(10, 0)).toBe(10);
  });

  it("kondice dostane regeneraci za dny zpoždění, nejvýš 100", () => {
    expect(catchUpCondition(0, 4, 13)).toBe(52);
    expect(catchUpCondition(44, 18, 16)).toBe(100);
    expect(catchUpCondition(30, 0, 20)).toBe(30);
  });

  it("denní regenerace podle výdrže a věku", () => {
    expect(dailyConditionRecovery(80, 20)).toBe(23);
    expect(dailyConditionRecovery(50, 28)).toBe(16);
    expect(dailyConditionRecovery(30, 33)).toBe(12);
    expect(dailyConditionRecovery(10, 37)).toBe(7);
    expect(dailyConditionRecovery(null, null)).toBe(14);
  });
});
