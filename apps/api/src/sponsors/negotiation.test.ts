/**
 * Matematika jednání se sponzorem: ochota, cena, kolo, trpělivost, řádky slibů.
 */
import { describe, expect, it } from "vitest";
import { expectedWinsPerSeason, MONTHS_PER_SEASON } from "./ambition";
import {
  advanceClawback, afterReject, buildPromiseRows, contractMonths, defaultPromise, earlyTerminationFee, evaluateRound,
  initialPatience, meetsMonthlyShare, minMonthlyFor, oneTimeTotal, promiseChance, promisePenalty, promiseRowCount, promiseValueShare, reduceToWillingness,
  requestCost, willingness, type Demands, type NegotiationContext, type Proposal,
} from "./negotiation";
import type { PromiseSpec } from "./promise-kinds";

const CTX: NegotiationContext = {
  category: "main", personality: "fan", wishes: [], budgetB: 10000, season: 3, leagueTeams: 14,
  expectedPosition: 7, cupTotalRounds: 7, lastAvgAttendance: 200, reputation: 50, licenceLevel: 1,
  sponsorType: "pub", sectorBannerActive: false,
  facilities: [
    { facility: "stands", currentLevel: 1, locked: false, costs: [0, 55000, 170000, 450000] },
    { facility: "toilets", currentLevel: 0, locked: false, costs: [0, 12000, 40000, 100000] },
  ],
  equipment: [{ category: "balls", currentLevel: 1, nextLevel: 2, cost: 8000, locked: false }],
  currentTerminationFee: 7442,
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
    const ctx: NegotiationContext = { ...CTX, expectedPosition: 14, wishes: ["promotion", "league_position"] };
    const p = prop({}, 2, [{ kind: "promotion", params: {} }, { kind: "league_position", params: { position: 1 } }]);
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
  it("bonus za splnění u mladých: klub nevybere víc než O × měsíce (B 10 000, fanoušek, 3 sezóny, G 30 000)", () => {
    const seasons = 3;
    const m = contractMonths(seasons);
    const youth: PromiseSpec[] = [{ kind: "youth", params: { count: 2 } }];
    const rows = promiseRowCount("youth", seasons);
    const G = 30000;
    const o = willingness(prop({}, seasons, youth), CTX);
    expect(o).toBeCloseTo(7500, 6);
    // Nejvyšší měsíční podpora, kterou sponzor s tímhle bonusem přijme.
    const monthly = Math.floor(o - (G * rows) / m + 1e-6);
    const accepted = prop({ monthly, goalBonuses: { youth: G } }, seasons, youth);
    expect(evaluateRound(accepted, CTX)).toEqual({ kind: "accept" });
    // Slib si klub splní sám, takže dostane měsíčně × měsíce + G za každou sezónu se slibem.
    expect(monthly * m + G * rows).toBeLessThanOrEqual(o * m + 1);
    expect(evaluateRound({ ...accepted, demands: { ...accepted.demands, monthly: monthly + 1 } }, CTX).kind).not.toBe("accept");
    // Ani protinabídka nepustí klub nad O × měsíce.
    const r = evaluateRound(prop({ monthly: monthly + 100, goalBonuses: { youth: G } }, seasons, youth), CTX);
    expect(r.kind).toBe("counter_money");
    if (r.kind === "counter_money") {
      const d = r.counter.demands;
      expect(d.monthly * m + (d.goalBonuses.youth ?? 0) * rows).toBeLessThanOrEqual(o * m + 1);
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
  it("protinabídka za přání přeskočí kolizi se stejným cílem v lize (pravidlo 1d)", () => {
    const ctx = { ...CTX, wishes: ["promotion" as const] };
    // Umístění už slíbené, přání „postup" je stejný cíl v lize — nejde přidat, zbývá sleva.
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
