import { describe, expect, it } from "vitest";
import { buildBodyOverview, type OverviewPlayerInput } from "./body-overview";

const base: Omit<OverviewPlayerInput, "id" | "name" | "physical"> = {
  position: "MID", rating: 40, trend30d: null, injured: false, pubVisits28d: 0, planUntil: null, planKind: null, pledgeUntil: null,
};
const p = (id: string, physical: Record<string, unknown>, extra: Partial<OverviewPlayerInput> = {}): OverviewPlayerInput =>
  ({ ...base, id, name: `Hráč ${id}`, physical, ...extra });

describe("buildBodyOverview", () => {
  const players = [
    p("fit", { height: 180, weight: 76 }, { rating: 50 }),
    p("over", { height: 180, weight: 86 }, { trend30d: 2, pubVisits28d: 9 }),
    p("obese", { height: 180, weight: 96 }, { injured: true, trend30d: 1 }),
    p("thin", { height: 190, weight: 70 }),
    p("gainer", { height: 180, weight: 79 }, { trend30d: 1.8 }),
  ];
  const o = buildBodyOverview(players, null);

  it("souhrn: počty podle kategorie, průměr nad ideálem a trend", () => {
    expect(o.summary.counts).toEqual({ under: 1, ideal: 2, muscular: 0, over: 1, obese: 1 });
    expect(o.summary.avgTrend30d).toBeCloseTo(1.6, 1);
    expect(o.summary.avgExcess).not.toBeNull();
  });

  it("pořadí: velká nadváha, nadváha, podváha, přibírající, pak ostatní", () => {
    expect(o.players.map((x) => x.id)).toEqual(["obese", "over", "thin", "gainer", "fit"]);
    expect(o.players.filter((x) => x.problem).map((x) => x.id)).toEqual(["obese", "over", "thin", "gainer"]);
  });

  it("příčina přibírání: zranění, hospoda, nebo nechodí", () => {
    const cause = Object.fromEntries(o.players.map((x) => [x.id, x.cause]));
    expect(cause).toMatchObject({ obese: "injury", over: "pub", gainer: "idle", fit: null, thin: null });
  });

  it("příčina jen u hráče, který přibírá: nadváha bez trendu nebo s hubnutím příčinu nemá", () => {
    const o2 = buildBodyOverview([
      p("heavyNoTrend", { height: 180, weight: 92 }),
      p("heavyLosing", { height: 180, weight: 92 }, { trend30d: -1.2, pubVisits28d: 9 }),
      p("heavyGaining", { height: 180, weight: 92 }, { trend30d: 0.6 }),
    ], null);
    const cause = Object.fromEntries(o2.players.map((x) => [x.id, x.cause]));
    expect(cause).toEqual({ heavyNoTrend: null, heavyLosing: null, heavyGaining: "idle" });
  });

  it("postih jedenáctky: bez sestavy 11 nejlepších podle hodnocení", () => {
    expect(o.summary.lineupSource).toBe("best11");
    expect(o.summary.lineupPenalty.speed).toBe(o.players.reduce((s, x) => s + x.effects.speed, 0));
  });

  it("se sestavou jen hráči v základu", () => {
    const withLineup = buildBodyOverview(players, new Set(["fit", "obese"]));
    expect(withLineup.summary.lineupSource).toBe("lineup");
    expect(withLineup.summary.lineupPenalty.speed).toBe(o.players.find((x) => x.id === "obese")!.effects.speed);
  });

  it("u plánu přehled ví, jestli hráč hubne, nebo nabírá", () => {
    const o2 = buildBodyOverview([
      p("loser", { height: 180, weight: 92 }, { planUntil: "2026-11-05", planKind: "loss" }),
      p("gainer", { height: 190, weight: 70 }, { planUntil: "2026-10-22", planKind: "gain" }),
    ], null);
    const kind = Object.fromEntries(o2.players.map((x) => [x.id, x.planKind]));
    expect(kind).toEqual({ loser: "loss", gainer: "gain" });
  });
});
