import { describe, expect, it } from "vitest";
import { createRng } from "../generators/rng";
import { generateBetweenRoundEvents } from "./between-rounds";
import type { GeneratedPlayer } from "../generators/player";

function player(over: Partial<GeneratedPlayer> = {}): GeneratedPlayer {
  return {
    firstName: "Jan", lastName: "Novák", age: 25, position: "MID",
    patriotism: 60, morale: 60, temper: 40, injuryProneness: 50,
    ...over,
  } as GeneratedPlayer;
}

function run(squad: GeneratedPlayer[], attendance?: number[], rounds = 4000) {
  const events = [];
  for (let seed = 1; seed <= rounds; seed++) {
    events.push(...generateBetweenRoundEvents(createRng(seed), squad, 0, 50, null, 5, undefined, attendance));
  }
  return events;
}

describe("mezikolové události na škále 0–100", () => {
  it("na tréninku se nezraní hráč, který na trénink nechodí", () => {
    const squad = [player(), player({ injuryProneness: 100 }), player()];
    const injuries = run(squad, [1, 0, 1]).filter((e) => e.effect?.type === "injury");
    expect(injuries.length).toBeGreaterThan(20);
    expect(injuries.every((e) => e.effect?.playerIndex !== 1)).toBe(true);
  });

  it("křehký hráč se na tréninku zraní častěji než železný", () => {
    const squad = [player({ injuryProneness: 5 }), player({ injuryProneness: 100 })];
    const injuries = run(squad).filter((e) => e.effect?.type === "injury");
    const fragile = injuries.filter((e) => e.effect?.playerIndex === 1).length;
    expect(fragile).toBeGreaterThan(injuries.length - fragile);
  });

  it("hráč s nízkým patriotismem a morálkou umí chtít odejít", () => {
    const squad = [player({ patriotism: 25, morale: 20 }), player()];
    expect(run(squad).some((e) => e.effect?.type === "player_leave")).toBe(true);
  });

  it("hádku v kabině nevyvolají průměrně vznětliví hráči", () => {
    const squad = [player({ temper: 40 }), player({ temper: 55 }), player({ temper: 60 })];
    expect(run(squad).some((e) => e.title === "Hádka v kabině")).toBe(false);
  });
});
