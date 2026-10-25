import { describe, expect, it } from "vitest";
import { createRng } from "../generators/rng";
import {
  fallbackPitchDecision, pitchGuardViolation, pitchOptions, pitchSchema, renderPitchPrompt, validatePitchReply,
  type PitchCandidate, type PitchContext,
} from "./demand-pitch-decision";
import type { AiCoachProfile } from "./profile";

const PROFILE: AiCoachProfile = {
  version: 1, ambition: 60, thrift: 40, youthFocus: 50, risk: 50, trading: 60, building: 50, patience: 50,
  favouriteTactic: "balanced", favouriteFormations: ["4-4-2"],
};

function candidate(over: Partial<PitchCandidate> & { pitchId: string }): PitchCandidate {
  return {
    playerId: `pl-${over.pitchId}`, position: "FWD", age: 25, rating: 55, marketValue: 20_000, fits: true,
    maxPrice: 26_000, openingBid: 21_000, ...over,
  };
}

const keysOf = (ids: string[]) => new Map(ids.map((id, i) => [`P${i + 1}`, id]));

describe("hráči nabídnutí k poptávce: meze kódu", () => {
  it("vzít jde jen hráče, který poptávku splní a na kterého AI má; nabídka od 70 % tržní hodnoty do stropu", () => {
    const o = pitchOptions([
      candidate({ pitchId: "ok" }),
      candidate({ pitchId: "misfit", fits: false }),
      // Strop pod 90 % tržní hodnoty: nabídka by urážela.
      candidate({ pitchId: "pricey", maxPrice: 17_000 }),
    ], 2, 100_000);
    expect(o.eligible).toEqual([{ pitchId: "ok", min: 14_000, max: 26_000 }]);
    expect(o.slots).toBe(2);
    // Strop nikdy nad peníze nad rezervou.
    expect(pitchOptions([candidate({ pitchId: "ok" })], 2, 22_050).eligible[0].max).toBe(22_000);
  });

  it("náhradní pravidlo vezme vhodné v pořadí za první nabídku, dokud stačí místa a peníze; ostatní počkají", () => {
    const candidates = [candidate({ pitchId: "a" }), candidate({ pitchId: "b" }), candidate({ pitchId: "c" })];
    expect(fallbackPitchDecision(candidates, pitchOptions(candidates, 2, 100_000)))
      .toEqual({ picks: [{ pitchId: "a", amount: 21_000 }, { pitchId: "b", amount: 21_000 }], deferred: ["c"] });
    expect(fallbackPitchDecision(candidates, pitchOptions(candidates, 3, 30_000)))
      .toEqual({ picks: [{ pitchId: "a", amount: 21_000 }], deferred: ["b", "c"] });
  });

  it("model smí vzít jen vhodné hráče, každého jednou, v mezích, do počtu míst a peněz", () => {
    const candidates = [candidate({ pitchId: "a" }), candidate({ pitchId: "b" }), candidate({ pitchId: "x", fits: false })];
    const o = pitchOptions(candidates, 1, 30_000);
    const keys = keysOf(o.eligible.map((b) => b.pitchId));
    expect(validatePitchReply({ offers: [], reason: "Nobody fits." }, o, keys)).toEqual({ ok: true, decision: { picks: [], deferred: [] }, reason: "Nobody fits." });
    expect(validatePitchReply({ offers: [{ player: "p2", amount: "21,049" }], reason: "x" }, o, keys))
      .toMatchObject({ ok: true, decision: { picks: [{ pitchId: "b", amount: 21_000 }] } });
    expect(validatePitchReply({ offers: [{ player: "P9", amount: 21_000 }] }, o, keys)).toMatchObject({ ok: false, error: expect.stringContaining("neznámý hráč") });
    expect(validatePitchReply({ offers: [{ player: "P1", amount: 13_000 }] }, o, keys)).toMatchObject({ ok: false, error: expect.stringContaining("mimo meze") });
    expect(validatePitchReply({ offers: [{ player: "P1", amount: 27_000 }] }, o, keys)).toMatchObject({ ok: false, error: expect.stringContaining("mimo meze") });
    expect(validatePitchReply({ offers: [{ player: "P1", amount: 21_000 }, { player: "P1", amount: 22_000 }] }, o, keys))
      .toMatchObject({ ok: false, error: expect.stringContaining("dvakrát") });
    expect(validatePitchReply({ offers: [{ player: "P1", amount: 15_000 }, { player: "P2", amount: 15_000 }] }, o, keys))
      .toMatchObject({ ok: false, error: expect.stringContaining("volná místa") });
    const wide = pitchOptions(candidates, 2, 30_000);
    expect(validatePitchReply({ offers: [{ player: "P1", amount: 16_000 }, { player: "P2", amount: 16_000 }] }, wide, keys))
      .toMatchObject({ ok: false, error: expect.stringContaining("peníze nad rezervou") });
    expect(validatePitchReply({ offers: "P1" }, o, keys).ok).toBe(false);
    expect(validatePitchReply(null, o, keys).ok).toBe(false);
  });

  it("pojistka zastaví nabídku mimo meze, navíc nebo nad peníze; náhradní pravidlo ji nikdy nespustí", () => {
    const o = pitchOptions([candidate({ pitchId: "a" }), candidate({ pitchId: "b" })], 1, 30_000);
    expect(pitchGuardViolation(o, { picks: [{ pitchId: "a", amount: 9_000 }], deferred: [] })).toContain("mimo meze");
    expect(pitchGuardViolation(o, { picks: [{ pitchId: "zz", amount: 20_000 }], deferred: [] })).toContain("nevhodného");
    expect(pitchGuardViolation(o, { picks: [{ pitchId: "a", amount: 15_000 }, { pitchId: "b", amount: 15_000 }], deferred: [] })).toContain("volná místa");
    const rng = createRng(77);
    for (let i = 0; i < 500; i++) {
      const candidates = Array.from({ length: 1 + Math.floor(rng.random() * 4) }, (_, j) => {
        const mv = 1_000 + Math.round(rng.random() * 40_000);
        const maxPrice = Math.round(mv * (0.5 + rng.random()));
        return candidate({
          pitchId: `p${i}-${j}`, marketValue: mv, maxPrice, fits: rng.random() < 0.8,
          openingBid: Math.max(500, Math.floor(Math.min(maxPrice, Math.max(mv * 0.7, maxPrice * 0.85)) / 100) * 100),
        });
      });
      const options = pitchOptions(candidates, Math.floor(rng.random() * 3), Math.round(rng.random() * 80_000));
      const decision = fallbackPitchDecision(candidates, options);
      expect(pitchGuardViolation(options, decision)).toBeNull();
      expect(decision.picks.length + decision.deferred.length).toBe(options.eligible.length);
    }
  });
});

describe("hráči nabídnutí k poptávce: popis pro model", () => {
  const candidates = [candidate({ pitchId: "a", rating: 58 }), candidate({ pitchId: "b", rating: 55, age: 30 })];
  const options = pitchOptions(candidates, 2, 120_000);
  const keys = keysOf(options.eligible.map((b) => b.pitchId));
  const ctx: PitchContext = {
    profile: PROFILE, budget: 150_000, spendable: 120_000, weeklyCosts: 4_000, squadSize: 18, targetSquad: 24,
    plan: { stance: "buy", focus: ["FWD"] },
    demand: { position: "FWD", ageMin: 18, ageMax: 30, role: "starter", maxPrice: 200_000 },
    need: 1, samePosition: [], starters: 2, formation: "4-4-2",
    candidates: [...keys].map(([key, pitchId], i) => ({
      key, position: "FWD", age: candidates[i].age, rating: candidates[i].rating, marketValue: 20_000,
      seller: { managedBy: "human" as const, sameDistrict: true }, min: options.eligible[i].min, max: options.eligible[i].max,
    })).filter((c, i) => options.eligible[i].pitchId === candidates[i].pitchId),
    unsuitable: 1,
    options,
  };

  it("schéma nabízí jen klíče vhodných hráčů a nejvýš tolik nabídek, kolik je míst", () => {
    const schema = pitchSchema(options, [...keys.keys()]) as {
      properties: { offers: { maxItems: number; items: { properties: { player: { enum: string[] }; amount: Record<string, number> } } } };
    };
    expect(schema.properties.offers.items.properties.player.enum).toEqual(["P1", "P2"]);
    expect(schema.properties.offers.maxItems).toBe(2);
    expect(schema.properties.offers.items.properties.amount).toMatchObject({ minimum: 14_000, maximum: 26_000 });
    const lonely = pitchSchema(pitchOptions([candidate({ pitchId: "a" })], 3, 50_000), ["P1"]) as { properties: { offers: { maxItems: number } } };
    expect(lonely.properties.offers.maxItems).toBe(1);
    // Výčet nikdy prázdný.
    const empty = pitchSchema(pitchOptions([], 1, 0), []) as { properties: { offers: { items: { properties: { player: { enum: string[] } } } } } };
    expect(empty.properties.offers.items.properties.player.enum.length).toBeGreaterThan(0);
  });

  it("popis má poptávku, vhodné hráče s mezemi a počet míst, žádnou dlouhou pomlčku", () => {
    const prompt = renderPitchPrompt(ctx);
    expect(prompt).toContain("YOUR DEMAND: a FWD aged 18 to 30 for your starting eleven, your price limit 200,000 CZK");
    expect(prompt).toContain('- "P1": FWD, age 25, rating 58, market value 20,000 CZK, from a club run by a human manager, from your district; you may offer 14,000 CZK to 26,000 CZK.');
    expect(prompt).toContain("(1 more offered player does not fit your demand or is too expensive for you.)");
    expect(prompt).toContain("You can make offers for at most 2 of them, 120,000 CZK in total at most.");
    expect(prompt).not.toContain("—");
  });
});
