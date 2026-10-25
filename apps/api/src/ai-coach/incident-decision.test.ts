import { describe, expect, it } from "vitest";
import {
  advanceOptions, clueLine, fallbackIncidentDecision, incidentDecisionSchema, incidentOptions, investigateOptions,
  punishOptions, renderIncidentPrompt, validateIncidentDecision,
  type AdvanceFacts, type IncidentClub, type IncidentDecisionContext, type IncidentFacts, type InvestigateFacts,
  type PunishFacts,
} from "./incident-decision";
import { incidentDecisionDue, reactionDelayDays } from "./incidents";
import { generateAiProfile, type AiCoachProfile } from "./profile";

function profile(over: Partial<AiCoachProfile> = {}): AiCoachProfile {
  return { ...generateAiProfile("test-team", null), ambition: 50, thrift: 50, risk: 50, patience: 50, youthFocus: 50, ...over };
}

function club(over: Partial<IncidentClub> = {}): IncidentClub {
  return { teamName: "TJ Netolice", profile: profile(), budget: 80_000, reserve: 20_000, squadSize: 20, matchesNext7Days: 2, ...over };
}

const player = (id: string, over: Partial<InvestigateFacts["suspects"][number]> = {}) => ({
  playerId: id, name: `Hráč ${id}`, position: "MID", age: 25, rating: 40, importance: "rotation" as const, popular: false,
  directClue: false, ...over,
});

function investigate(over: Partial<InvestigateFacts> = {}): InvestigateFacts {
  return {
    stage: "investigate", incidentId: "inc-1", kind: "vloupani_sklad", description: "a break-in", category: "kradez",
    severity: 2, damage: 3000, daysToDeadline: 5, clues: [], suspects: [], accusationsLeft: 2, canAccuse: true,
    policeAvailable: true, policeFailed: false, policeChance: 0.3, ...over,
  };
}

function punish(over: Partial<PunishFacts> = {}, culprit: Partial<PunishFacts["culprit"]> = {}): PunishFacts {
  return {
    stage: "punish", incidentId: "inc-2", kind: "vitrina", description: "trophies stolen", category: "kradez",
    severity: 2, damage: 4000, daysToDeadline: 4,
    culprit: { ...player("c"), weeklyWage: 1000, repeatOffender: false, ...culprit },
    allowed: ["odpustit", "srazka", "pokuta", "vyradit", "vyhodit", "policie", "nechat_byt"],
    deduction: 4000, fine: 2000, lastGoalkeeper: false, canRelease: true, ...over,
  };
}

function advance(over: Partial<AdvanceFacts> = {}): AdvanceFacts {
  return {
    stage: "advance", incidentId: "inc-3", kind: "dluhy", description: "a player is in debt", category: "zivotni",
    severity: 1, damage: 0, daysToDeadline: 6, player: player("d"), advanceMin: 3000, advanceMax: 8000, ...over,
  };
}

function ctx(facts: IncidentFacts, c: IncidentClub = club()): IncidentDecisionContext {
  return { club: c, facts, options: incidentOptions(facts, c) };
}

describe("možnosti AI trenéra u incidentu", () => {
  it("vyšetřování: policie, obvinění podezřelých ze stop a čekání", () => {
    const opts = investigateOptions(investigate({ suspects: [player("a"), player("b")] }));
    expect(opts.map((o) => o.key)).toEqual(["police", "accuse_1", "accuse_2", "wait"]);
    expect(opts[1].action).toEqual({ type: "accuse", playerId: "a" });
    // Bez obvinění a po policii zbývá jen čekat: o tom se nerozhoduje.
    expect(investigateOptions(investigate({ canAccuse: false, policeAvailable: false, suspects: [player("a")] })).map((o) => o.key)).toEqual(["wait"]);
  });

  it("trest: posledního brankáře nevyřadí ani nevyhodí, nepustitelného hráče nevyhodí", () => {
    const all = punishOptions(punish(), club()).map((o) => o.key);
    expect(all).toEqual(["forgive", "deduct", "fine", "ban_1", "ban_2", "ban_3", "sack", "report", "let_go"]);
    const gk = punishOptions(punish({ lastGoalkeeper: true }), club()).map((o) => o.key);
    expect(gk).not.toContain("ban_1");
    expect(gk).not.toContain("sack");
    expect(punishOptions(punish({ canRelease: false }), club()).map((o) => o.key)).not.toContain("sack");
    // Po policii udání nenabídne (pravidla ho vyřadila z povolených trestů).
    const noPolice = punishOptions(punish({ allowed: ["odpustit", "pokuta", "nechat_byt"] }), club()).map((o) => o.key);
    expect(noPolice).toEqual(["forgive", "fine", "let_go"]);
    expect(punishOptions(punish(), club()).find((o) => o.key === "ban_2")?.action).toEqual({ type: "punish", punishment: "vyradit", matches: 2 });
  });

  it("záloha: půjčit, nebo odmítnout", () => {
    expect(advanceOptions(advance()).map((o) => o.action)).toEqual([{ type: "advance", lend: true }, { type: "advance", lend: false }]);
  });

  it("schéma nabízí přesně klíče možností a kontrola pustí jen je", () => {
    const c = ctx(punish());
    const schema = incidentDecisionSchema(c) as { properties: { choice: { enum: string[] } } };
    expect(schema.properties.choice.enum).toEqual(c.options.map((o) => o.key));
    expect(validateIncidentDecision({ choice: "fine", reason: "teach him" }, c)?.option.action).toEqual({ type: "punish", punishment: "pokuta" });
    expect(validateIncidentDecision({ choice: " fine ", reason: 5 }, c)?.reason).toBe("");
    expect(validateIncidentDecision({ choice: "shoot him" }, c)).toBeNull();
    expect(validateIncidentDecision({ choice: 1 }, c)).toBeNull();
    expect(validateIncidentDecision(["fine"], c)).toBeNull();
    expect(validateIncidentDecision(null, c)).toBeNull();
  });

  it("popis pro model je anglicky, s možnostmi a bez skrytého pachatele", () => {
    const facts = investigate({ clues: ["a neighbour narrows it down to Hráč a, Hráč b"], suspects: [player("a"), player("b")] });
    const text = renderIncidentPrompt(ctx(facts));
    expect(text).toContain("CLUES FOUND:\n- a neighbour narrows it down to Hráč a, Hráč b");
    expect(text).toContain("- accuse_2: Accuse Hráč b");
    expect(text).toContain('Return {"choice"');
    expect(text).not.toContain("culprit_player_id");
  });

  it("stopa jednou větou: na koho ukazuje, mezi kým, nebo jen že něco viděla", () => {
    const name = (id: string) => `N${id}`;
    expect(clueLine({ zdroj: "spravce", ukazujeNa: "x", podezreli: null, sila: 2 }, name)).toBe("your groundsman points at Nx");
    expect(clueLine({ zdroj: "soused", ukazujeNa: null, podezreli: ["a", "b"], sila: 1 }, name)).toBe("a neighbour narrows it down to Na, Nb");
    expect(clueLine({ zdroj: "kamera", ukazujeNa: null, podezreli: null, sila: 1 }, name)).toContain("a weak");
    expect(clueLine({ zdroj: "bazar", ukazujeNa: null, podezreli: null, sila: 1 }, name)).toContain("second-hand market");
  });
});

describe("náhradní pravidlo podle povahy", () => {
  it("vyšetřování: přímá stopa → obvinit, jinak policie, po policii odvážný obviní a opatrný počká", () => {
    expect(fallbackIncidentDecision(ctx(investigate({ suspects: [player("a"), player("b", { directClue: true })] }))).key).toBe("accuse_2");
    expect(fallbackIncidentDecision(ctx(investigate({ suspects: [player("a"), player("b")] }))).key).toBe("police");
    const afterPolice = investigate({ policeAvailable: false, policeFailed: true, suspects: [player("a"), player("b")] });
    expect(fallbackIncidentDecision(ctx(afterPolice, club({ profile: profile({ risk: 80 }) }))).key).toBe("accuse_1");
    expect(fallbackIncidentDecision(ctx(afterPolice, club({ profile: profile({ risk: 20 }) }))).key).toBe("wait");
  });

  it("trest: vážný průšvih vyhodí, oporu potrestá penězi, trpělivý drobnost odpustí", () => {
    expect(fallbackIncidentDecision(ctx(punish({ severity: 3 }))).key).toBe("sack");
    expect(fallbackIncidentDecision(ctx(punish({ severity: 3 }, { importance: "key" }))).key).toBe("deduct");
    expect(fallbackIncidentDecision(ctx(punish({}, { popular: true }), club({ profile: profile({ thrift: 20 }) }))).key).toBe("fine");
    expect(fallbackIncidentDecision(ctx(punish({ severity: 1 }), club({ profile: profile({ patience: 80 }) }))).key).toBe("forgive");
    // Hráč bez mzdy: peníze nejdou, vyřadí ho.
    expect(fallbackIncidentDecision(ctx(punish({ deduction: 0, fine: 0 }))).key).toBe("ban_2");
    // Recidivista u druhého průšvihu jde, nejde-li o oporu.
    expect(fallbackIncidentDecision(ctx(punish({ severity: 2 }, { repeatOffender: true }))).key).toBe("sack");
  });

  it("záloha: půjčí, když na ni klub má; škudlil jen oporám; bez peněz odmítne", () => {
    expect(fallbackIncidentDecision(ctx(advance())).key).toBe("lend");
    expect(fallbackIncidentDecision(ctx(advance(), club({ profile: profile({ thrift: 90 }) }))).key).toBe("refuse");
    expect(fallbackIncidentDecision(ctx(advance({ player: player("d", { importance: "key" }) }), club({ profile: profile({ thrift: 90 }) }))).key).toBe("lend");
    expect(fallbackIncidentDecision(ctx(advance(), club({ budget: 25_000 }))).key).toBe("refuse");
  });

  it("náhradní pravidlo vrací vždy nabídnutou možnost", () => {
    for (const facts of [investigate(), punish(), advance(), punish({ allowed: ["nechat_byt", "odpustit"] })]) {
      const c = ctx(facts);
      expect(c.options.map((o) => o.key)).toContain(fallbackIncidentDecision(c).key);
    }
  });
});

describe("kdy trenér rozhodne", () => {
  it("ne hned po vzniku, ale nejpozději den před lhůtou", () => {
    expect(incidentDecisionDue({ today: "2026-11-02", createdDay: "2026-11-02", deadlineDay: "2026-11-09", delayDays: 2 })).toBe(false);
    expect(incidentDecisionDue({ today: "2026-11-04", createdDay: "2026-11-02T16:00:00.000Z", deadlineDay: "2026-11-09", delayDays: 2 })).toBe(true);
    expect(incidentDecisionDue({ today: "2026-11-02", createdDay: "2026-11-02", deadlineDay: "2026-11-09", delayDays: 0 })).toBe(true);
    // Lhůta zítra: hned, i když by si jinak dal na čas.
    expect(incidentDecisionDue({ today: "2026-11-08", createdDay: "2026-11-08", deadlineDay: "2026-11-09T16:00:00.000Z", delayDays: 2 })).toBe(true);
  });

  it("prodleva je pevná pro incident a nejvýš dva dny", () => {
    for (const id of ["inc-a", "inc-b", "inc-c", "inc-d"]) {
      expect(reactionDelayDays(id)).toBe(reactionDelayDays(id));
      expect(reactionDelayDays(id)).toBeGreaterThanOrEqual(0);
      expect(reactionDelayDays(id)).toBeLessThanOrEqual(2);
    }
  });
});
