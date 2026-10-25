import { describe, expect, it } from "vitest";
import { generateAiProfile, type AiCoachProfile } from "./profile";
import {
  fallbackSeasonDuels, hasRealChoice, leavingPlayerIds, renderSeasonDuelsPrompt, seasonDuelsSchema, validateSeasonDuels,
  type DuelFacts, type DuelPlayerFacts, type SeasonDuelsContext,
} from "./season-duels-decision";

function profile(over: Partial<AiCoachProfile> = {}): AiCoachProfile {
  return { ...generateAiProfile("test-team", null), youthFocus: 50, ...over };
}

function p(id: string, over: Partial<DuelPlayerFacts> = {}): DuelPlayerFacts {
  return { playerId: id, name: `Hráč ${id}`, position: "MID", age: 30, rating: 40, importance: "rotation", samePosition: 4, gone: false, ...over };
}

function ctx(duels: DuelFacts[], over: Partial<SeasonDuelsContext> = {}): SeasonDuelsContext {
  return { teamName: "TJ Netolice", profile: profile(), squadSize: 18, goalkeepers: 2, duels, ...over };
}

describe("souboje kdo zůstane: model a kontrola", () => {
  it("schéma: každý souboj A nebo B, daný souboj jen dovolenou stranu", () => {
    const c = ctx([{ a: p("a1"), b: p("b1"), mustKeep: null }, { a: p("a2", { position: "GK" }), b: p("b2"), mustKeep: "A" }]);
    const schema = seasonDuelsSchema(c) as { properties: Record<string, { enum?: string[] }>; required: string[] };
    expect(schema.properties.duel_1.enum).toEqual(["A", "B"]);
    expect(schema.properties.duel_2.enum).toEqual(["A"]);
    expect(schema.required).toEqual(["duel_1", "duel_2", "reason"]);
    expect(hasRealChoice(c)).toBe(true);
    expect(hasRealChoice(ctx([{ a: p("a"), b: p("b"), mustKeep: "B" }]))).toBe(false);
  });

  it("kontrola: jen dovolená strana a áčko nepřijde o všechny brankáře", () => {
    const c = ctx([{ a: p("a1"), b: p("b1"), mustKeep: null }, { a: p("a2"), b: p("b2"), mustKeep: "B" }]);
    expect(validateSeasonDuels({ duel_1: "a", duel_2: "B", reason: "keep the young one" }, c)).toEqual({ keep: ["A", "B"], reason: "keep the young one" });
    expect(validateSeasonDuels({ duel_1: "A", duel_2: "A" }, c)).toBeNull();
    expect(validateSeasonDuels({ duel_1: "C", duel_2: "B" }, c)).toBeNull();
    expect(validateSeasonDuels({ duel_1: "A" }, c)).toBeNull();
    expect(validateSeasonDuels("A", c)).toBeNull();
    // Dva brankáři ve dvou soubojích: oba odejít nesmí.
    const keepers = ctx([
      { a: p("g1", { position: "GK" }), b: p("x1"), mustKeep: null },
      { a: p("x2"), b: p("g2", { position: "GK" }), mustKeep: null },
    ]);
    expect(validateSeasonDuels({ duel_1: "B", duel_2: "A", reason: "" }, keepers)).toBeNull();
    expect(validateSeasonDuels({ duel_1: "A", duel_2: "A", reason: "" }, keepers)?.keep).toEqual(["A", "A"]);
  });

  it("popis pro model ukazuje dvojice, posty a povinné ponechání", () => {
    const text = renderSeasonDuelsPrompt(ctx([
      { a: p("a1", { name: "Pepa Kos" }), b: p("b1", { name: "Jan Vrba", age: 19 }), mustKeep: null },
      { a: p("a2", { name: "Brankář", position: "GK" }), b: p("b2"), mustKeep: "A" },
    ]));
    expect(text).toContain("duel_1:\n- A: Pepa Kos (MID, age 30, rating 40, a rotation player, 4 other players in his position)");
    expect(text).toContain("- B: Jan Vrba (MID, age 19");
    expect(text).toContain("A must stay: he is your last goalkeeper.");
    expect(text).toContain('"duel_2": "A" or "B"');
  });
});

describe("souboje kdo zůstane: náhradní pravidlo podle povahy", () => {
  it("zůstane lepší hráč; mládežník dá přednost mladšímu při podobném hodnocení", () => {
    const duel: DuelFacts = { a: p("old", { age: 33, rating: 42 }), b: p("young", { age: 18, rating: 40 }), mustKeep: null };
    expect(fallbackSeasonDuels(ctx([duel])).keep).toEqual(["A"]);
    expect(fallbackSeasonDuels(ctx([duel], { profile: profile({ youthFocus: 95 }) })).keep).toEqual(["B"]);
    expect(leavingPlayerIds(ctx([duel]), { keep: ["A"], reason: "" })).toEqual(["young"]);
  });

  it("poslední brankář zůstane vždy, i když ho souboje berou jeden po druhém", () => {
    const forced: DuelFacts = { a: p("gk", { position: "GK", rating: 20 }), b: p("star", { rating: 60 }), mustKeep: "A" };
    expect(fallbackSeasonDuels(ctx([forced], { goalkeepers: 1 })).keep).toEqual(["A"]);
    const twoKeepers = ctx([
      { a: p("g1", { position: "GK", rating: 20 }), b: p("x1", { rating: 50 }), mustKeep: null },
      { a: p("x2", { rating: 50 }), b: p("g2", { position: "GK", rating: 20 }), mustKeep: null },
    ]);
    // První brankář odejít smí (zůstane druhý), druhý už ne.
    expect(fallbackSeasonDuels(twoKeepers).keep).toEqual(["B", "B"]);
  });

  it("hráč, který už v klubu není, prohraje vždy", () => {
    const duel: DuelFacts = { a: p("left", { rating: 70, gone: true }), b: p("here", { rating: 20 }), mustKeep: "B" };
    expect(fallbackSeasonDuels(ctx([duel])).keep).toEqual(["B"]);
  });
});
