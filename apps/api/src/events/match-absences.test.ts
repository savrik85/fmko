import { describe, it, expect } from "vitest";
import { FalesnaD1 } from "../incidents/testovaci-d1";
import { kontextDojizdeni } from "./match-absences";

describe("kontextDojizdeni", () => {
  it("venkovní zápas pozná podle home_team_id", async () => {
    const db = new FalesnaD1([
      { sql: /FROM equipment/, first: { team_van: 0, team_van_condition: 50 } },
      { sql: /FROM matches/, first: { home_team_id: "soupeř" } },
    ]);
    const k = await kontextDojizdeni(db as never, "nas-tym", "kal-1");
    expect(k.isAway).toBe(true);
    expect(k.maDodavku).toBe(false);
  });

  it("domácí zápas s dodávkou", async () => {
    const db = new FalesnaD1([
      { sql: /FROM equipment/, first: { team_van: 1, team_van_condition: 80 } },
      { sql: /FROM matches/, first: { home_team_id: "nas-tym" } },
    ]);
    const k = await kontextDojizdeni(db as never, "nas-tym", "kal-1");
    expect(k.isAway).toBe(false);
    expect(k.maDodavku).toBe(true);
    expect(k.commuteMod).toBeGreaterThan(0);
  });

  it("když zápas není v DB, bere se to jako domácí a los se nezmění", async () => {
    const db = new FalesnaD1([
      { sql: /FROM equipment/, first: null },
      { sql: /FROM matches/, first: null },
    ]);
    const k = await kontextDojizdeni(db as never, "nas-tym", "neznamy");
    expect(k).toEqual({ commuteMod: 0, maDodavku: false, isAway: false });
  });

  it("pohárový zápas: náš tým je hostující cup team", async () => {
    // /FROM matches/ musí selhat (first: null), ať to zkusí pohár — cup_matches je jiná
    // tabulka a nesmí do stejného pravidla spadnout ta ligová.
    const db = new FalesnaD1([
      { sql: /FROM equipment/, first: { team_van: 0, team_van_condition: 50 } },
      { sql: /FROM cup_matches/, first: { home_cup_team_id: "ct-soupeř", home_real_team_id: "jiny-tym", away_cup_team_id: "ct-nas", away_real_team_id: "nas-tym" } },
      { sql: /FROM matches/, first: null },
    ]);
    const k = await kontextDojizdeni(db as never, "nas-tym", "cup-1");
    expect(k.isAway).toBe(true);
  });

  it("pohárový zápas: náš tým je domácí cup team", async () => {
    const db = new FalesnaD1([
      { sql: /FROM equipment/, first: { team_van: 0, team_van_condition: 50 } },
      { sql: /FROM cup_matches/, first: { home_cup_team_id: "ct-nas", home_real_team_id: "nas-tym", away_cup_team_id: "ct-soupeř", away_real_team_id: "jiny-tym" } },
      { sql: /FROM matches/, first: null },
    ]);
    const k = await kontextDojizdeni(db as never, "nas-tym", "cup-2");
    expect(k.isAway).toBe(false);
  });
});
