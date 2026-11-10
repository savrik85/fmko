import { describe, expect, it } from "vitest";
import { emptyConcessionContext } from "../ai-coach/concession-decision";
import { generateAiProfile } from "../ai-coach/profile";
import {
  computeReserve, fallbackWeeklyDecision, investBudgetFor, planWeeklyActions, renderWeeklyPrompt, reserveWeeksFor, weeklyInvestBudget,
  type WeeklyContext,
} from "../ai-coach/weekly-decision";
import { handoverMessage } from "./reclaim-handover";
import { TAKEOVER_PROTECTION_DAYS, takeoverGuardFor } from "./takeover-guard";

const DAY_MS = 86_400_000;
const NOW = new Date("2026-11-09T12:00:00.000Z");
const daysAgo = (d: number) => new Date(NOW.getTime() - d * DAY_MS).toISOString();

describe("ochranná lhůta klubu převzatého po člověku", () => {
  it("platí 90 dní od převzetí a jen pro klub, který měl lidského majitele", () => {
    expect(takeoverGuardFor({ userId: "ai", aiSince: daysAgo(1), formerUserId: "u-1" }, NOW)).toEqual({ active: true, since: daysAgo(1), daysLeft: 89 });
    expect(takeoverGuardFor({ userId: "ai", aiSince: daysAgo(89.5), formerUserId: "u-1" }, NOW).active).toBe(true);
    expect(takeoverGuardFor({ userId: "ai", aiSince: daysAgo(TAKEOVER_PROTECTION_DAYS), formerUserId: "u-1" }, NOW).active).toBe(false);
    expect(takeoverGuardFor({ userId: "ai", aiSince: daysAgo(200), formerUserId: "u-1" }, NOW).active).toBe(false);
    // Klub, který byl AI od začátku, a klub, ke kterému se majitel vrátil.
    expect(takeoverGuardFor({ userId: "ai", aiSince: null, formerUserId: null }, NOW).active).toBe(false);
    expect(takeoverGuardFor({ userId: "u-1", aiSince: null, formerUserId: null }, NOW).active).toBe(false);
    expect(takeoverGuardFor({ userId: "ai", aiSince: "nesmysl", formerUserId: "u-1" }, NOW).active).toBe(false);
  });
});

/** Bohatý klub po člověku: 600 tisíc v pokladně, trenér stavitel. */
function richClub(): WeeklyContext {
  const profile = { ...generateAiProfile("taken-club", null), building: 100, thrift: 30, ambition: 50 };
  const running = 6000;
  const reserve = computeReserve(profile, running);
  const budget = 600_000;
  return {
    teamId: "taken-club", teamName: "FK Po Člověku", gameDay: "2026-11-09", budget, reputation: 50, profile,
    finance: { weeklyRunningCost: running, weeklyIncome: 7000, reserveWeeks: reserveWeeksFor(profile), reserve, spendable: budget - reserve },
    league: { position: 5, teams: 14, points: 15, played: 9 },
    training: { type: "conditioning", approach: "balanced", sessions: 2, matchWeekdays: [1, 4], avgCondition: 85, injured: 0, squadSize: 24, youngPlayers: 4 },
    fans: { satisfaction: 60, ticketPrice: 30, villageBasePrice: 30, daysSinceTicketChange: null },
    pitch: { condition: 80, type: "natural", careMode: "auto", hasCareEquipment: true, hasMower: true },
    stadium: [
      { key: "S1", ref: "stand_main", label: "stand_main 1->2", cost: 180_000, detail: "tribuna" },
      { key: "S2", ref: "changing_rooms", label: "changing_rooms 0->1", cost: 25_000, detail: "šatny" },
    ],
    equipmentUpgrades: [{ key: "E1", ref: "balls", label: "balls 1->2", cost: 4000, detail: "míče" }],
    equipmentRepairs: [],
    staff: { hiredRoles: [], candidates: [] },
    academy: { current: "none", weeklyCostNow: 0, prospects: 0, expectedPerYear: 3, canVolunteer: false, canStaff: false, canFound: false },
    banners: { active: 0, max: 3, offers: [] },
    u21: { exists: false, aTeamSize: 24, promote: [], sendDown: [] },
    transfers: { squadSize: 24, targetSize: 24, needs: [], surplus: [] },
    concessions: emptyConcessionContext(),
  };
}

describe("týdenní strop investic převzatého klubu", () => {
  it("bez lhůty jde do staveb skoro všechno nad rezervou; v ochranné lhůtě nejvýš běžná rezerva trenéra", () => {
    const free = richClub();
    expect(weeklyInvestBudget(free)).toBe(investBudgetFor(free.profile, free.finance.spendable));
    expect(weeklyInvestBudget(free)).toBeGreaterThan(500_000);

    const guarded = richClub();
    guarded.finance.investCap = guarded.finance.reserve;
    guarded.takeover = { daysLeft: 89 };
    expect(weeklyInvestBudget(guarded)).toBe(guarded.finance.reserve);

    const wish = { ...fallbackWeeklyDecision(free), stadium: ["S1", "S2"], equipmentUpgrades: ["E1"] };
    const spentFree = planWeeklyActions(free, wish).actions.filter((a) => a.kind === "stadium_upgrade" || a.kind === "equipment_upgrade");
    expect(spentFree.map((a) => a.kind === "stadium_upgrade" ? a.facility : a.kind)).toContain("stand_main");
    const planned = planWeeklyActions(guarded, wish);
    const invested = planned.actions.filter((a) => a.kind === "stadium_upgrade" || a.kind === "equipment_upgrade");
    const total = invested.reduce((sum, a) => sum + ("cost" in a ? a.cost : 0), 0);
    expect(total).toBeLessThanOrEqual(guarded.finance.reserve);
    // Tribuna za 180 tisíc se do stropu nevejde, drobnosti ano.
    expect(invested.some((a) => a.kind === "stadium_upgrade" && a.facility === "stand_main")).toBe(false);
    expect(planned.skipped.some((s) => s.item === "S1" && s.reason.includes("investiční rozpočet"))).toBe(true);
  });

  it("model se o lhůtě dozví v popisu týdne", () => {
    const guarded = richClub();
    guarded.finance.investCap = guarded.finance.reserve;
    guarded.takeover = { daysLeft: 12 };
    const prompt = renderWeeklyPrompt(guarded);
    expect(prompt).toContain("CARETAKER: you took this club over from a human owner who may come back within 12 days.");
    expect(prompt).toContain("the club and the stadium keep their names");
    expect(renderWeeklyPrompt(richClub())).not.toContain("CARETAKER:");
  });
});

describe("zpráva majiteli po návratu ke klubu", () => {
  it("shrne odchody, příchody, sponzory, větší útraty a co se stáhlo", () => {
    const text = handoverMessage({
      listingsWithdrawn: 2, demandsWithdrawn: 1, offersWithdrawn: 5,
      sold: [{ name: "Jan Novák", amount: 45_000 }], bought: [{ name: "Petr Volný", amount: 0 }, { name: "Karel Drahý", amount: 80_000 }],
      sponsors: ["Pivovar Lhota"], spending: [{ label: "stadion a hřiště", total: 120_000 }, { label: "vybavení", total: 35_000 }],
    });
    expect(text).toContain("Trenére, vítejte zpátky.");
    expect(text).toContain("Odešli: Jan Novák (45 000 Kč).");
    expect(text).toContain("Přišli: Petr Volný, Karel Drahý (80 000 Kč).");
    expect(text).toContain("Nové smlouvy se sponzory: Pivovar Lhota.");
    expect(text).toContain("Větší útraty: stadion a hřiště 120 000 Kč, vybavení 35 000 Kč.");
    expect(text).toContain("Stáhli jsme 2 inzeráty, 1 poptávku, 5 rozjednaných nabídek, které zůstaly otevřené.");
    expect(text).not.toMatch(/[—–]/);
  });

  it("klidné zastupování: krátká zpráva bez prázdných řádků", () => {
    const text = handoverMessage({ listingsWithdrawn: 0, demandsWithdrawn: 0, offersWithdrawn: 0, sold: [], bought: [], sponsors: [], spending: [] });
    expect(text).toBe("Trenére, vítejte zpátky. Klub mezitím vedl zastupující trenér. Co se za tu dobu stalo:\nV kádru, u sponzorů ani na stadionu se nic velkého nezměnilo.\nDál už rozhodujete vy.");
  });
});
