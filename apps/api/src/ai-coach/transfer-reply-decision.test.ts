import { describe, expect, it } from "vitest";
import type { TransferTerms } from "@okresni-masina/shared";
import { generateAiProfile, type AiCoachProfile } from "./profile";
import type { SellBlockReason } from "./squad";
import {
  betterWaitingOffer, decideSellerReply, promiseReservation, requiredLoanFee, sellerDecisionFromChoice, sellerGuardViolation, sellerOptions,
  type SellerDecision, type SellerDecisionInput,
} from "./transfer-decision";
import { renderTransferReplyPrompt, transferReplySchema, validateTransferReply, type TransferReplyContext } from "./transfer-reply-decision";
import { createRng } from "../generators/rng";
import { netSaleValue, openingAsk, reservationPrice, type SquadImportance } from "./valuation";

const NOW = new Date("2026-10-25T12:00:00.000Z");
const MV = 20_000;

function profile(over: Partial<AiCoachProfile> = {}): AiCoachProfile {
  return {
    version: 1, ambition: 50, thrift: 50, youthFocus: 50, risk: 50, trading: 50, building: 50, patience: 50,
    favouriteTactic: "balanced", favouriteFormations: ["4-4-2"], ...over,
  };
}

const cash = (amount: number): TransferTerms => ({ amount, upfrontPct: 100, installments: 0, sellOnPct: 0 });

function sellerInput(over: Partial<SellerDecisionInput> & { terms: TransferTerms }): SellerDecisionInput {
  return {
    offerId: "offer-1", offerType: "transfer", loanDays: null, marketValue: MV, age: 25, importance: "rotation",
    block: null, profile: profile(), playerId: "player-1", now: NOW, swapValue: 0, virtualBuyer: false,
    previousAsks: [], previousBids: [], priorBreakOffs: 0, overDealLimit: false, listedPrice: null, ...over,
  };
}

const valuation = { marketValue: MV, age: 25, importance: "rotation" as SquadImportance, profile: profile(), playerId: "player-1", now: NOW };
const R = reservationPrice(valuation);
const ASK = openingAsk(valuation);
const round100 = (v: number) => Math.ceil(v / 100) * 100;

describe("přípustné možnosti AI prodávajícího", () => {
  it("blokovaný hráč a nabídka pod 60 % tržní hodnoty: jen odmítnutí, rozhodne kód bez modelu", () => {
    const blocked = sellerOptions(sellerInput({ terms: cash(MV * 3), block: "last_goalkeeper" }));
    expect(blocked.actions).toEqual(["reject"]);
    expect(blocked.forced).toMatchObject({ kind: "reject", reason: "blocked", block: "last_goalkeeper" });
    const lowball = sellerOptions(sellerInput({ terms: cash(Math.floor(MV * 0.55 / 100) * 100) }));
    expect(lowball.actions).toEqual(["reject"]);
    expect(lowball.forced).toMatchObject({ kind: "reject", reason: "hard_floor" });
  });

  it("nabídka za cenu z inzerátu nebo za dřívější požadavek AI projde bez modelu (vlastní slovo platí)", () => {
    expect(sellerOptions(sellerInput({ terms: cash(ASK), listedPrice: ASK })).forced).toMatchObject({ kind: "accept" });
    const asked = sellerOptions(sellerInput({ terms: cash(R + 1000), previousAsks: [R + 1000], previousBids: [R - 2000] }));
    expect(asked.actions).toEqual(["accept"]);
    expect(asked.forced).toMatchObject({ kind: "accept", reason: "accept_ask" });
  });

  it("mezi rezervací a požadavkem smí model přijmout, smlouvat i odmítnout; protinávrh nad nabídku a do požadavku", () => {
    const bid = round100((R + ASK) / 2);
    const o = sellerOptions(sellerInput({ terms: cash(bid) }));
    expect(o.forced).toBeNull();
    expect(o.actions).toEqual(["accept", "counter", "reject"]);
    expect(o.counter).toEqual({ min: bid + 100, max: ASK });
  });

  it("pod rezervací jen protinávrh od rezervace nebo odmítnutí, i u urážlivé nabídky (pravidlo ji odmítne)", () => {
    const insult = round100(MV * 0.62);
    expect(insult).toBeLessThan(R * 0.7);
    const o = sellerOptions(sellerInput({ terms: cash(insult) }));
    expect(o.actions).toEqual(["counter", "reject"]);
    expect(o.counter).toEqual({ min: R, max: ASK });
    expect(decideSellerReply(sellerInput({ terms: cash(insult) }))).toMatchObject({ kind: "reject", reason: "insulting" });
  });

  it("nabídka nad požadavkem bez závazku: model smí přijmout, nebo odmítnout, smlouvat výš nejde", () => {
    const o = sellerOptions(sellerInput({ terms: cash(ASK * 2) }));
    expect(o.actions).toEqual(["accept", "reject"]);
    expect(o.counter).toBeNull();
  });

  it("s klubem mimo hru a po došlé trpělivosti se nesmlouvá", () => {
    expect(sellerOptions(sellerInput({ terms: cash(R - 1000), virtualBuyer: true })).forced).toMatchObject({ kind: "reject" });
    expect(sellerOptions(sellerInput({ terms: cash(R), virtualBuyer: true })).actions).toEqual(["accept", "reject"]);
    // Trpělivost 50 snese čtyři protinávrhy.
    const asks = [ASK, ASK - 500, ASK - 1000, ASK - 1500];
    const bids = [R - 3000, R - 2800, R - 2600, R - 2400];
    expect(sellerOptions(sellerInput({ terms: cash(R - 1000), previousAsks: asks, previousBids: bids })).forced)
      .toMatchObject({ kind: "reject", reason: "out_of_patience" });
    expect(sellerOptions(sellerInput({ terms: cash(R + 200), previousAsks: asks, previousBids: bids })).actions).toEqual(["accept", "reject"]);
  });

  it("cena z inzerátu je závazná, i když ji AI dnes počítá níž než rezervaci (rotace, limit obchodů)", () => {
    // Vystavený jako přebytek, dnes v rotaci: rezervace v odpovědi vyšla znovu a výš.
    const listed = R - 1000;
    for (const over of [{}, { overDealLimit: true }]) {
      const input = sellerInput({ terms: cash(listed), listedPrice: listed, ...over });
      expect(sellerOptions(input).forced).toMatchObject({ kind: "accept", reason: "accept_ask" });
      expect(decideSellerReply(input)).toMatchObject({ kind: "accept", reason: "accept_ask" });
    }
  });

  it("pod cenou inzerátu smlouvá nejvýš na cenu inzerátu, ne na vlastní vyšší rezervaci", () => {
    const listed = R - 1000;
    const bid = listed - 2000;
    const o = sellerOptions(sellerInput({ terms: cash(bid), listedPrice: listed }));
    expect(o.forced).toBeNull();
    expect(o.reservation).toBe(listed);
    expect(o.counter).toEqual({ min: listed, max: listed });
  });

  it("z hráče, který se mezitím stal oporou, se cena inzerátu nebere", () => {
    const key = reservationPrice({ ...valuation, importance: "key" });
    const listed = round100(key / 2);
    const o = sellerOptions(sellerInput({ terms: cash(listed), listedPrice: listed, importance: "key" }));
    expect(o.forced).toBeNull();
    expect(o.reservation).toBe(key);
    expect(o.actions).not.toContain("accept");
  });

  it("hostování: opora jen odmítnutí, pod poplatkem protinávrh přesně na poplatek, od poplatku přijetí", () => {
    const loan = (amount: number, importance: SquadImportance) => sellerOptions(sellerInput({ offerType: "loan", loanDays: 30, terms: cash(amount), importance }));
    expect(loan(50_000, "key").forced).toMatchObject({ kind: "reject", reason: "loan_needed" });
    const fee = requiredLoanFee({ marketValue: MV, age: 25, importance: "rotation", loanDays: 30 })!;
    expect(loan(fee - 1000, "rotation")).toMatchObject({ actions: ["counter", "reject"], counter: { min: fee, max: fee } });
    expect(loan(fee, "rotation").actions).toEqual(["accept", "reject"]);
  });

  it("náhradní pravidlo nikdy nevybočí z přípustných možností a pojistek (náhodné nabídky)", () => {
    const rng = createRng(20261025);
    const blocks: Array<SellBlockReason | null> = [null, null, null, null, "last_goalkeeper", "min_squad"];
    const importances: SquadImportance[] = ["key", "rotation", "surplus"];
    const seen = { forcedAccept: 0, forcedReject: 0, model: 0, counter: 0, ruleCounter: 0 };
    for (let i = 0; i < 2500; i++) {
      const p = generateAiProfile(`club-${i}`, null);
      const mv = 2_000 + Math.round(rng.random() * 60_000);
      const importance = importances[i % 3];
      const r = reservationPrice({ marketValue: mv, age: 25, importance, profile: p, playerId: `pl-${i}`, now: NOW });
      const amount = Math.max(100, round100(r * (0.4 + rng.random() * 1.4)));
      const installments = rng.random() < 0.3;
      const terms: TransferTerms = installments
        ? { amount, upfrontPct: 30, installments: 6, sellOnPct: rng.random() < 0.3 ? 15 : 0 }
        : cash(amount);
      const asks = rng.random() < 0.4 ? [round100(r * (1 + rng.random() * 0.4))] : [];
      const input = sellerInput({
        offerType: rng.random() < 0.15 ? "loan" : "transfer", loanDays: 30, terms: rng.random() < 0.15 ? cash(amount) : terms,
        marketValue: mv, importance, profile: p, playerId: `pl-${i}`, block: blocks[i % blocks.length],
        virtualBuyer: rng.random() < 0.15, overDealLimit: rng.random() < 0.2,
        listedPrice: rng.random() < 0.25 ? round100(r * (0.85 + rng.random() * 0.4)) : null,
        previousAsks: asks, previousBids: asks.length ? [round100(r * 0.8)] : [], priorBreakOffs: rng.random() < 0.1 ? 1 : 0,
        saleCosts: rng.random() < 0.15 ? { sellOnPct: 30, remainingDebt: 500, swapMarketValue: 0 } : undefined,
      });
      const o = sellerOptions(input);
      const rule = decideSellerReply(input);
      expect(o.actions.length).toBeGreaterThan(0);
      expect(o.actions).toContain(rule.kind);
      if (o.forced) expect(o.forced.kind).toBe(rule.kind);
      expect(sellerGuardViolation(input, o, rule)).toBeNull();
      if (o.actions.includes("accept")) expect(o.value).toBeGreaterThanOrEqual(o.reservation);
      if (o.counter) {
        expect(o.counter.min).toBeGreaterThanOrEqual(o.reservation);
        expect(o.counter.min).toBeGreaterThan(input.offerType === "loan" ? input.terms.amount : o.value);
        expect(o.counter.max).toBeLessThanOrEqual(Math.max(o.reservation, o.currentAsk));
        // AI se k vyšší ceně nevrací: strop je nejvýš nejnižší dřívější požadavek.
        if (input.offerType === "transfer" && asks.length) expect(o.counter.max).toBeLessThanOrEqual(Math.max(o.reservation, asks[0]));
      }
      if (o.forced?.kind === "accept") seen.forcedAccept++;
      if (o.forced?.kind === "reject") seen.forcedReject++;
      if (!o.forced) seen.model++;
      if (o.counter) seen.counter++;
      if (rule.kind === "counter") seen.ruleCounter++;
    }
    // Vzorek pokryl všechny větve, ne jen jednu.
    for (const n of Object.values(seen)) expect(n).toBeGreaterThan(50);
  });
});

describe("volba modelu a pojistka", () => {
  const below = sellerInput({ terms: cash(R - 1000) });
  const belowOptions = sellerOptions(below);

  it("přípustná je jen akce z nabídky a protinávrh v mezích, zaokrouhlený na stovky", () => {
    expect(validateTransferReply({ action: "accept", amount: 0, reason: "Take it." }, belowOptions)).toMatchObject({ ok: false });
    expect(validateTransferReply({ action: "counter", amount: R - 500, reason: "x" }, belowOptions)).toMatchObject({ ok: false });
    expect(validateTransferReply({ action: "counter", amount: ASK + 1000, reason: "x" }, belowOptions)).toMatchObject({ ok: false });
    expect(validateTransferReply({ action: "counter", reason: "x" }, belowOptions).ok).toBe(false);
    expect(validateTransferReply({ action: "sell", amount: 0 }, belowOptions).ok).toBe(false);
    expect(validateTransferReply("counter", belowOptions).ok).toBe(false);
    expect(validateTransferReply({ action: "counter", amount: R + 1049, reason: " Halfway. " }, belowOptions))
      .toEqual({ ok: true, choice: { action: "counter", amount: R + 1000 }, reason: "Halfway." });
    expect(validateTransferReply({ action: "Counter", amount: String(R + 1000) }, belowOptions))
      .toMatchObject({ ok: true, choice: { action: "counter", amount: R + 1000 } });
    expect(validateTransferReply({ action: "reject", amount: 0, reason: "Too low." }, belowOptions))
      .toEqual({ ok: true, choice: { action: "reject", amount: 0 }, reason: "Too low." });
  });

  it("protinávrh modelu drží strukturu kupujícího a čistou hodnotu aspoň ve výši požadavku", () => {
    const input = sellerInput({ terms: { amount: round100(R * 0.9), upfrontPct: 30, installments: 6, sellOnPct: 0 } });
    const o = sellerOptions(input);
    expect(o.counter).not.toBeNull();
    const d = sellerDecisionFromChoice(input, o, { action: "counter", amount: o.counter!.min });
    expect(d).toMatchObject({ kind: "counter", reason: "model", ask: o.counter!.min });
    if (d?.kind === "counter") {
      expect(d.terms.installments).toBe(6);
      expect(netSaleValue(d.terms, 0)).toBeGreaterThanOrEqual(o.counter!.min);
    }
    expect(sellerDecisionFromChoice(input, o, { action: "accept", amount: 0 })).toBeNull();
    expect(sellerDecisionFromChoice(input, o, { action: "counter", amount: o.counter!.min + 50 })).toBeNull();
    expect(sellerDecisionFromChoice(input, o, { action: "counter", amount: o.counter!.max + 100 })).toBeNull();
  });

  it("pojistka zastaví přijetí i protinávrh pod rezervací a cokoli kromě odmítnutí u blokovaného hráče", () => {
    const { value, reservation } = belowOptions;
    const accept: SellerDecision = { kind: "accept", reason: "model", value, reservation };
    expect(sellerGuardViolation(below, belowOptions, accept)).toContain("pod rezervací");
    const lowCounter: SellerDecision = { kind: "counter", reason: "model", value, reservation, ask: R - 500, terms: cash(R - 500) };
    expect(sellerGuardViolation(below, belowOptions, lowCounter)).toContain("pod rezervací");
    expect(sellerGuardViolation(below, belowOptions, { kind: "reject", reason: "model", value, reservation })).toBeNull();
    const blocked = sellerInput({ terms: cash(MV * 3), block: "last_goalkeeper" });
    const blockedOptions = sellerOptions(blocked);
    expect(sellerGuardViolation(blocked, blockedOptions, { ...accept, value: MV * 3 })).not.toBeNull();
  });
});

describe("popis pro model", () => {
  const bid = round100((R + ASK) / 2);
  const options = sellerOptions(sellerInput({ terms: cash(bid) }));
  const ctx: TransferReplyContext = {
    profile: profile({ trading: 80 }), budget: 150_000, spendable: 120_000, weeklyCosts: 5_000, squadSize: 20, targetSquad: 24,
    dealsLast30: 1, dealLimit: 5, overDealLimit: false,
    plan: { stance: "sell", focus: ["FWD"], chosenToSell: true },
    player: {
      position: "MID", age: 28, rating: 47, marketValue: MV, importance: "rotation", injured: false, onLoanElsewhere: false,
      listedPrice: null, samePosition: [54, 51, 49, 43], starters: 4, formation: "4-4-2",
    },
    buyer: { managedBy: "human", sameDistrict: true },
    offer: { type: "transfer", loanDays: null, terms: cash(bid), swapPlayers: [{ position: "DEF", age: 31, rating: 38, useful: false }] },
    costs: { sellOnPct: 0, remainingDebt: 0, swapMarketValue: 0 },
    history: { previousAsks: [], previousBids: [], priorBreakOffs: 0 },
    options,
  };

  it("schéma nabízí jen přípustné akce a částku v mezích protinávrhu, výčet nikdy prázdný", () => {
    const schema = transferReplySchema(options) as { properties: { action: { enum: string[] }; amount: Record<string, unknown> }; required: string[] };
    expect(schema.properties.action.enum).toEqual(["accept", "counter", "reject"]);
    expect(schema.properties.amount).toMatchObject({ type: "integer", minimum: options.counter!.min, maximum: options.counter!.max });
    expect(schema.required).toEqual(["action", "amount", "reason"]);
    const forced = transferReplySchema(sellerOptions(sellerInput({ terms: cash(MV * 3), block: "min_squad" }))) as { properties: { action: { enum: string[] } } };
    expect(forced.properties.action.enum).toEqual(["reject"]);
  });

  it("popis má povahu, kurz, hráče, ceny a možnosti, žádnou dlouhou pomlčku", () => {
    const prompt = renderTransferReplyPrompt(ctx);
    expect(prompt).toContain("YOUR STYLE: you like doing transfer deals");
    expect(prompt).toContain("TRANSFER COURSE this week: sell");
    expect(prompt).toContain("you picked this player to sell");
    expect(prompt).toContain("Other MID in your A-team: 54, 51, 49, 43");
    expect(prompt).toContain("a club run by a human manager, from your district");
    expect(prompt).toContain("DEF age 31 rating 38 (would not play for you)");
    expect(prompt).toContain(`your minimum ${R.toLocaleString("en-US")} CZK`);
    expect(prompt).toContain(`"counter": ask for ${options.counter!.min.toLocaleString("en-US")} CZK to ${options.counter!.max.toLocaleString("en-US")} CZK`);
    expect(prompt).toContain("this is their first offer");
    expect(prompt).not.toContain("—");
  });

  it("klub mimo hru: bez historie jednání a bez pauzy po odmítnutí", () => {
    const outside = sellerOptions(sellerInput({ terms: cash(R), virtualBuyer: true }));
    const prompt = renderTransferReplyPrompt({ ...ctx, buyer: { managedBy: "outside", sameDistrict: null }, options: outside });
    expect(prompt).toContain("it does not negotiate");
    expect(prompt).not.toContain("TALKS with this club");
    expect(prompt).toContain('"reject": turn the offer down');
    expect(prompt).not.toContain('"counter"');
  });
});

describe("slib prodeje nespokojenému hráči", () => {
  // Nad pevnou pojistkou (60 % tržní hodnoty), ale pod tržní hodnotou.
  const LOW = round100(MV * 0.65);

  it("rozhoduje model, ne kód: od tržní hodnoty smí přijmout nebo odmítnout, pod ní jen protinávrh na tržní hodnotu nebo odmítnout", () => {
    const fair = sellerInput({ terms: cash(MV), salePromise: true, importance: "key", overDealLimit: true });
    const o = sellerOptions(fair);
    expect(o.forced).toBeNull();
    expect(o.reservation).toBe(MV);
    expect(o.currentAsk).toBe(MV);
    expect(o.actions).toEqual(["accept", "reject"]);
    // Bez slibu by za tržní hodnotu oporu přijmout nešlo (rezervace 1,75× a přirážka za limit).
    expect(sellerOptions(sellerInput({ terms: cash(MV), importance: "key", overDealLimit: true })).actions).not.toContain("accept");

    const low = sellerInput({ terms: cash(LOW), salePromise: true });
    const lowOptions = sellerOptions(low);
    expect(lowOptions.forced).toBeNull();
    expect(lowOptions.actions).toEqual(["counter", "reject"]);
    expect(lowOptions.counter).toEqual({ min: MV, max: MV });
    // Pojistka: přijetí pod tržní hodnotou neprojde, ani kdyby ho někdo navrhl.
    expect(sellerGuardViolation(low, lowOptions, { kind: "accept", reason: "model", value: LOW, reservation: MV })).toContain("pod rezervací");
    // Pravidlo (jen režim off) taky pod tržní hodnotou nepřijme.
    expect(decideSellerReply(low).kind).not.toBe("accept");
    // Klub mimo hru nesmlouvá: pod tržní hodnotou jen odmítnutí.
    expect(sellerOptions({ ...low, virtualBuyer: true }).forced).toMatchObject({ kind: "reject" });
  });

  it("rezervace je tržní hodnota, nebo vyšší cena inzerátu; nižší cena inzerátu ji nesníží", () => {
    expect(promiseReservation(MV, null)).toBe(MV);
    expect(promiseReservation(MV, MV + 3000)).toBe(MV + 3000);
    expect(promiseReservation(MV, MV - 5000)).toBe(MV);
    const cheapListing = sellerOptions(sellerInput({ terms: cash(MV - 5000), salePromise: true, listedPrice: MV - 5000 }));
    expect(cheapListing.reservation).toBe(MV);
    expect(cheapListing.actions).not.toContain("accept");
    // Za cenu inzerátu od tržní hodnoty výš vlastní slovo platí dál (závazek z inzerátu).
    expect(sellerOptions(sellerInput({ terms: cash(MV + 3000), salePromise: true, listedPrice: MV + 3000 })).forced)
      .toMatchObject({ kind: "accept", reason: "accept_ask" });
  });

  it("model se o slibu dozví v popisu situace", () => {
    const input = sellerInput({ terms: cash(MV), salePromise: true });
    const options = sellerOptions(input);
    const base: TransferReplyContext = {
      profile: profile(), budget: 50_000, spendable: 20_000, weeklyCosts: 3000, squadSize: 24, targetSquad: 24, dealsLast30: 0, dealLimit: 3,
      overDealLimit: false, plan: null,
      player: { position: "MID", age: 25, rating: 40, marketValue: MV, importance: "rotation", injured: false, onLoanElsewhere: false, listedPrice: null, samePosition: [41, 38], starters: 4, formation: "4-4-2" },
      buyer: { managedBy: "human", sameDistrict: true },
      offer: { type: "transfer", loanDays: null, terms: cash(MV), swapPlayers: [] },
      costs: { sellOnPct: 0, remainingDebt: 0, swapMarketValue: 0 },
      history: { previousAsks: [], previousBids: [], priorBreakOffs: 0 },
      options,
    };
    expect(renderTransferReplyPrompt(base)).not.toContain("PROMISE:");
    const prompt = renderTransferReplyPrompt({ ...base, salePromise: true, otherOffers: [MV - 1000, MV - 3000] });
    expect(prompt).toContain("PROMISE: he was unhappy and your club promised him");
    expect(prompt).toContain(`OTHER OFFERS for him waiting for your answer, worth to your club: ${(MV - 1000).toLocaleString("en-US")}, ${(MV - 3000).toLocaleString("en-US")} CZK`);
    expect(prompt).not.toContain("—");
  });

  it("pod 60 % tržní hodnoty ani se slibem ne; pojistky kádru platí, jen opora bez náhrady slib nepřebije", () => {
    const lowball = sellerOptions(sellerInput({ terms: cash(Math.floor(MV * 0.55 / 100) * 100), salePromise: true }));
    expect(lowball.forced).toMatchObject({ kind: "reject", reason: "hard_floor" });
    const lastKeeper = sellerOptions(sellerInput({ terms: cash(MV), salePromise: true, block: "last_goalkeeper" }));
    expect(lastKeeper.forced).toMatchObject({ kind: "reject", reason: "blocked", block: "last_goalkeeper" });
    const minSquad = sellerOptions(sellerInput({ terms: cash(MV), salePromise: true, block: "min_squad" }));
    expect(minSquad.forced).toMatchObject({ kind: "reject", reason: "blocked" });
    const keyPlayer = sellerOptions(sellerInput({ terms: cash(MV), salePromise: true, importance: "key", block: "key_without_replacement" }));
    expect(keyPlayer.forced).toBeNull();
    expect(keyPlayer.actions).toContain("accept");
    // Bez slibu opora bez náhrady dál neodejde.
    expect(sellerOptions(sellerInput({ terms: cash(MV * 3), importance: "key", block: "key_without_replacement" })).forced)
      .toMatchObject({ kind: "reject", reason: "blocked" });
  });

  it("hostování slib prodeje nemění: rozhoduje se jako bez něj", () => {
    const loan = { offerType: "loan" as const, loanDays: 30, terms: cash(500) };
    expect(sellerOptions(sellerInput({ ...loan, salePromise: true }))).toEqual(sellerOptions(sellerInput(loan)));
    expect(decideSellerReply(sellerInput({ ...loan, salePromise: true }))).toEqual(decideSellerReply(sellerInput(loan)));
  });
});

describe("víc nabídek na téhož hráče", () => {
  it("dokud čeká lepší nabídka, horší nejde přijmout: ani modelem, ani za cenu z inzerátu, ani pravidlem", () => {
    const bid = round100((R + ASK) / 2);
    const input = sellerInput({ terms: cash(bid), competingValues: [bid + 2000, bid - 1000] });
    expect(betterWaitingOffer(input, bid)).toBe(bid + 2000);
    const o = sellerOptions(input);
    expect(o.actions).not.toContain("accept");
    expect(sellerDecisionFromChoice(input, o, { action: "accept", amount: 0 })).toBeNull();
    expect(sellerGuardViolation(input, o, { kind: "accept", reason: "model", value: bid, reservation: R })).toContain("čeká lepší");
    expect(decideSellerReply(input).kind).not.toBe("accept");

    const listed = sellerInput({ terms: cash(ASK), listedPrice: ASK, competingValues: [ASK + 500] });
    expect(sellerOptions(listed).forced?.kind).not.toBe("accept");
    expect(decideSellerReply(listed).kind).not.toBe("accept");
  });

  it("nejlepší nabídka na stole se rozhoduje jako obvykle; hostování se netýká", () => {
    const bid = round100((R + ASK) / 2);
    const best = sellerInput({ terms: cash(bid), competingValues: [bid - 1000, bid] });
    expect(betterWaitingOffer(best, bid)).toBeNull();
    expect(sellerOptions(best).actions).toEqual(["accept", "counter", "reject"]);
    const loan = sellerInput({ offerType: "loan", loanDays: 30, terms: cash(5000), competingValues: [90_000] });
    expect(betterWaitingOffer(loan, 5000)).toBeNull();
  });
});
