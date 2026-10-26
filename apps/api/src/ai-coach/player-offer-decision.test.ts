import { describe, expect, it } from "vitest";
import {
  fallbackPlayerOfferChoice, playerOfferSchema, renderPlayerOfferPrompt, resolvePlayerOfferDecisions, talentBand,
  validatePlayerOfferDecision,
  type PlayerOfferCandidate, type PlayerOfferContext,
} from "./player-offer-decision";
import { generateAiProfile, type AiCoachProfile } from "./profile";

const profile = (over: Partial<AiCoachProfile> = {}): AiCoachProfile => ({ ...generateAiProfile("offer-unit", null), thrift: 40, youthFocus: 40, ...over });

const offer = (over: Partial<PlayerOfferCandidate> = {}): PlayerOfferCandidate => ({
  key: "O1", offerId: "offer-uuid-1", source: "pub", age: 27, position: "MID", rating: 44, weeklyWage: 186,
  talent: null, daysLeft: 4, samePosition: [55, 47, 44, 43, 41], starters: 4, need: 0, missing: 0,
  ...over,
});

const ctx = (offers: PlayerOfferCandidate[], p: AiCoachProfile = profile(), over: Partial<PlayerOfferContext> = {}): PlayerOfferContext => ({
  teamName: "TJ Netolice", profile: p, budget: 80_000, reserve: 20_000, spendable: 60_000, weeklyCosts: 4_000,
  squadSize: 22, targetSquad: 24, maxSquad: 30, formation: "4-4-2", top11Average: 47, signingFee: 500, offers, ...over,
});

describe("nabídky místních hráčů: popis a kontrola odpovědi modelu", () => {
  it("schéma má vždy neprázdné výčty a prompt nese fakta z karty nabídky, ne UUID", () => {
    const c = ctx([offer(), offer({ key: "O2", offerId: "offer-uuid-2", source: "youth", age: 17, rating: 30, talent: "high" })]);
    const schema = playerOfferSchema(c) as { properties: { decisions: { items: { properties: { offer: { enum: string[] }; action: { enum: string[] } } } } } };
    expect(schema.properties.decisions.items.properties.offer.enum).toEqual(["O1", "O2"]);
    expect(schema.properties.decisions.items.properties.action.enum).toEqual(["sign", "decline"]);
    const prompt = renderPlayerOfferPrompt(c);
    expect(prompt).toContain("O1: the pub landlord heard of him. MID, age 27, rating 44, weekly wage 186 CZK; the offer expires in 4 days.");
    expect(prompt).toContain("he would be your 3rd best MID");
    expect(prompt).toContain("talent: high");
    expect(prompt).toContain("500 CZK registration fee");
    expect(prompt).not.toContain("offer-uuid");
  });

  it("platí jen známá nabídka a „sign“ nebo „decline“, za zbytek rozhodne náhradní pravidlo", () => {
    const c = ctx([offer(), offer({ key: "O2", offerId: "offer-uuid-2" })]);
    const v = validatePlayerOfferDecision({ decisions: [
      { offer: "O1", action: "sign", reason: "fills midfield" },
      { offer: "O2", action: "loan", reason: "x" },
      { offer: "O9", action: "sign", reason: "y" },
    ], reasoning: "" }, c);
    expect(v?.chosen.get("O1")).toEqual({ action: "sign", reason: "fills midfield" });
    expect(v?.chosen.has("O2")).toBe(false);
    expect(v?.rejected).toEqual(expect.arrayContaining(["O2: loan není v nabídce", "neznámá nabídka O9"]));
    expect(resolvePlayerOfferDecisions(c, v).map((d) => d.decidedBy)).toEqual(["model", "fallback"]);
    expect(validatePlayerOfferDecision("nonsense", c)).toBeNull();
    expect(validatePlayerOfferDecision({ decisions: "x" }, c)).toBeNull();
    expect(resolvePlayerOfferDecisions(c, null).every((d) => d.decidedBy === "fallback")).toBe(true);
  });
});

describe("náhradní pravidlo podle povahy", () => {
  it("hráče do základu vezme každý, skrblík nikoho dalšího", () => {
    expect(fallbackPlayerOfferChoice(offer({ rating: 50 }), ctx([]))).toBe("sign");
    expect(fallbackPlayerOfferChoice(offer({ rating: 50 }), ctx([], profile({ thrift: 95 })))).toBe("sign");
    expect(fallbackPlayerOfferChoice(offer({ rating: 42, need: 0.5 }), ctx([], profile({ thrift: 95 })))).toBe("decline");
  });

  it("doplní slabý post a pod cílem kádru rozumnou zálohu; slabého hráče do plného kádru nebere", () => {
    expect(fallbackPlayerOfferChoice(offer({ rating: 40, need: 0.4 }), ctx([]))).toBe("sign");
    expect(fallbackPlayerOfferChoice(offer({ rating: 40 }), ctx([], profile(), { squadSize: 20 }))).toBe("sign");
    expect(fallbackPlayerOfferChoice(offer({ rating: 30 }), ctx([], profile(), { squadSize: 26 }))).toBe("decline");
  });

  it("mládežník vezme talentovaného kluka z dorostu, netalentovaného ne", () => {
    const boy = offer({ source: "youth", age: 17, rating: 28, talent: "medium" });
    expect(fallbackPlayerOfferChoice(boy, ctx([], profile({ youthFocus: 70 }), { squadSize: 26 }))).toBe("sign");
    expect(fallbackPlayerOfferChoice({ ...boy, talent: "low" }, ctx([], profile({ youthFocus: 70 }), { squadSize: 26 }))).toBe("decline");
    expect(fallbackPlayerOfferChoice(boy, ctx([], profile({ youthFocus: 30 }), { squadSize: 26 }))).toBe("decline");
  });

  it("talent podle stejných prahů, jaké vidí člověk na kartě nabídky", () => {
    expect([talentBand(35), talentBand(30), talentBand(18), talentBand(17), talentBand(0)]).toEqual(["high", "high", "medium", "low", "low"]);
  });
});
