import { describe, it, expect } from "vitest";
import { FalesnaD1 } from "../incidents/testovaci-d1";
import { getAbsentPlayersMap, kontextDojizdeni, visibleAbsencePhases } from "./match-absences";

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

describe("visibleAbsencePhases", () => {
  it("2+ dny před zápasem se nelosuje nic", () => {
    expect(visibleAbsencePhases(2)).toEqual([]);
  });

  it("den předem jen výmluvy „den předem“, ranní ještě nikdo neposlal", () => {
    expect(visibleAbsencePhases(1)).toEqual(["day_before"]);
  });

  it("v den zápasu (i přátelák) obě fáze", () => {
    expect(visibleAbsencePhases(0)).toEqual(["day_before", "match_day"]);
  });
});

describe("getAbsentPlayersMap a ranní omluvenky", () => {
  // Nespolehliví hráči, ať los vyhodí absence v obou fázích.
  const hraci = Array.from({ length: 20 }, (_, i) => ({
    id: `hrac-${i}`, first_name: "Jan", last_name: `Hráč${i}`, age: 24 + (i % 10),
    personality: JSON.stringify({ discipline: 0, patriotism: 0, alcohol: 80 }),
    life_context: JSON.stringify({ morale: 0, occupation: "Zedník" }),
    physical: JSON.stringify({ stamina: 40 }),
    commute_km: 15, suspended_matches: 0, is_celebrity: 0, overall_rating: 60 - i,
  }));
  const db = () => new FalesnaD1([{ sql: /FROM players p WHERE p.team_id/, all: hraci }]);
  const ctx = (gameDate: string) => ({
    matchKey: "kal-1", isFriendly: false, scheduledAt: "2026-10-08T16:00:00.000Z", gameDate,
  });

  it("den předem neukazuje omluvenky, které hráči pošlou až ráno", async () => {
    const denPredem = await getAbsentPlayersMap(db() as never, "tym-1", ctx("2026-10-07T16:00:00.000Z"));
    const denZapasu = await getAbsentPlayersMap(db() as never, "tym-1", ctx("2026-10-08T16:00:00.000Z"));

    // Ranní fáze přidá hráče, kteří den předem psali „přijdu“.
    const ranni = [...denZapasu.keys()].filter((id) => !denPredem.has(id));
    expect(ranni.length).toBeGreaterThan(0);
    // Kdo se omluvil den předem, má v den zápasu tutéž výmluvu.
    for (const [id, info] of denPredem) expect(denZapasu.get(id)?.smsText).toBe(info.smsText);
  });
});
