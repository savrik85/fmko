/**
 * Kdo z kádru reaguje na prodej nebo nákup (spec 3b, plán Task 11).
 */
import { describe, expect, it } from "vitest";
import { transferReactions, type TransferReactionInput } from "./transfers";
import { learningEffect } from "./effects";

const moved = { id: "grill", firstName: "Ondřej", lastName: "Grill", position: "GK", overall: 50 };

function input(o: Partial<TransferReactionInput>): TransferReactionInput {
  return { movedPlayer: moved, direction: "left", otherClubName: "FK Vimperk", squad: [], ties: [], ...o };
}

describe("kdo reaguje na přestup", () => {
  it("prodej bráchy: brácha reaguje, kolega skoro ne", () => {
    const out = transferReactions(input({
      squad: [{ id: "erik", position: "MID", overall: 40 }, { id: "kolega", position: "DEF", overall: 40 }, { id: "nikdo", position: "FWD", overall: 40 }],
      ties: [{ playerId: "erik", type: "brothers" }, { playerId: "kolega", type: "coworkers" }],
    }));
    expect(out).toEqual([{ playerId: "erik", via: "brothers" }, { playerId: "kolega", via: "coworkers" }]);
    expect(learningEffect("teammate_left", "brothers", { coachTalkedFirst: false, seededRoll: 0.9 })).toEqual({ relation: -5, morale: -6, unrest: 15, message: true });
    expect(learningEffect("teammate_left", "coworkers", { coachTalkedFirst: false, seededRoll: 0.1 })).toEqual({ relation: 0, morale: -1, unrest: 0, message: false });
  });

  it("nákup gólmana: jednička na postu je konkurent, čtyřka ne", () => {
    const out = transferReactions(input({
      direction: "arrived",
      squad: [
        { id: "jednicka", position: "GK", overall: 51 }, { id: "dvojka", position: "GK", overall: 45 },
        { id: "trojka", position: "GK", overall: 30 }, { id: "ctyrka", position: "GK", overall: 20 },
        { id: "stoper", position: "DEF", overall: 60 },
      ],
    }));
    expect(out).toEqual([{ playerId: "jednicka", via: "competitor" }, { playerId: "dvojka", via: "competitor" }]);
  });

  it("slabší příchozí není konkurent", () => {
    expect(transferReactions(input({ direction: "arrived", squad: [{ id: "jednicka", position: "GK", overall: 60 }] }))).toEqual([]);
  });

  it("rival s vazbou není zároveň konkurent a při odchodu konkurent nevzniká", () => {
    const squad = [{ id: "jednicka", position: "GK", overall: 51 }];
    const ties = [{ playerId: "jednicka", type: "rivals" }];
    expect(transferReactions(input({ direction: "arrived", squad, ties }))).toEqual([{ playerId: "jednicka", via: "rivals" }]);
    expect(transferReactions(input({ direction: "left", squad }))).toEqual([]);
  });

  it("dopady příchodu podle tabulky", () => {
    const quiet = { coachTalkedFirst: false, seededRoll: 0.9 };
    expect(learningEffect("teammate_arrived", "brothers", quiet)).toEqual({ relation: 4, morale: 5, unrest: 0, message: true });
    expect(learningEffect("teammate_arrived", "competitor", { ...quiet, seededRoll: 0.2 })).toEqual({ relation: 0, morale: -3, unrest: 5, message: true });
    expect(learningEffect("teammate_arrived", "rivals", quiet)).toEqual({ relation: 0, morale: -2, unrest: 0, message: false });
    expect(learningEffect("teammate_left", "rivals", { ...quiet, seededRoll: 0.1 })).toEqual({ relation: 0, morale: 2, unrest: 0, message: true });
  });
});
