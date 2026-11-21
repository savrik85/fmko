/**
 * Obálka pro sudího, čisté funkce: úplatnost z archetypu, kdy sudí obálku nabídne, komu,
 * kolik, texty SMS, rozpoznání odpovědi trenéra a rozhodnutí AI klubu.
 */
import { describe, expect, it } from "vitest";
import { REFEREE_ARCHETYPES, REFEREE_POOL_EXTRA, REFEREE_POOL_MIX } from "../engine/referee";
import { generateRefereePool } from "./referee-generator";
import {
  bribeFine, checkEnvelopeDecision, defaultCorruptibility, effectiveCorruptibility, envelopeAmount, envelopeSmsText,
  ENVELOPE_CORRUPTIBILITY_THRESHOLD, fallbackEnvelopeDecision, pickEnvelopeTarget, renderEnvelopePrompt,
  shouldOfferEnvelope, sieveEnvelopeReply, type EnvelopeDecisionContext,
} from "./envelope";
import { FINE_MAX } from "../competition/discipline";

const profile = { version: 1 as const, ambition: 50, thrift: 50, youthFocus: 50, risk: 50, trading: 50, building: 50, patience: 50, favouriteTactic: "balanced" as const, favouriteFormations: ["4-4-2" as const] };

describe("úplatnost sudího", () => {
  it("pool rozhodčích zůstává beze změny (žádný nový archetyp)", () => {
    expect(REFEREE_POOL_MIX).toHaveLength(15);
    expect(REFEREE_POOL_EXTRA).toHaveLength(9);
    expect(Object.keys(REFEREE_ARCHETYPES)).not.toContain("uplatny");
  });

  it("je deterministická podle archetypu a id a drží se v 0 až 100", () => {
    for (const key of Object.keys(REFEREE_ARCHETYPES)) {
      for (let i = 0; i < 30; i++) {
        const v = defaultCorruptibility(key, `ref-${i}`);
        expect(v).toBe(defaultCorruptibility(key, `ref-${i}`));
        expect(v).toBeGreaterThanOrEqual(0);
        expect(v).toBeLessThanOrEqual(100);
      }
    }
  });

  it("bafuňář a ambiciózní jsou úplatnější než puntičkář a veterán", () => {
    const avg = (key: string) => {
      let s = 0;
      for (let i = 0; i < 200; i++) s += defaultCorruptibility(key, `ref-${i}-x`);
      return s / 200;
    };
    expect(avg("bafunar")).toBeGreaterThan(avg("klidny_veteran") + 30);
    expect(avg("ambiciozni")).toBeGreaterThan(avg("puntickar") + 30);
    expect(avg("bafunar")).toBeGreaterThan(ENVELOPE_CORRUPTIBILITY_THRESHOLD);
  });

  it("uložená hodnota má přednost před odvozenou", () => {
    expect(effectiveCorruptibility({ id: "ref-1", archetype: "bafunar", corruptibility: 5 })).toBe(5);
    expect(effectiveCorruptibility({ id: "ref-1", archetype: "bafunar", corruptibility: null }))
      .toBe(defaultCorruptibility("bafunar", "ref-1"));
  });

  it("v běžném okrese je úplatných sudích jen pár", () => {
    const pool = generateRefereePool("Prachatice", { "Novák": 10, "Svoboda": 8, "Dvořák": 6, "Černý": 5, "Procházka": 4 });
    const corrupt = pool.filter((r) => effectiveCorruptibility({ id: r.id, archetype: r.archetype }) >= ENVELOPE_CORRUPTIBILITY_THRESHOLD);
    expect(corrupt.length).toBeGreaterThan(0);
    expect(corrupt.length).toBeLessThanOrEqual(6);
  });
});

describe("kdy a komu sudí obálku nabídne", () => {
  it("jen na derby a jen úplatný sudí", () => {
    const offered = (c: number, heat: number) =>
      Array.from({ length: 200 }, (_, i) => shouldOfferEnvelope(`m-${i}`, c, heat)).filter(Boolean).length;
    expect(offered(90, 10)).toBe(0);
    expect(offered(ENVELOPE_CORRUPTIBILITY_THRESHOLD - 1, 90)).toBe(0);
    expect(offered(90, 70)).toBeGreaterThan(60);
    expect(offered(90, 70)).toBe(offered(90, 70));
  });

  it("částka je v tisícovkách až pětistovkách a stejná pro stejný zápas", () => {
    for (let i = 0; i < 50; i++) {
      const a = envelopeAmount(`m-${i}`, 75);
      expect(a % 500).toBe(0);
      expect(a).toBeGreaterThanOrEqual(3000);
      expect(a).toBeLessThanOrEqual(8000);
      expect(envelopeAmount(`m-${i}`, 75)).toBe(a);
    }
  });

  it("cíl je jeden z klubů zápasu, člověk má přednost", () => {
    let human = 0;
    for (let i = 0; i < 300; i++) {
      const t = pickEnvelopeTarget(`m-${i}`, { id: "h", human: false }, { id: "a", human: true });
      expect(["h", "a"]).toContain(t);
      if (t === "a") human++;
    }
    expect(human).toBeGreaterThan(150);
  });

  it("pokuta za úplatek je aspoň 5 000 Kč a nejvýš strop sazebníku", () => {
    expect(bribeFine(3000)).toBe(6000);
    expect(bribeFine(1000)).toBe(5000);
    expect(bribeFine(20000)).toBe(FINE_MAX);
  });
});

describe("SMS od sudího", () => {
  it("je nejasná, ale s částkou a soupeřem, bez dlouhé pomlčky", () => {
    for (let i = 0; i < 12; i++) {
      const text = envelopeSmsText({
        matchId: `m-${i}`, refereeName: "Josef Novák", refereeGender: i % 2 ? "f" : "m",
        opponentName: "Sokol Lhenice", kickoff: "2026-11-22T17:00:00.000Z", amount: 5000,
      });
      expect(text).toContain("5 000 Kč");
      expect(text).toContain("Sokol Lhenice");
      expect(text).not.toMatch(/[\u2014\u2013]/);
      expect(text).not.toMatch(/úplat/i);
    }
  });
});

describe("rozpoznání odpovědi trenéra (síto bez modelu)", () => {
  it.each([
    ["Dobře, zaplatím. Ať je to v neděli v klidu.", "pay"],
    ["jo beru, obálku dostanete před zápasem", "pay"],
    ["Platí, domluveno", "pay"],
    ["Ne. Ani korunu, a příště si to rozmyslete.", "ignore"],
    ["nevim o cem mluvite, uvidime se na hristi", "ignore"],
    ["Žádnou obálku nedostanete, vy zm*de", "ignore"],
    ["Tohle jde rovnou komisaři rozhodčích", "report"],
    ["ne, nahlásím vás na svaz, šmejde", "report"],
    ["Okamzite to posilam na komisi", "report"],
    ["Hmm, uvidíme", "unclear"],
  ])("%s → %s", (text, expected) => {
    expect(sieveEnvelopeReply(text)).toBe(expected);
  });

  it("protichůdná odpověď nechá rozhodnout model", () => {
    expect(sieveEnvelopeReply("Jasně že ne")).toBeNull();
    expect(sieveEnvelopeReply("ok, ale nahlásím to")).toBeNull();
  });
});

describe("rozhodnutí AI klubu", () => {
  const ctx = (over: Partial<EnvelopeDecisionContext> = {}): EnvelopeDecisionContext => ({
    teamName: "TJ Volary", profile, budget: 80_000, reserve: 20_000, amount: 5000,
    opponentName: "Sokol Lhenice", refereeName: "Josef Novák", ...over,
  });

  it("prompt nese povahu, peníze i volby", () => {
    const p = renderEnvelopePrompt(ctx());
    expect(p).toContain("5,000 CZK");
    expect(p).toContain('"pay"');
    expect(p).toContain('"report"');
  });

  it("bez peněz nad rezervou model zaplatit nesmí", () => {
    expect(checkEnvelopeDecision({ choice: "pay", reason: "x" }, ctx()).ok).toBe(true);
    expect(checkEnvelopeDecision({ choice: "pay", reason: "x" }, ctx({ budget: 22_000 })).ok).toBe(false);
    expect(checkEnvelopeDecision({ choice: "bribe" }, ctx()).ok).toBe(false);
    expect(checkEnvelopeDecision({ choice: "REPORT", reason: "x" }, ctx())).toMatchObject({ ok: true, choice: "report" });
  });

  it("pravidlo podle povahy: odvážný ambiciózní zaplatí, opatrný nahlásí, ostatní ignorují", () => {
    expect(fallbackEnvelopeDecision(ctx({ profile: { ...profile, risk: 80, ambition: 75 } }))).toBe("pay");
    expect(fallbackEnvelopeDecision(ctx({ profile: { ...profile, risk: 80, ambition: 75 }, budget: 21_000 }))).toBe("ignore");
    expect(fallbackEnvelopeDecision(ctx({ profile: { ...profile, risk: 20 } }))).toBe("report");
    expect(fallbackEnvelopeDecision(ctx())).toBe("ignore");
  });
});
