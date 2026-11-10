/**
 * Proč AI kluby skoro nenakupovaly (audit 2026-11) a co to hlídá teď: strop ceny pro model podle
 * skutečných cen, doplnění kádru pod cílovou velikostí a pořadí postů, na které klub posilu hledá.
 */
import { describe, expect, it } from "vitest";
import { marketValue } from "@okresni-masina/shared";
import type { AiCoachProfile } from "./profile";
import { analyzeSquad, FILL_NEED, squadFillNeeds, TARGET_SENIOR_SQUAD, type SquadMember } from "./squad";
import type { AiClubState } from "./transfer-club";
import { buyNeedsFor, type WeeklyTransferPlan } from "./transfer-market";
import { buyCeiling, MARKET_BUY_CAP, maxBuyPrice } from "./valuation";

const NOW = new Date("2026-11-09T12:00:00.000Z");
const DAY_MS = 86_400_000;

function profile(over: Partial<AiCoachProfile> = {}): AiCoachProfile {
  return {
    version: 1, ambition: 50, thrift: 50, youthFocus: 50, risk: 50, trading: 50, building: 50, patience: 50,
    favouriteTactic: "balanced", favouriteFormations: ["4-4-2"], ...over,
  };
}

function member(id: string, position: SquadMember["position"], rating: number): SquadMember {
  return { id, position, rating, age: 26, rosterTeamId: "club", isU21Roster: false, loanedIn: false, injured: false };
}

/** Kádr 4-4-2 s plnou hloubkou: 2 brankáři, 6 obránců, 6 záložníků, 3 útočníci (17) a pár hráčů navíc. */
function squad(extra: SquadMember[] = []): SquadMember[] {
  const out: SquadMember[] = [member("gk1", "GK", 50), member("gk2", "GK", 44)];
  [55, 52, 50, 48, 44, 40].forEach((r, i) => out.push(member(`def${i + 1}`, "DEF", r)));
  [54, 51, 49, 47, 43, 41].forEach((r, i) => out.push(member(`mid${i + 1}`, "MID", r)));
  [53, 50, 45].forEach((r, i) => out.push(member(`fwd${i + 1}`, "FWD", r)));
  return [...out, ...extra];
}

function club(members: SquadMember[], over: Partial<AiClubState> = {}): AiClubState {
  const p = profile();
  return {
    teamId: "ai-club", name: "Sokol Lhota", budget: 150_000, leagueId: "league", district: "Test", userId: "ai", profile: p,
    members, analysis: analyzeSquad(members, p), weeklyCosts: 5000, reserve: 30_000, spendable: 120_000,
    dealsLast30: 0, dealLimit: 3, overDealLimit: false, buysLast30: 0, overBuyLimit: false, ...over,
  };
}

const plan = (over: Partial<WeeklyTransferPlan> = {}): WeeklyTransferPlan => ({ stance: "hold", focus: [], sellIds: [], fill: "none", ...over });

describe("strop ceny pro model podle skutečných cen na trhu", () => {
  it("strop je 1,5 tržní hodnoty a peníze nad rezervou, ať je povaha jakákoli", () => {
    const mv = 20_000;
    expect(buyCeiling({ marketValue: mv, spendable: 1_000_000 })).toBe(mv * MARKET_BUY_CAP);
    expect(buyCeiling({ marketValue: mv, spendable: 12_345 })).toBe(12_300);
    expect(buyCeiling({ marketValue: mv, spendable: 0 })).toBe(0);
    // Dřívější strop pravidla ležel u běžné potřeby (0,3) šetrného trenéra pod 90 % tržní hodnoty:
    // kandidát vypadl dřív, než ho model uviděl.
    const thrifty = profile({ ambition: 20, thrift: 90 });
    expect(maxBuyPrice({ marketValue: mv, need: 0.3, profile: thrifty, playerId: "p", now: NOW, spendable: 1_000_000 })).toBeLessThan(mv * 0.9);
  });

  it("hlášení skauta: strop sahá ke skautovu odhadu ceny, nejvýš k hodnotě při horním odhadu hodnocení", () => {
    // Obránce 19 let, odhad 39 až 61, klub si řekne 148 000 (hlášení z produ 2. 11.).
    const mid = marketValue(50, 19, "DEF");
    const hi = marketValue(61, 19, "DEF");
    expect(148_000).toBeGreaterThan(mid * MARKET_BUY_CAP);
    const cap = buyCeiling({ marketValue: mid, spendable: 1_000_000, scoutAskHint: 148_000, optimisticValue: hi });
    expect(cap).toBeGreaterThanOrEqual(148_000);
    expect(cap).toBeLessThanOrEqual(hi);
    // Přestřelená cena: útočník 18 let, odhad 36 až 64, klub chce 473 000. Nad hodnotu horního odhadu strop nejde.
    const top = marketValue(64, 18, "FWD");
    expect(buyCeiling({ marketValue: marketValue(50, 18, "FWD"), spendable: 1_000_000, scoutAskHint: 473_000, optimisticValue: top })).toBe(top);
    // Bez odhadu ceny platí obecný strop.
    expect(buyCeiling({ marketValue: 20_000, spendable: 1_000_000, scoutAskHint: null, optimisticValue: 90_000 })).toBe(30_000);
  });
});

describe("doplnění kádru pod cílovou velikostí", () => {
  it("s plnou hloubkou a 17 hráči nabídne posty k doplnění; hráč do šířky má být jako poslední z hloubky", () => {
    const analysis = analyzeSquad(squad(), profile());
    expect(analysis.seniorOwnCount).toBe(17);
    expect(analysis.needs.every((n) => n.upgrade)).toBe(true);
    const fill = squadFillNeeds(analysis);
    expect(fill.map((n) => n.position).sort()).toEqual(["DEF", "FWD", "GK", "MID"]);
    for (const n of fill) expect(n).toMatchObject({ fill: true, need: FILL_NEED, missing: 0 });
    expect(fill.find((n) => n.position === "DEF")?.minRating).toBe(40);
    expect(fill.find((n) => n.position === "GK")?.minRating).toBe(44);
  });

  it("kádr na cílové velikosti se nedoplňuje", () => {
    const extra = Array.from({ length: TARGET_SENIOR_SQUAD - 17 }, (_, i) => member(`x${i}`, "MID", 38));
    expect(squadFillNeeds(analyzeSquad(squad(extra), profile()))).toEqual([]);
  });

  it("doplnění hledá trh jen tehdy, když ho trenér v pondělí zvolil; pravidlo ho samo nezvolí", () => {
    const c = club(squad());
    expect(buyNeedsFor(c, plan({ fill: "none" }), NOW).some((n) => n.fill)).toBe(false);
    expect(buyNeedsFor(c, plan(), NOW).some((n) => n.fill)).toBe(false);
    expect(buyNeedsFor(c, null, NOW).some((n) => n.fill)).toBe(false);
    const filled = buyNeedsFor(c, plan({ fill: "both" }), NOW);
    expect(filled.filter((n) => n.fill)).toHaveLength(4);
    // Doplnění (0,4) jde před zlepšením základu (0,3).
    expect(filled[0].fill).toBe(true);
  });
});

describe("na který post klub posilu hledá", () => {
  it("při shodné potřebě nevyhrává pořád brankář: pořadí postů se den ode dne střídá", () => {
    const c = club(squad());
    const firsts = new Set<string>();
    for (let d = 0; d < 30; d++) firsts.add(buyNeedsFor(c, plan(), new Date(NOW.getTime() + d * DAY_MS))[0].position);
    expect(firsts.size).toBeGreaterThanOrEqual(3);
    // Týž den je pořadí stejné (opakovaný běh nic nezmění).
    expect(buyNeedsFor(c, plan(), NOW).map((n) => n.position)).toEqual(buyNeedsFor(c, plan(), NOW).map((n) => n.position));
  });

  it("posty z pondělního kurzu „kupovat“ jdou první", () => {
    const c = club(squad());
    for (let d = 0; d < 10; d++) {
      const needs = buyNeedsFor(c, plan({ stance: "buy", focus: ["FWD"] }), new Date(NOW.getTime() + d * DAY_MS));
      expect(needs[0].position).toBe("FWD");
    }
  });
});
