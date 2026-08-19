import { describe, it, expect } from "vitest";
import { DEFAULT_RULES, type CompetitionRules } from "./defaults";
import {
  matchCount, placementSum, placementReward, expectedBonusPerMatch, worstBonusPerMatch,
  projectSeasonCost, subsidyFor, checkBudget, teamImpact, payoutRatio,
  outstandingCommitments, freeBalance,
} from "./projection";

const R = DEFAULT_RULES as unknown as CompetitionRules;
const rules = (over: Partial<CompetitionRules> = {}): CompetitionRules => ({ ...R, ...over });

describe("projekce rozpočtu soutěže", () => {
  it("14 týmů hraje 182 zápasů, tedy 26 kol", () => {
    expect(matchCount(14)).toBe(182);
    expect(matchCount(14) / 7).toBe(26);
  });

  it("součet odměn za umístění odpovídá geometrické řadě", () => {
    // 150000 × (1 − 0,8^14) / 0,2 = 717 015; floor 6 000 se při 14 týmech neuplatní
    expect(placementSum(R, 14, "okresni_prebor")).toBe(717_015);
    expect(placementReward(R, 1, "okresni_prebor")).toBe(150_000);
    expect(placementReward(R, 14, "okresni_prebor")).toBeGreaterThan(R.place_floor);
  });

  it("floor se uplatní až u velmi dlouhé tabulky", () => {
    expect(placementReward(R, 20, "okresni_prebor")).toBe(R.place_floor);
  });

  it("násobič úrovně soutěže se propíše do odměn", () => {
    expect(placementReward(R, 1, "krajsky_prebor")).toBe(262_500);
    expect(placementReward(R, 1, "okresni_soutez")).toBe(127_500);
  });

  it("očekávaná prémie na zápas je 450 Kč, nejhorší případ 500", () => {
    expect(expectedBonusPerMatch(R)).toBe(450);
    expect(worstBonusPerMatch(R)).toBe(500);
  });

  it("náklady sezóny při výchozích sazbách sedí na kalibraci", () => {
    const c = projectSeasonCost(R, 14, "okresni_prebor");
    expect(c.placement).toBe(717_015);
    expect(c.bonus).toBe(81_900);
    expect(c.referees).toBe(209_300);
    expect(c.total).toBe(1_008_215);
  });

  it("svazová dotace drží výchozí bilanci kladnou i v nejhorším průběhu", () => {
    const subsidy = subsidyFor(14, "okresni_prebor");
    expect(subsidy).toBe(822_161);

    const worst = projectSeasonCost(R, 14, "okresni_prebor", true);
    const income = subsidy + 14 * R.entry_fee;
    expect(income - worst.total).toBeGreaterThan(0);
  });

  it("dotace škáluje s počtem týmů i úrovní soutěže", () => {
    expect(subsidyFor(10, "okresni_prebor")).toBeLessThan(subsidyFor(14, "okresni_prebor"));
    expect(subsidyFor(14, "krajsky_prebor")).toBeGreaterThan(subsidyFor(14, "okresni_prebor"));
  });

  it("výchozí sazby projdou stropem i s nulovým volným zůstatkem", () => {
    const check = checkBudget({ rules: R, teams: 14, level: "okresni_prebor", balance: 0 });
    expect(check.ok).toBe(true);
    expect(check.deficit).toBe(0);
  });

  it("na začátku sezóny je volný zůstatek malý, ale kladný — a strop projde", () => {
    const balance = subsidyFor(14, "okresni_prebor") + 14 * R.entry_fee;
    const free = freeBalance(balance, R, 14, "okresni_prebor", 0);
    expect(free).toBeGreaterThan(0);
    expect(checkBudget({ rules: R, teams: 14, level: "okresni_prebor", balance: free }).ok).toBe(true);
  });

  it("zvýšení odměny za výhru se musí zaplatit vyšším startovným", () => {
    const balance = subsidyFor(14, "okresni_prebor") + 14 * R.entry_fee;
    const free = freeBalance(balance, R, 14, "okresni_prebor", 0);
    const richer = rules({ win_bonus: 900 });
    const check = checkBudget({ rules: richer, teams: 14, level: "okresni_prebor", balance: free });
    expect(check.ok).toBe(false);
    expect(check.requiredEntryFee).toBeGreaterThan(R.entry_fee);

    const fixed = rules({ win_bonus: 900, entry_fee: check.requiredEntryFee });
    expect(checkBudget({ rules: fixed, teams: 14, level: "okresni_prebor", balance: free }).ok).toBe(true);
  });

  it("přestřelený návrh strop neprojde a řekne, kolik chybí", () => {
    const greedy = rules({ win_bonus: 1000, draw_bonus: 300, place_top: 200_000 });
    const check = checkBudget({ rules: greedy, teams: 14, level: "okresni_prebor", balance: 0 });
    expect(check.ok).toBe(false);
    expect(check.deficit).toBeGreaterThan(300_000);
    expect(check.requiredEntryFee).toBeGreaterThan(greedy.entry_fee);
  });

  it("zvednuté startovné dokáže dražší sazebník zaplatit", () => {
    const greedy = rules({ win_bonus: 1000, draw_bonus: 300, place_top: 200_000 });
    const need = checkBudget({ rules: greedy, teams: 14, level: "okresni_prebor", balance: 0 }).requiredEntryFee;
    const fixed = rules({ ...greedy, entry_fee: need });
    expect(checkBudget({ rules: fixed, teams: 14, level: "okresni_prebor", balance: 0 }).ok).toBe(true);
  });

  it("sazba rozhodčím se do stropu započítává", () => {
    const cheap = checkBudget({ rules: rules({ referee_fee: 600 }), teams: 14, level: "okresni_prebor", balance: 0 });
    const pricey = checkBudget({ rules: rules({ referee_fee: 2500 }), teams: 14, level: "okresni_prebor", balance: 0 });
    expect(cheap.projected - pricey.projected).toBe(182 * (2500 - 600));
  });

  it("dopad na klub počítá odměny minus startovné a rozhodčí ignoruje", () => {
    const base = { rules: R, teams: 14, level: "okresni_prebor", expectedPos: 6, expectedWins: 12, expectedDraws: 6 };
    const impact = teamImpact(base);
    expect(impact.matchBonus).toBe(12 * 500 + 6 * 150);
    expect(impact.placeReward).toBe(placementReward(R, 6, "okresni_prebor"));
    expect(impact.entryFee).toBe(15_000);
    expect(impact.net).toBe(impact.matchBonus + impact.placeReward - 15_000);

    // Sazba rozhodčím na klubový rozpočet nesmí mít vliv — platí ji soutěž.
    expect(teamImpact({ ...base, rules: rules({ referee_fee: 2500 }) }).net).toBe(impact.net);
  });

  it("zvýšení odměn prospěje lídrovi a poškodí zadní klub", () => {
    const richer = rules({ win_bonus: 2000, entry_fee: 34_300 });
    const leader = { teams: 14, level: "okresni_prebor", expectedPos: 1, expectedWins: 20, expectedDraws: 3 };
    const tail = { teams: 14, level: "okresni_prebor", expectedPos: 13, expectedWins: 5, expectedDraws: 5 };
    expect(teamImpact({ ...leader, rules: richer }).net).toBeGreaterThan(teamImpact({ ...leader, rules: R }).net);
    expect(teamImpact({ ...tail, rules: richer }).net).toBeLessThan(teamImpact({ ...tail, rules: R }).net);
  });

  it("závazky rozehrané sezóny klesají s počtem odehraných zápasů", () => {
    const start = outstandingCommitments(R, 14, "okresni_prebor", 0);
    const half = outstandingCommitments(R, 14, "okresni_prebor", 91);
    const end = outstandingCommitments(R, 14, "okresni_prebor", 182);

    // Na začátku sezóny visí celý náklad, na konci už jen odměny za umístění.
    expect(start.total).toBe(projectSeasonCost(R, 14, "okresni_prebor", true).total);
    expect(end.total).toBe(717_015);
    expect(half.total).toBeGreaterThan(end.total);
    expect(half.total).toBeLessThan(start.total);
  });

  it("volný zůstatek nepočítá peníze, které se letos ještě rozdají", () => {
    // Pokladna právě dostala celou dotaci a nic z ní zatím neutratila.
    const balance = subsidyFor(14, "okresni_prebor") + 14 * R.entry_fee;
    const free = freeBalance(balance, R, 14, "okresni_prebor", 0);
    expect(free).toBeLessThan(balance);
    expect(free).toBe(balance - outstandingCommitments(R, 14, "okresni_prebor", 0).total);
  });

  it("plná pokladna v půlce sezóny neuživí trvalé zdražení odměn", () => {
    const balance = subsidyFor(14, "okresni_prebor") + 14 * R.entry_fee;
    const greedy = rules({ place_top: 250_000 });

    // Hrubý zůstatek by návrh pustil — a to je právě ta past.
    expect(checkBudget({ rules: greedy, teams: 14, level: "okresni_prebor", balance }).ok).toBe(true);

    // S volným zůstatkem (letošní odměny se teprve vyplatí) neprojde.
    const free = freeBalance(balance, R, 14, "okresni_prebor", 0);
    expect(checkBudget({ rules: greedy, teams: 14, level: "okresni_prebor", balance: free }).ok).toBe(false);
  });

  it("krácení odměn je poměrné a nikdy záporné", () => {
    expect(payoutRatio(1000, 1000)).toBe(1);
    expect(payoutRatio(2000, 1000)).toBe(1);
    expect(payoutRatio(500, 1000)).toBe(0.5);
    expect(payoutRatio(-100, 1000)).toBe(0);
    expect(payoutRatio(0, 0)).toBe(1);
  });
});

import { hasMajority } from "./meeting";

describe("většina při hlasování", () => {
  it("prostá většina potřebuje ostře víc hlasů pro", () => {
    expect(hasMajority(5, 4, 0.5)).toBe(true);
    expect(hasMajority(4, 4, 0.5)).toBe(false);   // rovnost neprojde
    expect(hasMajority(4, 5, 0.5)).toBe(false);
    expect(hasMajority(0, 0, 0.5)).toBe(false);
  });

  it("kvalifikovaná většina projde přesně na dvou třetinách", () => {
    const q = 2 / 3;
    expect(hasMajority(8, 4, q)).toBe(true);      // přesně 2/3
    expect(hasMajority(7, 4, q)).toBe(false);
    expect(hasMajority(9, 4, q)).toBe(true);
    expect(hasMajority(2, 1, q)).toBe(true);
    expect(hasMajority(3, 2, q)).toBe(false);
  });

  it("zdržel se do většiny nevstupuje", () => {
    // 3 pro, 2 proti, 9 se zdrželo → prostá většina projde
    expect(hasMajority(3, 2, 0.5)).toBe(true);
  });
});
