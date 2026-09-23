/**
 * Matematika jednání se sponzorem: ochota, cena, kolo, trpělivost, řádky slibů.
 */
import { describe, expect, it } from "vitest";
import { expectedWinsPerSeason, MONTHS_PER_SEASON } from "./ambition";
import {
  advanceClawback, afterReject, allowedContractSeasons, minContractSeasons, bonusAwareOneTime, buildPromiseRows, contractMonths, deadlineGoalBonusTotal, defaultPromise, earlyTerminationFee,
  effectiveContractMonths, evaluateRound, initialPatience, openingOffer, OPENING_OFFER_SHARE, meetsMonthlyShare, minMonthlyFor, oneTimeTotal, proposalOneTimeTotal, promiseChance, promisePenalty,
  promiseRowCount, promiseValueShare, reduceToWillingness, requestCost, seasonalGoalBonusTotal, willingness,
  type Demands, type NegotiationContext, type Proposal,
} from "./negotiation";
import { GOAL_BONUS_KINDS, type PromiseSpec } from "./promise-kinds";
import { validateProposal } from "./proposal";

const CTX: NegotiationContext = {
  category: "main", personality: "fan", wishes: [], budgetB: 10000, season: 3, leagueTeams: 14,
  expectedPosition: 7, cupTotalRounds: 7, lastAvgAttendance: 200, reputation: 50, licenceLevel: 1,
  sponsorType: "pub", sectorBannerActive: false, sleeveHeldBySponsor: false,
  facilities: [
    { facility: "stands", currentLevel: 1, locked: false, costs: [0, 55000, 170000, 450000] },
    { facility: "toilets", currentLevel: 0, locked: false, costs: [0, 12000, 40000, 100000] },
  ],
  equipment: [{ category: "balls", currentLevel: 1, nextLevel: 2, cost: 8000, locked: false }],
  currentTerminationFee: 7442, seasonProgressMonths: 0,
};

function prop(demands: Partial<Demands> = {}, seasons = 2, promises: PromiseSpec[] = []): Proposal {
  return {
    seasons, promises,
    demands: { monthly: 0, winBonus: 0, signingBonus: 0, goalBonuses: {}, construction: null, equipment: null, payCurrentFee: false, ...demands },
  };
}

describe("trpělivost", () => {
  it("2 + náklonnost / 25", () => {
    expect(initialPatience(0)).toBe(2);
    expect(initialPatience(40)).toBe(3);
    expect(initialPatience(99)).toBe(5);
    expect(initialPatience(100)).toBe(6);
  });
  it("odmítnutí ubere bod, na nule majitel odchází", () => {
    expect(afterReject(3)).toEqual({ patience: 2, walkedAway: false });
    expect(afterReject(1)).toEqual({ patience: 0, walkedAway: true });
  });
});

describe("willingness", () => {
  it("holý podpis = 0,7 × B", () => {
    expect(willingness(prop(), CTX)).toBeCloseTo(7000, 6);
  });
  it("slib z přání: základ × 1,5 × ambice", () => {
    const ctx = { ...CTX, wishes: ["league_position" as const] };
    expect(willingness(prop({}, 2, [{ kind: "league_position", params: { position: 7 } }]), ctx)).toBeCloseTo(9250, 6);
  });
  it("opatrnému jsou výsledky jedno a +5 % za sezónu nad jednu", () => {
    const ctx: NegotiationContext = { ...CTX, personality: "cautious" };
    expect(willingness(prop({}, 2, [{ kind: "league_position", params: { position: 7 } }]), ctx)).toBeCloseTo(8137.5, 6);
  });
  it("strop 1,5 × B", () => {
    const ctx: NegotiationContext = { ...CTX, expectedPosition: 14, wishes: ["league_position"] };
    // 0,7 + umístění 0,45 + tribuny 0,2 + licence 0,1 + exkluzivita 0,05 + mladí 0,05 = 1,55 > 1,5.
    const p = prop({}, 2, [
      { kind: "league_position", params: { position: 1 } }, { kind: "stadium_upgrade", params: { facility: "stands", level: 3 } },
      { kind: "coach_licence", params: { level: 3 } }, { kind: "sector_exclusivity", params: { sector: "pub" } },
      { kind: "youth", params: { count: 2 } },
    ]);
    expect(willingness(p, ctx)).toBe(15000);
  });
  it("licence a stavba podle počtu stupňů", () => {
    expect(promiseValueShare({ kind: "coach_licence", params: { level: 3 } }, CTX)).toBeCloseTo(0.10, 9);
    expect(promiseValueShare({ kind: "stadium_upgrade", params: { facility: "stands", level: 3 } }, CTX)).toBeCloseTo(0.20, 9);
    expect(promiseValueShare({ kind: "stadium_upgrade", params: { facility: "toilets", level: 1 } }, CTX)).toBeCloseTo(0.05, 9);
  });
  it("slib s ambicí na podlaze (≤ 0,3) nedává žádnou hodnotu", () => {
    // Umístění 12 (nejhorší slíbitelné, leagueTeams 14 − RELEGATION_SPOTS 2) proti očekávanému 7. je skoro jisté.
    expect(promiseValueShare({ kind: "league_position", params: { position: 12 } }, CTX)).toBe(0);
  });
});

describe("requestCost", () => {
  it("měsíční podpora se počítá celá", () => {
    expect(requestCost(prop({ monthly: 5000 }), CTX)).toBeCloseTo(5000, 6);
  });
  it("podpisový příspěvek rozpočítaný na měsíce smlouvy", () => {
    expect(requestCost(prop({ signingBonus: 7442 }), CTX)).toBeCloseTo(1000, 0);
  });
  it("bonus za výhru podle očekávaných výher", () => {
    const expected = 500 * expectedWinsPerSeason(7, 14) / MONTHS_PER_SEASON;
    expect(requestCost(prop({ winBonus: 500 }), CTX)).toBeCloseTo(expected, 6);
    expect(expected).toBeCloseTo(1357.19, 1);
  });
  it("bonus za splnění: G × šance × počet sezón se slibem / měsíce", () => {
    // ambice 1 (cíl = očekávané místo) → šance = 1,15 − 0,5 × 1 = 0,65 (spojitý vzorec).
    const p = prop({ goalBonuses: { league_position: 2000 } }, 3, [{ kind: "league_position", params: { position: 7 } }]);
    expect(requestCost(p, CTX)).toBeCloseTo(232.92, 2);
  });
  it("bonus za splnění u slibu, který řeší klub (licence): šance 1,0, ne 0,7", () => {
    const p = prop({ goalBonuses: { coach_licence: 2000 } }, 2, [{ kind: "coach_licence", params: { level: 2 } }]);
    expect(requestCost(p, CTX)).toBeCloseTo(268.75, 2);
  });
  it("stavba, vybavení a pokuta podle ceníku, rozpočítané", () => {
    expect(requestCost(prop({ construction: "toilets" }, 1), CTX)).toBeCloseTo(3225, 6);
    expect(requestCost(prop({ equipment: "balls" }, 1), CTX)).toBeCloseTo(8000 / MONTHS_PER_SEASON, 6);
    expect(requestCost(prop({ payCurrentFee: true }), CTX)).toBeCloseTo(1000, 0);
  });
});

describe("promiseChance", () => {
  it("sezónní: spojitě 1,15 − 0,5 × ambice, na podlaze (0,3) přesně 1,0", () => {
    // Umístění 7 proti očekávanému 7. → ambice 1 → šance 0,65.
    expect(promiseChance({ kind: "league_position", params: { position: 7 } }, CTX)).toBeCloseTo(0.65, 9);
    // Umístění 12 (podlaha ambice, viz test výš) → šance přesně 1,0, ne extra větev.
    expect(promiseChance({ kind: "league_position", params: { position: 12 } }, CTX)).toBeCloseTo(1.0, 9);
  });
  it("sliby v rukou klubu (i sezónní mladí a výtržnosti) mají vždy 1,0", () => {
    expect(promiseChance({ kind: "coach_licence", params: { level: 2 } }, CTX)).toBe(1.0);
    expect(promiseChance({ kind: "sector_exclusivity", params: { sector: "pub" } }, CTX)).toBe(1.0);
    expect(promiseChance({ kind: "youth", params: { count: 2 } }, CTX)).toBe(1.0);
    expect(promiseChance({ kind: "no_riots", params: {} }, CTX)).toBe(1.0);
  });
  it("bonus za splnění u mladých: klub nevybere víc než O × měsíce (B 10 000, fanoušek, 3 sezóny, G 15 000)", () => {
    const seasons = 3;
    const m = contractMonths(seasons);
    const youth: PromiseSpec[] = [{ kind: "youth", params: { count: 2 } }];
    const rows = promiseRowCount("youth", seasons);
    // G 15 000: dřív tu bylo 30 000, ale to už teď nejde — bez měsíční podpory dost vysoké na to,
    // aby splnila pravidlo o polovině (bonusAwareOneTime počítá i sezónní bonusy), by tenhle návrh
    // vůbec neprošel validateProposal a k evaluateRound by se nedostal.
    const G = 15000;
    const o = willingness(prop({}, seasons, youth), CTX);
    expect(o).toBeCloseTo(7500, 6);
    // Nejvyšší měsíční podpora, kterou sponzor s tímhle bonusem přijme.
    const monthly = Math.floor(o - (G * rows) / m + 1e-6);
    const accepted = prop({ monthly, goalBonuses: { youth: G } }, seasons, youth);
    expect(evaluateRound(accepted, CTX)).toEqual({ kind: "accept" });
    expect(meetsMonthlyShare(accepted, CTX)).toBe(true);
    // Slib si klub splní sám, takže dostane měsíčně × měsíce + G za každou sezónu se slibem.
    expect(monthly * m + G * rows).toBeLessThanOrEqual(o * m + 1);
    expect(evaluateRound({ ...accepted, demands: { ...accepted.demands, monthly: monthly + 1 } }, CTX).kind).not.toBe("accept");
    // Ani protinabídka nepustí klub nad O × měsíce, ani neporuší pravidlo o polovině.
    const r = evaluateRound(prop({ monthly: monthly + 100, goalBonuses: { youth: G } }, seasons, youth), CTX);
    expect(r.kind).toBe("counter_money");
    if (r.kind === "counter_money") {
      const d = r.counter.demands;
      expect(d.monthly * m + (d.goalBonuses.youth ?? 0) * rows).toBeLessThanOrEqual(o * m + 1);
      expect(meetsMonthlyShare(r.counter, CTX)).toBe(true);
    }
  });
});

describe("defaultPromise", () => {
  it("umístění: min(očekávané místo, poslední bezpečné místo), nikdy sestupová příčka", () => {
    const ctx = { ...CTX, expectedPosition: 14 };
    expect(defaultPromise("league_position", ctx, prop({}, 2))).toEqual({ kind: "league_position", params: { position: 12 } });
  });
  it("pohár s méně než 2 koly nejde nabídnout", () => {
    const ctx = { ...CTX, cupTotalRounds: 1 };
    expect(defaultPromise("cup_round", ctx, prop({}, 2))).toBeNull();
  });
  it("logo na rukávu: majitel ho za přání nenabídne, když ho rukáv už nese", () => {
    const ctx = { ...CTX, category: "stadium" as const, sleeveHeldBySponsor: true };
    expect(defaultPromise("jersey_logo", ctx, prop({}, 2))).toBeNull();
    expect(defaultPromise("jersey_logo", { ...ctx, sleeveHeldBySponsor: false }, prop({}, 2))).toEqual({ kind: "jersey_logo", params: {} });
  });
});

describe("evaluateRound", () => {
  it("cena ≤ O: přijme", () => {
    expect(evaluateRound(prop({ monthly: 7000 }), CTX)).toEqual({ kind: "accept" });
  });
  it("do 115 % O bez přání: sníží nejdražší peněžní položku na O", () => {
    const r = evaluateRound(prop({ monthly: 7500 }), CTX);
    expect(r.kind).toBe("counter_money");
    if (r.kind === "counter_money") expect(r.counter.demands.monthly).toBe(7000);
  });
  it("ubírá nejdřív z nejdražší položky, ostatní nechá", () => {
    const r = evaluateRound(prop({ monthly: 6000, signingBonus: 11162 }), CTX);
    expect(r.kind).toBe("counter_money");
    if (r.kind === "counter_money") {
      expect(r.counter.demands.monthly).toBe(5500);
      expect(r.counter.demands.signingBonus).toBe(11162);
      expect(requestCost(r.counter, CTX)).toBeLessThanOrEqual(willingness(r.counter, CTX) + 1e-6);
    }
  });
  it("do 115 % O s nesplněným přáním: původní návrh výměnou za slib", () => {
    const ctx = { ...CTX, wishes: ["league_position" as const] };
    const r = evaluateRound(prop({ monthly: 7500 }), ctx);
    expect(r.kind).toBe("counter_wish");
    if (r.kind === "counter_wish") {
      expect(r.wish).toBe("league_position");
      expect(r.counter.promises).toEqual([{ kind: "league_position", params: { position: 7 } }]);
      expect(r.counter.demands.monthly).toBe(7500);
    }
  });
  it("sezónní přání u smlouvy na 1 sezónu nejde, zbývá sleva", () => {
    const ctx = { ...CTX, wishes: ["league_position" as const] };
    expect(evaluateRound(prop({ monthly: 7500 }, 1), ctx).kind).toBe("counter_money");
  });
  it("na konci sezóny protinabídka nikdy nezní na 1 sezónu", () => {
    const end: NegotiationContext = { ...CTX, seasonProgressMonths: MONTHS_PER_SEASON - 0.2, wishes: ["league_position"] };
    // Ve stejném pásmu by jinak přišla sleva (viz test výše), s 1 sezónou na konci sezóny už ne.
    const r = evaluateRound(prop({ monthly: 7500 }, 1), end);
    expect(r.kind).toBe("reject");
    const two = evaluateRound(prop({ monthly: 7500 }, 2), end);
    expect(two.kind === "counter_money" || two.kind === "counter_wish").toBe(true);
    if (two.kind === "counter_money" || two.kind === "counter_wish") expect(two.counter.seasons).toBe(2);
  });
  it("nejkratší délka smlouvy podle postupu sezóny", () => {
    expect(minContractSeasons(0)).toBe(1);
    expect(minContractSeasons(MONTHS_PER_SEASON - 1)).toBe(1);
    expect(minContractSeasons(MONTHS_PER_SEASON - 0.99)).toBe(2);
    expect(allowedContractSeasons(0)).toEqual([1, 2, 3]);
    expect(allowedContractSeasons(MONTHS_PER_SEASON)).toEqual([2, 3]);
  });
  it("nad 115 % odmítne, nad 150 % se urazí", () => {
    expect(evaluateRound(prop({ monthly: 9000 }), CTX)).toEqual({ kind: "reject", insulted: false });
    expect(evaluateRound(prop({ monthly: 11000 }), CTX)).toEqual({ kind: "reject", insulted: true });
  });
  it("stavbu ani pokutu sponzor neubírá", () => {
    expect(reduceToWillingness(prop({ construction: "toilets" }, 1), CTX, 3000)).toBeNull();
  });
  it("sleva nestáhne měsíční podporu pod polovinu podpory, ubere radši z podpisu", () => {
    const m = contractMonths(2);
    // Stará sleva by vzala 1200 z měsíční (2900 < 30 000 / 7,44 = 4031) a porušila pravidlo.
    const r = reduceToWillingness(prop({ monthly: 4100, signingBonus: 30000 }), CTX, 7000)!;
    expect(r).not.toBeNull();
    expect(r.demands.monthly).toBe(minMonthlyFor(30000, m));
    expect(r.demands.signingBonus).toBe(22000);
    expect(meetsMonthlyShare(r, CTX)).toBe(true);
    expect(requestCost(r, CTX)).toBeLessThanOrEqual(7000 + 1e-6);
  });
  it("když se podpis ubere celý, druhý průchod ubere zbytek z měsíční", () => {
    const r = reduceToWillingness(prop({ monthly: 4100, signingBonus: 30000 }), CTX, 3000)!;
    expect(r.demands).toMatchObject({ monthly: 2932, signingBonus: 0 });
    expect(meetsMonthlyShare(r, CTX)).toBe(true);
  });
  it("protinabídka nikdy neporuší pravidlo o měsíční polovině", () => {
    const ctxs: NegotiationContext[] = [CTX, { ...CTX, wishes: ["league_position"] }, { ...CTX, personality: "cautious" }];
    let counters = 0;
    for (const ctx of ctxs) {
      for (const seasons of [1, 2, 3]) {
        for (const monthly of [1, 500, 2000, 3500, 5000, 6500, 8000]) {
          for (const signingBonus of [0, 5000, 20000, 40000, 60000]) {
            for (const extra of [{}, { construction: "toilets" }, { equipment: "balls" }, { payCurrentFee: true }, { winBonus: 300 }]) {
              const p = prop({ monthly, signingBonus, ...extra }, seasons);
              if (!meetsMonthlyShare(p, ctx)) continue;
              const r = evaluateRound(p, ctx);
              if (r.kind === "counter_money" || r.kind === "counter_wish") {
                counters++;
                expect(meetsMonthlyShare(r.counter, ctx)).toBe(true);
                expect(requestCost(r.counter, ctx)).toBeLessThanOrEqual(willingness(r.counter, ctx) + 1e-6);
              }
            }
          }
        }
      }
    }
    expect(counters).toBeGreaterThan(20);
  });
  it("měsíční podpora nikdy neklesne pod 1", () => {
    expect(reduceToWillingness(prop({ monthly: 5 }), CTX, 1)?.demands.monthly).toBe(1);
    expect(reduceToWillingness(prop({ monthly: 5 }), CTX, 0)).toBeNull();
  });
  it("protinabídka za přání nenabídne postup (postupy se teď nehrají), zbývá sleva", () => {
    const ctx = { ...CTX, wishes: ["promotion" as const, "no_relegation" as const] };
    expect(defaultPromise("promotion", ctx, prop({}, 2))).toBeNull();
    expect(defaultPromise("no_relegation", ctx, prop({}, 2))).toBeNull();
    const already = prop({ monthly: 9000 }, 2, [{ kind: "league_position", params: { position: 7 } }]);
    const r = evaluateRound(already, ctx);
    expect(r.kind).toBe("counter_money");
    if (r.kind === "counter_money") expect(r.counter.demands.monthly).toBe(8500);
  });
});

describe("buildPromiseRows", () => {
  const signDate = "2026-09-23T10:00:00.000Z";
  const p = prop({ monthly: 5000, goalBonuses: { league_position: 2000 } }, 3, [
    { kind: "league_position", params: { position: 7 } },
    { kind: "coach_licence", params: { level: 2 } },
    { kind: "sector_exclusivity", params: { sector: "pub" } },
  ]);
  const rows = buildPromiseRows(p, CTX, signDate);

  it("sezónní slib: řádek pro každou sezónu od příští", () => {
    // penalty na řádek = round(share × B × měsíce CELÉ smlouvy / počet řádků) = round(0,15×10000×11,1628.../2) = 8372.
    const lp = rows.filter((r) => r.kind === "league_position");
    expect(lp.map((r) => r.season)).toEqual([4, 5]);
    expect(lp[0]).toMatchObject({ reward: 2000, penalty: 8372, deadlineGameDate: null, valueShare: 0.15 });
  });
  it("termínový slib: jeden řádek s termínem 112 herních dní", () => {
    // penalty = round(0,05×10000×11,1628.../1) = 5581.
    const lic = rows.find((r) => r.kind === "coach_licence");
    expect(lic).toMatchObject({ season: null, deadlineGameDate: "2027-01-13T10:00:00.000Z", penalty: 5581, reward: 0 });
  });
  it("exkluzivita oboru: bez sezóny i termínu", () => {
    expect(rows.find((r) => r.kind === "sector_exclusivity")).toMatchObject({ season: null, deadlineGameDate: null });
  });
  it("smlouva na 1 sezónu: sezónní slib bez řádků", () => {
    expect(buildPromiseRows(prop({}, 1, [{ kind: "no_riots", params: {} }]), CTX, signDate)).toEqual([]);
  });
});

describe("promisePenalty", () => {
  it("na řádek: round(share × B × seasonMultiplier × měsíce CELÉ smlouvy / počet řádků)", () => {
    expect(promisePenalty(0.15, 10000, contractMonths(3), 2)).toBe(8372); // seasonMult výchozí 1 (fan)
    expect(promisePenalty(0.05, 10000, contractMonths(3), 1)).toBe(5581);
    // Opatrný na 3 sezóny: seasonMultiplier("cautious", 3) = 1,10 (viz seasonMultiplier()).
    expect(promisePenalty(0.05, 10000, contractMonths(3), 1, 1.10)).toBe(6140);
  });
  it("rozbít všechny sliby nikdy nevyplatí víc, než kolik navíc přinesly (součet pokut ≥ extra ochota × měsíce)", () => {
    const signDate = "2026-09-23T10:00:00.000Z";
    const cases: Array<{ ctx: NegotiationContext; seasons: number; promises: PromiseSpec[] }> = [
      {
        ctx: CTX, seasons: 3,
        promises: [{ kind: "league_position", params: { position: 7 } }, { kind: "coach_licence", params: { level: 2 } }],
      },
      { ctx: { ...CTX, wishes: ["league_position" as const] }, seasons: 2, promises: [{ kind: "league_position", params: { position: 7 } }] },
      {
        ctx: { ...CTX, personality: "patriot" as const }, seasons: 3,
        promises: [{ kind: "reputation", params: { reputation: 60 } }, { kind: "coach_licence", params: { level: 2 } }],
      },
      // Opatrný, 2 a 3 sezóny — kolo 2 tu penalty nedosahovala extra × měsíce (chyběl seasonMultiplier), kolo 3 to opravilo.
      {
        ctx: { ...CTX, personality: "cautious" as const }, seasons: 2,
        promises: [{ kind: "reputation", params: { reputation: 60 } }, { kind: "coach_licence", params: { level: 2 } }],
      },
      {
        ctx: { ...CTX, personality: "cautious" as const }, seasons: 3,
        promises: [{ kind: "reputation", params: { reputation: 60 } }, { kind: "coach_licence", params: { level: 2 } }],
      },
      // Velký rozpočet B 100 000: podíl návštěvy 0,077625 by se zaokrouhlený na 0,0776 propadl
      // o ~28 Kč pod hodnotu slibu (kolo 4), pokuta proto jde z nezaokrouhleného podílu.
      {
        ctx: { ...CTX, budgetB: 100000 }, seasons: 3,
        promises: [
          { kind: "attendance", params: { attendance: 207 } }, { kind: "league_position", params: { position: 5 } },
          { kind: "coach_licence", params: { level: 2 } }, { kind: "youth", params: { count: 3 } },
        ],
      },
      {
        ctx: { ...CTX, budgetB: 100000, personality: "cautious" as const }, seasons: 3,
        promises: [{ kind: "attendance", params: { attendance: 207 } }, { kind: "reputation", params: { reputation: 57 } }],
      },
    ];
    for (const c of cases) {
      const withPromises = prop({}, c.seasons, c.promises);
      const without = prop({}, c.seasons, []);
      const extra = (willingness(withPromises, c.ctx) - willingness(without, c.ctx)) * contractMonths(c.seasons);
      const totalPenalty = buildPromiseRows(withPromises, c.ctx, signDate).reduce((s, r) => s + r.penalty, 0);
      // Tolerance: ≤ 1 Kč zaokrouhlení na řádek (kolo 3 ruling), ne systémová odchylka.
      const totalRows = c.promises.reduce((s, p) => s + promiseRowCount(p.kind, c.seasons), 0);
      expect(totalPenalty).toBeGreaterThanOrEqual(extra - totalRows);
    }
  });
});

describe("earlyTerminationFee", () => {
  it("měsíčně × sezóny × 2, stejně jako u dřívějších pevných nabídek", () => {
    expect(earlyTerminationFee({ monthly: 5000, seasons: 2 })).toBe(20000);
  });
});

describe("oneTimeTotal", () => {
  it("sečte jednorázové položky smlouvy", () => {
    expect(oneTimeTotal({ signingBonus: 1000, construction: 2000, equipment: 500, paidFee: 300 })).toBe(3800);
  });
});

describe("advanceClawback", () => {
  it("hned po podpisu: vrací celou částku", () => {
    const m = contractMonths(2);
    expect(advanceClawback({ oneTimeTotal: 90000, contractMonths: m, monthsElapsed: 0 })).toBe(90000);
  });
  it("v polovině smlouvy: polovinu", () => {
    const m = contractMonths(2);
    expect(advanceClawback({ oneTimeTotal: 90000, contractMonths: m, monthsElapsed: m / 2 })).toBe(45000);
  });
  it("na konci smlouvy: nic", () => {
    const m = contractMonths(2);
    expect(advanceClawback({ oneTimeTotal: 90000, contractMonths: m, monthsElapsed: m })).toBe(0);
  });
  it("nahustit podpisový příspěvek a hned vypovědět klubu nic nevydělá", () => {
    const monthly = 5000;
    const seasons = 2;
    const signingBonus = 50000;
    const m = contractMonths(seasons);
    const total = oneTimeTotal({ signingBonus, construction: 0, equipment: 0, paidFee: 0 });
    const clawback = advanceClawback({ oneTimeTotal: total, contractMonths: m, monthsElapsed: 0 });
    const fee = earlyTerminationFee({ monthly, seasons });
    // S přijaté − vratka − pokuta ≤ 0: klub na tom nemůže vydělat.
    expect(signingBonus - clawback - fee).toBeLessThanOrEqual(0);
  });
});

describe("bonus za splnění termínového slibu = jednorázová platba (kolo 5)", () => {
  const licence: PromiseSpec[] = [{ kind: "coach_licence", params: { level: 2 } }];
  const m1 = contractMonths(1);

  it("počítá se do jednorázových položek (proposalOneTimeTotal), sezónní bonus tam ne — ten jde přes bonusAwareOneTime", () => {
    const p = prop({ monthly: 5000, signingBonus: 1000, goalBonuses: { coach_licence: 27900 } }, 1, licence);
    expect(deadlineGoalBonusTotal(p)).toBe(27900);
    expect(proposalOneTimeTotal(p, CTX)).toBe(28900);
    const seasonal = prop({ monthly: 5000, goalBonuses: { league_position: 2000 } }, 2, [{ kind: "league_position", params: { position: 7 } }]);
    expect(proposalOneTimeTotal(seasonal, CTX)).toBe(0);
    // Dřív (do zavedení bonusAwareOneTime) sezónní bonus do pravidla o polovině vůbec nevstupoval —
    // od téhle změny se počítá seasons × bonus (může se vyplatit každou sezónu smlouvy).
    expect(seasonalGoalBonusTotal(seasonal)).toBe(4000);
    expect(bonusAwareOneTime(seasonal, CTX)).toBe(4000);
  });

  it("případ z review: B 10 000, fanoušek, 1 sezóna, licence +1, měsíčně 1 Kč a bonus 27 900 neprojde pravidlem o polovině", () => {
    const p = prop({ monthly: 1, goalBonuses: { coach_licence: 27900 } }, 1, licence);
    expect(meetsMonthlyShare(p, CTX)).toBe(false);
    // 27 900 / (16 / 4,3) = 7498,125 → nejnižší měsíční 7499.
    expect(minMonthlyFor(27900, m1)).toBe(7499);
    expect(meetsMonthlyShare(prop({ monthly: 7499, goalBonuses: { coach_licence: 27900 } }, 1, licence), CTX)).toBe(true);
    expect(meetsMonthlyShare(prop({ monthly: 7498, goalBonuses: { coach_licence: 27900 } }, 1, licence), CTX)).toBe(false);
  });

  it("vratka zahrnuje už vyplacený bonus za splnění", () => {
    const total = oneTimeTotal({ signingBonus: 0, construction: 0, equipment: 0, paidFee: 0, deadlineGoalBonuses: 27900 });
    expect(total).toBe(27900);
    expect(advanceClawback({ oneTimeTotal: total, contractMonths: m1, monthsElapsed: 0 })).toBe(27900);
    expect(advanceClawback({ oneTimeTotal: total, contractMonths: m1, monthsElapsed: m1 / 2 })).toBe(13950);
    // Splnit licenci, shrábnout bonus a hned vypovědět: klub na tom nevydělá.
    const fee = earlyTerminationFee({ monthly: 7499, seasons: 1 });
    expect(27900 - advanceClawback({ oneTimeTotal: total, contractMonths: m1, monthsElapsed: 0 }) - fee).toBeLessThanOrEqual(0);
  });

  it("sleva ubere bonus i měsíční podporu a výsledek drží polovinu měsíčně", () => {
    const p = prop({ monthly: 9000, goalBonuses: { coach_licence: 27900 } }, 1, licence);
    const o = willingness(p, CTX);
    const r = reduceToWillingness(p, CTX, o);
    expect(r).not.toBeNull();
    expect(requestCost(r!, CTX)).toBeLessThanOrEqual(o + 1e-6);
    expect(meetsMonthlyShare(r!, CTX)).toBe(true);
  });

  it("protinabídky nikdy nepřidají bonus ke slibu, u kterého bonus nejde", () => {
    const ctx: NegotiationContext = { ...CTX, wishes: ["attendance", "reputation", "sector_exclusivity", "youth"] };
    let counters = 0;
    for (const seasons of [1, 2, 3]) {
      for (const monthly of [7000, 7600, 8000, 9000]) {
        for (const goal of [0, 3000, 12000]) {
          const promises: PromiseSpec[] = [{ kind: "coach_licence", params: { level: 2 } }];
          const p = prop({ monthly, goalBonuses: goal ? { coach_licence: goal } : {} }, seasons, promises);
          const r = evaluateRound(p, ctx);
          if (r.kind !== "counter_money" && r.kind !== "counter_wish") continue;
          counters++;
          const keys = Object.entries(r.counter.demands.goalBonuses).filter(([, v]) => (v ?? 0) > 0).map(([k]) => k);
          expect(keys.every((k) => GOAL_BONUS_KINDS.has(k as never))).toBe(true);
          expect(meetsMonthlyShare(r.counter, ctx)).toBe(true);
        }
      }
    }
    expect(counters).toBeGreaterThan(3);
  });
});

describe("sezónní bonusy za splnění v pravidle o měsíční polovině (nová ruling)", () => {
  const seasonalPromises: PromiseSpec[] = [{ kind: "youth", params: { count: 2 } }, { kind: "no_riots", params: {} }];

  it("3 sezóny, youth + no_riots, měsíčně 1 Kč a velké bonusy neprojdou pravidlem o polovině", () => {
    const p = prop({ monthly: 1, goalBonuses: { youth: 20000, no_riots: 20000 } }, 3, seasonalPromises);
    // seasons × (youth + no_riots) = 3 × 40 000 = 120 000, žádné jednorázové položky navíc.
    expect(seasonalGoalBonusTotal(p)).toBe(120000);
    expect(bonusAwareOneTime(p, CTX)).toBe(120000);
    expect(meetsMonthlyShare(p, CTX)).toBe(false);
  });

  it("stejný případ s dost vysokou měsíční podporou projde", () => {
    const m3 = contractMonths(3);
    const need = minMonthlyFor(120000, m3);
    const enough = prop({ monthly: need, goalBonuses: { youth: 20000, no_riots: 20000 } }, 3, seasonalPromises);
    expect(meetsMonthlyShare(enough, CTX)).toBe(true);
    const tooLittle = prop({ monthly: need - 1, goalBonuses: { youth: 20000, no_riots: 20000 } }, 3, seasonalPromises);
    expect(meetsMonthlyShare(tooLittle, CTX)).toBe(false);
  });

  it("protinabídka majitele nikdy neporuší pravidlo o polovině ani se sezónními bonusy za splnění", () => {
    const ctxs: NegotiationContext[] = [CTX, { ...CTX, wishes: ["youth", "no_riots"] }, { ...CTX, personality: "cautious" }];
    let counters = 0;
    for (const ctx of ctxs) {
      for (const seasons of [2, 3]) {
        for (const monthly of [1, 2000, 6000, 9000]) {
          for (const goal of [0, 8000, 20000]) {
            const goalBonuses = goal ? { youth: goal, no_riots: goal } : {};
            const p = prop({ monthly, goalBonuses }, seasons, seasonalPromises);
            if (!meetsMonthlyShare(p, ctx)) continue;
            const r = evaluateRound(p, ctx);
            if (r.kind === "counter_money" || r.kind === "counter_wish") {
              counters++;
              expect(meetsMonthlyShare(r.counter, ctx)).toBe(true);
            }
          }
        }
      }
    }
    expect(counters).toBeGreaterThan(0);
  });
});

describe("skutečná délka smlouvy (podpis pozdě v sezóně)", () => {
  const MPS = MONTHS_PER_SEASON;
  const late = { ...CTX, seasonProgressMonths: MPS - 0.1 };

  it("od podpisu do konce poslední sezóny, aspoň 1 měsíc", () => {
    expect(effectiveContractMonths(2, 0)).toBeCloseTo(2 * MPS, 9);
    expect(effectiveContractMonths(2, MPS / 2)).toBeCloseTo(1.5 * MPS, 9);
    expect(effectiveContractMonths(1, MPS)).toBe(1);
  });

  it("příspěvek za podpis se rozpočítá na zbytek sezóny, ne na celou sezónu", () => {
    const p = prop({ monthly: 3000, signingBonus: 6000 }, 1);
    expect(requestCost(p, CTX)).toBeCloseTo(3000 + 6000 / MPS, 6);
    expect(requestCost(p, late)).toBeCloseTo(3000 + 6000 / 1, 6);
  });

  it("pozdní podpis na 1 sezónu s velkým příspěvkem už se nevyplatí: na začátku sezóny projde, na konci ne", () => {
    // O = 0,7 × B = 7000. Polovina měsíčně, druhá polovina jako příspěvek za podpis za celou sezónu.
    const o = willingness(prop({ monthly: 1 }, 1), CTX);
    const monthly = Math.floor(o / 2);
    const signingBonus = Math.floor((o / 2) * MPS);
    const p = prop({ monthly, signingBonus }, 1);
    expect(evaluateRound(p, CTX).kind).toBe("accept");
    expect(meetsMonthlyShare(p, CTX)).toBe(true);
    // Na konci sezóny by klub dostal skoro celý příspěvek a smlouva by při rolloveru hned vypršela.
    expect(meetsMonthlyShare(p, late)).toBe(false);
    expect(evaluateRound(p, late).kind).toBe("reject");
  });

  it("co klub pozdním podpisem dostane, je nejvýš ochota × skutečné měsíce (žádný zisk navíc)", () => {
    for (const progress of [0, MPS / 2, MPS - 0.5, MPS]) {
      const ctx = { ...CTX, seasonProgressMonths: progress };
      const m = effectiveContractMonths(1, progress);
      const o = willingness(prop({ monthly: 1 }, 1), ctx);
      // Nejvyšší příspěvek, který majitel ještě přijme při polovině měsíčně.
      const monthly = Math.max(1, Math.floor(o / 2));
      const signingBonus = Math.floor((o - monthly) * m);
      const p = prop({ monthly, signingBonus }, 1);
      expect(evaluateRound(p, ctx).kind).toBe("accept");
      expect(monthly * m + signingBonus).toBeLessThanOrEqual(o * m + 1e-6);
    }
    // Na začátku sezóny smlouva vynese řádově víc než podpis na jejím konci.
    const early = willingness(prop({ monthly: 1 }, 1), CTX) * effectiveContractMonths(1, 0);
    const lateMax = willingness(prop({ monthly: 1 }, 1), late) * effectiveContractMonths(1, MPS - 0.1);
    expect(lateMax).toBeLessThan(early / 3);
  });

  it("pokuta za slib se počítá ze skutečné délky smlouvy", () => {
    const p: Proposal = { seasons: 2, promises: [{ kind: "coach_licence", params: { level: 2 } }], demands: prop({ monthly: 5000 }, 2).demands };
    const full = buildPromiseRows(p, CTX, "2026-09-23T00:00:00.000Z")[0].penalty;
    const half = buildPromiseRows(p, { ...CTX, seasonProgressMonths: MPS }, "2026-09-23T00:00:00.000Z")[0].penalty;
    expect(Math.abs(half - full / 2)).toBeLessThanOrEqual(1);
  });
});

describe("protinávrh návštěvy je položka katalogu", () => {
  it("defaultPromise attendance = hodnota „průměr“ z katalogu (zaokrouhlení nahoru)", async () => {
    const { promiseCatalog } = await import("./proposal");
    for (const lastAvgAttendance of [5, 95, 123, 200, 207, 1234, 4999]) {
      const ctx = { ...CTX, lastAvgAttendance };
      const def = defaultPromise("attendance", ctx, prop({ monthly: 5000 }, 2));
      expect(def).not.toBeNull();
      const catalog = promiseCatalog(ctx, 50).filter((o) => o.kind === "attendance").map((o) => o.params.attendance);
      expect(catalog).toContain(def!.params.attendance);
    }
  });

  it("nad strop 5000 protinávrh návštěvy nedává", () => {
    expect(defaultPromise("attendance", { ...CTX, lastAvgAttendance: 5001 }, prop({ monthly: 5000 }, 2))).toBeNull();
  });
});

describe("openingOffer", () => {
  const WISH_CTX: NegotiationContext = { ...CTX, category: "stadium", personality: "businessman", wishes: ["attendance", "jersey_logo", "sector_exclusivity"] };

  it("je platný návrh: validace projde, cena ≤ ochota, polovina měsíčně, jen měsíční podpora", () => {
    for (const personality of ["businessman", "cautious", "patriot", "fan"] as const) {
      const ctx = { ...WISH_CTX, personality };
      const offer = openingOffer(ctx);
      const valid = validateProposal(offer, ctx);
      expect(valid.ok).toBe(true);
      expect(requestCost(offer, ctx)).toBeLessThanOrEqual(willingness(offer, ctx) + 1e-6);
      expect(meetsMonthlyShare(offer, ctx)).toBe(true);
      expect(offer.demands).toMatchObject({ winBonus: 0, goalBonuses: {}, construction: null, equipment: null, payCurrentFee: false });
      expect(offer.demands.signingBonus).toBeGreaterThan(0);
      expect(offer.demands.monthly % 100).toBe(0);
      expect(offer.demands.signingBonus % 100).toBe(0);
      expect(evaluateRound(offer, ctx).kind).toBe("accept");
    }
  });

  it("sliby podle přání majitele s výchozími parametry", () => {
    const offer = openingOffer(WISH_CTX);
    expect(offer.seasons).toBe(2);
    expect(offer.promises).toEqual([
      { kind: "attendance", params: { attendance: 200 } },
      { kind: "jersey_logo", params: {} },
      { kind: "sector_exclusivity", params: { sector: "pub" } },
    ]);
  });

  it("podíl ochoty podle povahy: obchodník nabídne méně než fanoušek", () => {
    const businessman = openingOffer(WISH_CTX, "businessman");
    const fan = openingOffer(WISH_CTX, "fan");
    const o = willingness(businessman, WISH_CTX);
    // Cena nabídky (měsíčně + příspěvek rozpočítaný na měsíce) sedí těsně pod podílem ochoty.
    const cost = requestCost(businessman, WISH_CTX);
    expect(cost).toBeLessThanOrEqual(o * OPENING_OFFER_SHARE.businessman + 1e-6);
    expect(cost).toBeGreaterThan(o * OPENING_OFFER_SHARE.businessman - 200);
    expect(requestCost(businessman, WISH_CTX)).toBeLessThan(requestCost(fan, WISH_CTX));
    expect(businessman.demands.monthly).toBeLessThan(fan.demands.monthly);
  });

  it("vynechá sliby, které teď nejdou: logo už na rukávu, exkluzivita s bannerem oboru", () => {
    const ctx: NegotiationContext = { ...WISH_CTX, sleeveHeldBySponsor: true, sectorBannerActive: true };
    const offer = openingOffer(ctx);
    expect(offer.promises.map((p) => p.kind)).toEqual(["attendance"]);
    expect(validateProposal(offer, ctx).ok).toBe(true);
  });

  it("postup ani nesestup do nabídky nedá (postupy se teď nehrají), i když je má mezi přáními", () => {
    const ctx: NegotiationContext = { ...CTX, wishes: ["promotion", "league_position", "no_relegation", "cup_round"] };
    const offer = openingOffer(ctx);
    expect(offer.promises.map((p) => p.kind)).toEqual(["league_position", "cup_round"]);
    expect(validateProposal(offer, ctx).ok).toBe(true);
  });

  it("na konci sezóny (1 sezóna nejde) nabídne nejkratší povolenou délku, sezónní sliby drží", () => {
    const late: NegotiationContext = { ...CTX, wishes: ["youth"], seasonProgressMonths: MONTHS_PER_SEASON - 0.5 };
    expect(allowedContractSeasons(late.seasonProgressMonths)).toEqual([2, 3]);
    expect(openingOffer(late).seasons).toBe(2);
    expect(validateProposal(openingOffer(late), late).ok).toBe(true);
  });

  it("příspěvek za podpis: asi 20 % hodnoty smlouvy u fanouška, 15 % u obchodníka, zbytek měsíčně", () => {
    // Realistický klub: B 8 000, uprostřed tabulky, měsíc po začátku sezóny.
    const ctx: NegotiationContext = { ...CTX, budgetB: 8000, wishes: ["league_position", "cup_round"], seasonProgressMonths: 1 };
    const m = effectiveContractMonths(2, 1);
    for (const [personality, share] of [["fan", 0.2], ["businessman", 0.15]] as const) {
      const offer = openingOffer({ ...ctx, personality });
      const c = { ...ctx, personality };
      expect(validateProposal(offer, c).ok).toBe(true);
      expect(offer.demands.signingBonus).toBeGreaterThan(0);
      const total = offer.demands.monthly * m + offer.demands.signingBonus;
      expect(offer.demands.signingBonus / total).toBeGreaterThan(share - 0.02);
      expect(offer.demands.signingBonus / total).toBeLessThan(share + 0.02);
      expect(meetsMonthlyShare(offer, c)).toBe(true);
      expect(requestCost(offer, c)).toBeLessThanOrEqual(willingness(offer, c) + 1e-6);
    }
  });

  it("drobný rozpočet: nabídka pořád platná", () => {
    const tiny: NegotiationContext = { ...CTX, budgetB: 50 };
    const offer = openingOffer(tiny);
    expect(validateProposal(offer, tiny).ok).toBe(true);
    expect(requestCost(offer, tiny)).toBeLessThanOrEqual(willingness(offer, tiny) + 1e-6);
  });

  it("deterministická", () => {
    expect(openingOffer(WISH_CTX)).toEqual(openingOffer(WISH_CTX));
  });

  it("po úvodní nabídce kolo funguje dál: dražší návrh dostane protinabídku, stejný přijme", () => {
    const offer = openingOffer(WISH_CTX);
    const o = willingness(offer, WISH_CTX);
    const cost = requestCost(offer, WISH_CTX);
    const withMonthly = (monthly: number): Proposal => ({ ...offer, demands: { ...offer.demands, monthly } });
    const r = evaluateRound(withMonthly(offer.demands.monthly + Math.floor(o * 1.1 - cost)), WISH_CTX);
    expect(r.kind === "counter_money" || r.kind === "counter_wish").toBe(true);
    if (r.kind === "counter_money" || r.kind === "counter_wish") expect(validateProposal(r.counter, WISH_CTX).ok).toBe(true);
    expect(evaluateRound(withMonthly(offer.demands.monthly + Math.floor(o - cost)), WISH_CTX).kind).toBe("accept");
  });
});
