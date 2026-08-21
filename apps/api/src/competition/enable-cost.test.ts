import { describe, expect, it } from "vitest";
import { enableCost, matchCount, projectSeasonCost } from "./projection";
import { DEFAULT_RULES, SUBSIDY_CUSHION, type CompetitionRules } from "./defaults";

const RULES = DEFAULT_RULES as unknown as CompetitionRules;

describe("cena za zapnutí samosprávy", () => {
  it("na začátku sezóny se vybírá plné startovné a platí běžná dotace", () => {
    const out = enableCost(14, "okresni_prebor", 0);
    expect(out.midSeason).toBe(false);
    expect(out.entryFee).toBe(15_000);
    expect(out.subsidy).toBe(822_161);
    expect(out.remaining).toBe(1);
  });

  it("uprostřed sezóny nestojí kluby ani korunu", () => {
    // 14 týmů = 182 zápasů, půlka odehraná.
    const out = enableCost(14, "okresni_prebor", 91);
    expect(out.midSeason).toBe(true);
    expect(out.entryFee).toBe(0);
    expect(out.remaining).toBeCloseTo(0.5, 5);
  });

  it("dotace uprostřed sezóny pokryje celé odměny za umístění a zbytek zápasů", () => {
    const played = 91;
    const out = enableCost(14, "okresni_prebor", played);
    const plny = projectSeasonCost(RULES, 14, "okresni_prebor");
    const zbyva = (matchCount(14) - played) / matchCount(14);
    const ocekavano = Math.round(
      SUBSIDY_CUSHION * (plny.placement + Math.round((plny.bonus + plny.referees) * zbyva)),
    );
    expect(out.subsidy).toBe(ocekavano);
    // Musí stačit i na to nejdražší, co soutěž čeká — odměny za umístění.
    expect(out.subsidy).toBeGreaterThan(plny.placement);
  });

  it("čím později se zapne, tím menší dotace — ale nikdy pod odměny za umístění", () => {
    const plny = projectSeasonCost(RULES, 14, "okresni_prebor");
    const brzy = enableCost(14, "okresni_prebor", 20).subsidy;
    const pozde = enableCost(14, "okresni_prebor", 170).subsidy;
    expect(brzy).toBeGreaterThan(pozde);
    expect(pozde).toBeGreaterThanOrEqual(plny.placement);
  });

  it("zapnutí po posledním kole pořád pokryje odměny za umístění", () => {
    const out = enableCost(14, "okresni_prebor", matchCount(14));
    expect(out.remaining).toBe(0);
    expect(out.entryFee).toBe(0);
    expect(out.subsidy).toBeGreaterThanOrEqual(projectSeasonCost(RULES, 14, "okresni_prebor").placement);
  });

  it("prázdná soutěž nespadne na dělení nulou", () => {
    const out = enableCost(0, "okresni_prebor", 0);
    expect(Number.isFinite(out.subsidy)).toBe(true);
  });
});
