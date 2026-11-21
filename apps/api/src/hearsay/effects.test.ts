/**
 * Tabulka dopadů, když se hráč dozví, co o něm trenér řekl (spec část 3, plán Task 5).
 */
import { describe, expect, it } from "vitest";
import { learningEffect } from "./effects";

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
