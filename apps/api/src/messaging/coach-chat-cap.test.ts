/**
 * Které vlákno se uzavírá jako rozhovor od trenéra (malý dopad, strop jednou denně).
 * Vlákno „slyšel jsem…“ si trenér umí vyrobit sám (napíše o hráči jinému), proto nesmí dát
 * velký kladný výsledek za omluvu (závěrečná kontrola Kabina má uši, 2026-11-21).
 */
import { describe, expect, it } from "vitest";
import { closesLikeCoachChat, resolutionMoraleDelta } from "./ai-player-spawn";

describe("strop výsledku vlákna", () => {
  it("rozhovor od trenéra a zpráva jen tak", () => {
    expect(closesLikeCoachChat("coach_initiated", {})).toBe(true);
    expect(closesLikeCoachChat("casual_drop_by", {})).toBe(true);
  });

  it("vlákno slyšel jsem jde přes strop, i když je to stížnost", () => {
    expect(closesLikeCoachChat("heard_criticism", { hearsay_id: "h1" })).toBe(true);
    expect(closesLikeCoachChat("transfer_reaction_bad", { hearsay_id: "h2" })).toBe(true);
  });

  it("obyčejná stížnost hráče jede jako dřív", () => {
    expect(closesLikeCoachChat("team_chemistry", {})).toBe(false);
  });
});

describe("nálada z výsledku vlákna", () => {
  it("vlákno slyšel jsem: kladná nálada nejvýš jako rozhovor od trenéra, záporná beze změny", () => {
    expect(resolutionMoraleDelta({ hearsay_id: "h1" }, 12)).toBe(3);
    expect(resolutionMoraleDelta({ hearsay_id: "h1" }, -9)).toBe(-9);
  });

  it("ostatní vlákna jako dřív", () => {
    expect(resolutionMoraleDelta({}, 12)).toBe(12);
  });
});
