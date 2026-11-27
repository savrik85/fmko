/**
 * Třídění důvodů absence pro sazebník: flákání a hospoda se pokutují, práce a rodina ne.
 */
import { describe, expect, it } from "vitest";
import { classifyTrainingAbsence, matchExcuseConditionMatches, trainingConditionMatches } from "./classify";
import { COACH_REST_REASONS, SKIP_PLEDGE_REASONS } from "../messaging/attendance-pledge";
import { SULK_TRAINING_REASONS } from "../multiplayer/left-out";

const cat = (reason: string) => classifyTrainingAbsence({ reason });

describe("důvody absence na tréninku", () => {
  it("flákání", () => {
    for (const r of [
      "Zaspěl, prý měl budík na pět", "Říkal, že zapomněl", "Říkal, že myslel že je zítra",
      "Říkal, že přišel pozdě a styděl se", "Říkal, že přijde, ale nepřišel. Nezdá telefon",
      "Vybitý telefon, nikoho nezavolal",
    ]) expect(cat(r), r).toBe("slacking");
  });

  it("hospoda", () => {
    for (const r of [
      "Páteční hospoda se protáhla", "Včera byla zabijačka, dneska se sotva hýbe",
      "Strejda měl narozeniny, dali si jen jedno…", "Oslava povýšení v práci, dohnalo ho to ráno",
      "Hodili kluci po práci pivo, jedno vedlo k druhým", "Včera viděl Slavii, neudržel emoce",
      "Oslavuje narozeniny, své, ne cizí", "Sedí v hospodě, prý je mu to jedno, když stejně nehraje",
    ]) expect(cat(r), r).toBe("pub");
  });

  it("kopačky", () => {
    expect(cat("Tréninkové boty zapomněl v práci")).toBe("boots");
  });

  it("omluvené důvody se nepokutují jako flákání ani hospoda", () => {
    for (const r of [
      "Pohřeb vzdáleného strejdy", "Veze rodiče k doktorovi", "Oteklý kotník, raději ho šetří",
      "Šéf ho nepustil dřív, prý urgentní zakázka", "Kombajn na poli, celá rodina pomáhá",
      "Autoškola, jízdy mu dali zrovna na dnešek", "Píše zítra písemku, máma ho nepustila",
      "Nehoda na hlavní, stál hodinu v koloně", "Otevírá hospodu kamarádovi v Brně",
      "Dcera má vystoupení ve školce", "Grilování u sousedů", "Dovolená",
    ]) expect(cat(r), r).toBe("excused");
  });

  it("truc po nenominaci", () => {
    for (const r of SULK_TRAINING_REASONS) expect(["sulk", "pub"], r).toContain(cat(r));
  });

  it("volno od trenéra a předem ohlášená absence", () => {
    for (const r of COACH_REST_REASONS) expect(classifyTrainingAbsence({ reason: r, restByCoach: true })).toBe("coach_rest");
    for (const r of SKIP_PLEDGE_REASONS) expect(classifyTrainingAbsence({ reason: r, pledge: "skip" })).toBe("announced");
  });

  it("volno od trenéra nesplní ani „úplně jakýkoli“", () => {
    expect(trainingConditionMatches("any", "coach_rest")).toBe(false);
    expect(trainingConditionMatches("any", "excused")).toBe(true);
    expect(trainingConditionMatches("unexcused", "excused")).toBe(false);
    expect(trainingConditionMatches("unexcused", "sulk")).toBe(true);
    expect(trainingConditionMatches("slacking", "pub")).toBe(false);
  });
});

describe("omluvenky na zápas", () => {
  it("zranění, stopka a narození dítěte se nepokutují nikdy", () => {
    for (const reason of ["Zranění", "Stopka za karty", "Osobní volno", "Narodilo se mu dítě"]) {
      expect(matchExcuseConditionMatches("any", { reason, announcedOnMatchDay: true }), reason).toBe(false);
    }
  });
  it("kocovina a den zápasu", () => {
    expect(matchExcuseConditionMatches("hangover", { reason: "Kocovina", announcedOnMatchDay: false })).toBe(true);
    expect(matchExcuseConditionMatches("hangover", { reason: "Práce", announcedOnMatchDay: true })).toBe(false);
    expect(matchExcuseConditionMatches("match_day", { reason: "Práce", announcedOnMatchDay: true })).toBe(true);
    expect(matchExcuseConditionMatches("match_day", { reason: "Práce", announcedOnMatchDay: false })).toBe(false);
  });
});

describe("víc položek za trénink", () => {
  it("hospoda vyhraje nad „úplně jakýkoli“", async () => {
    const { trainingFineCandidates } = await import("./detect");
    const base = { valueKind: "czk" as const, repeatMode: "flat" as const, scope: "senior" as const };
    const items = [
      { id: "a", itemKey: "training_missed" as const, conditionKey: "any", amountCzk: 200, ...base },
      { id: "b", itemKey: "training_missed" as const, conditionKey: "pub", amountCzk: 50, ...base },
    ];
    const [c] = trainingFineCandidates("2026-11-18", [{ playerId: "p", attended: false, reason: "Páteční hospoda se protáhla" }], items);
    expect(c.conditionKey).toBe("pub");
  });
});
