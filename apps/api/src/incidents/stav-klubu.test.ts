import { describe, expect, it } from "vitest";
import { FalesnaD1, jakoD1 } from "./testovaci-d1";
import { hracZRadku, nactiStavKlubu } from "./stav-klubu";

function tym() {
  return { id: "tym-a", league_id: "liga-1" };
}

describe("hráč z řádku DB", () => {
  const radek = {
    id: "h1", first_name: "Franta", last_name: "Novák",
    personality: JSON.stringify({ alcohol: 80, discipline: 20, patriotism: 30, temper: 70, leadership: 72 }),
    life_context: JSON.stringify({ occupation: "Policista", transferUnrest: { level: 40 } }),
    coach_relationship: 35,
  };

  it("přečte povahu, vůdcovství, povolání a vztah k trenérovi", () => {
    expect(hracZRadku(radek)).toEqual({
      id: "h1", jmeno: "Franta Novák", alkohol: 80, disciplina: 20, vernost: 30, temperament: 70,
      vztahKTrenerovi: 35, transferUnrest: 40, vudcovstvi: 72, povolani: "Policista", recidivista: false,
      vek: 25, dluhy: false, zalohaOdmitnuta: false,
    });
  });

  it("recidivistu pozná podle množiny", () => {
    expect(hracZRadku(radek, new Set(["h1"])).recidivista).toBe(true);
  });

  it("rozbitý JSON dá výchozí hodnoty", () => {
    const h = hracZRadku({ id: "h2", first_name: "Jan", last_name: "Kos", personality: "{rozbite", life_context: null, coach_relationship: null });
    expect(h).toMatchObject({
      alkohol: 30, disciplina: 50, vernost: 50, temperament: 40, vztahKTrenerovi: 50,
      vudcovstvi: 30, povolani: "", transferUnrest: 0, recidivista: false,
      vek: 25, dluhy: false, zalohaOdmitnuta: false,
    });
  });

  it("věk, dluhy a odmítnutou zálohu bere z kontextu", () => {
    const h = hracZRadku({ ...radek, age: 31 }, new Set(), {
      situace: new Map([["h1", "dluhy"]]), odmitnuteZalohy: new Set(["h1"]),
    });
    expect(h).toMatchObject({ vek: 31, dluhy: true, zalohaOdmitnuta: true });
    const bez = hracZRadku({ ...radek, age: 31 }, new Set(), { situace: new Map([["h1", "rozvod"]]) });
    expect(bez).toMatchObject({ vek: 31, dluhy: false, zalohaOdmitnuta: false });
    expect(hracZRadku(radek).vek).toBe(25);
  });
});

describe("včerejší tržby a letošní útěk (spec 4a)", () => {
  it("načte kasu i tombolu ze včerejšího domácího zápasu", async () => {
    const db = new FalesnaD1([
      // Vybavení musí najít řádek, jinak nactiStavKlubu skončí null dřív, než dojde na dávku.
      { sql: /FROM equipment WHERE team_id/, first: {} },
      // Dotaz běží uvnitř db.batch(), FalesnaD1 tam čte `all`, ne `first`.
      { sql: /FROM matches m JOIN season_calendar/, all: [{ id: "m1", home_team_id: "t1", home_score: 2, away_score: 1 }] },
      { sql: /type IN \('concession_income_self', 'raffle_income'\)/, all: [
        { type: "concession_income_self", castka: 4000 },
        { type: "raffle_income", castka: 1500 },
      ] },
      { sql: /kind = 'utek_s_penezi'/, first: null },
    ]);
    const s = await nactiStavKlubu(jakoD1(db), tym(), "2026-09-18", 4);
    expect(s?.vcera?.trzby).toEqual({ kasa: 4000, tombola: 1500 });
    expect(s?.utekLetos).toBe(false);
  });

  it("bez včerejšího zápasu jsou tržby nulové", async () => {
    const db = new FalesnaD1([
      { sql: /FROM equipment WHERE team_id/, first: {} },
      { sql: /FROM matches m JOIN season_calendar/, all: [] },
    ]);
    const s = await nactiStavKlubu(jakoD1(db), tym(), "2026-09-18", 4);
    expect(s?.vcera).toBeNull();
  });
});
