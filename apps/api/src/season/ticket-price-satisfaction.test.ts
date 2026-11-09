import { describe, it, expect } from "vitest";
import { computeMatchSatisfactionDelta, type MatchSatisfactionInput } from "./fans-processor";
import { matchTicketPrice } from "./finance-processor";

/**
 * „Drahé vstupné −2" dostával i klub, který na cenu nikdy nesáhl: poměr se počítal
 * z ceny vybrané u vstupu, a ta nese bonus za oplocení a násobitel spokojenosti.
 * Posuzuje se jen to, co nastavil manažer, proti sazbě obce.
 */

const VILLAGE_PRICE = 30;

function homeMatch(setTicketPrice: number): MatchSatisfactionInput {
  return {
    result: "draw",
    fans: { satisfaction: 90, loyalty: 60, expected_performance: 50, base_ticket_price: setTicketPrice },
    opponentReputation: 50,
    setTicketPrice,
    villageBaseTicketPrice: VILLAGE_PRICE,
    concessionMode: "external",
    soldProducts: [],
  };
}

const reasons = (setTicketPrice: number) => computeMatchSatisfactionDelta(homeMatch(setTicketPrice)).reasons;

describe("spokojenost fanoušků a cena vstupného", () => {
  it("výchozí cena (0 = sazba obce) není drahá, ani když plot a spokojenost zvednou cenu u vstupu", () => {
    // Plot třetí úrovně +20 %, spokojenost 90 → ×1,24. U vstupu se vybírá 45 Kč místo 30.
    const atGate = matchTicketPrice({ userBasePrice: 0, villageBasePrice: VILLAGE_PRICE, ticketPriceBonus: 0.2, satisfaction: 90 });
    expect(atGate / VILLAGE_PRICE).toBeGreaterThan(1.2);
    expect(reasons(0)).not.toContain("Drahé vstupné -2");
    expect(reasons(0)).not.toContain("Levné vstupné +1");
    expect(computeMatchSatisfactionDelta(homeMatch(0)).delta).toBe(0);
  });

  it("cena nastavená přesně na sazbu obce je stejná jako výchozí", () => {
    expect(reasons(VILLAGE_PRICE)).toEqual(reasons(0));
  });

  it("drahé je až víc než 120 % sazby obce", () => {
    expect(reasons(36)).not.toContain("Drahé vstupné -2");   // přesně 120 %
    expect(reasons(37)).toContain("Drahé vstupné -2");
    expect(computeMatchSatisfactionDelta(homeMatch(37)).delta).toBe(-2);
  });

  it("levné je až pod 80 % sazby obce", () => {
    expect(reasons(24)).not.toContain("Levné vstupné +1");   // přesně 80 %
    expect(reasons(23)).toContain("Levné vstupné +1");
    expect(computeMatchSatisfactionDelta(homeMatch(23)).delta).toBe(1);
  });

  it("venku se cena neposuzuje, i když má klub doma draho", () => {
    // Volající posílá pro venkovní zápas 0, vlastní cena klubu zůstává v `fans`.
    const away = { ...homeMatch(0), fans: { ...homeMatch(0).fans, base_ticket_price: 200 } };
    expect(computeMatchSatisfactionDelta(away).reasons).toEqual(["Remíza 0"]);
  });

  it("bez sazby obce se cena neposuzuje", () => {
    const r = computeMatchSatisfactionDelta({ ...homeMatch(500), villageBaseTicketPrice: 0 });
    expect(r.reasons).toEqual(["Remíza 0"]);
  });
});
