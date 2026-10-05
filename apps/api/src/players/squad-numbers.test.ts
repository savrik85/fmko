import { describe, expect, it } from "vitest";
import { pickFreeNumber, planSquadNumbers, positionGroup, isValidSquadNumber } from "./squad-numbers";

describe("pickFreeNumber", () => {
  it("brankář dostane jedničku, když je volná", () => {
    expect(pickFreeNumber(new Set(), "GK")).toBe(1);
  });

  it("obsazená oblíbená čísla přeskočí", () => {
    expect(pickFreeNumber(new Set([9, 11]), "FWD")).toBe(7);
  });

  it("když jsou oblíbená čísla pryč, vezme nejnižší volné", () => {
    const taken = new Set([1, 12, 30, 23, 33, 31, 21, 41, 2, 3]);
    expect(pickFreeNumber(taken, "GK")).toBe(4);
  });

  it("plný tým nemá volné číslo", () => {
    const all = new Set(Array.from({ length: 99 }, (_, i) => i + 1));
    expect(pickFreeNumber(all, "MID")).toBeNull();
  });
});

describe("planSquadNumbers", () => {
  it("hráči bez čísla dostanou různá čísla a platná čísla zůstanou", () => {
    const plan = planSquadNumbers([
      { id: "a", position: "GK", squad_number: null },
      { id: "b", position: "FWD", squad_number: 9 },
      { id: "c", position: "FWD", squad_number: null },
      { id: "d", position: "DEF", squad_number: null },
    ]);
    const byId = Object.fromEntries(plan.map((c) => [c.id, c.number]));
    expect(byId.b).toBeUndefined();
    expect(byId.a).toBe(1);
    expect(byId.c).toBe(11);
    expect(byId.d).toBe(2);
  });

  it("kolize: číslo si nechá jeden hráč, druhý dostane jiné", () => {
    const plan = planSquadNumbers([
      { id: "x", position: "MID", squad_number: 10 },
      { id: "y", position: "MID", squad_number: 10 },
    ]);
    expect(plan).toHaveLength(1);
    expect(plan[0].id).toBe("y");
    expect(plan[0].number).not.toBe(10);
  });

  it("neplatná čísla (0, 100, desetinná) se přečíslují", () => {
    const plan = planSquadNumbers([
      { id: "a", position: "MID", squad_number: 0 },
      { id: "b", position: "MID", squad_number: 100 },
      { id: "c", position: "MID", squad_number: 7.5 },
    ]);
    expect(plan).toHaveLength(3);
    expect(new Set(plan.map((c) => c.number)).size).toBe(3);
    for (const c of plan) expect(isValidSquadNumber(c.number)).toBe(true);
  });

  it("celý kádr bez čísel (30 hráčů) dostane 30 různých čísel", () => {
    const players = Array.from({ length: 30 }, (_, i) => ({
      id: `p${String(i).padStart(2, "0")}`,
      position: ["GK", "DEF", "MID", "FWD"][i % 4],
      squad_number: null,
    }));
    const plan = planSquadNumbers(players);
    expect(plan).toHaveLength(30);
    expect(new Set(plan.map((c) => c.number)).size).toBe(30);
  });

  it("tým v pořádku nic nemění", () => {
    expect(planSquadNumbers([
      { id: "a", position: "GK", squad_number: 1 },
      { id: "b", position: "DEF", squad_number: 2 },
    ])).toEqual([]);
  });
});

describe("positionGroup", () => {
  it("rozpozná české i anglické zkratky", () => {
    expect(positionGroup("BRA")).toBe("GK");
    expect(positionGroup("CB")).toBe("DEF");
    expect(positionGroup("ST")).toBe("FWD");
    expect(positionGroup("CAM")).toBe("MID");
    expect(positionGroup(null)).toBe("MID");
  });
});
