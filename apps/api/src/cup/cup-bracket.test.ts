import { describe, expect, it } from "vitest";
import { createRng } from "../generators/rng";
import { cupBracketPlan, cupPrize, pickByeTeamIds, roundName, secondRoundOrder } from "./cup";

describe("pohár jen ze skutečných týmů", () => {
  it("56 týmů: pavouk 64, 6 kol, 8 volných losů", () => {
    expect(cupBracketPlan(56)).toEqual({ rounds: 6, byes: 8 });
  });

  it("mocnina dvou se hraje bez volných losů, malé pole i hraniční velikosti", () => {
    expect(cupBracketPlan(64)).toEqual({ rounds: 6, byes: 0 });
    expect(cupBracketPlan(65)).toEqual({ rounds: 7, byes: 63 });
    expect(cupBracketPlan(3)).toEqual({ rounds: 2, byes: 1 });
    expect(cupBracketPlan(2)).toEqual({ rounds: 1, byes: 0 });
    expect(cupBracketPlan(1)).toEqual({ rounds: 0, byes: 0 });
  });

  it("2. kolo: každý volný los dostane vítěze 1. kola, ten hraje doma, zbytek spolu", () => {
    const winners = Array.from({ length: 24 }, (_, i) => `w${i}`);
    const byes = Array.from({ length: 8 }, (_, i) => `b${i}`);
    const order = secondRoundOrder(winners, byes);
    expect(order).toHaveLength(32);
    expect(new Set(order).size).toBe(32);
    for (let i = 0; i < 8; i++) {
      expect(order[i * 2]).toBe(`w${i}`);
      expect(order[i * 2 + 1]).toBe(`b${i}`);
    }
    // Žádná dvojice dvou volných losů.
    for (let i = 0; i < order.length; i += 2) {
      expect(order[i].startsWith("b") && order[i + 1].startsWith("b")).toBe(false);
    }
  });

  it("bez volných losů zůstane pořadí vítězů", () => {
    expect(secondRoundOrder(["a", "b", "c", "d"], [])).toEqual(["a", "b", "c", "d"]);
  });

  it("názvy kol a odměny šestikolového poháru", () => {
    expect([1, 2, 3, 4, 5, 6].map((r) => roundName(r, 6))).toEqual(["1. kolo", "2. kolo", "Osmifinále", "Čtvrtfinále", "Semifinále", "Finále"]);
    expect(cupPrize(1, 6)).toBe(15000);
    expect(cupPrize(6, 6)).toBe(240000);
  });
});

describe("volný los losem, ne podle síly", () => {
  const ids = Array.from({ length: 56 }, (_, i) => `t${i}`); // t0 nejsilnější … t55 nejslabší

  it("vybere přesně tolik klubů, kolik je volných losů, stejný seed stejný los", () => {
    const a = pickByeTeamIds(ids, 8, createRng(3));
    expect(a.size).toBe(8);
    expect([...a]).toEqual([...pickByeTeamIds(ids, 8, createRng(3))]);
  });

  it("silní nemají přednost: za 200 sezón dostane volný los každý zhruba stejně často", () => {
    const counts = new Map<string, number>();
    for (let s = 0; s < 200; s++) for (const id of pickByeTeamIds(ids, 8, createRng(1000 + s))) counts.set(id, (counts.get(id) ?? 0) + 1);
    const strongest = ids.slice(0, 8).reduce((n, id) => n + (counts.get(id) ?? 0), 0);
    // Podle síly by to bylo 200 × 8 = 1600. Losem ~ 200 × 8 × 8/56 ≈ 229.
    expect(strongest).toBeLessThan(400);
    expect(counts.size).toBeGreaterThan(50);
  });
});

