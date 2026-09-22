/**
 * Náklonnost majitele: pozvání, změny po zápase, výtržnosti (čisté funkce).
 */
import { describe, it, expect } from "vitest";
import {
  clampFavor, FAVOR_REASONS, invitationAcceptance, invitationAcceptedDelta, invitationGiftCost,
  postMatchFavorDelta, postMatchFavorReason, pubBeerCost, riotFavorDelta, vipBoxAcceptanceBonus, vipBoxFavorBonus,
} from "./favor-math";

describe("favor-math", () => {
  it("ořez 0–100 a zaokrouhlení", () => {
    expect(clampFavor(-5)).toBe(0);
    expect(clampFavor(120)).toBe(100);
    expect(clampFavor(41.6)).toBe(42);
  });

  it("dárek zlevňuje s náklonností, minimum 300", () => {
    expect(invitationGiftCost(50)).toBe(500);
    expect(invitationGiftCost(0)).toBe(1000);
    expect(invitationGiftCost(100)).toBe(300);
  });

  it("šance roste s náklonností a drží se v 5–95 %", () => {
    const low = invitationAcceptance({ favor: 10, personality: "businessman", recentLosses: 0, noise: 0 });
    const high = invitationAcceptance({ favor: 90, personality: "businessman", recentLosses: 0, noise: 0 });
    expect(high).toBeGreaterThan(low);
    expect(invitationAcceptance({ favor: 0, personality: "cautious", recentLosses: 5, noise: -0.1 })).toBe(0.05);
    expect(invitationAcceptance({ favor: 100, personality: "patriot", recentLosses: 0, noise: 0.1 })).toBe(0.95);
  });

  it("fanoušek nejde na klub v krizi", () => {
    const calm = invitationAcceptance({ favor: 50, personality: "fan", recentLosses: 0, noise: 0 });
    const crisis = invitationAcceptance({ favor: 50, personality: "fan", recentLosses: 3, noise: 0 });
    expect(crisis).toBeCloseTo(calm - 0.2, 5);
  });

  it("přijaté pozvání: +3, patriot +5", () => {
    expect(invitationAcceptedDelta("businessman")).toBe(3);
    expect(invitationAcceptedDelta("patriot")).toBe(5);
  });

  it("po zápase: výhra +4, remíza +1, prohra -1, fanoušek dvojnásob", () => {
    expect(postMatchFavorDelta("businessman", 2, 1)).toBe(4);
    expect(postMatchFavorDelta("businessman", 1, 1)).toBe(1);
    expect(postMatchFavorDelta("businessman", 0, 1)).toBe(-1);
    expect(postMatchFavorDelta("fan", 3, 0)).toBe(8);
    expect(postMatchFavorDelta("fan", 0, 3)).toBe(-2);
  });

  it("výtržnost: -2, opatrný -4", () => {
    expect(riotFavorDelta("fan")).toBe(-2);
    expect(riotFavorDelta("cautious")).toBe(-4);
  });

  it("pivo stojí 300–400", () => {
    expect(pubBeerCost("fan")).toBe(300);
    expect(pubBeerCost("businessman")).toBe(400);
  });

  it("VIP lóže: majitel po zápase +1/+2/+3, mimo rozsah se ořízne", () => {
    expect([0, 1, 2, 3].map(vipBoxFavorBonus)).toEqual([0, 1, 2, 3]);
    expect(vipBoxFavorBonus(7)).toBe(3);
    expect(vipBoxFavorBonus(-1)).toBe(0);
  });

  it("VIP lóže: šance na přijetí +5/+10/+15 p. b., strop 95 % platí dál", () => {
    expect([0, 1, 2, 3].map(vipBoxAcceptanceBonus)).toEqual([0, 0.05, 0.1, 0.15]);
    const bez = invitationAcceptance({ favor: 50, personality: "businessman", recentLosses: 0, noise: 0 });
    const s = invitationAcceptance({ favor: 50, personality: "businessman", recentLosses: 0, noise: 0, vipBoxLevel: 3 });
    expect(bez).toBeCloseTo(0.4, 5);
    expect(s).toBeCloseTo(0.55, 5);
    expect(invitationAcceptance({ favor: 100, personality: "patriot", recentLosses: 0, noise: 0.1, vipBoxLevel: 3 })).toBe(0.95);
  });
});

describe("důvody změn náklonnosti", () => {
  it("po zápase podle výsledku a se skóre", () => {
    expect(postMatchFavorReason(3, 1)).toBe("viděl výhru 3:1");
    expect(postMatchFavorReason(1, 1)).toBe("viděl remízu 1:1");
    expect(postMatchFavorReason(0, 2)).toBe("viděl prohru 0:2");
  });

  it("žádný důvod neobsahuje dlouhou pomlčku", () => {
    for (const r of Object.values(FAVOR_REASONS)) expect(r).not.toContain("—");
  });
});
