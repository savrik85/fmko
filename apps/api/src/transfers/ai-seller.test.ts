/**
 * Cizí klub jako prodávající — smlouvá nahoru, pod rezervační cenu nejde, urážka a
 * přešlapování ho stojí trpělivost, splátky nejsou levnější než hotovost.
 */
import { describe, it, expect } from "vitest";
import {
  AI_SELLER, aiReplyDueAt, decideAiSellerReply, effectiveBidValue, initAiSellerState, rankMultiplier,
  termsForValue, type AiSellerState,
} from "./ai-seller";
import { transferTermsError, type TransferTerms } from "@okresni-masina/shared";

const cash = (amount: number): TransferTerms => ({ amount, upfrontPct: 100, installments: 0, sellOnPct: 0 });

const poached = (o: Partial<AiSellerState> = {}): AiSellerState => ({
  stance: "poached", reservation: 20_000, ask: 26_000, patience: 2, round: 0, lastBidValue: 0,
  keyPlayer: false, seed: 42, ...o,
});

describe("výchozí stav prodávajícího", () => {
  it("klub z inzerátu začíná cenou inzerátu a rezervaci má pod ní", () => {
    for (let seed = 1; seed < 200; seed++) {
      const s = initAiSellerState({ stance: "listed", marketValue: 30_000, askingPrice: 31_000, seed });
      expect(s.ask).toBe(31_000);
      expect(s.reservation).toBeLessThanOrEqual(s.ask);
      expect(s.patience).toBe(AI_SELLER.listed.patience);
    }
  });

  it("opora klubu je dražší než náhradník a klub je s ní netrpělivější", () => {
    const avg = (rank: number) => {
      let sum = 0;
      for (let seed = 1; seed <= 400; seed++) sum += initAiSellerState({ stance: "poached", marketValue: 20_000, clubRank: rank, seed }).reservation;
      return sum / 400;
    };
    expect(avg(1)).toBeGreaterThan(avg(5));
    expect(avg(5)).toBeGreaterThan(avg(15));
    expect(initAiSellerState({ stance: "poached", marketValue: 20_000, clubRank: 1, seed: 7 }).patience).toBe(1);
    expect(initAiSellerState({ stance: "poached", marketValue: 20_000, clubRank: 6, seed: 7 }).patience).toBe(2);
    expect(rankMultiplier(1)).toBeGreaterThan(rankMultiplier(2));
  });

  it("vyfukovaný klub začíná výš než klub, který hráče sám nabízí", () => {
    let listed = 0, pched = 0;
    for (let seed = 1; seed <= 300; seed++) {
      listed += initAiSellerState({ stance: "listed", marketValue: 20_000, askingPrice: 20_000, seed }).reservation;
      pched += initAiSellerState({ stance: "poached", marketValue: 20_000, clubRank: 8, seed }).reservation;
    }
    expect(pched).toBeGreaterThan(listed);
  });

  it("po ukončeném jednání má klub o trpělivost míň, ale aspoň jednu", () => {
    const s = initAiSellerState({ stance: "listed", marketValue: 20_000, askingPrice: 20_000, seed: 3, priorBreakOffs: 1 });
    expect(s.patience).toBe(AI_SELLER.listed.patience - 1);
    const s2 = initAiSellerState({ stance: "listed", marketValue: 20_000, askingPrice: 20_000, seed: 3, priorBreakOffs: 9 });
    expect(s2.patience).toBe(1);
  });

  it("stejný seed dá stejný stav", () => {
    const a = initAiSellerState({ stance: "poached", marketValue: 18_000, clubRank: 3, seed: 99 });
    const b = initAiSellerState({ stance: "poached", marketValue: 18_000, clubRank: 3, seed: 99 });
    expect(a).toEqual(b);
  });
});

describe("splátky mají pro klub menší cenu než hotovost", () => {
  it("hotovost = nominál, splátky méně, delší splátky ještě méně", () => {
    expect(effectiveBidValue(cash(40_000))).toBe(40_000);
    const short = effectiveBidValue({ amount: 40_000, upfrontPct: 50, installments: 4, sellOnPct: 0 });
    const long = effectiveBidValue({ amount: 40_000, upfrontPct: 10, installments: 20, sellOnPct: 0 });
    expect(short).toBeLessThan(40_000);
    expect(long).toBeLessThan(short);
    // 10 % zálohy a 20 splátek: klub to počítá zhruba na 84 % ceny (spec).
    expect(long / 40_000).toBeGreaterThan(0.82);
    expect(long / 40_000).toBeLessThan(0.85);
  });

  it("protinávrh se splátkami má požadovanou hodnotu a platné podmínky", () => {
    const structure: TransferTerms = { amount: 30_000, upfrontPct: 30, installments: 10, sellOnPct: 0 };
    const t = termsForValue(25_000, structure);
    expect(transferTermsError(t)).toBeNull();
    expect(t.upfrontPct).toBe(30);
    expect(t.installments).toBe(10);
    expect(effectiveBidValue(t)).toBeGreaterThanOrEqual(25_000);
    expect(effectiveBidValue(t)).toBeLessThan(25_000 + 400);
  });

  it("když se splátky nevejdou do pravidel, klub chce vše hned", () => {
    const structure: TransferTerms = { amount: 3_000, upfrontPct: 10, installments: 5, sellOnPct: 0 };
    const t = termsForValue(2_000, structure);
    expect(t.installments).toBe(0);
    expect(t.upfrontPct).toBe(100);
  });
});

describe("odpověď klubu", () => {
  it("nabídka na požadavek nebo nad něj = souhlas", () => {
    expect(decideAiSellerReply(poached(), cash(26_000)).kind).toBe("agree");
    expect(decideAiSellerReply(poached(), cash(30_000)).kind).toBe("agree");
  });

  it("nabídka přesně za inzerovanou cenu (i nekulatou) = souhlas", () => {
    const s = initAiSellerState({ stance: "listed", marketValue: 6_000, askingPrice: 6_164, seed: 9 });
    expect(decideAiSellerReply(s, cash(6_164)).kind).toBe("agree");
  });

  it("nad rezervací klub buď souhlasí, nebo v prvním kole ještě přitlačí", () => {
    const kinds = new Set<string>();
    for (let seed = 1; seed <= 200; seed++) {
      const r = decideAiSellerReply(poached({ seed }), cash(22_000));
      kinds.add(r.kind);
      if (r.kind === "counter") {
        expect(r.tone).toBe("squeeze");
        expect(effectiveBidValue(r.counterTerms!)).toBeGreaterThan(22_000);
        expect(effectiveBidValue(r.counterTerms!)).toBeLessThan(26_000);
      }
    }
    expect(kinds).toEqual(new Set(["agree", "counter"]));
  });

  it("klub z inzerátu nad rezervací nepřitlačuje", () => {
    for (let seed = 1; seed <= 100; seed++) {
      const r = decideAiSellerReply(poached({ stance: "listed", seed }), cash(22_000));
      expect(r.kind).toBe("agree");
    }
  });

  it("pod rezervací protinávrh, který neklesne pod rezervaci ani nestoupne", () => {
    const r = decideAiSellerReply(poached(), cash(18_000));
    expect(r.kind).toBe("counter");
    const v = effectiveBidValue(r.counterTerms!);
    expect(v).toBeGreaterThanOrEqual(20_000);
    expect(v).toBeLessThan(26_000);
    expect(r.nextState.ask).toBeLessThan(26_000);
    expect(r.nextState.patience).toBe(2); // blízko = trpělivost zůstává
  });

  it("urážka ubere dvě trpělivosti a klub neslevuje", () => {
    const r = decideAiSellerReply(poached({ patience: 3 }), cash(8_000));
    expect(r.kind).toBe("counter");
    expect(r.tone).toBe("insulted");
    expect(r.nextState.patience).toBe(1);
    expect(r.nextState.ask).toBe(26_000);
  });

  it("opora a nabídka za 60 % požadavku = konec jednání hned", () => {
    const r = decideAiSellerReply(poached({ patience: 1, keyPlayer: true }), cash(15_600));
    expect(r.kind).toBe("break_off");
  });

  it("přešlapování na místě stojí trpělivost", () => {
    const after1 = decideAiSellerReply(poached(), cash(18_000)).nextState;
    const r2 = decideAiSellerReply(after1, cash(18_000));
    expect(r2.nextState.patience).toBe(after1.patience - 1);
  });

  it("vytrvalé drobné přidávání pod rezervací skončí po nejvýš maxRounds kolech", () => {
    let state = poached({ patience: 3, reservation: 25_000, ask: 26_000 });
    let bid = 19_000;
    let result: string = "";
    for (let i = 0; i < 20; i++) {
      const r = decideAiSellerReply(state, cash(bid));
      result = r.kind;
      if (r.kind !== "counter") break;
      state = r.nextState;
      bid += 200;
    }
    expect(result).toBe("break_off");
    expect(state.round).toBeLessThan(AI_SELLER.maxRounds);
  });

  it("kupující, který postupně přidává, se ke shodě dostane", () => {
    let state = initAiSellerState({ stance: "poached", marketValue: 20_000, clubRank: 6, seed: 11 });
    let bid = Math.round(state.ask * 0.75 / 100) * 100;
    let kind = "";
    for (let i = 0; i < 10; i++) {
      const r = decideAiSellerReply(state, cash(bid));
      kind = r.kind;
      if (r.kind !== "counter") break;
      state = r.nextState;
      // Kupující se posune do půlky mezi svou nabídkou a protinávrhem.
      bid = Math.round((bid + r.counterTerms!.amount) / 2 / 100) * 100 + 100;
    }
    expect(kind).toBe("agree");
  });

  it("stejný stav a návrh = stejná odpověď", () => {
    const a = decideAiSellerReply(poached({ seed: 5 }), cash(21_000));
    const b = decideAiSellerReply(poached({ seed: 5 }), cash(21_000));
    expect(a).toEqual(b);
  });
});

describe("kdy odpověď dorazí", () => {
  it("odpoledne za 1–4 hodiny", () => {
    // 10:00 UTC = 12:00 v Praze (léto)
    const now = new Date("2026-07-15T10:00:00Z");
    for (let seed = 1; seed < 100; seed++) {
      const due = aiReplyDueAt(now, seed).getTime() - now.getTime();
      expect(due).toBeGreaterThanOrEqual(60 * 60_000);
      expect(due).toBeLessThanOrEqual(240 * 60_000);
    }
  });

  it("v noci až ráno mezi sedmou a půl devátou pražského času", () => {
    // 21:00 UTC = 23:00 v Praze (léto)
    const now = new Date("2026-07-15T21:00:00Z");
    for (let seed = 1; seed < 100; seed++) {
      const due = aiReplyDueAt(now, seed);
      const hour = Number(new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Prague", hour: "numeric", hour12: false }).format(due));
      expect(hour).toBeGreaterThanOrEqual(7);
      expect(hour).toBeLessThanOrEqual(8);
    }
  });
});
