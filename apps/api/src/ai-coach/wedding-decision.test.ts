import { describe, expect, it } from "vitest";
import { WEDDING_GIFT_DEFAULT } from "../weddings/wedding";
import { generateAiProfile, type AiCoachProfile } from "./profile";
import {
  affordableGifts, checkWeddingDecision, fallbackWeddingDecision, renderWeddingPrompt, weddingSchema,
  type WeddingDecisionContext,
} from "./wedding-decision";

function profile(over: Partial<AiCoachProfile> = {}): AiCoachProfile {
  return { ...generateAiProfile("ai-club", null), thrift: 50, ambition: 50, ...over };
}

function ctx(over: Partial<WeddingDecisionContext> = {}): WeddingDecisionContext {
  return {
    teamName: "TJ Netolice", profile: profile(), budget: 40_000, reserve: 20_000,
    groom: { name: "Franta Ženich", age: 28, position: "MID" },
    weddingDay: "2026-11-20", matchNextDay: true, absentIfFull: 3, absentIfAttend: 1,
    giftOptions: affordableGifts(40_000, 20_000),
    ...over,
  };
}

describe("svatba hráče AI klubu: nabídka pro model", () => {
  it("popis obsahuje ženicha, den, zápas druhý den a dopady všech tří cest", () => {
    const p = renderWeddingPrompt(ctx());
    expect(p).toContain("Franta Ženich");
    expect(p).toContain("2026-11-20");
    expect(p).toContain("day before a league match");
    expect(p).toContain("3 players");
    expect(p).toContain("1 player ");
    expect(p).toMatch(/"attend"[\s\S]*"gift"[\s\S]*"ban"/);
    expect(p).toContain("1,000 CZK");
  });

  it("bez zápasu druhý den o zápase nemluví", () => {
    expect(renderWeddingPrompt(ctx({ matchNextDay: false, absentIfFull: 0, absentIfAttend: 0 }))).not.toContain("day before a league match");
  });

  it("dar jen nad rezervou", () => {
    expect(affordableGifts(40_000, 20_000)).toEqual([1000, 2000, 5000]);
    expect(affordableGifts(22_500, 20_000)).toEqual([1000, 2000]);
    expect(affordableGifts(10_000, 20_000)).toEqual([]);
    const schema = weddingSchema(ctx()) as { properties: { choice: { enum: string[] } } };
    expect(schema.properties.choice.enum).toEqual(["attend", "gift", "ban"]);
    expect((weddingSchema(ctx({ giftOptions: [] })) as { properties: { choice: { enum: string[] } } }).properties.choice.enum).toEqual(["attend", "ban"]);
  });
});

describe("kontrola odpovědi modelu", () => {
  it("platná rozhodnutí projdou", () => {
    expect(checkWeddingDecision({ choice: "ban", gift: null, reason: "Big match." }, ctx())).toEqual({ ok: true, decision: { choice: "ban", giftAmount: null, reason: "Big match." } });
    expect(checkWeddingDecision({ choice: "gift", gift: 5000, reason: "" }, ctx())).toMatchObject({ ok: true, decision: { choice: "gift", giftAmount: 5000 } });
    expect(checkWeddingDecision({ choice: "attend", gift: 2000, reason: "" }, ctx())).toMatchObject({ ok: true, decision: { choice: "attend", giftAmount: null } });
  });

  it("dar bez částky dostane obvyklou, když na něj klub má", () => {
    expect(checkWeddingDecision({ choice: "gift", gift: null, reason: "" }, ctx())).toMatchObject({ ok: true, decision: { giftAmount: WEDDING_GIFT_DEFAULT } });
  });

  it("dar nad možnosti, neznámá volba nebo nesmysl neprojdou", () => {
    expect(checkWeddingDecision({ choice: "gift", gift: 9000, reason: "" }, ctx()).ok).toBe(false);
    expect(checkWeddingDecision({ choice: "gift", gift: 1000, reason: "" }, ctx({ giftOptions: [] })).ok).toBe(false);
    expect(checkWeddingDecision({ choice: "elope", reason: "" }, ctx()).ok).toBe(false);
    expect(checkWeddingDecision("ban", ctx()).ok).toBe(false);
  });
});

describe("náhradní pravidlo podle povahy", () => {
  it("ambiciózní trenér před zápasem s víc pijáky zakáže pít", () => {
    expect(fallbackWeddingDecision(ctx({ profile: profile({ ambition: 75 }) })).choice).toBe("ban");
  });

  it("štědrý trenér pošle dar, když na něj klub má", () => {
    expect(fallbackWeddingDecision(ctx({ profile: profile({ thrift: 20, ambition: 30 }) }))).toMatchObject({ choice: "gift", giftAmount: 2000 });
    expect(fallbackWeddingDecision(ctx({ profile: profile({ thrift: 20, ambition: 30 }), giftOptions: [] })).choice).toBe("attend");
  });

  it("jinak přijde a pohlídá kluky", () => {
    expect(fallbackWeddingDecision(ctx()).choice).toBe("attend");
    expect(fallbackWeddingDecision(ctx({ profile: profile({ ambition: 75 }), matchNextDay: false })).choice).toBe("attend");
  });
});
