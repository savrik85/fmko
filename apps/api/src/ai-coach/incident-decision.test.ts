import { describe, expect, it } from "vitest";
import {
  advanceOptions, clueLine, fallbackIncidentDecision, incidentDecisionSchema, incidentOptions, investigateOptions,
  punishOptions, renderIncidentPrompt, stolenItemText, threatOptions, trustWord, validateIncidentDecision,
  type AdvanceFacts, type AskCandidate, type IncidentClub, type IncidentDecisionContext, type IncidentFacts,
  type InvestigateFacts, type PunishFacts, type ThreatFacts,
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
    policeAvailable: true, policeFailed: false, policeChance: 0.3, policeInvestigating: false, policeResultInDays: null,
    askCandidates: [], askedNames: [], listing: null, ...over,
  };
}

function candidate(id: string, over: Partial<AskCandidate> = {}): AskCandidate {
  return { ...player(id), reason: "suspect", linkedTo: null, trust: "neutral", ...over };
}

function threat(over: Partial<ThreatFacts> = {}): ThreatFacts {
  return {
    stage: "threat", incidentId: "inc-4", kind: "vloupani_sklad", description: "a break-in", category: "kradez",
    severity: 1, damage: 0, daysToDeadline: 2, player: { ...player("t"), trust: "good" },
    threat: "break into the equipment store and help himself", ...over,
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

  it("vyšetřování: nahlásit poznaný inzerát a zeptat se hráčů, kteří připadají v úvahu", () => {
    const facts = investigate({
      suspects: [player("a")],
      askCandidates: [candidate("a"), candidate("r", { reason: "rival", linkedTo: "Hráč a" })],
      listing: { listingId: "bazar-1", item: stolenItemText("jerseys"), startsPolice: true },
    });
    const opts = investigateOptions(facts);
    expect(opts.map((o) => o.key)).toEqual(["police", "report_listing", "accuse_1", "ask_1", "ask_2", "wait"]);
    expect(opts[1].action).toEqual({ type: "report_listing", listingId: "bazar-1" });
    expect(opts[1].text).toContain("the police take over the case");
    expect(opts[1].text).toContain("club jerseys");
    expect(opts[3].action).toEqual({ type: "ask", playerId: "a" });
    expect(opts[4].text).toContain("does not get on with suspect Hráč a");
    // Inzerát, který policie už šetří: jen se zajistí.
    const secured = investigateOptions(investigate({ listing: { listingId: "bazar-1", item: "trophies", startsPolice: false } }));
    expect(secured.find((o) => o.key === "report_listing")?.text).toContain("become part of the police investigation");
  });

  it("když šetří policie: obvinit ani volat nejde, ptát se a čekat na výsledek ano", () => {
    const facts = investigate({
      canAccuse: false, policeAvailable: false, policeInvestigating: true, policeResultInDays: 3, daysToDeadline: null,
      suspects: [player("a")], askCandidates: [candidate("a")], askedNames: ["Hráč b"],
    });
    const opts = investigateOptions(facts);
    expect(opts.map((o) => o.key)).toEqual(["ask_1", "wait"]);
    expect(opts[1].text).toBe("Do nothing and wait for the police result (in 3 days).");
    const text = renderIncidentPrompt(ctx(facts));
    expect(text).toContain("The police are investigating the case and report back in 3 days.");
    expect(text).toContain("ALREADY ASKED: Hráč b");
    expect(text).not.toContain("Accusations left");
    expect(text).not.toContain("left to decide");
  });

  it("řeči z hospody: promluvit si s ním, nebo to nechat být", () => {
    const opts = threatOptions(threat());
    expect(opts.map((o) => o.action)).toEqual([{ type: "talk" }, { type: "wait" }]);
    expect(opts[0].text).toContain("his relationship with you is good");
    const text = renderIncidentPrompt(ctx(threat()));
    expect(text).toContain("SITUATION: in the pub, Hráč t (MID, age 25, rating 40, a rotation player) said while drunk that he would break into the equipment store");
    expect(text).toContain("You have 2 days left to decide.");
    expect(text).not.toContain("INCIDENT:");
  });

  it("vztah k trenérovi slovy", () => {
    expect([trustWord(80), trustWord(65), trustWord(50), trustWord(35), trustWord(10)]).toEqual(["good", "good", "neutral", "poor", "poor"]);
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

  it("vyšetřování: inzerát nahlásí dřív než policii, a než někoho obviní naslepo, zeptá se", () => {
    const listing = { listingId: "bazar-1", item: "club jerseys", startsPolice: true };
    expect(fallbackIncidentDecision(ctx(investigate({ suspects: [player("a")], listing }))).key).toBe("report_listing");
    // Přímá stopa pořád vyhrává: obvinění s ní pachatele usvědčí.
    expect(fallbackIncidentDecision(ctx(investigate({ suspects: [player("a", { directClue: true })], listing }))).key).toBe("accuse_1");
    const asking = investigate({ policeAvailable: false, policeFailed: true, suspects: [player("a")], askCandidates: [candidate("a")] });
    expect(fallbackIncidentDecision(ctx(asking, club({ profile: profile({ risk: 90 }) }))).key).toBe("ask_1");
    expect(fallbackIncidentDecision(ctx(asking, club({ profile: profile({ risk: 10 }) }))).key).toBe("ask_1");
    // Poslední den před lhůtou odvážný trenér obviní, opatrný se pořád ptá.
    const lastDay = { ...asking, daysToDeadline: 1 };
    expect(fallbackIncidentDecision(ctx(lastDay, club({ profile: profile({ risk: 90 }) }))).key).toBe("accuse_1");
    expect(fallbackIncidentDecision(ctx(lastDay, club({ profile: profile({ risk: 10 }) }))).key).toBe("ask_1");
    // Když šetří policie a jde jen se ptát.
    const duringPolice = investigate({ canAccuse: false, policeAvailable: false, policeInvestigating: true, askCandidates: [candidate("x", { reason: "trusted" })] });
    expect(fallbackIncidentDecision(ctx(duringPolice)).key).toBe("ask_1");
  });

  it("řeči z hospody: promluví si s ním", () => {
    expect(fallbackIncidentDecision(ctx(threat())).key).toBe("talk");
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
    const listing = { listingId: "bazar-1", item: "trophies", startsPolice: false };
    for (const facts of [
      investigate(), punish(), advance(), punish({ allowed: ["nechat_byt", "odpustit"] }), threat(),
      investigate({ canAccuse: false, policeAvailable: false, policeInvestigating: true, listing }),
      investigate({ policeAvailable: false, askCandidates: [candidate("q", { reason: "friend", linkedTo: "X" })] }),
    ]) {
      const c = ctx(facts);
      expect(c.options.map((o) => o.key)).toContain(fallbackIncidentDecision(c).key);
      // Schéma pro model nikdy nemá prázdný výčet.
      expect((incidentDecisionSchema(c) as { properties: { choice: { enum: string[] } } }).properties.choice.enum.length).toBeGreaterThan(0);
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
