import { describe, it, expect } from "vitest";
import {
  computeMatchSatisfactionDelta, driftSatisfaction, satisfactionRest, AMENITY_BONUS_CAP,
  type MatchSatisfactionInput,
} from "./fans-processor";

/**
 * Lidské kluby měly spokojenost přibitou na 100 a všechny party „nadšené".
 * Tři příčiny: klid mířil k loajalitě (≈ reputace 80–95), zázemí stadionu
 * přičítalo body po každém zápase a očekávání bylo napořád 50.
 */

function zapas(over: Partial<MatchSatisfactionInput> = {}): MatchSatisfactionInput {
  return {
    result: "draw",
    fans: { satisfaction: 60, loyalty: 60, expected_performance: 50, base_ticket_price: 0 },
    opponentReputation: 50,
    effectiveTicketPrice: 50,
    villageBaseTicketPrice: 50,
    concessionMode: "external",
    soldProducts: [],
    ...over,
  };
}

describe("klidová spokojenost", () => {
  it("klid je kolem 55 a loajalita ho posune jen o pár bodů", () => {
    expect(satisfactionRest(50)).toBe(53);
    expect(satisfactionRest(95)).toBe(59);
    expect(satisfactionRest(0)).toBe(45);
  });

  it("nadšení bez dalších výher vyprchá, loajalita 95 na stovce nedrží", () => {
    let s = 100;
    for (let den = 0; den < 30; den++) s = driftSatisfaction(s, 95);
    expect(s).toBeLessThan(70);
    for (let den = 0; den < 60; den++) s = driftSatisfaction(s, 95);
    expect(s).toBe(satisfactionRest(95));
  });

  it("zdola se vrací taky a přes klid nepřestřelí", () => {
    let s = 0;
    for (let den = 0; den < 200; den++) s = driftSatisfaction(s, 50);
    expect(s).toBe(satisfactionRest(50));
  });
});

describe("zázemí stadionu má strop", () => {
  const vsechno = zapas({
    result: "loss",
    paSystemBonus: 6,
    facilityBonus: 4,
    staffBonus: 1,
    concessionMode: "self",
    pitchCondition: 95,
  });

  it("prohra zůstane prohrou i s nejlepším zázemím", () => {
    expect(computeMatchSatisfactionDelta(vsechno).delta).toBe(-5 + AMENITY_BONUS_CAP);
  });

  it("důvod vyjmenuje, co fanouškům udělalo radost", () => {
    const text = computeMatchSatisfactionDelta(vsechno).reasons.join(" ");
    expect(text).toContain(`Zázemí +${AMENITY_BONUS_CAP}`);
    expect(text).toContain("ozvučení");
    expect(text).toContain("sociálky");
  });

  it("obsluha se počítá jen u vlastního prodeje", () => {
    const cizi = computeMatchSatisfactionDelta(zapas({ staffBonus: 1, concessionMode: "external" }));
    expect(cizi.delta).toBe(0);
  });
});

describe("očekávání podle vlastní reputace", () => {
  it("silný klub výhrou nad slabším nic navíc nezíská", () => {
    const r = computeMatchSatisfactionDelta(zapas({ result: "win", teamReputation: 90, opponentReputation: 85 }));
    expect(r.delta).toBe(6);
  });

  it("prohra silného klubu se slabým bolí navíc", () => {
    const r = computeMatchSatisfactionDelta(zapas({ result: "loss", teamReputation: 90, opponentReputation: 40 }));
    expect(r.delta).toBe(-10);
  });

  it("slabý klub za skalp favorita dostane bonus", () => {
    const r = computeMatchSatisfactionDelta(zapas({ result: "win", teamReputation: 40, opponentReputation: 90 }));
    expect(r.delta).toBe(11);
  });

  it("bez reputace klubu se bere uložené očekávání", () => {
    const r = computeMatchSatisfactionDelta(zapas({ result: "win", opponentReputation: 90 }));
    expect(r.delta).toBe(10);
  });
});
