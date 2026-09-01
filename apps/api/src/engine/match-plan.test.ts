import { describe, it, expect } from "vitest";
import { ruleMatches, type EngineMatchPlanRule, type PlanContext } from "./match-plan";
import { createTeam } from "./test-helpers/lineup";

/**
 * Vyhodnocení jednoho pravidla plánu. Čistá funkce — žádná simulace, žádná DB.
 * Efekt pravidel na skutečný zápas hlídá `match-plan-simulace.test.ts`.
 */

const sestava = createTeam(1, "Domácí").lineup;

function ctx(over: Partial<PlanContext> = {}): PlanContext {
  return {
    minute: 70,
    ownScore: 0,
    oppScore: 0,
    ownOnPitch: 11,
    oppOnPitch: 11,
    lineup: sestava,
    ...over,
  };
}

function pravidlo(over: Partial<EngineMatchPlanRule> = {}): EngineMatchPlanRule {
  return {
    id: "r1",
    fromMinute: 1,
    trigger: { kind: "minute" },
    action: { kind: "tactic", tactic: "offensive" },
    ...over,
  };
}

describe("fromMinute", () => {
  it("před zadanou minutou nesepne ani splněná podmínka", () => {
    const r = pravidlo({ fromMinute: 60, trigger: { kind: "minute" } });
    expect(ruleMatches(r, ctx({ minute: 59 }))).toBe(false);
  });

  it("v zadané minutě už sepne", () => {
    const r = pravidlo({ fromMinute: 60, trigger: { kind: "minute" } });
    expect(ruleMatches(r, ctx({ minute: 60 }))).toBe(true);
  });
});

describe("spouštěč podle skóre", () => {
  it("prohráváme sepne při manku, ne při remíze ani vedení", () => {
    const r = pravidlo({ trigger: { kind: "score", state: "losing" } });
    expect(ruleMatches(r, ctx({ ownScore: 0, oppScore: 1 }))).toBe(true);
    expect(ruleMatches(r, ctx({ ownScore: 1, oppScore: 1 }))).toBe(false);
    expect(ruleMatches(r, ctx({ ownScore: 2, oppScore: 1 }))).toBe(false);
  });

  it("byAtLeast bere manko o dva a víc, jeden gól nestačí", () => {
    const r = pravidlo({ trigger: { kind: "score", state: "losing", byAtLeast: 2 } });
    expect(ruleMatches(r, ctx({ ownScore: 0, oppScore: 1 }))).toBe(false);
    expect(ruleMatches(r, ctx({ ownScore: 0, oppScore: 2 }))).toBe(true);
    expect(ruleMatches(r, ctx({ ownScore: 1, oppScore: 4 }))).toBe(true);
  });

  it("vedeme funguje zrcadlově", () => {
    const r = pravidlo({ trigger: { kind: "score", state: "winning", byAtLeast: 2 } });
    expect(ruleMatches(r, ctx({ ownScore: 2, oppScore: 0 }))).toBe(true);
    expect(ruleMatches(r, ctx({ ownScore: 1, oppScore: 0 }))).toBe(false);
  });

  it("remíza sepne jen při shodném skóre", () => {
    const r = pravidlo({ trigger: { kind: "score", state: "drawing" } });
    expect(ruleMatches(r, ctx({ ownScore: 2, oppScore: 2 }))).toBe(true);
    expect(ruleMatches(r, ctx({ ownScore: 2, oppScore: 1 }))).toBe(false);
  });
});

describe("spouštěč podle početního stavu", () => {
  it("oslabení sepne když nás je na hřišti míň", () => {
    const r = pravidlo({ trigger: { kind: "men", state: "down" } });
    expect(ruleMatches(r, ctx({ ownOnPitch: 10, oppOnPitch: 11 }))).toBe(true);
    expect(ruleMatches(r, ctx({ ownOnPitch: 11, oppOnPitch: 11 }))).toBe(false);
    expect(ruleMatches(r, ctx({ ownOnPitch: 11, oppOnPitch: 10 }))).toBe(false);
  });

  it("přesilovka sepne opačně", () => {
    const r = pravidlo({ trigger: { kind: "men", state: "up" } });
    expect(ruleMatches(r, ctx({ ownOnPitch: 11, oppOnPitch: 10 }))).toBe(true);
    expect(ruleMatches(r, ctx({ ownOnPitch: 10, oppOnPitch: 10 }))).toBe(false);
  });

  it("dvě vyloučení na obou stranách nechají stav vyrovnaný", () => {
    const r = pravidlo({ trigger: { kind: "men", state: "down" } });
    expect(ruleMatches(r, ctx({ ownOnPitch: 10, oppOnPitch: 10 }))).toBe(false);
  });
});

describe("spouštěč podle kondice", () => {
  it("u změny taktiky hlídá kohokoli v poli", () => {
    const r = pravidlo({ trigger: { kind: "condition", below: 30 } });
    const unaveny = sestava.map((p, i) => i === 5 ? { ...p, condition: 20 } : p);
    expect(ruleMatches(r, ctx({ lineup: unaveny }))).toBe(true);
    expect(ruleMatches(r, ctx())).toBe(false);
  });

  it("brankář vyčerpáním změnu taktiky nespustí", () => {
    const r = pravidlo({ trigger: { kind: "condition", below: 30 } });
    const unavenyGK = sestava.map((p) => p.position === "GK" ? { ...p, condition: 5 } : p);
    expect(ruleMatches(r, ctx({ lineup: unavenyGK }))).toBe(false);
  });

  it("u střídání hlídá jen konkrétního střídaného hráče", () => {
    const outId = sestava[5].id;
    const r = pravidlo({
      trigger: { kind: "condition", below: 30 },
      action: { kind: "sub", outPlayerId: outId, inPlayerId: 112 },
    });
    const jinyUnaveny = sestava.map((p) => p.id === sestava[6].id ? { ...p, condition: 10 } : p);
    expect(ruleMatches(r, ctx({ lineup: jinyUnaveny }))).toBe(false);

    const spravnyUnaveny = sestava.map((p) => p.id === outId ? { ...p, condition: 10 } : p);
    expect(ruleMatches(r, ctx({ lineup: spravnyUnaveny }))).toBe(true);
  });

  it("střídaný hráč, který už na hřišti není, pravidlo nespustí", () => {
    const r = pravidlo({
      trigger: { kind: "condition", below: 30 },
      action: { kind: "sub", outPlayerId: 999, inPlayerId: 112 },
    });
    expect(ruleMatches(r, ctx())).toBe(false);
  });
});
