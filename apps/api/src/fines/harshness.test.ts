/**
 * Tvrdost sazebníku a verdikt kapitána: klasika projde, přehnané pokuty narazí.
 */
import { describe, expect, it } from "vitest";
import { CLASSIC_FINE_SCHEDULE, type FineScheduleItemInput } from "@okresni-masina/shared";
import { captainDecision, isSoftening, scheduleHarshness } from "./harshness";
import { burdenRatio, burdenStage, fineTolerance, weeklyPocket } from "./burden";

const loyal = { coachRelationship: 60, temper: 40, discipline: 60, alcohol: 30, leadership: 60 };
const item = (o: Partial<FineScheduleItemInput>): FineScheduleItemInput => ({
  itemKey: "training_missed", conditionKey: "slacking", valueKind: "czk", amountCzk: 50, repeatMode: "flat", ...o,
});

describe("kapitán a sazebník", () => {
  it("Klasiku okresu běžný kapitán schválí", () => {
    expect(captainDecision(CLASSIC_FINE_SCHEDULE, loyal).verdict).toBe("approved");
  });

  it("200 Kč za úplně jakoukoli absenci odmítne", () => {
    const d = captainDecision([item({ conditionKey: "any", amountCzk: 200 })], loyal);
    expect(d.verdict).toBe("rejected");
  });

  it("jedna přehnaná položka vedle rozumných = výhrada k ní", () => {
    const items = [item({}), item({ itemKey: "yellow_card", conditionKey: "foul", amountCzk: 100 })];
    const d = captainDecision(items, loyal);
    expect(d.verdict).toBe("reservation");
    expect(d.objectionIndex).toBe(1);
  });

  it("kapitán, který pije, hájí hospodu", () => {
    const items = [item({ conditionKey: "pub", amountCzk: 100 })];
    const d = captainDecision(items, { ...loyal, alcohol: 85, coachRelationship: 45 });
    expect(d.selfInterest).toBe(true);
    expect(d.verdict).not.toBe("approved");
    expect(d.objectionIndex).toBe(0);
  });

  it("500 Kč je tvrdší než 50 Kč", () => {
    expect(scheduleHarshness([item({ amountCzk: 500 })]).score).toBeGreaterThan(scheduleHarshness([item({})]).score);
  });

  it("zmírnění pozná, přidání položky ne", () => {
    expect(isSoftening([item({ amountCzk: 20 })], [item({ amountCzk: 100 })])).toBe(true);
    expect(isSoftening([item({}), item({ itemKey: "red_card", conditionKey: "any" })], [item({})])).toBe(false);
  });
});

describe("zátěž hráče", () => {
  it("student unese míň než podnikatel", () => {
    expect(weeklyPocket({ weeklyWage: 100, age: 17, occupation: "Student" }))
      .toBeLessThan(weeklyPocket({ weeklyWage: 100, age: 35, occupation: "Podnikatel" }));
  });
  it("prchlivý unese míň než patriot", () => {
    expect(fineTolerance({ temper: 90, patriotism: 30 })).toBeLessThan(fineTolerance({ temper: 20, patriotism: 90 }));
  });
  it("stupně podle 0,5 / 1 / 2 týdenní kapsy", () => {
    expect(burdenStage(burdenRatio(100, 800, 1))).toBe(0);
    expect(burdenStage(burdenRatio(600, 800, 1))).toBe(1);
    expect(burdenStage(burdenRatio(1000, 800, 1))).toBe(2);
    expect(burdenStage(burdenRatio(600, 220, 1))).toBe(3);
  });
});

describe("tlak kabiny", () => {
  it("tvrdý vnucený sazebník tlačí na ultimátum, i když ještě nikdo neplatil", async () => {
    const { squadPressure, targetStage } = await import("./squad");
    const harsh = scheduleHarshness([item({ conditionKey: "any", amountCzk: 200 })]).score;
    const base = { ratios: [0, 0, 0, 0], origin: "imposed" as const, changesSeason: 0, resentful: false };
    expect(targetStage(squadPressure({ ...base, harshness: harsh }))).toBe(2);
    expect(targetStage(squadPressure({ ...base, origin: "approved", harshness: scheduleHarshness(CLASSIC_FINE_SCHEDULE).score }))).toBe(0);
  });
  it("přetížená polovina kádru = ultimátum i u schváleného sazebníku", async () => {
    const { squadPressure, targetStage } = await import("./squad");
    expect(targetStage(squadPressure({ ratios: [1.2, 1.1, 0.2, 0.1], origin: "approved", changesSeason: 0, resentful: false, harshness: 0.3 }))).toBe(2);
  });
});

describe("reakce na pokutu", () => {
  it("text se jménem spoluhráče mimo fakta se nepoužije", async () => {
    const { namesTeammate } = await import("./reaction");
    const squad = ["Jakub Kučera", "Šimon Svoboda"];
    expect(namesTeammate("Kučera taky chyběl a nic mu nebylo", squad, [])).toContain("Kučera");
    expect(namesTeammate("To je přes čáru, Svobodovi to nevadí?", squad, [])).toBeNull();
    expect(namesTeammate("Šimon Svoboda za to neplatil", squad, ["Šimon Svoboda"])).toBeNull();
    expect(namesTeammate("Svoboda za to neplatil", squad, [])).toContain("Svoboda");
  });
});

describe("připravené věty k pokutě", () => {
  it("bez modelu: kdo byl na tréninku, řekne, že tam byl; nikdo netvrdí, že jiní neplatí, když to není pravda", async () => {
    const { fallbackReplies, FINE_REPLIES, OBJECTION_REPLIES } = await import("./reaction");
    const fine = { id: "f", teamId: "t", playerId: "p", itemKey: null, conditionKey: null, source: "sms" as const, valueKind: "czk" as const,
      amountCzk: 150, status: "paid" as const, fact: "trénink", inSchedule: false, gameDate: "2026-11-18" };
    const base = { fines: [fine], origin: null, stage: 0 as const, othersForgiven: [], attendedLastTraining: true, restByCoachLastTraining: false, pocketWords: "", stance: "objects" as const };
    expect(fallbackReplies(base)).toBe(OBJECTION_REPLIES.attended);
    expect(fallbackReplies({ ...base, attendedLastTraining: null })).toBe(FINE_REPLIES.objects);
    expect(FINE_REPLIES.objects.join(" ")).not.toMatch(/jin[ií] za to neplat/i);
    for (const pool of Object.values(OBJECTION_REPLIES)) expect(pool.length).toBeGreaterThanOrEqual(8);
  });
});
