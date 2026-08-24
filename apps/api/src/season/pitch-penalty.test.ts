import { describe, it, expect } from "vitest";
import { pitchAttendanceFactor } from "./weather";
import { computeMatchSatisfactionDelta } from "./fans-processor";

/**
 * Rozbité hřiště se klubu vyplácelo: ušetřil na údržbě a nakopávaná taktika na něm
 * navíc funguje líp. Pasivní postih (návštěva + spokojenost) to má srovnat, aby se
 * záměrně neudržovaný trávník nevyplácel ani bez zásahu grémia.
 */

function base(pitchCondition: number | null) {
  return {
    result: "draw" as const,
    fans: { hardcore: 100, regular: 200, casual: 300 } as never,
    opponentReputation: 50,
    effectiveTicketPrice: 50,
    villageBaseTicketPrice: 50,
    concessionMode: "external" as const,
    soldProducts: [],
    pitchCondition,
  };
}

describe("pasivní postih za rozbité hřiště", () => {
  it("slušné hřiště návštěvu nesráží", () => {
    expect(pitchAttendanceFactor(100)).toBe(1);
    expect(pitchAttendanceFactor(70)).toBe(1);
  });

  it("pod hranicí 70 začne návštěva klesat", () => {
    expect(pitchAttendanceFactor(60)).toBeLessThan(1);
    expect(pitchAttendanceFactor(30)).toBeLessThan(pitchAttendanceFactor(60));
    expect(pitchAttendanceFactor(5)).toBeLessThan(pitchAttendanceFactor(30));
  });

  it("postih návštěvy má strop — prázdný stadion z toho nebude", () => {
    expect(pitchAttendanceFactor(0)).toBeGreaterThan(0.8);
  });

  it("neznámý stav (starší zápasy) návštěvu nemění", () => {
    expect(pitchAttendanceFactor(null)).toBe(1);
    expect(pitchAttendanceFactor(undefined)).toBe(1);
  });

  it("brambořiště fanoušky naštve, koberec potěší", () => {
    const brambory = computeMatchSatisfactionDelta(base(10));
    const zanedbany = computeMatchSatisfactionDelta(base(30));
    const bezny = computeMatchSatisfactionDelta(base(60));
    const koberec = computeMatchSatisfactionDelta(base(95));

    expect(brambory.delta).toBeLessThan(zanedbany.delta);
    expect(zanedbany.delta).toBeLessThan(bezny.delta);
    expect(koberec.delta).toBeGreaterThan(bezny.delta);
  });

  it("důvod se fanouškům vypíše, ať vědí za co", () => {
    expect(computeMatchSatisfactionDelta(base(10)).reasons.join(" ")).toContain("brambořiště");
    expect(computeMatchSatisfactionDelta(base(95)).reasons.join(" ")).toContain("koberec");
  });

  it("venkovní zápas se stavem hřiště neřeší", () => {
    const venku = computeMatchSatisfactionDelta(base(null));
    const doma = computeMatchSatisfactionDelta(base(60));
    expect(venku.delta).toBe(doma.delta);
  });
});
