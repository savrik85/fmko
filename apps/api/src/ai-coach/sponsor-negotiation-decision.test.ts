/**
 * Jednání AI klubu se sponzorem modelem: přípustné tahy, meze vlastního návrhu, sliby, které AI
 * opravdu dodrží, kontrola odpovědi modelu, schéma a náhradní pravidlo (bez databáze).
 */
import { describe, expect, it } from "vitest";
import { NO_LEAGUE_MOVEMENT } from "../league/district-promotion";
import type { NegotiationContext, Proposal } from "../sponsors/negotiation";
import type { Negotiation, NegotiationRound } from "../sponsors/negotiation-db";
import { validateProposal } from "../sponsors/proposal";
import { generateAiProfile } from "./profile";
import {
  aiPromiseChoices, checkSponsorTalks, counterBounds, counterProposal, fallbackSponsorTalks, MAX_AI_COUNTERS, promiseKeep,
  renderSponsorTalksPrompt, sponsorTalksContext, sponsorTalksMoves, sponsorTalksSchema,
  type SponsorTalksContext,
} from "./sponsor-negotiation-decision";

/** Fanoušek, 14 klubů, čeká se 7. místo, pohár na 7 kol, loni průměrně 200 diváků, B = 10 000 Kč. */
const DEAL: NegotiationContext = {
  category: "main", personality: "fan", wishes: [], budgetB: 10000, season: 3, leagueTeams: 14,
  expectedPosition: 7, cupTotalRounds: 7, lastAvgAttendance: 200, reputation: 50, licenceLevel: 1,
  sponsorType: "pub", sectorBannerActive: false, sleeveHeldBySponsor: false,
  facilities: [{ facility: "stands", currentLevel: 1, locked: false, costs: [0, 55000, 170000, 450000] }],
  equipment: [], currentTerminationFee: 0, seasonProgressMonths: 0, leagueMovement: NO_LEAGUE_MOVEMENT,
};

const OPENING: Proposal = {
  seasons: 2,
  promises: [{ kind: "youth", params: { count: 2 } }],
  demands: { monthly: 9500, winBonus: 0, signingBonus: 12000, goalBonuses: {}, construction: null, equipment: null, payCurrentFee: false },
};

function round(kind: NegotiationRound["response"]["kind"], proposal: Proposal, extra: Partial<NegotiationRound["response"]> = {}): NegotiationRound {
  return { proposal, response: { kind, text: "x", gameDate: "2026-11-02T16:00:00.000Z", ...extra } };
}

function negotiation(rounds: NegotiationRound[], over: Partial<Negotiation> = {}): Negotiation {
  return {
    id: "n1", teamId: "t1", sponsorId: 7, category: "main", wishes: [], budgetB: 10000, patience: 4, rounds,
    roundsRaw: JSON.stringify(rounds), status: "open", expiresGameDate: "2026-11-09T16:00:00.000Z", cooldownUntil: null, ...over,
  };
}

function talks(rounds: NegotiationRound[] = [round("offer", OPENING, { counter: OPENING })], over: Partial<Negotiation> = {}, deal = DEAL): SponsorTalksContext {
  return sponsorTalksContext({
    neg: negotiation(rounds, over), deal, owner: "fan", favor: 50, sponsorName: "Hospoda U Lípy", sponsorType: "pub",
    renewal: false, gameDate: "2026-11-02T16:00:00.000Z", teamName: "Sokol Testov", budget: 80_000,
    profile: generateAiProfile("team-talks", null),
  });
}

describe("sliby, které AI opravdu dodrží", () => {
  it("exkluzivitu oboru hlídá hra, logo na rukávu jen u stadionu, licence, stavba, mladí a fanoušci AI nemá jak", () => {
    expect(promiseKeep("sector_exclusivity", "main")).toBe("kept");
    expect(promiseKeep("jersey_logo", "stadium")).toBe("kept");
    expect(promiseKeep("jersey_logo", "main")).toBe("out_of_hand");
    expect(promiseKeep("league_position", "main")).toBe("results");
    for (const kind of ["coach_licence", "stadium_upgrade", "youth", "no_riots"] as const) expect(promiseKeep(kind, "main")).toBe("out_of_hand");
  });

  it("nabídka: výsledky jen se šancí aspoň 70 %, od druhu jeden s největším přínosem, nic, co AI nedodrží", () => {
    const choices = aiPromiseChoices(DEAL, 50);
    expect(choices.map((c) => [c.key, c.spec.kind, c.spec.params])).toEqual([
      // 8. místo je první pozice pod očekávaným 7. se šancí nad 70 %, 3. kolo poháru taky; 4. kolo už ne.
      ["P1", "league_position", { position: 8 }],
      ["P2", "cup_round", { round: 3 }],
      ["P3", "sector_exclusivity", { sector: "pub" }],
      // 90 % loňské návštěvy (šance přesně 70 %); celý loňský průměr má jen 65 %.
      ["P4", "attendance", { attendance: 180 }],
    ]);
    expect(choices.every((c) => c.chance >= 0.7 - 1e-9)).toBe(true);
  });

  it("postup ani nesestup AI nikdy nenabídne, ani když je liga má", () => {
    const kinds = aiPromiseChoices({ ...DEAL, leagueMovement: { promotion: true, relegation: true }, expectedPosition: 1 }, 50).map((c) => c.spec.kind);
    expect(kinds).not.toContain("promotion");
    expect(kinds).not.toContain("no_relegation");
  });

  it("u stadionu nabídne logo na rukávu, když ho rukáv ještě nenese", () => {
    expect(aiPromiseChoices({ ...DEAL, category: "stadium" }, 50).map((c) => c.spec.kind)).toContain("jersey_logo");
    expect(aiPromiseChoices({ ...DEAL, category: "stadium", sleeveHeldBySponsor: true }, 50).map((c) => c.spec.kind)).not.toContain("jersey_logo");
  });
});

describe("meze vlastního návrhu", () => {
  it("měsíčně od spodku odhadu bez slibů po odhad se všemi sliby AI, podpis do dvou měsíců horní meze", () => {
    const b = counterBounds({ ctx: DEAL, favor: 50, pending: null, countersLeft: 2 });
    // Odhad bez slibů 9 075 až 12 925 Kč, sliby AI přidají nahoře 3 707 Kč (strop se sliby 23 500 Kč).
    expect(b).toMatchObject({ seasons: [1, 2, 3], monthly: { min: 9000, max: 16600 }, signingBonus: { min: 0, max: 33200 }, countersLeft: 2 });
  });

  it("na stole míň než spodek odhadu: spodní mez je to, co je na stole; vyšší podpis na stole zvedne horní mez podpisu", () => {
    const pending = { ...OPENING, demands: { ...OPENING.demands, monthly: 5000, signingBonus: 50_000 } };
    expect(counterBounds({ ctx: DEAL, favor: 50, pending, countersLeft: 1 })).toMatchObject({ monthly: { min: 5000 }, signingBonus: { max: 50_000 } });
  });

  it("došly protinávrhy: další návrh nejde", () => {
    expect(counterBounds({ ctx: DEAL, favor: 50, pending: OPENING, countersLeft: 0 })).toBeNull();
  });
});

describe("tahy jednání", () => {
  it("na úvodní nabídku: podepsat, smlouvat, nebo odejít", () => {
    const c = talks();
    expect(sponsorTalksMoves(c)).toEqual(["sign", "counter", "walk_away"]);
    expect(c.table).toMatchObject({ seasons: 2, monthly: 9500, signingBonus: 12000 });
    expect(c.counter?.countersLeft).toBe(MAX_AI_COUNTERS);
  });

  it("po dvou vlastních návrzích už jen podepsat, nebo odejít (strop kol)", () => {
    const mine = { ...OPENING, promises: [], demands: { ...OPENING.demands, monthly: 11000 } };
    const c = talks([round("offer", OPENING, { counter: OPENING }), round("reject", mine), round("accept", mine)], { status: "accepted" });
    expect(c.counter).toBeNull();
    expect(sponsorTalksMoves(c)).toEqual(["sign", "walk_away"]);
    expect(c.table?.monthly).toBe(11000);
  });

  it("bez nabídky na stole a bez dalšího návrhu zbývá jen odejít", () => {
    const mine = { ...OPENING, promises: [] };
    const c = talks([round("reject", mine), round("reject", mine)]);
    expect(sponsorTalksMoves(c)).toEqual(["walk_away"]);
    expect(fallbackSponsorTalks(c)).toEqual({ move: "walk_away", reason: "fallback" });
  });

  it("náhradní pravidlo: dosavadní chování, podepsat, co je na stole", () => {
    expect(fallbackSponsorTalks(talks())).toEqual({ move: "sign", reason: "fallback" });
  });
});

describe("kontrola odpovědi modelu", () => {
  const c = talks();
  const counter = { move: "counter", seasons: 2, monthly: 12_000, signingBonus: 10_000, promises: ["P3", "P1"], reason: " more money " };

  it("podpis a odchod projdou vždy, když jsou mezi tahy", () => {
    expect(checkSponsorTalks({ move: "sign", reason: "fair" }, c)).toEqual({ ok: true, decision: { move: "sign", reason: "fair" } });
    expect(checkSponsorTalks({ move: "WALK_AWAY" }, c)).toEqual({ ok: true, decision: { move: "walk_away", reason: "" } });
  });

  it("protinávrh v mezích: návrh ve tvaru webu, který projde validací jako návrh člověka", () => {
    const check = checkSponsorTalks(counter, c);
    expect(check).toEqual({ ok: true, decision: { move: "counter", seasons: 2, monthly: 12_000, signingBonus: 10_000, promiseKeys: ["P3", "P1"], reason: "more money" } });
    if (!check.ok || check.decision.move !== "counter") throw new Error("čekal se protinávrh");
    const proposal = counterProposal(check.decision, c);
    expect(proposal.promises).toEqual([{ kind: "sector_exclusivity", params: { sector: "pub" } }, { kind: "league_position", params: { position: 8 } }]);
    expect(validateProposal(proposal, DEAL)).toEqual({ ok: true, proposal });
  });

  it("peníze nebo délka mimo meze: neplatné", () => {
    expect(checkSponsorTalks({ ...counter, monthly: 99_999 }, c)).toMatchObject({ ok: false, reason: expect.stringContaining("mimo meze") });
    expect(checkSponsorTalks({ ...counter, monthly: 8_000 }, c).ok).toBe(false);
    expect(checkSponsorTalks({ ...counter, signingBonus: -1 }, c).ok).toBe(false);
    expect(checkSponsorTalks({ ...counter, signingBonus: 40_000 }, c).ok).toBe(false);
    expect(checkSponsorTalks({ ...counter, seasons: 4 }, c).ok).toBe(false);
    expect(checkSponsorTalks({ ...counter, monthly: "lots" }, c).ok).toBe(false);
  });

  it("neznámý tah nebo tah, který teď nejde: neplatné", () => {
    expect(checkSponsorTalks({ move: "haggle" }, c)).toMatchObject({ ok: false, reason: expect.stringContaining("nepřípustný tah") });
    const noCounter = talks([round("offer", OPENING, { counter: OPENING }), round("reject", OPENING), round("reject", OPENING)]);
    expect(checkSponsorTalks(counter, noCounter).ok).toBe(false);
    expect(checkSponsorTalks(null, c).ok).toBe(false);
    expect(checkSponsorTalks(["sign"], c).ok).toBe(false);
  });

  it("sliby jen z nabídnutých klíčů: slib, který AI nedodrží, ani druh slibu místo klíče neprojde", () => {
    expect(checkSponsorTalks({ ...counter, promises: ["P9"] }, c)).toMatchObject({ ok: false, reason: expect.stringContaining("není v nabídce") });
    expect(checkSponsorTalks({ ...counter, promises: ["youth"] }, c).ok).toBe(false);
    expect(checkSponsorTalks({ ...counter, promises: "P1" }, c).ok).toBe(false);
    // Sezónní slib na smlouvu na jednu sezónu neplatí od příští sezóny ani jednou.
    expect(checkSponsorTalks({ ...counter, seasons: 1, promises: ["P1"] }, c)).toMatchObject({ ok: false, reason: expect.stringContaining("2 sezóny") });
    // Exkluzivita oboru sezónní není, jde i na jednu sezónu; opakovaný klíč se jen sloučí.
    expect(checkSponsorTalks({ ...counter, seasons: 1, promises: ["p3", "P3"] }, c)).toMatchObject({ ok: true, decision: { promiseKeys: ["P3"] } });
  });
});

describe("schéma a popis pro model", () => {
  it("enumy nikdy nejsou prázdné: sliby bez nabídky bez enumu, tahy aspoň odchod", () => {
    const schema = sponsorTalksSchema(talks()) as { properties: Record<string, { enum?: unknown[]; items?: { enum?: string[] } }>; required: string[] };
    expect(schema.properties.move.enum).toEqual(["sign", "counter", "walk_away"]);
    expect(schema.properties.seasons.enum).toEqual([1, 2, 3]);
    expect(schema.properties.promises.items?.enum).toEqual(["P1", "P2", "P3", "P4"]);
    expect(schema.required).toEqual(["move", "seasons", "monthly", "signingBonus", "promises", "reason"]);

    const mine = { ...OPENING, promises: [] };
    const only = sponsorTalksSchema(talks([round("reject", mine), round("reject", mine)])) as typeof schema;
    expect(only.properties.move.enum).toEqual(["walk_away"]);
    expect(only.properties.promises.items?.enum).toBeUndefined();
    expect(only.properties.seasons.enum?.length).toBeGreaterThan(0);
  });

  it("popis úvodní nabídky: co je na stole, jak AI který slib dodrží, meze a sliby s klíči", () => {
    const prompt = renderSponsorTalksPrompt(talks());
    expect(prompt).toContain("TALKS with Hospoda U Lípy (pub) about becoming your main sponsor");
    expect(prompt).toContain("ON THE TABLE (you can sign it now): 2 seasons (7.4 months of payments), 9,500 CZK a month, signing bonus 12,000 CZK.");
    // Slib z přání majitele, který AI nemá jak splnit: model to ví, než podepíše.
    expect(prompt).toContain("on average 2 players aged 21 or younger in your starting eleven: penalty");
    expect(prompt).toContain("your lineups pick the strongest players, so expect to break it");
    expect(prompt).toContain('"counter": propose your own terms; you can do it 2 more times. Seasons: one of 1, 2, 3. Monthly money: 9,000 CZK to 16,600 CZK.');
    expect(prompt).toContain('- "P3": no banner of another pub company');
    expect(prompt).toContain("kept for sure: the game itself will not let you sign such a banner");
    expect(prompt).toContain("he rates the chance at about 72 %");
    expect(prompt).toContain('"walk_away"');
    expect(prompt).not.toMatch(/[—–]/);
  });

  it("popis po protinabídce: dosavadní kola a na stole protinabídka majitele", () => {
    const mine: Proposal = { ...OPENING, promises: [], demands: { ...OPENING.demands, monthly: 14_000 } };
    const reduced: Proposal = { ...mine, demands: { ...mine.demands, monthly: 11_000 } };
    const prompt = renderSponsorTalksPrompt(talks([
      round("offer", OPENING, { counter: OPENING }),
      round("counter_money", mine, { counter: reduced, complaint: "Měsíčně 14 000 Kč je nad moje možnosti." }),
    ]));
    expect(prompt).toContain("ON THE TABLE (you can sign it now): 2 seasons (7.4 months of payments), 11,000 CZK a month");
    expect(prompt).toContain("- his opening offer: 2 seasons, 9,500 CZK a month, signing bonus 12,000 CZK");
    expect(prompt).toContain("- you proposed 2 seasons, 14,000 CZK a month, signing bonus 12,000 CZK, no promises; he countered with 2 seasons, 11,000 CZK a month");
    expect(prompt).toContain('"counter": propose your own terms; you can do it 1 more time.');
    expect(prompt).not.toMatch(/[—–]/);
  });

  it("prodloužení a název stadionu mají vlastní popis", () => {
    const stadium = sponsorTalksContext({
      neg: negotiation([round("offer", OPENING, { counter: OPENING })], { category: "stadium" }), deal: { ...DEAL, category: "stadium" },
      owner: "businessman", favor: 50, sponsorName: "Pila Dvořák", sponsorType: "woodwork", renewal: true,
      gameDate: "2026-11-02T16:00:00.000Z", teamName: "Sokol Testov", budget: 80_000, profile: generateAiProfile("team-talks", null),
    });
    expect(renderSponsorTalksPrompt(stadium)).toContain("about renewing its naming of your stadium");
  });
});
