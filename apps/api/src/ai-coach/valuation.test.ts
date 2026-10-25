import { describe, expect, it } from "vitest";
import { marketValue, type TransferTerms } from "@okresni-masina/shared";
import { generateAiProfile, type AiCoachProfile } from "./profile";
import {
  HARD_FLOOR_RATIO, IMPORTANCE_MULTIPLIER, MAX_BUY_TO_VALUE, VALUATION_WINDOW_DAYS, budgetReserve, maxBuyPrice, openingAsk, presentCost,
  presentValue, reservationPrice, swapPlayerValue, valuationWindow, type SquadImportance,
} from "./valuation";
import { analyzeSquad, type SquadMember } from "./squad";
import { decideBuyerReply, decideSellerReply, INSULT_RATIO, requiredLoanFee, type SellerDecisionInput } from "./transfer-decision";
import { MAX_REPLY_HOURS, MIN_REPLY_HOURS, replyDelayHours, replyDueAt } from "./transfer-replies";

const NOW = new Date("2026-10-25T12:00:00.000Z");
const DAY = 86_400_000;
const IMPORTANCES: SquadImportance[] = ["key", "rotation", "surplus"];

function profile(over: Partial<AiCoachProfile> = {}): AiCoachProfile {
  return {
    version: 1, ambition: 50, thrift: 50, youthFocus: 50, risk: 50, trading: 50, building: 50, patience: 50,
    favouriteTactic: "balanced", favouriteFormations: ["4-4-2"], ...over,
  };
}

const cash = (amount: number): TransferTerms => ({ amount, upfrontPct: 100, installments: 0, sellOnPct: 0 });

function sellerInput(over: Partial<SellerDecisionInput> & { terms: TransferTerms }): SellerDecisionInput {
  return {
    offerId: "offer-1", offerType: "transfer", loanDays: null, marketValue: 20_000, age: 25, importance: "rotation",
    block: null, profile: profile(), playerId: "player-1", now: NOW, swapValue: 0, virtualBuyer: false,
    previousAsks: [], previousBids: [], priorBreakOffs: 0, overDealLimit: false, listedPrice: null, ...over,
  };
}

function member(id: string, position: SquadMember["position"], rating: number, over: Partial<SquadMember> = {}): SquadMember {
  return { id, position, rating, age: 26, rosterTeamId: "club", isU21Roster: false, loanedIn: false, injured: false, ...over };
}

/** Kádr 4-4-2 se 20 hráči: 2 brankáři, 6 obránců, 6 záložníků, 4 útočníci (hodnocení 40–55). */
function fullSquad(): SquadMember[] {
  const out: SquadMember[] = [member("gk1", "GK", 50), member("gk2", "GK", 44)];
  [55, 52, 50, 48, 44, 40].forEach((r, i) => out.push(member(`def${i + 1}`, "DEF", r)));
  [54, 51, 49, 47, 43, 41].forEach((r, i) => out.push(member(`mid${i + 1}`, "MID", r)));
  [53, 50, 45, 42].forEach((r, i) => out.push(member(`fwd${i + 1}`, "FWD", r)));
  return out;
}

describe("ocenění hráče AI trenérem", () => {
  it("rezervace nikdy neklesne pod 60 % tržní hodnoty, ať je povaha a postavení jakékoli", () => {
    for (let i = 0; i < 300; i++) {
      const p = generateAiProfile(`team-${i}`, null);
      const mv = 500 + i * 517;
      for (const importance of IMPORTANCES) {
        const r = reservationPrice({ marketValue: mv, importance, profile: p, playerId: `p-${i}`, now: NOW });
        expect(r).toBeGreaterThanOrEqual(mv * HARD_FLOOR_RATIO);
      }
    }
  });

  it("opora stojí víc než hráč do rotace a ten víc než přebytečný", () => {
    const p = profile();
    const [key, rotation, surplus] = IMPORTANCES.map((importance) =>
      reservationPrice({ marketValue: 30_000, importance, profile: p, playerId: "x", now: NOW }));
    expect(key).toBeGreaterThan(rotation);
    expect(rotation).toBeGreaterThan(surplus);
    expect(IMPORTANCE_MULTIPLIER.key).toBeGreaterThan(IMPORTANCE_MULTIPLIER.surplus);
  });

  it("opakované nabídky ve 14denním okně vidí stejnou rezervaci (šum je pevný na hráče a okno)", () => {
    const p = profile();
    const windowStart = new Date(valuationWindow(NOW) * VALUATION_WINDOW_DAYS * DAY);
    const sameWindow = [0, 1, 5, 9, 13].map((d) => new Date(windowStart.getTime() + d * DAY + 3_600_000));
    for (const playerId of ["a", "b", "c", "d"]) {
      const values = sameWindow.map((now) => reservationPrice({ marketValue: 25_000, importance: "rotation", profile: p, playerId, now }));
      expect(new Set(values).size).toBe(1);
      const asks = sameWindow.map((now) => openingAsk({ marketValue: 25_000, importance: "rotation", profile: p, playerId, now }));
      expect(new Set(asks).size).toBe(1);
    }
    // Za další okno se cena posune (šum se mění), u některého z hráčů určitě.
    const next = new Date(windowStart.getTime() + VALUATION_WINDOW_DAYS * DAY + 3_600_000);
    const changed = ["a", "b", "c", "d", "e", "f"].some((playerId) =>
      reservationPrice({ marketValue: 25_000, importance: "rotation", profile: p, playerId, now: sameWindow[0] })
        !== reservationPrice({ marketValue: 25_000, importance: "rotation", profile: p, playerId, now: next }));
    expect(changed).toBe(true);
  });

  it("splátky s 10% zálohou mají nižší současnou hodnotu než hotovost (AI je bere jen s přirážkou)", () => {
    const amount = 60_000;
    const instalments: TransferTerms = { amount, upfrontPct: 10, installments: 20, sellOnPct: 0 };
    expect(presentValue(instalments, 30_000)).toBeLessThan(presentValue(cash(amount), 30_000));
    // Aspoň čtvrtina dolů: přirážka za splátky není symbolická.
    expect(presentValue(instalments, 30_000)).toBeLessThan(amount * 0.8);
    // Pro kupujícího jsou splátky levnější, ale bez srážky za riziko.
    expect(presentCost(instalments, 30_000)).toBeGreaterThan(presentValue(instalments, 30_000));
  });

  it("procenta z dalšího prodeje mají malou, ale kladnou cenu", () => {
    const withSellOn: TransferTerms = { amount: 20_000, upfrontPct: 100, installments: 0, sellOnPct: 50 };
    const extra = presentValue(withSellOn, 20_000) - 20_000;
    expect(extra).toBeGreaterThan(0);
    expect(extra).toBeLessThan(20_000 * 0.15);
  });

  it("strop nákupu respektuje rezervu na provoz a šetrný trenér platí míň", () => {
    const base = { marketValue: 40_000, need: 1, playerId: "t", now: NOW };
    expect(maxBuyPrice({ ...base, profile: profile(), spendable: 10_000 })).toBeLessThanOrEqual(10_000);
    const thrifty = maxBuyPrice({ ...base, profile: profile({ ambition: 20, thrift: 90 }), spendable: 1_000_000 });
    const ambitious = maxBuyPrice({ ...base, profile: profile({ ambition: 90, thrift: 15 }), spendable: 1_000_000 });
    expect(ambitious).toBeGreaterThan(thrifty);
    expect(budgetReserve(profile({ thrift: 90 }), 5_000)).toBeGreaterThan(budgetReserve(profile({ thrift: 10 }), 5_000));
  });
});

describe("pokusy AI klub obrat", () => {
  it("nabídka pod 60 % tržní hodnoty se nikdy nepřijme (hotově, na splátky, s procenty, s výměnou)", () => {
    const mv = 30_000;
    const lowball = Math.floor(mv * 0.59 / 100) * 100;
    const structures: TransferTerms[] = [
      cash(lowball),
      { amount: lowball, upfrontPct: 10, installments: 10, sellOnPct: 0 },
      { amount: lowball, upfrontPct: 100, installments: 0, sellOnPct: 50 },
    ];
    for (let i = 0; i < 60; i++) {
      const p = generateAiProfile(`club-${i}`, null);
      for (const importance of IMPORTANCES) {
        for (const terms of structures) {
          const d = decideSellerReply(sellerInput({ terms, marketValue: mv, importance, profile: p, playerId: `pl-${i}`, overDealLimit: false }));
          expect(d.kind).not.toBe("accept");
        }
        // Ani s inzerátem za směšnou cenu (AI by si takový nedala, ale pojistka platí i tak).
        const listed = decideSellerReply(sellerInput({ terms: cash(lowball), marketValue: mv, importance, profile: p, listedPrice: lowball }));
        expect(listed.kind).toBe("reject");
      }
    }
  });

  it("60% pojistku nejde obejít procenty z dalšího prodeje: počítá se jen jistá část", () => {
    const mv = 30_000;
    const cashPart = Math.floor(mv * 0.59 / 100) * 100;
    // Nejmírnější prodávající (přebytečný hráč, obchodník bez ambicí, nejnižší šum by stačil).
    const soft = profile({ ambition: 0, trading: 100 });
    for (let i = 0; i < 40; i++) {
      const d = decideSellerReply(sellerInput({
        terms: { amount: cashPart, upfrontPct: 100, installments: 0, sellOnPct: 50 },
        marketValue: mv, importance: "surplus", profile: soft, playerId: `soft-${i}`,
      }));
      expect(d).toMatchObject({ kind: "reject", reason: "hard_floor" });
    }
  });

  it("ani zoufale potřebný post AI nepřinutí zaplatit víc než 1,35 tržní hodnoty", () => {
    const greedy = profile({ ambition: 100, thrift: 0 });
    for (let i = 0; i < 50; i++) {
      const max = maxBuyPrice({ marketValue: 20_000, need: 1, profile: greedy, playerId: `p-${i}`, now: NOW, spendable: 10_000_000 });
      expect(max).toBeLessThanOrEqual(20_000 * MAX_BUY_TO_VALUE);
    }
  });

  it("urážlivá nabídka hluboko pod rezervací se odmítne hned, bez protinávrhu", () => {
    const input = sellerInput({ terms: cash(15_000), marketValue: 20_000, importance: "rotation" });
    const reservation = reservationPrice({ marketValue: 20_000, importance: "rotation", profile: input.profile, playerId: input.playerId, now: NOW });
    expect(15_000).toBeLessThan(reservation * INSULT_RATIO);
    expect(decideSellerReply(input).kind).toBe("reject");
  });

  it("opakované smlouvání nikdy nesrazí cenu pod rezervaci a trpělivost dojde", () => {
    const p = profile({ patience: 50 });
    const mv = 20_000;
    const reservation = reservationPrice({ marketValue: mv, importance: "rotation", profile: p, playerId: "player-1", now: NOW });
    const asks: number[] = [];
    const bids: number[] = [];
    let bid = Math.ceil(reservation * 0.85 / 100) * 100;
    let rejected = false;
    for (let round = 0; round < 10; round++) {
      const d = decideSellerReply(sellerInput({ terms: cash(bid), marketValue: mv, profile: p, previousAsks: asks, previousBids: bids }));
      expect(d.kind).not.toBe("accept");
      if (d.kind === "reject") { rejected = true; break; }
      if (d.kind === "counter") {
        expect(d.ask).toBeGreaterThanOrEqual(reservation);
        asks.push(d.ask);
      }
      bids.push(bid);
      bid += 100; // kupující přidává po stovkách a zkouší, kde je dno
    }
    expect(rejected).toBe(true);
  });

  it("stažení a nová nabídka AI nevynuluje: dřívější kola se počítají", () => {
    const p = profile({ patience: 0 });
    const mv = 20_000;
    const reservation = reservationPrice({ marketValue: mv, importance: "rotation", profile: p, playerId: "player-1", now: NOW });
    const bid = Math.ceil(reservation * 0.9 / 100) * 100;
    const fresh = decideSellerReply(sellerInput({ terms: cash(bid), marketValue: mv, profile: p }));
    expect(fresh.kind).toBe("counter");
    // Stejný kupující už dvakrát smlouval (dvě kola) v jiném jednání o témže hráči.
    const again = decideSellerReply(sellerInput({ terms: cash(bid), marketValue: mv, profile: p, previousAsks: [reservation * 1.2, reservation * 1.1], previousBids: [bid, bid] }));
    expect(again.kind).toBe("reject");
  });

  it("výměna za slabšího hráče se nepřijme: šunt má pro AI skoro nulovou cenu", () => {
    const squad = analyzeSquad(fullSquad(), profile());
    // Chce oporu záložníka (54), nabízí slabšího záložníka (40) a malý doplatek. Nominálně „tržní cena“.
    const target = { rating: 54, age: 25, position: "MID" };
    const mvTarget = marketValue(target.rating, target.age, target.position);
    const weaker = { rating: 40, age: 25, position: "MID" };
    const mvWeaker = marketValue(weaker.rating, weaker.age, weaker.position);
    expect(squad.isUseful(weaker)).toBe(false);
    const swapValue = swapPlayerValue({ marketValue: mvWeaker, useful: false });
    const topUp = Math.max(100, Math.ceil((mvTarget - mvWeaker) / 100) * 100);
    const d = decideSellerReply(sellerInput({
      terms: cash(topUp), marketValue: mvTarget, importance: squad.importanceOf("mid1"), swapValue, playerId: "mid1",
      block: squad.sellBlock("mid1", [{ position: "MID", rating: weaker.rating }]),
    }));
    expect(d.kind).not.toBe("accept");
    // Mladý „talent“ s nafouknutou tržní cenou (věk 19) taky ne.
    const youngJunk = { rating: 36, age: 19, position: "MID" };
    const youngValue = swapPlayerValue({ marketValue: marketValue(youngJunk.rating, youngJunk.age, youngJunk.position), useful: squad.isUseful(youngJunk) });
    const d2 = decideSellerReply(sellerInput({ terms: cash(2_000), marketValue: mvTarget, importance: "key", swapValue: youngValue, playerId: "mid1" }));
    expect(d2.kind).not.toBe("accept");
  });

  it("posledního brankáře AI neprodá ani za dvojnásobek", () => {
    const squad = analyzeSquad(fullSquad().filter((m) => m.id !== "gk2"), profile());
    expect(squad.sellBlock("gk1")).toBe("last_goalkeeper");
    const mv = marketValue(50, 26, "GK");
    const d = decideSellerReply(sellerInput({ terms: cash(mv * 3), marketValue: mv, importance: squad.importanceOf("gk1"), block: squad.sellBlock("gk1") }));
    expect(d.kind).toBe("reject");
    // S dalším brankářem v kádru už prodat jde.
    expect(analyzeSquad(fullSquad(), profile()).sellBlock("gk2")).toBeNull();
  });

  it("pod minimum kádru AI nikoho nepustí a oporu jen s náhradou", () => {
    const small = fullSquad().slice(0, 16);
    const squad = analyzeSquad(small, profile());
    expect(squad.seniorOwnCount).toBe(16);
    expect(squad.sellBlock("def5")).toBe("min_squad");
    // Výměna kus za kus kádr nezmenší.
    expect(squad.sellBlock("def5", [{ position: "DEF", rating: 45 }])).not.toBe("min_squad");

    // Útočník 60 výrazně nad ostatními: bez náhrady nejde, s náhradou na výměnu ano.
    const star = [...fullSquad().filter((m) => m.id !== "fwd1"), member("star", "FWD", 62)];
    const withStar = analyzeSquad(star, profile());
    expect(withStar.importanceOf("star")).toBe("key");
    expect(withStar.sellBlock("star")).toBe("key_without_replacement");
    expect(withStar.sellBlock("star", [{ position: "FWD", rating: 57 }])).toBeNull();
  });

  it("nad limitem obchodů za měsíc chce AI víc, ale pojistky platí dál", () => {
    const mv = 20_000;
    const p = profile();
    const reservation = reservationPrice({ marketValue: mv, importance: "surplus", profile: p, playerId: "player-1", now: NOW });
    const normal = decideSellerReply(sellerInput({ terms: cash(reservation), marketValue: mv, importance: "surplus", profile: p }));
    expect(["accept", "counter"]).toContain(normal.kind);
    const limited = decideSellerReply(sellerInput({ terms: cash(reservation), marketValue: mv, importance: "surplus", profile: p, overDealLimit: true }));
    expect(limited.kind).not.toBe("accept");
  });

  it("nabídka na úrovni požadavku projde, protinávrh drží strukturu kupujícího", () => {
    const mv = 20_000;
    const p = profile();
    const ask = openingAsk({ marketValue: mv, importance: "rotation", profile: p, playerId: "player-1", now: NOW });
    expect(decideSellerReply(sellerInput({ terms: cash(ask), marketValue: mv, profile: p })).kind).toBe("accept");
    const reservation = reservationPrice({ marketValue: mv, importance: "rotation", profile: p, playerId: "player-1", now: NOW });
    const instalments: TransferTerms = { amount: Math.ceil(reservation * 0.9 / 100) * 100, upfrontPct: 30, installments: 6, sellOnPct: 0 };
    const d = decideSellerReply(sellerInput({ terms: instalments, marketValue: mv, profile: p }));
    expect(d.kind).toBe("counter");
    if (d.kind === "counter") {
      expect(d.terms.installments).toBe(6);
      expect(presentValue(d.terms, mv)).toBeGreaterThanOrEqual(d.ask);
    }
  });

  it("klub mimo hru nesmlouvá: pod rezervací odmítnutí, nad ní přijetí", () => {
    const mv = 20_000;
    const p = profile();
    const reservation = reservationPrice({ marketValue: mv, importance: "rotation", profile: p, playerId: "player-1", now: NOW });
    expect(decideSellerReply(sellerInput({ terms: cash(reservation - 1000), marketValue: mv, profile: p, virtualBuyer: true })).kind).toBe("reject");
    expect(decideSellerReply(sellerInput({ terms: cash(reservation + 100), marketValue: mv, profile: p, virtualBuyer: true })).kind).toBe("accept");
  });
});

describe("hostování a nákup", () => {
  it("oporu AI nepůjčí, přebytečného mladíka i zadarmo", () => {
    expect(requiredLoanFee({ marketValue: 20_000, age: 25, importance: "key", loanDays: 30 })).toBeNull();
    expect(requiredLoanFee({ marketValue: 20_000, age: 19, importance: "surplus", loanDays: 30 })).toBe(0);
    const keyLoan = decideSellerReply(sellerInput({ offerType: "loan", loanDays: 30, terms: cash(50_000), importance: "key" }));
    expect(keyLoan.kind).toBe("reject");
    const youngLoan = decideSellerReply(sellerInput({ offerType: "loan", loanDays: 45, terms: { amount: 0, upfrontPct: 100, installments: 0, sellOnPct: 0 }, importance: "surplus", age: 19 }));
    expect(youngLoan.kind).toBe("accept");
  });

  it("kupující AI: do stropu bere, kousek nad stropem přidá, hodně nad stropem odejde", () => {
    const p = profile();
    const base = { marketValue: 20_000, maxPrice: 22_000, lastOwnBid: 17_000, rounds: 0, profile: p };
    expect(decideBuyerReply({ ...base, terms: cash(21_500) }).kind).toBe("accept");
    const raise = decideBuyerReply({ ...base, terms: cash(24_000) });
    expect(raise.kind).toBe("counter");
    if (raise.kind === "counter") {
      expect(raise.terms.amount).toBeGreaterThan(17_000);
      expect(raise.terms.amount).toBeLessThanOrEqual(22_000);
    }
    expect(decideBuyerReply({ ...base, terms: cash(40_000) }).kind).toBe("withdraw");
    expect(decideBuyerReply({ ...base, rounds: 9, terms: cash(24_000) }).kind).toBe("withdraw");
  });
});

describe("lidská prodleva odpovědi", () => {
  it("odpověď přijde za 1 až 20 hodin a vždy do lhůty nabídky", () => {
    for (let i = 0; i < 200; i++) {
      const p = generateAiProfile(`t-${i}`, null);
      const h = replyDelayHours(`offer-${i}`, p);
      expect(h).toBeGreaterThanOrEqual(MIN_REPLY_HOURS);
      expect(h).toBeLessThanOrEqual(MAX_REPLY_HOURS);
      const last = new Date(NOW.getTime() - i * 3_600_000);
      const expires = new Date(last.getTime() + 3 * DAY);
      const due = replyDueAt(last, expires, h);
      expect(due.getTime()).toBeLessThan(expires.getTime());
      expect(due.getTime()).toBeGreaterThanOrEqual(last.getTime() + MIN_REPLY_HOURS * 3_600_000);
    }
    // Lhůta za hodinu: AI odpoví hned, nečeká na prodlevu.
    const last = new Date(NOW.getTime() - 71 * 3_600_000);
    expect(replyDueAt(last, new Date(NOW.getTime() + 3_600_000), 20).getTime()).toBeLessThanOrEqual(NOW.getTime());
  });

  it("stejný tah dá vždy stejnou prodlevu (opakovaný běh nic nezmění)", () => {
    const p = profile();
    expect(replyDelayHours("offer-x|1", p)).toBe(replyDelayHours("offer-x|1", p));
  });
});
