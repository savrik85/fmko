import { describe, expect, it } from "vitest";
import { getOccupationByName } from "../generators/occupations";
import type { TransferUnrest } from "./offer-rejection-impact";
import { JOB_LURE_SHARE, JOB_LURES, canTakeJob, jobLureOf, jobLurePull, pickJobLure } from "./job-lure";
import { computePlayerInterest, interestOfferOf, type InterestInputs } from "./player-interest";
import { availableActions, UNREST_ACTIONS, type UnrestContext } from "./unrest";
import { DEAL_TEXTS, REASON_LABELS, REASON_SMS, reasonSms, transferTalkFrom, unrestReasonsFromFactors } from "./unrest-reasons";
import { fallbackUnrestChoice, type UnrestCandidate } from "../ai-coach/unrest-decision";
import type { AiCoachProfile } from "../ai-coach/profile";

const BASE: InterestInputs = {
  personality: { patriotism: 50 }, morale: 50, coachRelationship: 50, recentMinutes: 250, age: 26, overallRating: 55,
  position: "MID", currentTeamStrength: 45, offerTeamStrength: 55, offerAmount: 60_000,
};

describe("soupeř láká prací", () => {
  it("nabídky s prací nesou povolání, které hra zná, a jen část nabídek práci má", () => {
    for (const l of JOB_LURES) expect(getOccupationByName(l.occupation), l.occupation).toBeDefined();
    let withJob = 0;
    for (let i = 0; i < 2000; i++) if (pickJobLure(`team-${i}|2026-11-20`)) withJob++;
    expect(withJob / 2000).toBeGreaterThan(JOB_LURE_SHARE - 0.05);
    expect(withJob / 2000).toBeLessThan(JOB_LURE_SHARE + 0.05);
    expect(pickJobLure("team-7|2026-11-20")).toEqual(pickJobLure("team-7|2026-11-20"));
  });

  it("práce táhne hlavně toho, kdo je bez práce; kdo dělá u sponzora, toho nenaláká", () => {
    expect(jobLurePull({ unemployed: true, sponsorJob: false, occupation: "Zedník" })).toBeGreaterThan(
      jobLurePull({ unemployed: false, sponsorJob: false, occupation: "Hasič" }));
    expect(jobLurePull({ unemployed: false, sponsorJob: false, occupation: "Hasič" })).toBeGreaterThan(
      jobLurePull({ unemployed: false, sponsorJob: false, occupation: "Účetní" }));
    expect(jobLurePull({ unemployed: true, sponsorJob: true, occupation: "Zedník" })).toBe(0);
  });

  it("student, důchodce ani kluk práci od soupeře neberou", () => {
    expect(canTakeJob(17, "Student")).toBe(false);
    expect(canTakeJob(21, "Student")).toBe(false);
    expect(canTakeJob(64, "Důchodce")).toBe(false);
    expect(canTakeJob(28, "Zedník")).toBe(true);
  });

  it("faktor zájmu „Práce u nich“ a z něj důvod nespokojenosti `job`", () => {
    const plain = computePlayerInterest(BASE);
    const lured = computePlayerInterest({ ...BASE, jobLure: { unemployed: true, sponsorJob: false, occupation: "Zedník" } });
    expect(lured.score).toBeGreaterThan(plain.score);
    expect(lured.factors.map((f) => f.label)).toContain("Práce u nich");
    expect(unrestReasonsFromFactors(lured.factors)).toContain("job");
    // Denní práce táhne málo, důvod z toho není.
    const weak = computePlayerInterest({ ...BASE, jobLure: { unemployed: false, sponsorJob: false, occupation: "Účetní" } });
    expect(unrestReasonsFromFactors(weak.factors)).not.toContain("job");
  });

  it("práce se čte z virtual_team_data nabídky", () => {
    const vd = JSON.stringify({ name: "TJ Blatná", rating: 50, job: JOB_LURES[0] });
    expect(jobLureOf(vd)).toEqual(JOB_LURES[0]);
    expect(jobLureOf(JSON.stringify({ name: "TJ Blatná" }))).toBeNull();
    expect(jobLureOf("{rozbité")).toBeNull();
    expect(interestOfferOf({ from_team_id: "virtual_ai", offer_amount: 50_000, virtual_team_data: vd }).virtualJob).toBe(true);
    expect(interestOfferOf({ from_team_id: "team-1", offer_amount: 50_000, virtual_team_data: vd }).virtualJob).toBeUndefined();
  });
});

describe("důvod `job` má dohodu", () => {
  const CTX: UnrestContext = { seasonNumber: 4, patriotism: 50, discipline: 50, leadership: 30, coachRelationship: 50, isCaptain: false, ownedHere: true };
  const unrest = (o: Partial<TransferUnrest> = {}): TransferUnrest => ({ level: 50, reasons: ["job"], ...o });

  it("nabídne se „Sehnat mu práci u sponzora“, ne dvakrát a ne tomu, kdo u sponzora už dělá", () => {
    expect(availableActions(unrest(), {}, CTX).map((a) => a.id)).toEqual(["find_job"]);
    expect(availableActions(unrest({ deals: [{ id: "find_job", at: "2026-11-20T10:00:00Z" }] }), {}, CTX).map((a) => a.id)).toEqual([]);
    expect(availableActions(unrest(), { sponsorJob: { sponsorId: 1 } }, CTX).map((a) => a.id)).toEqual([]);
    // Na hostování hraje jinde: práci mu klub u svého sponzora nesežene.
    expect(availableActions(unrest(), {}, { ...CTX, ownedHere: false }).map((a) => a.id)).toEqual([]);
  });

  it("texty dohody a důvodu: česky, bez dlouhé pomlčky a značek", () => {
    const def = UNREST_ACTIONS.find((a) => a.id === "find_job")!;
    for (const t of [def.label, def.coachMessage, def.description, DEAL_TEXTS.find_job, REASON_LABELS.job, REASON_SMS.job, reasonSms("job", undefined)]) {
      expect(t).toBeTruthy();
      expect(t).not.toMatch(/[—{}]/);
    }
    expect(transferTalkFrom({ reasons: ["job"], deals: [{ id: "find_job" }] })?.deals).toEqual([DEAL_TEXTS.find_job]);
  });

  it("AI trenér bez modelu: potřebnému hráči sežene práci dřív než apeluje", () => {
    const profile: AiCoachProfile = {
      version: 1, ambition: 50, thrift: 50, youthFocus: 40, risk: 50, trading: 30, building: 50, patience: 40,
      favouriteTactic: "balanced", favouriteFormations: ["4-4-2"],
    };
    const p: UnrestCandidate = {
      key: "P1", playerId: "p1", name: "Jan Novák", age: 27, position: "MID", rating: 55, importance: "key", inU21: false,
      onLoanElsewhere: false, weeklyWage: 500, level: 60, reasons: ["job"], offer: { club: "TJ Blatná", amount: 40_000 }, dealsDone: [],
      options: [{ id: "find_job", cost: 0, weeklyCost: 0 }, { id: "appeal_loyalty", cost: 0, weeklyCost: 0 }],
    };
    expect(fallbackUnrestChoice(p, profile)).toBe("find_job");
  });
});
