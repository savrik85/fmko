import { describe, expect, it, vi } from "vitest";
import { prijemci, GRANT_MIN, GRANT_MAX, SURPLUS_MAX_PCT } from "./grants";

/** Minimální atrapa D1 — vrací pevný seznam klubů. */
const dbSKluby = (kluby: Array<{ id: string; pitch: number | null }>) => ({
  prepare: () => ({
    bind: () => ({
      all: async () => ({ results: kluby }),
    }),
  }),
}) as unknown as D1Database;

describe("komu dotace patří", () => {
  it("rovným dílem všem, zbytek po dělení zůstává v pokladně", async () => {
    const db = dbSKluby([{ id: "a", pitch: 50 }, { id: "b", pitch: 50 }, { id: "c", pitch: 50 }]);
    const out = await prijemci(db, { leagueId: "l", kind: "equipment", amount: 10_000 });
    expect(out).toHaveLength(3);
    // 10 000 / 3 = 3 333 na klub, 1 Kč zůstane soutěži.
    expect(out.every((p) => p.amount === 3333)).toBe(true);
    expect(out.reduce((s, p) => s + p.amount, 0)).toBe(9999);
  });

  it("dotace na hřiště jde jen klubům pod hranicí", async () => {
    const db = dbSKluby([{ id: "a", pitch: 19 }, { id: "b", pitch: 80 }, { id: "c", pitch: 5 }]);
    const out = await prijemci(db, { leagueId: "l", kind: "pitch", amount: 10_000, pitchThreshold: 30 });
    expect(out.map((p) => p.teamId).sort()).toEqual(["a", "c"]);
    expect(out[0].amount).toBe(5000);
  });

  it("klub bez stadionu se do dotace na hřiště nepočítá", async () => {
    const db = dbSKluby([{ id: "a", pitch: null }, { id: "b", pitch: 10 }]);
    const out = await prijemci(db, { leagueId: "l", kind: "pitch", amount: 4000, pitchThreshold: 30 });
    expect(out).toEqual([{ teamId: "b", amount: 4000 }]);
  });

  it("když hranici nikdo nesplňuje, nevyplácí se nic", async () => {
    const db = dbSKluby([{ id: "a", pitch: 90 }, { id: "b", pitch: 80 }]);
    expect(await prijemci(db, { leagueId: "l", kind: "pitch", amount: 9000, pitchThreshold: 30 })).toEqual([]);
  });

  it("cílená dotace míří na jeden klub a nedělí se", async () => {
    const db = dbSKluby([{ id: "a", pitch: 50 }, { id: "b", pitch: 50 }]);
    const out = await prijemci(db, { leagueId: "l", kind: "loan", amount: 20_000, targetTeamId: "b" });
    expect(out).toEqual([{ teamId: "b", amount: 20_000 }]);
  });

  it("částka, ze které by na klub nezbyla ani koruna, se nevyplácí", async () => {
    const db = dbSKluby([{ id: "a", pitch: 50 }, { id: "b", pitch: 50 }, { id: "c", pitch: 50 }]);
    expect(await prijemci(db, { leagueId: "l", kind: "equipment", amount: 2 })).toEqual([]);
  });

  it("stropy dávají smysl", () => {
    expect(GRANT_MIN).toBeLessThan(GRANT_MAX);
    expect(SURPLUS_MAX_PCT).toBeGreaterThan(0);
    expect(SURPLUS_MAX_PCT).toBeLessThanOrEqual(100);
  });
});
