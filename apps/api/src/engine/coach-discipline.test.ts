/**
 * Disciplína trenéra v zápase: méně faulů a karet, góly beze změny.
 * Mod mění jen pravděpodobnosti, ne počet hodů kostkou, takže se stejným seedem
 * je rozdíl čistě jeho zásluha.
 */
import { describe, it, expect } from "vitest";
import { disciplineCardMul, disciplineFoulMul } from "@okresni-masina/shared";
import { createRng } from "../generators/rng";
import { simulateMatch } from "./simulation";
import { NEUTRAL_REFEREE } from "./referee";
import type { EquipmentMods, MatchPlayer, TeamSetup } from "./types";

function mkPlayer(id: number, position: MatchPlayer["position"]): MatchPlayer {
  const v = 50;
  return {
    id, firstName: "Hráč", lastName: `${id}`, nickname: null, position,
    speed: v, technique: v, shooting: v, passing: v, heading: v, defense: v,
    goalkeeping: v, stamina: v, strength: v, vision: v, creativity: v, setPieces: v,
    discipline: 50, alcohol: 30, temper: 50, leadership: 30,
    workRate: 50, aggression: 50, consistency: 50, clutch: 50,
    injuryProneness: 50, preferredFoot: "right", preferredSide: "center",
    condition: 100, morale: 50,
  };
}

function mkTeam(teamId: number, idBase: number): TeamSetup {
  const lineup = [mkPlayer(idBase, "GK")];
  for (let i = 0; i < 4; i++) lineup.push(mkPlayer(idBase + 1 + i, "DEF"));
  for (let i = 0; i < 4; i++) lineup.push(mkPlayer(idBase + 5 + i, "MID"));
  for (let i = 0; i < 2; i++) lineup.push(mkPlayer(idBase + 9 + i, "FWD"));
  const subs = [mkPlayer(idBase + 11, "GK"), mkPlayer(idBase + 12, "DEF"), mkPlayer(idBase + 13, "MID")];
  return { teamId, teamName: `T${teamId}`, lineup, subs, tactic: "balanced", formation: "4-4-2", hardness: "normal" };
}

const NEUTRAL_EQ: EquipmentMods = { techniqueMod: 0, gkBonus: 0, injurySeverityMod: 0, conditionDrainMod: 0, moraleMod: 0 };

function run(discipline: number | null, n: number) {
  const t = { fouls: 0, yellow: 0, goals: 0 };
  const homeEquipment: EquipmentMods = discipline === null
    ? NEUTRAL_EQ
    : { ...NEUTRAL_EQ, coachFoulMod: disciplineFoulMul(discipline), coachCardMod: disciplineCardMul(discipline) };
  for (let i = 0; i < n; i++) {
    const r = simulateMatch(createRng(70000 + i), {
      home: mkTeam(1, 1), away: mkTeam(2, 100), weather: "sunny", isHomeAdvantage: true,
      referee: NEUTRAL_REFEREE, homeEquipment, awayEquipment: NEUTRAL_EQ,
    });
    t.goals += r.homeScore + r.awayScore;
    for (const e of r.events) {
      if (e.type === "foul" && e.teamId === 1) t.fouls++;
      if (e.type === "card" && e.teamId === 1 && e.detail !== "red") t.yellow++;
    }
  }
  return t;
}

describe("disciplína trenéra v zápase", () => {
  const N = 600;
  const neutral = run(40, N);
  const strict = run(99, N);
  const sloppy = run(10, N);
  const none = run(null, N);

  it("trenér se čtyřicítkou hraje stejně jako tým bez trenéra", () => {
    expect(neutral).toEqual(none);
  });

  it("přísný trenér: méně faulů a o pětinu méně žlutých", () => {
    expect(strict.fouls / neutral.fouls).toBeLessThan(0.92);
    expect(strict.yellow / neutral.yellow).toBeLessThan(0.85);
    expect(strict.yellow / neutral.yellow).toBeGreaterThan(0.6);
  });

  it("lajdák: víc karet", () => {
    expect(sloppy.yellow).toBeGreaterThan(neutral.yellow);
  });

  it("góly zůstávají v šumu", () => {
    const ratio = strict.goals / neutral.goals;
    expect(ratio).toBeGreaterThan(0.95);
    expect(ratio).toBeLessThan(1.05);
  });
}, 120_000);
