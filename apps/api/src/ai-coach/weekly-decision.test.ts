import { describe, expect, it } from "vitest";
import { CONCESSION_CATALOG, CONCESSION_PRODUCT_KEYS, type ProductKey } from "../season/concession-catalog";
import type { StockByTier } from "../season/concession-stock";
import { computeSelfConcessionMatch } from "../season/fans-processor";
import {
  buildConcessionContext, concessionTopUpPlan, emptyConcessionContext, fallbackConcessions, fallbackProductChoice, MIN_TOPUP_COVER,
  planConcessionTopUp, salesFor, type ConcessionContext, type ConcessionFixture, type ConcessionMode, type ConcessionTopUpPlan,
} from "./concession-decision";
import { generateAiProfile, type AiCoachProfile } from "./profile";
import {
  buildTrainingPlan, computeReserve, fallbackWeeklyDecision, investBudgetFor, nextTicketPrice, planWeeklyActions, renderWeeklyPrompt,
  reserveWeeksFor, validateWeeklyDecision, weeklyDecisionSchema, MIN_RESERVE,
  type WeeklyContext, type WeeklyDecision,
} from "./weekly-decision";

function profile(over: Partial<AiCoachProfile> = {}): AiCoachProfile {
  return { ...generateAiProfile("team-weekly", null), ...over };
}

/** Čtvrteční ligový zápas doma, 200 diváků (silnější návštěva 260), zataženo a 10 °C. */
const HOME_MATCH: ConcessionFixture = { id: "m-home", kind: "league", day: "2026-11-05", attendance: 200, peak: 260, weather: "cloudy", temperature: 10 };

interface ConcessionOptions {
  mode?: ConcessionMode;
  refreshments?: number;
  fixtures?: ConcessionFixture[];
  /** Sklad a nastavení produktu (výchozí: L1 za doporučenou cenu, prázdný sklad). */
  stock?: Partial<Record<ProductKey, { level?: number; price?: number; stockByTier?: StockByTier }>>;
}

function concessionCtx(spendable: number, o: ConcessionOptions = {}): ConcessionContext {
  return buildConcessionContext({
    mode: o.mode ?? "external",
    refreshmentsLevel: o.refreshments ?? 1,
    externalWeeklyIncome: 900,
    satisfaction: 60,
    demandMul: 1,
    attendance: { average: 200, peak: 260, matches: 10 },
    fixtures: o.fixtures ?? [HOME_MATCH],
    spendable,
    stock: CONCESSION_PRODUCT_KEYS.map((key) => {
      const s = o.stock?.[key] ?? {};
      const level = s.level ?? 1;
      return { key, qualityLevel: level, sellPrice: s.price ?? CONCESSION_CATALOG[key].tiers[level].defaultSellPrice, stockByTier: s.stockByTier ?? [0, 0, 0, 0] };
    }),
  });
}

/** Týdenní kontext s bufetem, kde se dá rozhodovat (vlastní občerstvení L1, domácí zápas ve čtvrtek). */
function withConcessions(ctx: WeeklyContext, o: ConcessionOptions = {}): WeeklyContext {
  return { ...ctx, concessions: concessionCtx(ctx.finance.spendable, o) };
}

function tierOf(c: ConcessionContext, key: ProductKey, level: number) {
  const tier = c.products.find((p) => p.key === key)?.tiers.find((t) => t.level === level);
  if (!tier) throw new Error(`v nabídce chybí ${key} L${level}`);
  return tier;
}

function context(budget: number, p: AiCoachProfile = profile()): WeeklyContext {
  const running = 6000;
  const reserve = computeReserve(p, running);
  return {
    teamId: "team-weekly", teamName: "TJ Týdenní", gameDay: "2026-11-02", budget, reputation: 50, profile: p,
    finance: { weeklyRunningCost: running, weeklyIncome: 7000, reserveWeeks: reserveWeeksFor(p), reserve, spendable: Math.max(0, budget - reserve) },
    league: { position: 6, teams: 14, points: 12, played: 8 },
    training: { type: "conditioning", approach: "balanced", sessions: 2, matchWeekdays: [1, 4], avgCondition: 85, injured: 1, squadSize: 21, youngPlayers: 5 },
    fans: { satisfaction: 60, ticketPrice: 30, villageBasePrice: 30, daysSinceTicketChange: null },
    pitch: { condition: 40, type: "natural", careMode: "auto", hasCareEquipment: false, hasMower: false },
    stadium: [
      { key: "S1", ref: "changing_rooms", label: "changing_rooms 0->1", cost: 25_000, detail: "šatny" },
      { key: "S2", ref: "lighting", label: "lighting 0->1", cost: 95_000, detail: "osvětlení" },
    ],
    equipmentUpgrades: [
      { key: "E1", ref: "balls", label: "balls 1->2", cost: 4_000, detail: "míče" },
      { key: "E2", ref: "mower", label: "mower 0->1", cost: 18_000, detail: "sekačka" },
      { key: "E3", ref: "team_van", label: "team_van 0->1", cost: 120_000, detail: "dodávka" },
    ],
    equipmentRepairs: [{ key: "R1", ref: "jerseys", label: "jerseys level 1", cost: 600, detail: "state 40 %", condition: 40 }],
    staff: {
      hiredRoles: [],
      candidates: [
        { key: "C1", ref: "staff-1", role: "asistent", label: "Petr Pomocník", detail: "coaching 12", cost: 3_000, weeklyWage: 700 },
        { key: "C2", ref: "staff-2", role: "maser", label: "Iva Masérka", detail: "medicine 9", cost: 2_000, weeklyWage: 500 },
      ],
    },
    academy: { current: "none", weeklyCostNow: 0 },
    banners: {
      active: 4, max: 6,
      offers: [
        { key: "B1", ref: "Pekárna Novák", label: "Pekárna Novák", cost: 0, detail: "food", monthly: 900, seasons: 2, sponsorType: "food" },
        { key: "B2", ref: "Autoservis Kolo", label: "Autoservis Kolo", cost: 0, detail: "auto", monthly: 700, seasons: 1, sponsorType: "auto" },
        { key: "B3", ref: "Hospoda U Lípy", label: "Hospoda U Lípy", cost: 0, detail: "pub", monthly: 500, seasons: 1, sponsorType: "pub" },
      ],
    },
    u21: {
      exists: true, aTeamSize: 21,
      promote: [{ key: "U1", playerId: "young-1", label: "MID 19y rating 41" }],
      sendDown: [{ key: "Y1", playerId: "young-2", label: "DEF 18y rating 22" }],
    },
    transfers: {
      squadSize: 21, targetSize: 24,
      needs: [{ position: "FWD", need: 0.42, missing: 1, startersAverage: 44 }, { position: "DEF", need: 0.12, missing: 0, startersAverage: 50 }],
      surplus: [{ key: "L1", playerId: "old-1", label: "MID 35y rating 38" }, { key: "L2", playerId: "old-2", label: "DEF 33y rating 40" }],
    },
    // Bez vlastního občerstvení: o bufetu se nerozhoduje (starší testy týdne s ním nepočítají).
    concessions: emptyConcessionContext(),
  };
}

const everything: WeeklyDecision = {
  training: { focus: "technique", intensity: "hard", sessions: 4, approach: "strict" },
  ticketPrice: "raise",
  pitchMaintenance: "renovation",
  pitchCareMode: "keep",
  stadium: ["S1", "S2"],
  equipmentUpgrades: ["E1", "E2", "E3"],
  equipmentRepairs: ["R1"],
  hire: ["C1"],
  academy: "high",
  banners: ["B1", "B2", "B3"],
  promote: ["U1"],
  sendDown: ["Y1"],
  transfers: { stance: "sell", focus: ["FWD"], sell: ["L2"] },
  concessions: { mode: "external", products: [], decidedBy: "model" },
  reasoning: "all in",
};

function paid(plan: ReturnType<typeof planWeeklyActions>): number {
  return plan.actions.reduce((s, a) => s + ("cost" in a ? a.cost : 0), 0);
}

describe("rezerva podle šetrnosti", () => {
  it("šetrný trenér drží víc týdnů provozu než rozhazovačný", () => {
    expect(reserveWeeksFor(profile({ thrift: 90, ambition: 50 }))).toBeGreaterThan(reserveWeeksFor(profile({ thrift: 15, ambition: 50 })));
  });

  it("rezerva nikdy pod minimem", () => {
    expect(computeReserve(profile({ thrift: 0, ambition: 100 }), 0)).toBe(MIN_RESERVE);
  });
});

describe("týdenní správa nepřekročí rezervu", () => {
  for (const budget of [10_000, 40_000, 80_000, 400_000]) {
    it(`rozpočet ${budget} Kč: placené akce se vejdou do peněz nad rezervou`, () => {
      const ctx = context(budget);
      const plan = planWeeklyActions(ctx, everything);
      expect(paid(plan)).toBe(plan.totalCost);
      expect(plan.totalCost).toBeLessThanOrEqual(ctx.finance.spendable);
      expect(ctx.budget - plan.totalCost).toBeGreaterThanOrEqual(Math.min(ctx.budget, ctx.finance.reserve));
    });
  }

  it("bez peněz nad rezervou se nic placeného neprovede, bezplatné ano", () => {
    const ctx = context(5_000);
    const plan = planWeeklyActions(ctx, everything);
    expect(plan.totalCost).toBe(0);
    expect(plan.actions.some((a) => a.kind === "training")).toBe(true);
    expect(plan.actions.filter((a) => a.kind === "banner")).toHaveLength(2);
    expect(plan.skipped.some((s) => s.item === "S2")).toBe(true);
  });

  it("náhradní pravidlo se do rezervy vejde u šetrného i rozhazovačného trenéra", () => {
    for (const p of [profile({ thrift: 95, building: 20 }), profile({ thrift: 10, building: 95, ambition: 90 })]) {
      for (const budget of [20_000, 150_000, 600_000]) {
        const ctx = context(budget, p);
        const plan = planWeeklyActions(ctx, fallbackWeeklyDecision(ctx));
        expect(plan.totalCost).toBeLessThanOrEqual(ctx.finance.spendable);
      }
    }
  });

  it("stavby a vybavení jen do investičního rozpočtu podle chuti stavět", () => {
    const builder = context(400_000, profile({ building: 95, thrift: 20 }));
    const saver = context(400_000, profile({ building: 5, thrift: 20 }));
    const investOf = (ctx: WeeklyContext) => planWeeklyActions(ctx, everything).actions
      .filter((a) => a.kind === "stadium_upgrade" || a.kind === "equipment_upgrade")
      .reduce((s, a) => s + ("cost" in a ? a.cost : 0), 0);
    expect(investOf(saver)).toBeLessThanOrEqual(investBudgetFor(saver.profile, saver.finance.spendable));
    expect(investOf(builder)).toBeGreaterThan(investOf(saver));
  });

  it("volná místa na bannery se doplní nejlepšími nabídkami, i když je model nevybral", () => {
    const plan = planWeeklyActions(context(100_000), { ...everything, banners: [] });
    const signed = plan.actions.filter((a) => a.kind === "banner").map((a) => ("key" in a ? a.key : ""));
    expect(signed).toEqual(["B1", "B2"]);
  });

  it("bannery jen do volných míst", () => {
    const plan = planWeeklyActions(context(100_000), everything);
    expect(plan.actions.filter((a) => a.kind === "banner")).toHaveLength(2);
  });
});

describe("kontrola odpovědi modelu", () => {
  it("platná odpověď projde", () => {
    expect(validateWeeklyDecision(everything, context(100_000)).ok).toBe(true);
  });

  it("položka mimo nabídku se zahodí, zbytek rozhodnutí platí; nic mimo nabídku se neprovede", () => {
    const r = validateWeeklyDecision({ ...everything, stadium: ["S9", "S1"], hire: ["staff-1"], promote: ["Y1"] }, context(100_000));
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.decision.stadium).toEqual(["S1"]);
      expect(r.decision.hire).toEqual([]);
      expect(r.decision.promote).toEqual([]);
      expect(r.rejected.some((x) => x.includes("S9"))).toBe(true);
      const plan = planWeeklyActions(context(400_000), r.decision);
      expect(plan.actions.some((a) => a.kind === "hire")).toBe(false);
      expect(plan.actions.some((a) => a.kind === "promote")).toBe(false);
    }
  });

  it("neznámá volba výčtu (akademie, vstupné) shodí rozhodnutí", () => {
    expect(validateWeeklyDecision({ ...everything, academy: "elite" }, context(100_000)).ok).toBe(false);
    expect(validateWeeklyDecision({ ...everything, ticketPrice: "double" }, context(100_000)).ok).toBe(false);
  });

  it("přestupní kurz: platný projde a hráči z listiny se v plánu přeloží na id", () => {
    const r = validateWeeklyDecision(everything, context(100_000));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.decision.transfers).toEqual({ stance: "sell", focus: ["FWD"], sell: ["L2"] });
    expect(planWeeklyActions(context(100_000), r.decision).transfers).toEqual({ stance: "sell", focus: ["FWD"], sellIds: ["old-2"] });
  });

  it("chybný přestupní kurz nahradí náhradní, zbytek týdne platí; cizí klíče a posty se zahodí", () => {
    const bad = validateWeeklyDecision({ ...everything, transfers: { stance: "panic", focus: [], sell: [] } }, context(100_000));
    expect(bad.ok).toBe(true);
    if (bad.ok) {
      // Náhradní kurz: FWD má potřebu 0,42 a jsou peníze → kupovat, posílit útok.
      expect(bad.decision.transfers).toEqual({ stance: "buy", focus: ["FWD"], sell: [] });
      expect(bad.decision.stadium).toEqual(["S1", "S2"]);
      expect(bad.rejected.some((x) => x.includes("transfers.stance"))).toBe(true);
    }
    const missing = validateWeeklyDecision({ ...everything, transfers: undefined }, context(100_000));
    if (missing.ok) expect(missing.decision.transfers.stance).toBe("buy");
    const foreign = validateWeeklyDecision({ ...everything, transfers: { stance: "hold", focus: ["KEEPER", "MID"], sell: ["S1", "L1"] } }, context(100_000));
    expect(foreign.ok).toBe(true);
    if (foreign.ok) expect(foreign.decision.transfers).toEqual({ stance: "hold", focus: ["MID"], sell: ["L1"] });
  });

  it("náhradní kurz: bez peněz nad rezervou drží, přeplněný kádr obchodník prodává", () => {
    expect(fallbackWeeklyDecision(context(0)).transfers.stance).toBe("hold");
    const crowded = { ...context(0, profile({ trading: 70 })) };
    crowded.transfers = { ...crowded.transfers, squadSize: 27, needs: [] };
    expect(fallbackWeeklyDecision(crowded).transfers.stance).toBe("sell");
    const lean = { ...crowded, transfers: { ...crowded.transfers, squadSize: 22 } };
    expect(fallbackWeeklyDecision(lean).transfers.stance).toBe("hold");
  });

  it("počet tréninků mimo 1 až 5 se srovná do mezí, rozhodnutí platí", () => {
    const r = validateWeeklyDecision({ ...everything, training: { ...everything.training, sessions: 0 } }, context(100_000));
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.decision.training.sessions).toBe(1);
    const r9 = validateWeeklyDecision({ ...everything, training: { ...everything.training, sessions: 9 } }, context(100_000));
    if (r9.ok) expect(r9.decision.training.sessions).toBe(5);
    expect(validateWeeklyDecision({ ...everything, training: { ...everything.training, sessions: "hodně" } }, context(100_000)).ok).toBe(false);
  });
});

describe("tréninkový plán a vstupné", () => {
  it("netrénuje se v den zápasu, den před zápasem lehce", () => {
    const plan = buildTrainingPlan({ focus: "mixed", intensity: "hard", sessions: 5, matchWeekdays: [1, 4] } as never, [1, 4]);
    expect(plan["1"]).toBeUndefined();
    expect(plan["4"]).toBeUndefined();
    if (plan["3"]) expect(plan["3"].intensity).toBe("light");
    if (plan["0"]) expect(plan["0"].intensity).toBe("light");
    expect(Object.keys(plan)).toHaveLength(5);
  });

  it("zdražení o desetinu na pětikoruny, v mezích obce", () => {
    expect(nextTicketPrice(30, 30, "raise")).toBe(35);
    expect(nextTicketPrice(30, 30, "lower")).toBe(25);
    expect(nextTicketPrice(66, 30, "raise")).toBe(66);
    expect(nextTicketPrice(18, 30, "lower")).toBe(18);
  });

  it("prompt obsahuje peníze nad rezervou a nabídky s klíči", () => {
    const text = renderWeeklyPrompt(context(100_000));
    expect(text).toContain("Money you may spend this week");
    expect(text).toContain("S1: changing_rooms 0->1");
    expect(text).toContain("C1: asistent");
    expect(text).toContain("L1: MID 35y rating 38");
    expect(text).toContain("FWD need 0.42");
  });
});

// ── Bufet ──────────────────────────────────────────────────────────────────

type ProductAnswer = { tier: number; price: number; buy: number };

function concessionAnswer(products: Partial<Record<ProductKey, ProductAnswer>>, mode: ConcessionMode = "self") {
  return { ...everything, concessions: { mode, products } };
}

/** Odpověď modelu, kde každý produkt dostane platnou volbu v mezích nabídky. */
function validProducts(c: ConcessionContext, level: number, share = 0.5): Record<ProductKey, ProductAnswer> {
  return Object.fromEntries(c.products.map((p) => {
    const t = tierOf(c, p.key, level);
    return [p.key, { tier: level, price: t.defaultPrice, buy: Math.floor(t.maxBuy * share) }];
  })) as Record<ProductKey, ProductAnswer>;
}

function decided(ctx: WeeklyContext, raw: unknown) {
  const r = validateWeeklyDecision(raw, ctx);
  if (!r.ok) throw new Error(`rozhodnutí neprošlo: ${r.reason}`);
  return r;
}

describe("bufet: poptávka a meze", () => {
  it("očekávaný prodej se počítá stejně jako prodej v zápase", () => {
    const c = concessionCtx(50_000);
    const sale = computeSelfConcessionMatch(200, 60, [{ key: "beer", qualityLevel: 2, sellPrice: 35, stockQuantity: 100_000 }], "cloudy", 1, 10);
    expect(salesFor(c, "beer", 2, 35)).toBe(sale.products[0].sold);
    expect(tierOf(c, "beer", 2).expectedSales).toBe(sale.products[0].sold);
  });

  it("cena nad nákupní a pod cenou, za kterou nikdo nekoupí; nákup podle silnější návštěvy a peněz nad rezervou", () => {
    const c = concessionCtx(1_000_000);
    const beer = tierOf(c, "beer", 1);
    expect(beer.minPrice).toBe(15);
    // Doporučená 25 Kč × (1 + 1 / 0,8) = 56,25 → od 57 Kč nikdo nekoupí.
    expect(beer.maxPrice).toBe(56);
    expect(beer.maxBuy).toBe(salesFor(c, "beer", 1, beer.minPrice, "peak"));
    expect(beer.maxBuy).toBeGreaterThan(beer.expectedSales);
    // Málo peněz nad rezervou: nákup jen do nich.
    expect(tierOf(concessionCtx(2_000), "beer", 1).maxBuy).toBe(Math.floor(2_000 / 14));
    // Bez domácího zápasu do příští správy se nekupuje nic.
    expect(tierOf(concessionCtx(1_000_000, { fixtures: [] }), "beer", 1).maxBuy).toBe(0);
  });
});

describe("bufet: model volí, kód hlídá", () => {
  it("platná volba modelu: provoz, kvalita, cena i nákup jdou do plánu, nákup po trávníku a před náborem", () => {
    const ctx = withConcessions(context(400_000, profile({ thrift: 30 })));
    const c = ctx.concessions;
    const beer = tierOf(c, "beer", 2);
    const mulled = tierOf(c, "mulled_wine", 3);
    const r = decided(ctx, concessionAnswer({
      beer: { tier: 2, price: 38, buy: Math.min(900, beer.maxBuy) },
      sausage: { tier: 1, price: 30, buy: 40 },
      lemonade: { tier: 2, price: 25, buy: 0 },
      mulled_wine: { tier: 3, price: 60, buy: Math.min(50, mulled.maxBuy) },
    }));
    expect(r.rejected).toEqual([]);
    expect(r.decision.concessions.decidedBy).toBe("model");
    expect(r.decision.concessions.mode).toBe("self");
    expect(r.decision.concessions.products.every((p) => p.decidedBy === "model")).toBe(true);

    const plan = planWeeklyActions(ctx, r.decision);
    const kinds = plan.actions.map((a) => a.kind);
    expect(plan.actions).toContainEqual({ kind: "concession_mode", mode: "self", from: "external" });
    expect(plan.actions).toContainEqual({ kind: "concession_product", key: "beer", tier: 2, price: 38, fromTier: 1, fromPrice: 25 });
    expect(plan.actions).toContainEqual({ kind: "concession_product", key: "mulled_wine", tier: 3, price: 60, fromTier: 1, fromPrice: 28 });
    // Klobása zůstává na L1 za 30 Kč: nic se nemění.
    expect(plan.actions.some((a) => a.kind === "concession_product" && a.key === "sausage")).toBe(false);
    const stock = plan.actions.filter((a) => a.kind === "concession_stock");
    expect(stock).toContainEqual({ kind: "concession_stock", key: "beer", tier: 2, quantity: Math.min(900, beer.maxBuy), unitCost: 20, cost: Math.min(900, beer.maxBuy) * 20 });
    expect(stock).toContainEqual({ kind: "concession_stock", key: "sausage", tier: 1, quantity: 40, unitCost: 15, cost: 600 });
    expect(stock.some((a) => a.key === "lemonade")).toBe(false);
    // Nastavení před nákupem (nákup jde do zvolené kvality), nákup po trávníku a před náborem.
    expect(kinds.lastIndexOf("concession_product")).toBeLessThan(kinds.indexOf("concession_stock"));
    expect(kinds.indexOf("pitch_maintenance")).toBeLessThan(kinds.indexOf("concession_stock"));
    expect(kinds.lastIndexOf("concession_stock")).toBeLessThan(kinds.indexOf("hire"));
    expect(plan.totalCost).toBeLessThanOrEqual(ctx.finance.spendable);
  });

  it("nákup mimo meze, neznámá kvalita nebo cena pod nákupní: ten produkt rozhodne náhradní pravidlo, ostatní platí", () => {
    const p = profile({ thrift: 30 });
    const ctx = withConcessions(context(400_000, p));
    const c = ctx.concessions;
    const beer = tierOf(c, "beer", 2);
    const r = decided(ctx, concessionAnswer({
      beer: { tier: 2, price: 38, buy: beer.maxBuy + 1 },
      sausage: { tier: 4, price: 30, buy: 10 },
      lemonade: { tier: 1, price: 8, buy: 10 },
      mulled_wine: { tier: 2, price: 45, buy: 20 },
    }));
    const byKey = new Map(r.decision.concessions.products.map((x) => [x.key, x]));
    const fallback = new Map(c.products.map((x) => [x.key, fallbackProductChoice(x, p)]));
    expect(r.decision.concessions.mode).toBe("self");
    for (const key of ["beer", "sausage", "lemonade"] as const) {
      expect(byKey.get(key)).toEqual(fallback.get(key));
      expect(byKey.get(key)?.decidedBy).toBe("fallback");
    }
    expect(byKey.get("mulled_wine")).toEqual({ key: "mulled_wine", tier: 2, price: 45, buy: 20, decidedBy: "model" });
    expect(r.rejected.some((x) => x.startsWith("concessions.beer: nákup"))).toBe(true);
    expect(r.rejected.some((x) => x.includes("concessions.sausage: neznámá kvalita 4"))).toBe(true);
    expect(r.rejected.some((x) => x.includes("concessions.lemonade: cena 8"))).toBe(true);
    // Nic mimo meze se do plánu nedostane.
    const plan = planWeeklyActions(ctx, r.decision);
    for (const a of plan.actions) {
      if (a.kind === "concession_stock") expect(a.quantity).toBeLessThanOrEqual(tierOf(c, a.key, a.tier).maxBuy);
    }
  });

  it("neplatný nebo chybějící provoz: celý bufet podle náhradního pravidla, zbytek týdne platí", () => {
    const p = profile({ thrift: 30 });
    const ctx = withConcessions(context(400_000, p));
    const bad = decided(ctx, concessionAnswer(validProducts(ctx.concessions, 2), "both" as ConcessionMode));
    expect(bad.decision.concessions).toEqual(fallbackConcessions(ctx.concessions, p));
    expect(bad.decision.concessions.decidedBy).toBe("fallback");
    expect(bad.rejected.some((x) => x.includes("concessions.mode"))).toBe(true);
    expect(bad.decision.stadium).toEqual(["S1", "S2"]);
    const withoutConcessions: Record<string, unknown> = { ...everything };
    delete withoutConcessions.concessions;
    const missing = decided(ctx, withoutConcessions);
    expect(missing.decision.concessions.decidedBy).toBe("fallback");
    expect(missing.rejected).toContain("concessions: chybí, platí náhradní pravidlo");
  });

  it("externí provozovatel od modelu: žádný nákup ani změna produktů", () => {
    const ctx = withConcessions(context(400_000), { mode: "self" });
    const r = decided(ctx, concessionAnswer(validProducts(ctx.concessions, 3, 1), "external"));
    expect(r.decision.concessions).toEqual({ mode: "external", products: [], decidedBy: "model" });
    const plan = planWeeklyActions(ctx, r.decision);
    expect(plan.actions.filter((a) => a.kind.startsWith("concession_"))).toEqual([{ kind: "concession_mode", mode: "external", from: "self" }]);
    expect(plan.concessions.products).toEqual([]);
  });

  it("sklad nikdy nejde pod rezervu, ani když model chce v každém produktu maximum", () => {
    for (const budget of [16_000, 25_000, 40_000, 80_000, 400_000]) {
      const ctx = withConcessions(context(budget, profile({ thrift: 20 })));
      const c = ctx.concessions;
      const r = decided(ctx, concessionAnswer(validProducts(c, 3, 1)));
      expect(r.decision.concessions.products.every((x) => x.decidedBy === "model")).toBe(true);
      const plan = planWeeklyActions(ctx, r.decision);
      const stockCost = plan.actions.reduce((s, a) => s + (a.kind === "concession_stock" ? a.cost : 0), 0);
      expect(paid(plan)).toBe(plan.totalCost);
      expect(stockCost).toBeLessThanOrEqual(ctx.finance.spendable);
      expect(plan.totalCost).toBeLessThanOrEqual(ctx.finance.spendable);
      expect(ctx.budget - plan.totalCost).toBeGreaterThanOrEqual(Math.min(ctx.budget, ctx.finance.reserve));
    }
  });

  it("bez peněz nad rezervou model nic nenakoupí: větší nákup neprojde a náhradní pravidlo koupí nula", () => {
    const ctx = withConcessions(context(5_000));
    expect(ctx.finance.spendable).toBe(0);
    const r = decided(ctx, concessionAnswer({ beer: { tier: 1, price: 25, buy: 100 } }));
    expect(r.decision.concessions.products.every((x) => x.buy === 0)).toBe(true);
    expect(planWeeklyActions(ctx, r.decision).actions.some((a) => a.kind === "concession_stock")).toBe(false);
  });

  it("bez vlastního občerstvení se o bufetu nerozhoduje: ve schématu ani v plánu není", () => {
    const ctx = withConcessions(context(400_000), { refreshments: 0 });
    expect(ctx.concessions.modeOptions).toEqual(["external"]);
    const schema = weeklyDecisionSchema(ctx) as { properties: Record<string, unknown>; required: string[] };
    expect(schema.properties.concessions).toBeUndefined();
    expect(schema.required).not.toContain("concessions");
    expect(renderWeeklyPrompt(ctx)).toContain("Own sales need a refreshment stand");
    const r = decided(ctx, concessionAnswer(validProducts(ctx.concessions, 1)));
    expect(r.decision.concessions).toEqual({ mode: "external", products: [], decidedBy: "guard" });
    expect(planWeeklyActions(ctx, r.decision).actions.some((a) => a.kind.startsWith("concession_"))).toBe(false);
  });

  it("schéma: výčty nikdy prázdné, meze odpovídají nabídce", () => {
    const ctx = withConcessions(context(400_000));
    const schema = weeklyDecisionSchema(ctx) as {
      properties: { concessions: { properties: {
        mode: { enum: string[] };
        products: { properties: Record<string, { properties: { tier: { minimum: number; maximum: number }; price: { minimum: number; maximum: number }; buy: { maximum: number } } }> };
      } } };
      required: string[];
    };
    const conc = schema.properties.concessions.properties;
    expect(conc.mode.enum).toEqual(["external", "self"]);
    expect(Object.keys(conc.products.properties).sort()).toEqual([...CONCESSION_PRODUCT_KEYS].sort());
    const beer = conc.products.properties.beer.properties;
    expect(beer.tier).toMatchObject({ minimum: 1, maximum: 3 });
    expect(beer.price.minimum).toBe(15);
    expect(beer.buy.maximum).toBe(Math.max(...[1, 2, 3].map((l) => tierOf(ctx.concessions, "beer", l).maxBuy)));
    expect(schema.required).toContain("concessions");
    const enums: unknown[][] = [];
    const walk = (node: unknown) => {
      if (!node || typeof node !== "object") return;
      for (const [k, v] of Object.entries(node)) {
        if (k === "enum" && Array.isArray(v)) enums.push(v);
        else walk(v);
      }
    };
    walk(schema);
    expect(enums.length).toBeGreaterThan(5);
    expect(enums.every((e) => e.length > 0)).toBe(true);
  });

  it("prompt ukáže provoz, zápas, kvality s mezemi a klíče bloku bufetu", () => {
    const text = renderWeeklyPrompt(withConcessions(context(400_000)));
    expect(text).toContain("REFRESHMENTS now: external operator");
    expect(text).toContain("league on Thu (about 200 spectators, cloudy 10 °C)");
    expect(text).toContain("beer (Pivo), now tier 1 at 25 CZK:");
    expect(text).toMatch(/2 Kozel 11°: 20\/35, price 21-78, stock 0, sells ~\d+, max buy \d+/);
    expect(text).toContain("concessions {mode external/self, products {sausage, beer, lemonade, mulled_wine: each {tier, price, buy}}}");
    expect(text).toContain("repairs, pitch, refreshment stock, hiring");
  });
});

describe("bufet: náhradní pravidlo podle povahy", () => {
  it("šetrný bere levnou kvalitu a méně kusů, ostatní střední kvalitu na očekávaný prodej", () => {
    const thrifty = withConcessions(context(400_000, profile({ thrift: 85 })));
    const generous = withConcessions(context(400_000, profile({ thrift: 30 })));
    const t = fallbackWeeklyDecision(thrifty).concessions;
    const g = fallbackWeeklyDecision(generous).concessions;
    expect(t.mode).toBe("self");
    expect(g.mode).toBe("self");
    expect(t.decidedBy).toBe("fallback");
    for (const choice of t.products) {
      const tier = tierOf(thrifty.concessions, choice.key, 1);
      // Šetrný: levná kvalita přesně na očekávaný prodej.
      expect(choice).toMatchObject({ tier: 1, price: tier.defaultPrice, buy: Math.min(tier.maxBuy, tier.expectedSales) });
    }
    for (const choice of g.products) {
      const tier = tierOf(generous.concessions, choice.key, 2);
      // Ostatní: střední kvalita na očekávaný prodej s rezervou 15 % na silnější zápas.
      expect(choice).toMatchObject({ tier: 2, price: tier.defaultPrice, buy: Math.min(tier.maxBuy, Math.ceil(tier.expectedSales * 1.15)) });
    }
    const cost = (ctx: WeeklyContext) => planWeeklyActions(ctx, fallbackWeeklyDecision(ctx)).actions
      .reduce((s, a) => s + (a.kind === "concession_stock" ? a.cost : 0), 0);
    expect(cost(thrifty)).toBeGreaterThan(0);
    expect(cost(thrifty)).toBeLessThan(cost(generous));
  });

  it("provoz: bez peněz zůstane externí, prázdný vlastní bez peněz přejde na externí, se zbožím zůstane vlastní", () => {
    const poor = withConcessions(context(5_000));
    expect(fallbackWeeklyDecision(poor).concessions).toEqual({ mode: "external", products: [], decidedBy: "fallback" });
    const emptySelf = withConcessions(context(5_000), { mode: "self" });
    expect(fallbackWeeklyDecision(emptySelf).concessions.mode).toBe("external");
    const stocked = withConcessions(context(5_000), { mode: "self", stock: { beer: { level: 1, stockByTier: [0, 300, 0, 0] } } });
    expect(fallbackWeeklyDecision(stocked).concessions.mode).toBe("self");
    // Bez domácího zápasu do příští správy se provoz nepřepíná.
    expect(fallbackWeeklyDecision(withConcessions(context(400_000), { fixtures: [] })).concessions.mode).toBe("external");
    expect(fallbackWeeklyDecision(withConcessions(context(5_000), { mode: "self", fixtures: [] })).concessions.mode).toBe("self");
  });

  it("na vlastní provoz přejde, až zboží stačí aspoň na polovinu očekávané tržby", () => {
    const p = profile({ thrift: 30 });
    // 2 000 Kč nad rezervou: sotva stovka piv na zápas, kde jich lidé chtějí přes osm set.
    const little = concessionCtx(2_000);
    expect(fallbackConcessions(little, p).mode).toBe("external");
    // Kdo už vlastní provoz má a pivo na skladě, prodává dál.
    expect(fallbackConcessions(concessionCtx(2_000, { mode: "self", stock: { beer: { level: 2, price: 35, stockByTier: [0, 0, 200, 0] } } }), p).mode).toBe("self");
    expect(fallbackConcessions(concessionCtx(100_000), p).mode).toBe("self");
  });

  it("kvalita se zbožím na celý týden se nejdřív doprodá", () => {
    const ctx = withConcessions(context(400_000, profile({ thrift: 30 })), { mode: "self", stock: { beer: { level: 1, stockByTier: [0, 2_000, 0, 0] } } });
    const beer = fallbackWeeklyDecision(ctx).concessions.products.find((x) => x.key === "beer");
    expect(beer).toMatchObject({ tier: 1, buy: 0 });
  });
});

describe("bufet: dorovnání před domácím zápasem", () => {
  const p = profile({ thrift: 30 });

  function weeklyPlan(cover: number): { plan: ConcessionTopUpPlan; reserve: number } {
    const ctx = withConcessions(context(400_000, p));
    const beer = tierOf(ctx.concessions, "beer", 2);
    const r = decided(ctx, concessionAnswer({ ...validProducts(ctx.concessions, 2, 0), beer: { tier: 2, price: 35, buy: Math.round(beer.expectedSales * cover) } }));
    return { plan: planWeeklyActions(ctx, r.decision).concessions, reserve: ctx.finance.reserve };
  }

  it("plán si pamatuje kvalitu, cenu a pokrytí, které trenér zvolil", () => {
    const { plan, reserve } = weeklyPlan(1.2);
    expect(plan).toMatchObject({ decidedBy: "model", mode: "self", reserve });
    expect(plan.products.find((x) => x.key === "beer")).toMatchObject({ tier: 2, price: 35 });
    expect(plan.products.find((x) => x.key === "beer")!.cover).toBeCloseTo(1.2, 1);
    // Produkt bez nákupu a bez zboží trenér prodávat nechce: dorovnávat se nebude.
    expect(plan.products.find((x) => x.key === "sausage")!.cover).toBeLessThan(MIN_TOPUP_COVER);
  });

  it("po prodeji dokoupí na stejné pokrytí, plný sklad nechá být, jinou kvalitu nekupuje", () => {
    const { plan, reserve } = weeklyPlan(1.2);
    const budget = reserve + 100_000;
    const today = concessionCtx(budget - reserve, { mode: "self", stock: { beer: { level: 2, price: 35, stockByTier: [0, 0, 100, 0] } } });
    const { purchases } = planConcessionTopUp(today, plan, budget);
    const cover = plan.products.find((x) => x.key === "beer")!.cover;
    const target = Math.ceil(salesFor(today, "beer", 2, 35) * cover);
    expect(purchases).toEqual([{ key: "beer", tier: 2, quantity: target - 100, unitCost: 20, cost: (target - 100) * 20, target, stock: 100 }]);

    const full = concessionCtx(budget - reserve, { mode: "self", stock: { beer: { level: 2, price: 35, stockByTier: [0, 0, 5_000, 0] } } });
    expect(planConcessionTopUp(full, plan, budget).purchases).toEqual([]);

    const otherTier = concessionCtx(budget - reserve, { mode: "self", stock: { beer: { level: 1, price: 25 } } });
    const res = planConcessionTopUp(otherTier, plan, budget);
    expect(res.purchases).toEqual([]);
    expect(res.skipped.some((s) => s.item === "beer")).toBe(true);
  });

  it("dokup jen z peněz nad rezervou", () => {
    const { plan, reserve } = weeklyPlan(1.2);
    const budget = reserve + 1_000;
    const today = concessionCtx(budget - reserve, { mode: "self", stock: { beer: { level: 2, price: 35 } } });
    const { purchases } = planConcessionTopUp(today, plan, budget);
    expect(purchases.reduce((s, x) => s + x.cost, 0)).toBeLessThanOrEqual(1_000);
    expect(purchases.find((x) => x.key === "beer")?.quantity).toBe(50);
    expect(planConcessionTopUp(today, plan, reserve - 500).purchases).toEqual([]);
  });

  it("bez vlastního provozu nebo bez dnešního zápasu se nedokupuje", () => {
    const { plan, reserve } = weeklyPlan(1.2);
    const budget = reserve + 100_000;
    expect(planConcessionTopUp(concessionCtx(100_000, { mode: "external" }), plan, budget).purchases).toEqual([]);
    expect(planConcessionTopUp(concessionCtx(100_000, { mode: "self", fixtures: [], stock: { beer: { level: 2, price: 35 } } }), plan, budget).purchases).toEqual([]);
    const external = concessionTopUpPlan(concessionCtx(100_000), { mode: "external", products: [], decidedBy: "model" }, p, reserve);
    expect(planConcessionTopUp(concessionCtx(100_000, { mode: "self" }), external, budget).purchases).toEqual([]);
  });
});
