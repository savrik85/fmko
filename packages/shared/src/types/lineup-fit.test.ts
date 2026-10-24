import { describe, it, expect } from "vitest";
import { splitPlanByLineup, benchForLineup, type LineupIds } from "./lineup-fit";
import type { MatchPlanRule } from "./match-plan";

const lineup: LineupIds = {
  starterIds: new Set(["s1", "s2", "s3"]),
  squadIds: new Set(["s1", "s2", "s3", "b1", "b2"]),
};

const sub = (id: string, outPlayerId: string, inPlayerId: string): MatchPlanRule => ({
  id, fromMinute: 60, trigger: { kind: "minute" }, action: { kind: "sub", outPlayerId, inPlayerId },
});

describe("pokyny srovnané na sestavu", () => {
  it("střídání ze základu za hráče z kádru zůstane", () => {
    const { kept, dropped } = splitPlanByLineup([sub("r1", "s1", "b1")], lineup);
    expect(kept.map((r) => r.id)).toEqual(["r1"]);
    expect(dropped).toEqual([]);
  });

  it("pokyny na taktiku a tvrdost se sestavy netýkají", () => {
    const plan: MatchPlanRule[] = [
      { id: "t", fromMinute: 70, trigger: { kind: "score", state: "losing" }, action: { kind: "tactic", tactic: "offensive" } },
      { id: "h", fromMinute: 80, trigger: { kind: "minute" }, action: { kind: "hardness", hardness: "hard" } },
    ];
    expect(splitPlanByLineup(plan, lineup).kept).toEqual(plan);
  });

  it("zruší střídání hráče, který nehraje od začátku (automat ho nahradil za omluveného)", () => {
    const { kept, dropped } = splitPlanByLineup([sub("r1", "b2", "b1")], lineup);
    expect(kept).toEqual([]);
    expect(dropped).toEqual([{ rule: sub("r1", "b2", "b1"), reason: "out_not_starting" }]);
  });

  it("zruší střídání za hráče, který už hraje od začátku", () => {
    const { dropped } = splitPlanByLineup([sub("r1", "s1", "s2")], lineup);
    expect(dropped.map((d) => d.reason)).toEqual(["in_already_starting"]);
  });

  it("zruší střídání za hráče, který odešel z kádru", () => {
    const { dropped } = splitPlanByLineup([sub("r1", "s1", "sold")], lineup);
    expect(dropped.map((d) => d.reason)).toEqual(["in_not_in_squad"]);
  });

  it("zachová pořadí pokynů, které zůstaly", () => {
    const plan = [sub("r1", "s1", "b1"), sub("r2", "x", "b2"), sub("r3", "s2", "b2")];
    expect(splitPlanByLineup(plan, lineup).kept.map((r) => r.id)).toEqual(["r1", "r3"]);
  });
});

describe("lavička srovnaná na sestavu", () => {
  it("null nechává výběr na automatu", () => {
    expect(benchForLineup(null, lineup)).toBeNull();
  });

  it("vyřadí hráče ze základu a hráče mimo kádr, pořadí ostatních zůstane", () => {
    expect(benchForLineup(["b2", "s1", "sold", "b1"], lineup)).toEqual(["b2", "b1"]);
  });

  it("z lavičky, ze které nikdo nezbyl, je prázdný seznam, ne automat", () => {
    expect(benchForLineup(["sold"], lineup)).toEqual([]);
  });
});
