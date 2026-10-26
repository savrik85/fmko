import { describe, expect, it } from "vitest";
import { generateAiProfile, type AiCoachProfile } from "./profile";
import {
  fallbackUnrestChoice, renderUnrestPrompt, resolveUnrestDecisions, unrestDecisionSchema, validateUnrestDecision,
  type UnrestCandidate, type UnrestDecisionContext,
} from "./unrest-decision";

const profile = (over: Partial<AiCoachProfile> = {}): AiCoachProfile => ({ ...generateAiProfile("t", null), ...over });

const player = (over: Partial<UnrestCandidate> = {}): UnrestCandidate => ({
  key: "P1", playerId: "p1", name: "Jan Novák", age: 24, position: "MID", rating: 45, importance: "key",
  inU21: false, onLoanElsewhere: false, weeklyWage: 200, level: 60, reasons: ["money"],
  offer: { club: "SV Grafenau", amount: 40_000 }, dealsDone: [],
  options: [{ id: "bonus", cost: 6_000, weeklyCost: 0 }, { id: "raise_wage", cost: 0, weeklyCost: 60 }],
  ...over,
});

const ctx = (players: UnrestCandidate[], p: AiCoachProfile = profile()): UnrestDecisionContext => ({
  teamName: "TJ Netolice", profile: p, budget: 60_000, reserve: 10_000, spendable: 50_000, top11Average: 44, players,
});

describe("nespokojení hráči AI klubu: kontrola odpovědi modelu", () => {
  it("platí jen dohoda z nabídky hráče nebo čekání, zbytek rozhodne náhradní pravidlo", () => {
    const c = ctx([player(), player({ key: "P2", playerId: "p2", options: [{ id: "tough_love", cost: 0, weeklyCost: 0 }] })]);
    const v = validateUnrestDecision({ decisions: [
      { player: "P1", action: "bonus", reason: "keep him" },
      { player: "P2", action: "captaincy", reason: "x" },
    ], reasoning: "" }, c);
    expect(v?.chosen.get("P1")?.action).toBe("bonus");
    expect(v?.chosen.has("P2")).toBe(false);
    expect(v?.rejected.some((r) => r.startsWith("P2:"))).toBe(true);
    const resolved = resolveUnrestDecisions(c, v);
    expect(resolved.map((d) => d.decidedBy)).toEqual(["model", "fallback"]);
    expect(validateUnrestDecision("nonsense", c)).toBeNull();
    expect(resolveUnrestDecisions(c, null).every((d) => d.decidedBy === "fallback")).toBe(true);
  });

  it("schéma má vždy neprázdné výčty a prompt bez UUID hráče", () => {
    const c = ctx([player()]);
    const schema = JSON.stringify(unrestDecisionSchema(c));
    expect(schema).toContain('"wait"');
    expect(schema).toContain('"P1"');
    expect(renderUnrestPrompt(c)).not.toContain("p1,");
  });
});

describe("náhradní pravidlo podle povahy", () => {
  it("skoro klidného nechá být, opoře nešetrný trenér zvedne plat, skrblík nedá nic", () => {
    expect(fallbackUnrestChoice(player({ level: 10 }), profile())).toBe("wait");
    expect(fallbackUnrestChoice(player(), profile({ thrift: 30 }))).toBe("raise_wage");
    expect(fallbackUnrestChoice(player(), profile({ thrift: 90 }))).toBe("wait");
  });

  it("obchodník pustí hráče, bez kterého se obejde; přebytečnému šetrný trenér neplatí", () => {
    const release = { id: "release" as const, cost: 0, weeklyCost: 0, sale: { club: "SV Grafenau", amount: 40_000 } };
    expect(fallbackUnrestChoice(player({ importance: "rotation", options: [...player().options, release] }), profile({ trading: 70 }))).toBe("release");
    expect(fallbackUnrestChoice(player({ importance: "key", options: [release] }), profile({ trading: 90 }))).toBe("wait");
    expect(fallbackUnrestChoice(player({ importance: "surplus" }), profile({ thrift: 20, trading: 10 }))).toBe("wait");
  });

  it("když „pustit ho“ nejde, obchodník slíbí prodej hráči, bez kterého se obejde; opoře ne", () => {
    const promise = { id: "promise_transfer" as const, cost: 0, weeklyCost: 0, promise: { marketValue: 20_000, minPrice: 12_000 } };
    const wantsOut = { reasons: ["better_club" as const], options: [promise] };
    expect(fallbackUnrestChoice(player({ ...wantsOut, importance: "rotation" }), profile({ trading: 70 }))).toBe("promise_transfer");
    expect(fallbackUnrestChoice(player({ ...wantsOut, importance: "surplus" }), profile({ trading: 40 }))).toBe("promise_transfer");
    expect(fallbackUnrestChoice(player({ ...wantsOut, importance: "key" }), profile({ trading: 90 }))).toBe("wait");
    expect(fallbackUnrestChoice(player({ ...wantsOut, importance: "rotation" }), profile({ trading: 20 }))).toBe("wait");
  });
});

describe("slib prodeje v popisu pro model", () => {
  it("model ví, že hráč půjde na trh a slušná nabídka od 60 % tržní hodnoty se přijme", () => {
    const promise = { id: "promise_transfer" as const, cost: 0, weeklyCost: 0, promise: { marketValue: 20_000, minPrice: 12_000 } };
    const prompt = renderUnrestPrompt(ctx([player({ reasons: ["better_club"], options: [promise] })]));
    expect(prompt).toContain('"promise_transfer": promise to sell him at the next decent offer within 30 days');
    expect(prompt).toContain("you accept the first transfer offer of at least 12,000 CZK (his market value is 20,000 CZK)");
  });
});
