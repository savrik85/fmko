/**
 * Tabulka dopadů, když se hráč dozví, co o něm trenér řekl (spec část 3, plán Task 5).
 */
import { describe, expect, it } from "vitest";
import { LINEUP_TALK_RE, NOT_COUNTED_ON_RE, learningEffect } from "./effects";

const quiet = { coachTalkedFirst: false, seededRoll: 0.3 };

describe("dopad toho, co se hráč doslechl", () => {
  it("tabulka dopadů za zády", () => {
    expect(learningEffect("praise", "brothers", quiet)).toEqual({ relation: 3, morale: 2, unrest: 0, message: true });
    expect(learningEffect("praise", "brothers", { ...quiet, seededRoll: 0.7 })).toEqual({ relation: 3, morale: 2, unrest: 0, message: false });
    expect(learningEffect("criticism", "rivals", quiet)).toEqual({ relation: -4, morale: -3, unrest: 0, message: true });
    expect(learningEffect("decision_against", "teammate", quiet)).toEqual({ relation: -3, morale: -4, unrest: 10, message: true });
  });

  it("když to trenér řekl první, rozhodnutí na úkor bolí polovinu, kritika ne (spec 3)", () => {
    expect(learningEffect("criticism", "brothers", { ...quiet, coachTalkedFirst: true })).toEqual({ relation: -4, morale: -3, unrest: 0, message: true });
    expect(learningEffect("decision_against", "pub", { ...quiet, coachTalkedFirst: true })).toEqual({ relation: -1, morale: -2, unrest: 5, message: true });
    // Pochvalu to nezmenší.
    expect(learningEffect("praise", "pub", { ...quiet, coachTalkedFirst: true }).relation).toBe(3);
  });

  it("před kabinou žádná zpráva", () => {
    expect(learningEffect("praise", "squad_chat", quiet)).toEqual({ relation: 4, morale: 3, unrest: 0, message: false });
    expect(learningEffect("criticism", "squad_chat", quiet)).toEqual({ relation: -5, morale: -4, unrest: 0, message: false });
    expect(learningEffect("decision_against", "squad_chat", quiet)).toEqual({ relation: -2, morale: -3, unrest: 0, message: false });
  });

  it("decision_for nepíše", () => {
    expect(learningEffect("decision_for", "drinking_buddies", quiet)).toEqual({ relation: 0, morale: 2, unrest: 0, message: false });
    expect(learningEffect("decision_for", "squad_chat", quiet)).toEqual({ relation: 0, morale: 3, unrest: 0, message: false });
  });
});

describe("trenér napsal, že s hráčem nepočítá", () => {
  it("prodej, hostování, nestavění a „hledej si klub“ (Študlar, Výškovice, 10/2026)", () => {
    for (const t of [
      "Dobře. Dávám tě na seznam nepotřebných hráčů určených k prodeji a po sezoně tě připustíme. S platem nepočítej",
      "Měl jsi šanci tu si prosral. Policie o tobě ví. Já tě nebudu stavět a ani na trénink chodit nemusíš",
      "O čem jsme se bavili včera: že si máš hledat místo jinde",
      "Hledej si klub, tady končíš.",
      "Půjčím tě na hostování do Dobrše.",
      "Dám tě na přestupovou listinu.",
      "S tebou už nepočítám.",
    ]) expect(NOT_COUNTED_ON_RE.test(t), t).toBe(true);
    // LINEUP_TALK_RE dřív prodej nepoznal.
    expect(LINEUP_TALK_RE.test("Dávám tě na seznam nepotřebných hráčů určených k prodeji")).toBe(false);
  });

  it("běžná zpráva ani hledání práce to nejsou", () => {
    for (const t of ["Ahoj, jak se máš?", "V sobotu hraješ od začátku.", "Hledej si práci, ať máš z čeho žít.", "Prodej lístků jde dobře."]) {
      expect(NOT_COUNTED_ON_RE.test(t), t).toBe(false);
    }
  });
});
