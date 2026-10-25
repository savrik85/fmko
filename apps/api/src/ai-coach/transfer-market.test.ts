import { describe, expect, it } from "vitest";
import type { Bindings } from "../index";
import {
  buyChoiceKeys, buyNegotiationBounds, buyNegotiationSchema, buyPickSchema, CASH_TERMS, hasBuyChoice, minimumBid,
  renderBuyNegotiationPrompt, renderBuyPickPrompt, validateBuyNegotiation, validateBuyPick,
  type BuyNegotiationContext, type BuyPickContext,
} from "./buy-decision";
import { decideBuyerReplyByModel, type BuyerReplyInput } from "./buy-model";
import { outsideRuleDecision } from "./outside-buy";
import { generateAiProfile } from "./profile";
import { AI_TO_AI_CHANCE, buyThreshold, marketDayChance, marketHour } from "./transfer-market";
import { maxCounterRounds, monthlyDealLimit, openDealLimit } from "./valuation";
import { pragueDay, pragueHour, parseDbTime } from "./transfer-club";

describe("přestupní kurz z pondělní správy", () => {
  it("bez kurzu kupuje od potřeby 0,3, s kurzem „kupovat“ na vybraný post dřív", () => {
    expect(buyThreshold("FWD", null)).toBe(0.3);
    const buy = { stance: "buy" as const, focus: ["FWD"], sellIds: [] };
    expect(buyThreshold("FWD", buy)).toBe(0.15);
    expect(buyThreshold("DEF", buy)).toBe(0.3);
  });

  it("„držet“ a „prodávat“ kupují jen na prázdné místo v základu", () => {
    expect(buyThreshold("FWD", { stance: "hold", focus: ["FWD"], sellIds: [] })).toBe(0.65);
    expect(buyThreshold("MID", { stance: "sell", focus: [], sellIds: ["p1"] })).toBe(0.65);
  });
});

describe("rozvrh AI klubu na trhu", () => {
  it("každý klub se na trh dívá v jinou hodinu mezi 9 a 19 a vždy ve stejnou", () => {
    const hours = new Set<number>();
    for (let i = 0; i < 200; i++) {
      const h = marketHour(`team-${i}`);
      expect(h).toBeGreaterThanOrEqual(9);
      expect(h).toBeLessThanOrEqual(19);
      expect(marketHour(`team-${i}`)).toBe(h);
      hours.add(h);
    }
    // Kluby se rozprostřou přes den, nechodí všechny naráz.
    expect(hours.size).toBeGreaterThanOrEqual(8);
  });

  it("obchodník chodí na trh častěji a smí uzavřít víc obchodů", () => {
    const calm = { ...generateAiProfile("calm", null), trading: 10 };
    const trader = { ...generateAiProfile("trader", null), trading: 90 };
    expect(marketDayChance(trader)).toBeGreaterThan(marketDayChance(calm));
    expect(marketDayChance(calm)).toBeGreaterThanOrEqual(0.25);
    expect(marketDayChance(trader)).toBeLessThanOrEqual(0.75);
    expect(monthlyDealLimit(trader)).toBeGreaterThan(monthlyDealLimit(calm));
    expect(openDealLimit(trader)).toBeGreaterThan(openDealLimit(calm));
    expect(monthlyDealLimit(calm)).toBeGreaterThanOrEqual(1);
  });

  it("obchody mezi AI kluby jsou vzácné", () => {
    expect(AI_TO_AI_CHANCE).toBeGreaterThan(0);
    expect(AI_TO_AI_CHANCE).toBeLessThanOrEqual(0.25);
  });

  it("pražský den a hodina sedí i přes změnu času", () => {
    // 25. 10. 2026 v 0:30 UTC je v Praze ještě letní čas (2:30).
    expect(pragueHour(new Date("2026-10-25T00:30:00Z"))).toBe(2);
    // Po přechodu na zimní čas je poledne UTC 13:00 v Praze.
    expect(pragueHour(new Date("2026-10-26T12:00:00Z"))).toBe(13);
    expect(pragueDay(new Date("2026-10-25T22:30:00Z"))).toBe("2026-10-25");
    expect(pragueDay(new Date("2026-10-25T23:30:00Z"))).toBe("2026-10-26");
  });

  it("čas z databáze se čte jako UTC v obou formátech", () => {
    expect(parseDbTime("2026-10-25 10:00:00")?.toISOString()).toBe("2026-10-25T10:00:00.000Z");
    expect(parseDbTime("2026-10-25T10:00:00Z")?.toISOString()).toBe("2026-10-25T10:00:00.000Z");
    expect(parseDbTime(null)).toBeNull();
    expect(parseDbTime("nesmysl")).toBeNull();
  });
});

const BUYER = { ...generateAiProfile("buyer-club", null), ambition: 60, thrift: 40, patience: 50 };

function pickCtx(over: Partial<BuyPickContext> = {}): BuyPickContext {
  return {
    teamName: "Sokol Lhota", profile: BUYER, budget: 100_000, reserve: 20_000, spendable: 80_000,
    squadSize: 18, targetSquad: 24, strength: 40,
    need: { position: "DEF", need: 0.7, missing: 2, minRating: 38, startersAverage: 39 },
    course: { stance: "buy", focus: ["DEF"] },
    candidates: [
      {
        key: "c1", route: "listing", seller: "human", position: "DEF", age: 26, rating: 44, ratingRange: null,
        estimatedValue: 8000, askingPrice: 9000, feePct: 0, minBid: 6300, maxBid: 9000,
      },
      {
        key: "c2", route: "scout_report", seller: "outside", position: "DEF", age: 22, rating: 42, ratingRange: { lo: 38, hi: 46 },
        estimatedValue: 7000, askingPrice: 8000, feePct: 0, minBid: 4900, maxBid: 9500,
      },
    ],
    loans: [{ key: "l1", seller: "ai", position: "DEF", age: 19, rating: 39, days: 45 }],
    demand: { maxPrice: 9000, ageMin: 18, ageMax: 33 },
    tried: [],
    ...over,
  };
}

describe("výběr hráče modelem: model navrhuje, kód hlídá", () => {
  it("model smí vybrat jen nabídnutého hráče a nabídnout jen v rozpětí kódu", () => {
    const ctx = pickCtx();
    expect(validateBuyPick({ choice: "c1", bid: 7000, reason: "solid defender" }, ctx)).toEqual({ kind: "buy", key: "c1", bid: 7000, reason: "solid defender" });
    // Číslo jako text model občas vrátí, platí stejně.
    expect(validateBuyPick({ choice: "c2", bid: "9500", reason: "" }, ctx)).toMatchObject({ kind: "buy", key: "c2", bid: 9500 });
    // Mimo rozpětí (nad strop i pod urážlivou mez) a neznámý hráč: neplatí, rozhodne pravidlo.
    expect(validateBuyPick({ choice: "c1", bid: 9001, reason: "" }, ctx)).toBeNull();
    expect(validateBuyPick({ choice: "c1", bid: 6299, reason: "" }, ctx)).toBeNull();
    expect(validateBuyPick({ choice: "c1", reason: "" }, ctx)).toBeNull();
    expect(validateBuyPick({ choice: "c3", bid: 7000, reason: "" }, ctx)).toBeNull();
    expect(validateBuyPick("c1", ctx)).toBeNull();
    expect(validateBuyPick({ choice: "none", bid: 0, reason: "save money" }, ctx)).toEqual({ kind: "none", reason: "save money" });
    expect(validateBuyPick({ choice: "l1", bid: 0, reason: "" }, ctx)).toEqual({ kind: "loan", key: "l1", reason: "" });
    expect(validateBuyPick({ choice: "demand", bid: 0, reason: "" }, ctx)).toEqual({ kind: "demand", reason: "" });
    // Poptávku jde vybrat jen tehdy, když ji kód nabídl.
    expect(validateBuyPick({ choice: "demand", bid: 0, reason: "" }, pickCtx({ demand: null }))).toBeNull();
  });

  it("výčet možností ve schématu není nikdy prázdný a bez kandidátů se model neptá", () => {
    const schema = buyPickSchema(pickCtx()) as { properties: { choice: { enum: string[] } }; required: string[] };
    expect(schema.properties.choice.enum).toEqual(["c1", "c2", "l1", "demand", "none"]);
    expect(schema.required).toEqual(["choice", "bid", "reason"]);
    const empty = pickCtx({ candidates: [], loans: [], demand: null });
    expect(buyChoiceKeys(empty)).toEqual(["none"]);
    expect(hasBuyChoice(empty)).toBe(false);
    expect(hasBuyChoice(pickCtx({ candidates: [], loans: [] }))).toBe(true);
  });

  it("popis pro model: povaha, potřeba, ceny, rozpětí nabídky a co už dnes nevyšlo", () => {
    const prompt = renderBuyPickPrompt(pickCtx({ tried: ['"c3" (DEF, age 25, rating 43): the club broke off the talks'] }));
    expect(prompt).toContain("YOUR STYLE:");
    expect(prompt).toContain("NEED: defender (DEF), need 0.70");
    expect(prompt).toContain('"c1": DEF, age 26, rating 44');
    expect(prompt).toContain("Transfer-listed by a club managed by a human player for 9,000 CZK");
    expect(prompt).toContain("Bid between 6,300 CZK and 9,000 CZK.");
    expect(prompt).toContain("rating about 42 (your scout's estimate 38-46)");
    expect(prompt).toContain('"l1": ask a club managed by another computer coach to loan you DEF, age 19, rating 39 for 45 days');
    expect(prompt).toContain('"demand": post a public wanted ad');
    expect(prompt).toContain("ALREADY TRIED TODAY WITHOUT A DEAL:");
    expect(prompt).toContain("the club broke off the talks");
  });

  it("spodní mez nabídky je 70 % ceny, nejméně 500 Kč a nikdy nad nabídkou pravidla", () => {
    expect(minimumBid({ estimatedValue: 8000, listedPrice: 9000, ruleBid: 9000 })).toBe(6300);
    expect(minimumBid({ estimatedValue: 8000, listedPrice: null, ruleBid: 7000 })).toBe(5600);
    expect(minimumBid({ estimatedValue: 8000, listedPrice: null, ruleBid: 5000 })).toBe(5000);
    expect(minimumBid({ estimatedValue: 400, listedPrice: null, ruleBid: 600 })).toBe(500);
  });
});

function negotiationCtx(input: { ask: number; maxPrice: number; ownBids: number[]; sellOnPct?: number; countersLeft?: number }): BuyNegotiationContext {
  const countersLeft = input.countersLeft ?? 2;
  const bounds = buyNegotiationBounds({
    ask: input.ask, sellOnPct: input.sellOnPct ?? 0, maxPrice: input.maxPrice, lastOwnBid: input.ownBids[input.ownBids.length - 1], countersLeft,
  });
  return {
    ...bounds, teamName: "Sokol Lhota", profile: BUYER, spendable: 80_000,
    player: { position: "MID", age: 25, rating: 45, ratingRange: null, estimatedValue: 11_000 },
    seller: "outside", listedPrice: 9000, ownBids: input.ownBids, ask: input.ask,
    askTerms: { ...CASH_TERMS, sellOnPct: input.sellOnPct ?? 0 }, maxPrice: input.maxPrice, countersLeft,
  };
}

describe("jednání o ceně modelem: přijetí nikdy nad strop", () => {
  it("meze počítá kód: přijmout jen do stropu a bez procent, přihodit víc než minule a nejvýš strop", () => {
    expect(buyNegotiationBounds({ ask: 6000, sellOnPct: 0, maxPrice: 7000, lastOwnBid: 4000, countersLeft: 2 }))
      .toEqual({ canAccept: true, counter: { min: 4001, max: 5999 } });
    expect(buyNegotiationBounds({ ask: 9000, sellOnPct: 0, maxPrice: 7000, lastOwnBid: 4000, countersLeft: 2 }))
      .toEqual({ canAccept: false, counter: { min: 4001, max: 7000 } });
    // Strop už padl: zbývá jen odejít.
    expect(buyNegotiationBounds({ ask: 9000, sellOnPct: 0, maxPrice: 7000, lastOwnBid: 7000, countersLeft: 2 }))
      .toEqual({ canAccept: false, counter: null });
    expect(buyNegotiationBounds({ ask: 6000, sellOnPct: 0, maxPrice: 7000, lastOwnBid: 4000, countersLeft: 0 }))
      .toEqual({ canAccept: true, counter: null });
    // Procenta z dalšího prodeje AI nedá: nepřijme, ale nabídne i stejnou částku bez nich.
    expect(buyNegotiationBounds({ ask: 6000, sellOnPct: 10, maxPrice: 7000, lastOwnBid: 5000, countersLeft: 2 }))
      .toEqual({ canAccept: false, counter: { min: 5000, max: 6000 } });
  });

  it("přijetí nad strop ani protinávrh mimo meze neprojde", () => {
    const over = negotiationCtx({ ask: 9000, maxPrice: 7000, ownBids: [4000] });
    expect(validateBuyNegotiation({ action: "accept", amount: 0, reason: "" }, over)).toBeNull();
    expect(validateBuyNegotiation({ action: "counter", amount: 7001, reason: "" }, over)).toBeNull();
    expect(validateBuyNegotiation({ action: "counter", amount: 4000, reason: "" }, over)).toBeNull();
    expect(validateBuyNegotiation({ action: "counter", amount: 6500, reason: "meet halfway" }, over)).toEqual({ kind: "counter", amount: 6500, reason: "meet halfway" });
    expect(validateBuyNegotiation({ action: "withdraw", amount: 0, reason: "" }, over)).toEqual({ kind: "withdraw", reason: "" });
    expect(validateBuyNegotiation({ action: "haggle", amount: 5000, reason: "" }, over)).toBeNull();
    const fair = negotiationCtx({ ask: 6000, maxPrice: 7000, ownBids: [4000] });
    expect(validateBuyNegotiation({ action: "accept", amount: 0, reason: "fair" }, fair)).toEqual({ kind: "accept", reason: "fair" });
    // Protinávrh musí být pod požadavkem (jinak by stačilo přijmout).
    expect(validateBuyNegotiation({ action: "counter", amount: 6000, reason: "" }, fair)).toBeNull();
  });

  it("schéma nabízí jen přípustné akce, odejít jde vždycky; popis řekne strop a meze", () => {
    const over = negotiationCtx({ ask: 9000, maxPrice: 7000, ownBids: [4000] });
    expect((buyNegotiationSchema(over) as { properties: { action: { enum: string[] } } }).properties.action.enum).toEqual(["counter", "withdraw"]);
    const done = negotiationCtx({ ask: 9000, maxPrice: 7000, ownBids: [4000, 7000] });
    expect((buyNegotiationSchema(done) as { properties: { action: { enum: string[] } } }).properties.action.enum).toEqual(["withdraw"]);
    const prompt = renderBuyNegotiationPrompt(over);
    expect(prompt).toContain("- the seller now asks 9,000 CZK in cash");
    expect(prompt).toContain("your limit for this player is 7,000 CZK");
    expect(prompt).toContain('"counter": offer between 4,001 CZK and 7,000 CZK');
    expect(prompt).not.toContain('"accept"');
    const sellOn = renderBuyNegotiationPrompt(negotiationCtx({ ask: 6000, maxPrice: 7000, ownBids: [5000], sellOnPct: 10 }));
    expect(sellOn).toContain("plus 10 % of any future transfer fee");
    expect(sellOn).toContain("you cannot accept these terms as they are");
  });

  it("pravidlo u klubu mimo hru: do stropu podepíše, nad strop jednou nabídne strop, pak odejde", () => {
    const rule = (ask: number, last: number, countersLeft = 2) => outsideRuleDecision({
      ask, maxPrice: 7000, lastOwnBid: last, bounds: buyNegotiationBounds({ ask, sellOnPct: 0, maxPrice: 7000, lastOwnBid: last, countersLeft }),
    });
    expect(rule(6500, 5000).kind).toBe("accept");
    expect(rule(9000, 5000)).toEqual({ kind: "counter", amount: 7000, reason: "offer_max" });
    expect(rule(9000, 7000).kind).toBe("withdraw");
    expect(rule(9000, 5000, 0).kind).toBe("withdraw");
  });
});

/** Binding Workers AI, který vrátí pevnou odpověď (a počítá volání). */
function fakeAi(answer: unknown): { env: Pick<Bindings, "AI">; calls: () => number } {
  let calls = 0;
  const run = async () => {
    calls++;
    return { choices: [{ message: { content: JSON.stringify(answer) } }], usage: { prompt_tokens: 10, completion_tokens: 5 } };
  };
  return { env: { AI: { run } } as unknown as Pick<Bindings, "AI">, calls: () => calls };
}

function buyerReply(over: Partial<BuyerReplyInput> = {}): BuyerReplyInput {
  return {
    teamName: "Sokol Lhota", profile: BUYER, spendable: 80_000,
    player: { position: "MID", age: 25, rating: 45, ratingRange: null, estimatedValue: 6000 },
    seller: "human", listedPrice: null,
    terms: { amount: 6500, upfrontPct: 100, installments: 0, sellOnPct: 0 },
    maxPrice: 7000, ownBids: [5000], rounds: 0,
    ...over,
  };
}

describe("odpověď AI kupujícího na protinávrh klubu ve hře", () => {
  it("platné přijetí do stropu i protinávrh v mezích provede, jak model řekl", async () => {
    const accept = await decideBuyerReplyByModel(buyerReply(), { useModel: true, ai: fakeAi({ action: "accept", amount: 0, reason: "fair price" }).env });
    expect(accept.by).toBe("model");
    expect(accept.reply).toMatchObject({ kind: "accept", cost: 6500 });
    expect(accept.trace).toMatchObject({ tokensIn: 10, tokensOut: 5, error: null });

    const counter = await decideBuyerReplyByModel(
      buyerReply({ terms: { amount: 9000, upfrontPct: 100, installments: 0, sellOnPct: 0 } }),
      { useModel: true, ai: fakeAi({ action: "counter", amount: 6200, reason: "meet halfway" }).env },
    );
    expect(counter.by).toBe("model");
    expect(counter.reply).toEqual({ kind: "counter", reason: "raise", cost: 9000, terms: { amount: 6200, upfrontPct: 100, installments: 0, sellOnPct: 0 } });
  });

  it("přijetí nad strop nebo protinávrh nad strop neprojde: rozhodne pravidlo a nikdy nezaplatí víc než strop", async () => {
    const terms = { amount: 8000, upfrontPct: 100, installments: 0, sellOnPct: 0 };
    for (const answer of [{ action: "accept", amount: 0, reason: "" }, { action: "counter", amount: 7500, reason: "" }]) {
      const res = await decideBuyerReplyByModel(buyerReply({ terms }), { useModel: true, ai: fakeAi(answer).env });
      expect(res.by).toBe("fallback");
      expect(res.trace.error).toBe("neplatná odpověď modelu");
      expect(res.reply.kind).toBe("counter");
      if (res.reply.kind === "counter") expect(res.reply.terms.amount).toBeLessThanOrEqual(7000);
    }
  });

  it("procenta z dalšího prodeje AI nepřijme ani od modelu, stejnou částku nabídne bez nich", async () => {
    const terms = { amount: 6000, upfrontPct: 100, installments: 0, sellOnPct: 10 };
    const accept = await decideBuyerReplyByModel(buyerReply({ terms }), { useModel: true, ai: fakeAi({ action: "accept", amount: 0, reason: "" }).env });
    expect(accept.by).toBe("fallback");
    expect(accept.reply).toMatchObject({ kind: "counter", reason: "no_sell_on", terms: { amount: 6000, sellOnPct: 0 } });
    const counter = await decideBuyerReplyByModel(buyerReply({ terms }), { useModel: true, ai: fakeAi({ action: "counter", amount: 6000, reason: "no clause" }).env });
    expect(counter.by).toBe("model");
    expect(counter.reply).toMatchObject({ kind: "counter", reason: "no_sell_on", terms: { amount: 6000, sellOnPct: 0 } });
  });

  it("bez modelu (off, chybí binding) rozhoduje pravidlo; jediná možnost se modelu nepředkládá", async () => {
    const ai = fakeAi({ action: "accept", amount: 0, reason: "" });
    const off = await decideBuyerReplyByModel(buyerReply(), { useModel: false, ai: ai.env });
    expect(off).toMatchObject({ by: "fallback", reply: { kind: "accept", reason: "accept_within_max" } });
    const noBinding = await decideBuyerReplyByModel(buyerReply(), { useModel: true, ai: null });
    expect(noBinding).toMatchObject({ by: "fallback", reply: { kind: "accept" } });
    // Protinávrhy došly a klub chce víc než strop: jen odejít.
    const last = await decideBuyerReplyByModel(
      buyerReply({ terms: { amount: 9000, upfrontPct: 100, installments: 0, sellOnPct: 0 }, rounds: maxCounterRounds(BUYER) }),
      { useModel: true, ai: ai.env },
    );
    expect(last).toMatchObject({ by: "guard", reply: { kind: "withdraw" } });
    expect(ai.calls()).toBe(0);
  });

  it("limit volání modelu za běh: po vyčerpání rozhodne pravidlo a deník zná důvod", async () => {
    const ai = fakeAi({ action: "accept", amount: 0, reason: "" });
    const budget = { left: 1 };
    const first = await decideBuyerReplyByModel(buyerReply(), { useModel: true, ai: ai.env, budget });
    expect(first.by).toBe("model");
    expect(budget.left).toBe(0);
    const second = await decideBuyerReplyByModel(buyerReply(), { useModel: true, ai: ai.env, budget });
    expect(second).toMatchObject({ by: "fallback", trace: { error: "došel limit volání modelu za běh" }, reply: { kind: "accept" } });
    expect(ai.calls()).toBe(1);
  });
});
