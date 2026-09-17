import { describe, expect, it } from "vitest";
import { hracZRadku } from "./stav-klubu";

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
});
