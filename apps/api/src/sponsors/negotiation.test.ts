/**
 * Matematika jednání se sponzorem: ochota, cena, kolo, trpělivost, řádky slibů.
 */
import { describe, expect, it } from "vitest";
import { expectedWinsPerSeason, MONTHS_PER_SEASON } from "./ambition";
import {
  afterReject, buildPromiseRows, earlyTerminationFee, evaluateRound, initialPatience, promiseValueShare,
  reduceToWillingness, requestCost, willingness, type Demands, type NegotiationContext, type Proposal,
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
    const p = prop({ goalBonuses: { league_position: 2000 } }, 3, [{ kind: "league_position", params: { position: 7 } }]);
    expect(requestCost(p, CTX)).toBeCloseTo(179.17, 1);
  });
  it("stavba, vybavení a pokuta podle ceníku, rozpočítané", () => {
    expect(requestCost(prop({ construction: "toilets" }, 1), CTX)).toBeCloseTo(3225, 6);
    expect(requestCost(prop({ equipment: "balls" }, 1), CTX)).toBeCloseTo(8000 / MONTHS_PER_SEASON, 6);
    expect(requestCost(prop({ payCurrentFee: true }), CTX)).toBeCloseTo(1000, 0);
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
    const lp = rows.filter((r) => r.kind === "league_position");
    expect(lp.map((r) => r.season)).toEqual([4, 5]);
    expect(lp[0]).toMatchObject({ reward: 2000, penalty: 5581, deadlineGameDate: null, valueShare: 0.15 });
  });
  it("termínový slib: jeden řádek s termínem 112 herních dní", () => {
    const lic = rows.find((r) => r.kind === "coach_licence");
    expect(lic).toMatchObject({ season: null, deadlineGameDate: "2027-01-13T10:00:00.000Z", penalty: 1860, reward: 0 });
  });
  it("exkluzivita oboru: bez sezóny i termínu", () => {
    expect(rows.find((r) => r.kind === "sector_exclusivity")).toMatchObject({ season: null, deadlineGameDate: null });
  });
  it("smlouva na 1 sezónu: sezónní slib bez řádků", () => {
    expect(buildPromiseRows(prop({}, 1, [{ kind: "no_riots", params: {} }]), CTX, signDate)).toEqual([]);
  });
});

describe("earlyTerminationFee", () => {
  it("měsíčně × sezóny × 2 jako dřív", () => {
    expect(earlyTerminationFee(5000, 2)).toBe(20000);
  });
});
