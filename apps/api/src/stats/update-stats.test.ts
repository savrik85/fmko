import { describe, expect, it } from "vitest";
import type { MatchEvent } from "@okresni-masina/shared";
import { calculatePlayerRatings, playedTeamsMap } from "./update-stats";

// Domácí mají v enginu id 1, hosté 2 (match-runner, pohár, turnaj).
const HOME = 1;
const AWAY = 2;

function setup() {
  // Domácí: brankář 1, obránce 2, útočník 3; hosté: brankář 11, obránce 12, útočník 13; 4 a 14 sedí na lavičce.
  const ids = new Map<number, string>([
    [1, "h-gk"], [2, "h-def"], [3, "h-fwd"], [4, "h-bench"],
    [11, "a-gk"], [12, "a-def"], [13, "a-fwd"], [14, "a-bench"],
  ]);
  const positions = new Map<number, string>([
    [1, "GK"], [2, "DEF"], [3, "FWD"], [4, "DEF"],
    [11, "GK"], [12, "DEF"], [13, "FWD"], [14, "DEF"],
  ]);
  const minutes: Record<number, { entered: number; left: number | null }> = {
    1: { entered: 0, left: null }, 2: { entered: 0, left: null }, 3: { entered: 0, left: null },
    11: { entered: 0, left: null }, 12: { entered: 0, left: null }, 13: { entered: 0, left: null },
  };
  const teams = playedTeamsMap(minutes, [1, 2, 3, 4], [11, 12, 13, 14], HOME, AWAY);
  return { ids, positions, teams };
}

const goal = (playerId: number, teamId: number, minute: number): MatchEvent =>
  ({ minute, type: "goal", teamId, playerId, playerName: "x", description: "" }) as MatchEvent;

describe("calculatePlayerRatings: bonus za výsledek", () => {
  it("brankář a obránce bez jediné události dostanou bonus za výhru i čisté konto", () => {
    const { ids, positions, teams } = setup();
    const events = [goal(3, HOME, 10), goal(3, HOME, 50), goal(3, HOME, 80)];
    const r = calculatePlayerRatings(events, ids, HOME, 3, 0, positions, teams);
    // 6,2 základ obrany + 0,5 výhra + 0,8 čisté konto
    expect(r["h-gk"]).toBe(7.5);
    expect(r["h-def"]).toBe(7.5);
  });

  it("poražení bez události dostanou malus za prohru, ne čisté konto", () => {
    const { ids, positions, teams } = setup();
    const events = [goal(3, HOME, 10)];
    const r = calculatePlayerRatings(events, ids, HOME, 1, 0, positions, teams);
    expect(r["a-gk"]).toBe(5.9);
    expect(r["a-def"]).toBe(5.9);
    expect(r["a-fwd"]).toBe(5.7);
  });

  it("kdo nenastoupil, zůstane na základu", () => {
    const { ids, positions, teams } = setup();
    const r = calculatePlayerRatings([goal(3, HOME, 10)], ids, HOME, 1, 0, positions, teams);
    expect(r["h-bench"]).toBe(6.2);
    expect(r["a-bench"]).toBe(6.2);
  });

  it("střídající, který šel na hřiště, bonus dostane", () => {
    const { ids, positions } = setup();
    const minutes = {
      1: { entered: 0, left: null }, 2: { entered: 0, left: 60 }, 3: { entered: 0, left: null }, 4: { entered: 60, left: null },
      11: { entered: 0, left: null }, 12: { entered: 0, left: null }, 13: { entered: 0, left: null },
    };
    const teams = playedTeamsMap(minutes, [1, 2, 3, 4], [11, 12, 13, 14], HOME, AWAY);
    const r = calculatePlayerRatings([goal(3, HOME, 10)], ids, HOME, 1, 0, positions, teams);
    expect(r["h-bench"]).toBe(7.5);
  });

  it("bez mapy týmů se chová jako dřív (bonus jen hráčům s událostí)", () => {
    const { ids, positions } = setup();
    const r = calculatePlayerRatings([goal(3, HOME, 10)], ids, HOME, 1, 0, positions);
    expect(r["h-gk"]).toBe(6.2);
    expect(r["h-fwd"]).toBe(7.5);
  });
});
