import { describe, expect, it } from "vitest";
import { applyBodyEffects } from "../generators/physicals";
import { calcAerialProb, calcGoalProb } from "./simulation";
import { mapRowToMatchPlayer } from "./lineup-loader";
import { createPlayer, createTeam } from "./test-helpers/lineup";
import { createRng } from "../generators/rng";

describe("applyBodyEffects", () => {
  it("nadváha ubere rychlost a výdrž, hmotnost přidá sílu, výška nastaví height", () => {
    const p = { ...createPlayer(1, "DEF", 40), stamina: 40 };
    applyBodyEffects(p, { height: 180, weight: 90 });
    expect([p.speed, p.stamina, p.strength, p.heading, p.height]).toEqual([35, 35, 41, 40, 180]);
  });

  it("vlastnost úpravou nespadne pod 1", () => {
    const p = { ...createPlayer(1, "MID", 5), stamina: 5 };
    applyBodyEffects(p, { height: 170, weight: 140 });
    expect(p.speed).toBe(1);
    expect(p.stamina).toBe(1);
  });

  it("vysoký útočník má víc hlaviček, malý méně", () => {
    const tall = createPlayer(1, "FWD", 40);
    const short = createPlayer(2, "FWD", 40);
    applyBodyEffects(tall, { height: 192, weight: 87 });
    applyBodyEffects(short, { height: 170, weight: 68 });
    expect(tall.heading).toBe(45);
    expect(short.heading).toBe(36);
  });

  it("bez úpravy se nic nemění, ani nula se nezvedne na 1", () => {
    const p = { ...createPlayer(1, "GK", 50), heading: 0 };
    applyBodyEffects(p, {});
    expect(p.heading).toBe(0);
    expect(p.height).toBeUndefined();
  });
});

describe("dosah brankáře", () => {
  it("vysoký brankář pustí z rohu méně než malý", () => {
    const attacking = createTeam(1, "Útok", 40);
    const defending = createTeam(2, "Obrana", 40);
    const kicker = attacking.lineup[9];
    const header = attacking.lineup[10];
    const gk = defending.lineup[0];
    const tall = calcAerialProb(kicker, header, { ...gk, height: 195 }, defending, true, "cloudy");
    const short = calcAerialProb(kicker, header, { ...gk, height: 175 }, defending, true, "cloudy");
    expect(tall).toBeLessThan(short);
  });

  it("vysoký brankář chytá víc hlaviček ze hry, na střely nohou výška nepůsobí", () => {
    const attacker = createPlayer(1, "FWD", 50);
    const gk = createPlayer(2, "GK", 50);
    let tallSum = 0, shortSum = 0;
    for (let s = 1; s <= 500; s++) {
      tallSum += calcGoalProb(createRng(s), attacker, { ...gk, height: 195 }, 50, 30, 0);
      shortSum += calcGoalProb(createRng(s), attacker, { ...gk, height: 175 }, 50, 30, 0);
    }
    expect(tallSum).toBeLessThan(shortSum);
  });
});

describe("mapRowToMatchPlayer", () => {
  it("náhled sestavy počítá s postavou", () => {
    const row = {
      id: "p1", first_name: "Jan", last_name: "Novák", nickname: null, position: "DEF",
      skills: JSON.stringify({ speed: 40, heading: 40, defense: 40 }),
      personality: "{}", life_context: "{}",
      physical: JSON.stringify({ stamina: 40, strength: 40, height: 180, weight: 90 }),
    };
    const p = mapRowToMatchPlayer(row);
    expect([p.speed, p.stamina, p.strength, p.height]).toEqual([35, 35, 41, 180]);
  });
});
