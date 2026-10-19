import { describe, expect, it } from "vitest";
import { createRng } from "../generators/rng";
import { pickReported, REPORT_MARGIN } from "./scout-work";

describe("koho skaut nahlásí", () => {
  const players = [{ id: "a", est: 48 }, { id: "b", est: 50 }, { id: "c", est: 55 }, { id: "d", est: 60 }, { id: "e", est: 64 }];

  it("nikoho pod laťkou mínus rezerva, nad ní los s vahou podle odhadu", () => {
    const rng = createRng(1);
    const count = new Map<string, number>();
    for (let i = 0; i < 4000; i++) {
      const p = pickReported(rng, players, (x) => x.est, 55)!;
      count.set(p.id, (count.get(p.id) ?? 0) + 1);
    }
    expect(count.get("a") ?? 0).toBe(0);
    // Váhy 1 / 6 / 11 / 15: nejlepší nejčastěji, ale i průměrný a slabší přijde.
    expect(count.get("e")!).toBeGreaterThan(count.get("d")!);
    expect(count.get("d")!).toBeGreaterThan(count.get("c")!);
    expect(count.get("c")!).toBeGreaterThan(count.get("b")!);
    expect(count.get("b")!).toBeGreaterThan(0);
    expect(count.get("e")! / 4000).toBeLessThan(0.55);
  });

  it("když nikdo nedosáhne ani na laťku mínus rezervu, skaut nehlásí nic", () => {
    expect(pickReported(createRng(2), players, (x) => x.est, 64 + REPORT_MARGIN + 1)).toBeUndefined();
    expect(pickReported(createRng(2), [], (x: { est: number }) => x.est, 50)).toBeUndefined();
  });
});
