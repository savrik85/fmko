import { describe, expect, it } from "vitest";
import { generateAiProfile, type AiCoachProfile } from "./profile";
import {
  buildTrainingPlan, computeReserve, fallbackWeeklyDecision, investBudgetFor, nextTicketPrice, planWeeklyActions, renderWeeklyPrompt,
  reserveWeeksFor, validateWeeklyDecision, MIN_RESERVE,
  type WeeklyContext, type WeeklyDecision,
} from "./weekly-decision";

function profile(over: Partial<AiCoachProfile> = {}): AiCoachProfile {
  return { ...generateAiProfile("team-weekly", null), ...over };
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

  it("bannery jen do volných míst", () => {
    const plan = planWeeklyActions(context(100_000), everything);
    expect(plan.actions.filter((a) => a.kind === "banner")).toHaveLength(2);
  });
});

describe("kontrola odpovědi modelu", () => {
  it("platná odpověď projde", () => {
    expect(validateWeeklyDecision(everything, context(100_000)).ok).toBe(true);
  });

  it("položka mimo nabídku shodí rozhodnutí", () => {
    expect(validateWeeklyDecision({ ...everything, stadium: ["S9"] }, context(100_000)).ok).toBe(false);
    expect(validateWeeklyDecision({ ...everything, hire: ["staff-1"] }, context(100_000)).ok).toBe(false);
    expect(validateWeeklyDecision({ ...everything, academy: "elite" }, context(100_000)).ok).toBe(false);
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
  });
});
