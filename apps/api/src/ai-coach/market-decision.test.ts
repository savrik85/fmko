import { describe, expect, it } from "vitest";
import {
  emergencySigningSchema, listingPriceBounds, listingSchema, pitchSchema, renderEmergencySigningPrompt, renderListingPrompt,
  renderPitchPrompt, renderScoutPrompt, scoutAgeBandOf, scoutSchema, validateEmergencySigning, validateListing, validatePitch,
  validateScout, wageBounds,
  type EmergencySigningContext, type ListingContext, type MarketClubInfo, type PitchContext, type ScoutContext,
} from "./market-decision";
import { scoutAgesFor } from "./outside-buy";
import { generateAiProfile } from "./profile";
import { HARD_FLOOR_RATIO, reservationPrice } from "./valuation";

const PROFILE = { ...generateAiProfile("market-club", null), ambition: 55, thrift: 45, trading: 50, youthFocus: 40 };

const CLUB: MarketClubInfo = {
  teamName: "Sokol Lhota", profile: PROFILE, budget: 90_000, spendable: 60_000, squadSize: 22, targetSquad: 24,
  course: { stance: "sell", focus: [] },
};

function listingCtx(over: Partial<ListingContext> = {}): ListingContext {
  return {
    ...CLUB, slots: 2,
    options: [
      { key: "s1", position: "GK", age: 33, rating: 31, marketValue: 600, chosen: true, minPrice: 700, maxPrice: 1100 },
      { key: "s2", position: "DEF", age: 31, rating: 33, marketValue: 2600, chosen: false, minPrice: 2700, maxPrice: 4100 },
      { key: "s3", position: "FWD", age: 29, rating: 34, marketValue: 3400, chosen: false, minPrice: 3600, maxPrice: 5400 },
    ],
    ...over,
  };
}

describe("inzeráty modelem: koho a za kolik, cena nikdy pod rezervací", () => {
  it("rozpětí ceny je od rezervace do 1,5násobku a rezervace nikdy není pod pevnou pojistkou", () => {
    expect(listingPriceBounds(2700)).toEqual({ minPrice: 2700, maxPrice: 4100 });
    for (const mv of [500, 2600, 11_000, 40_000]) {
      const reservation = reservationPrice({ marketValue: mv, importance: "surplus", profile: PROFILE, playerId: `p-${mv}`, now: new Date("2026-10-25T10:00:00Z") });
      expect(listingPriceBounds(reservation).minPrice).toBeGreaterThanOrEqual(mv * HARD_FLOOR_RATIO);
    }
  });

  it("model vystaví jen nabízené hráče, každého jednou, nejvýš kolik je míst a za cenu v rozpětí", () => {
    const ctx = listingCtx();
    expect(validateListing({ list: [{ player: "s2", price: 3000 }, { player: "s1", price: 820 }], reason: "clear the bench" }, ctx))
      .toEqual({ picks: [{ key: "s2", price: 3000 }, { key: "s1", price: 800 }], reason: "clear the bench" });
    expect(validateListing({ list: [], reason: "keep everyone" }, ctx)).toEqual({ picks: [], reason: "keep everyone" });
    // Pod rezervací (na pevné pojistce 60 %), nad stropem, neznámý hráč, dvakrát týž, víc než míst: neplatí.
    expect(validateListing({ list: [{ player: "s2", price: 1600 }], reason: "" }, ctx)).toBeNull();
    expect(validateListing({ list: [{ player: "s2", price: 4200 }], reason: "" }, ctx)).toBeNull();
    expect(validateListing({ list: [{ player: "s9", price: 3000 }], reason: "" }, ctx)).toBeNull();
    expect(validateListing({ list: [{ player: "s2", price: 3000 }, { player: "s2", price: 3100 }], reason: "" }, ctx)).toBeNull();
    expect(validateListing({ list: [{ player: "s1", price: 800 }, { player: "s2", price: 3000 }, { player: "s3", price: 4000 }], reason: "" }, ctx)).toBeNull();
    expect(validateListing({ list: "s1", reason: "" }, ctx)).toBeNull();
  });

  it("popis a schéma: rozpětí ceny, počet míst, hráč vybraný v pondělí", () => {
    const prompt = renderListingPrompt(listingCtx());
    expect(prompt).toContain("you can list at most 2 more right now");
    expect(prompt).toContain('"s1": GK, age 33, rating 31, market value 600 CZK; you picked him to sell in your Monday review. Asking price between 700 CZK and 1,100 CZK.');
    expect(prompt).toContain("TRANSFER COURSE this week (your Monday review): sell.");
    const schema = listingSchema(listingCtx()) as { properties: { list: { items: { properties: { player: { enum: string[] } } } } } };
    expect(schema.properties.list.items.properties.player.enum).toEqual(["s1", "s2", "s3"]);
  });
});

function pitchCtx(): PitchContext {
  return {
    ...CLUB,
    options: [
      {
        key: "p1", demand: { position: "DEF", ageMin: 25, ageMax: 33, minRating: null, maxPrice: 5000, club: "outside" },
        player: { position: "DEF", age: 31, rating: 33, marketValue: 2600 },
      },
      {
        key: "p2", demand: { position: "FWD", ageMin: 22, ageMax: 30, minRating: 32, maxPrice: null, club: "human" },
        player: { position: "FWD", age: 29, rating: 34, marketValue: 3400 },
      },
    ],
  };
}

describe("nabídka hráče k poptávce modelem", () => {
  it("jen nabízená dvojice, nebo nic", () => {
    const ctx = pitchCtx();
    expect(validatePitch({ choice: "p2", reason: "he fits" }, ctx)).toEqual({ key: "p2", reason: "he fits" });
    expect(validatePitch({ choice: "none", reason: "keep him" }, ctx)).toEqual({ key: null, reason: "keep him" });
    expect(validatePitch({ choice: "p3", reason: "" }, ctx)).toBeNull();
    expect(validatePitch({ reason: "" }, ctx)).toBeNull();
    expect((pitchSchema(ctx) as { properties: { choice: { enum: string[] } } }).properties.choice.enum).toEqual(["p1", "p2", "none"]);
  });

  it("popis: kdo poptává a co chce, u klubu mimo hru bez prahu hodnocení", () => {
    const prompt = renderPitchPrompt(pitchCtx());
    expect(prompt).toContain('"p1": offer your DEF, age 31, rating 33, market value 2,600 CZK, to a club outside the game from your district');
    expect(prompt).toContain("its rating requirement is not public");
    expect(prompt).toContain("They want a forward aged 22-30, rating 32 or more.");
    expect(prompt).toContain('"none": do not offer anyone today.');
  });
});

function scoutCtx(over: Partial<ScoutContext> = {}): ScoutContext {
  return {
    ...CLUB, weeks: 2,
    positions: [{ position: "MID", need: 1, missing: 3 }, { position: "DEF", need: 0.7, missing: 2 }],
    radii: [{ km: 15, weeklyCost: 1500 }, { km: 30, weeklyCost: 3000 }],
    busy: ["FWD"],
    ...over,
  };
}

describe("skaut modelem: jestli, kam a koho hledat", () => {
  it("post, okruh i věk jen ze sady, kterou dovolí kód a peníze", () => {
    const ctx = scoutCtx();
    expect(validateScout({ send: true, position: "DEF", radius: 30, ages: "experienced", reason: "need depth" }, ctx))
      .toEqual({ send: true, position: "DEF", radiusKm: 30, ages: "experienced", reason: "need depth" });
    expect(validateScout({ send: false, position: "MID", radius: 15, ages: "youth", reason: "save money" }, ctx)).toEqual({ send: false, reason: "save money" });
    // Okruh, na který nejsou peníze, post, který už jiný skaut hledá, neznámý věk: neplatí.
    expect(validateScout({ send: true, position: "MID", radius: 50, ages: "prime", reason: "" }, ctx)).toBeNull();
    expect(validateScout({ send: true, position: "FWD", radius: 15, ages: "prime", reason: "" }, ctx)).toBeNull();
    expect(validateScout({ send: true, position: "MID", radius: 15, ages: "veterans", reason: "" }, ctx)).toBeNull();
    const schema = scoutSchema(ctx) as { properties: { position: { enum: string[] }; radius: { enum: number[] }; ages: { enum: string[] } } };
    expect(schema.properties.position.enum).toEqual(["MID", "DEF"]);
    expect(schema.properties.radius.enum).toEqual([15, 30]);
    expect(schema.properties.ages.enum).toEqual(["youth", "prime", "experienced"]);
  });

  it("věk pravidla odpovídá pásmům a popis řekne cestovné i obsazené posty", () => {
    expect(scoutAgeBandOf(scoutAgesFor({ ...PROFILE, youthFocus: 80 }))).toBe("youth");
    expect(scoutAgeBandOf(scoutAgesFor({ ...PROFILE, youthFocus: 20 }))).toBe("prime");
    const prompt = renderScoutPrompt(scoutCtx());
    expect(prompt).toContain("RADIUS: 15 km for 1,500 CZK a week, 30 km for 3,000 CZK a week");
    expect(prompt).toContain("Another scout already looks for FWD.");
    expect(prompt).toContain('"youth" = 17-21 (he judges youngsters by their potential)');
  });
});

function signingCtx(): EmergencySigningContext {
  return {
    ...CLUB, squadSize: 14, minSquad: 16, emptyPosition: null,
    needs: [{ position: "MID", need: 1, missing: 3 }],
    agents: [
      { key: "a1", position: "MID", age: 24, rating: 35, askWage: 200, ...wageBounds(200) },
      { key: "a2", position: "DEF", age: 27, rating: 38, askWage: 300, ...wageBounds(300) },
    ],
  };
}

describe("nouzový podpis volného hráče modelem: podepsat se musí", () => {
  it("jen nabízený hráč a mzda od toho, co chce, nejvýš o čtvrtinu víc", () => {
    const ctx = signingCtx();
    expect(wageBounds(300)).toEqual({ minWage: 300, maxWage: 375 });
    expect(validateEmergencySigning({ choice: "a2", wage: 360, reason: "better player" }, ctx)).toEqual({ key: "a2", wage: 360, reason: "better player" });
    expect(validateEmergencySigning({ choice: "a2", wage: 299, reason: "" }, ctx)).toBeNull();
    expect(validateEmergencySigning({ choice: "a2", wage: 376, reason: "" }, ctx)).toBeNull();
    expect(validateEmergencySigning({ choice: "a3", wage: 300, reason: "" }, ctx)).toBeNull();
    // Odmítnout podpis nejde: „nic“ mezi možnostmi není.
    expect(validateEmergencySigning({ choice: "none", wage: 0, reason: "" }, ctx)).toBeNull();
    expect((emergencySigningSchema(ctx) as { properties: { choice: { enum: string[] } } }).properties.choice.enum).toEqual(["a1", "a2"]);
  });

  it("popis: proč musí podepsat a rozpětí mzdy", () => {
    const prompt = renderEmergencySigningPrompt(signingCtx());
    expect(prompt).toContain("URGENT: your senior squad has only 14 players and you never go below 16");
    expect(prompt).toContain('"a2": DEF, age 27, rating 38, asks 300 CZK a week. Offer a weekly wage between 300 CZK and 375 CZK.');
    expect(renderEmergencySigningPrompt({ ...signingCtx(), emptyPosition: "GK" })).toContain("URGENT: you have no goalkeeper at all");
  });
});
