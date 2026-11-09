/**
 * Mzda při podpisu volného hráče: ověřuje se proti jeho požadavku, celebrita o ní nejedná.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createTransferTestDb, type TransferTestDb } from "../test-support/transfer-db";

const sideEffects = vi.hoisted(() => ({
  evaluateSigningChance: vi.fn((..._args: unknown[]) => ({ accepted: true, chance: 1, factors: [] })),
}));

vi.mock("../transfers/attach-relations", () => ({ attachNewcomerRelations: async () => 0 }));
vi.mock("../lib/coach-relation", () => ({ initNewcomerCoachRelation: async () => undefined }));
vi.mock("../transfers/transfer-news", () => ({ createTransferNews: async () => undefined }));
vi.mock("../lib/reputation", () => ({ applyReputationDelta: async () => undefined }));
vi.mock("../services/achievements", () => ({ checkFreeAgentSigningAchievements: async () => undefined }));
vi.mock("../transfers/player-interest", () => ({ loadCoachStandings: async () => new Map() }));
vi.mock("../transfers/player-agency", () => ({ evaluateSigningChance: sideEffects.evaluateSigningChance }));

vi.setConfig({ testTimeout: 30_000, hookTimeout: 60_000 });

import { resolveFreeAgentWage, signFreeAgent } from "./transfer-actions";

describe("resolveFreeAgentWage", () => {
  it("požadavek hráče a mzdu od 80 % výš pustí", () => {
    expect(resolveFreeAgentWage(300, 300, false)).toEqual({ ok: true, wage: 300 });
    expect(resolveFreeAgentWage(240, 300, false)).toEqual({ ok: true, wage: 240 });
    expect(resolveFreeAgentWage(450, 300, false)).toEqual({ ok: true, wage: 450 });
  });

  it("mzdu pod 80 % požadavku, nulu a záporné číslo odmítne", () => {
    for (const wage of [239, 1, 0, -500]) {
      const res = resolveFreeAgentWage(wage, 300, false);
      expect(res.ok, `mzda ${wage}`).toBe(false);
    }
  });

  it("necelé, nekonečné a nečíselné hodnoty odmítne", () => {
    for (const wage of [299.5, Number.POSITIVE_INFINITY, Number.NaN, "300", {}, 1e12]) {
      expect(resolveFreeAgentWage(wage, 300, false).ok, `mzda ${String(wage)}`).toBe(false);
    }
  });

  it("bez udané mzdy platí požadavek hráče", () => {
    expect(resolveFreeAgentWage(undefined, 300, false)).toEqual({ ok: true, wage: 300 });
    expect(resolveFreeAgentWage(null, 300, false)).toEqual({ ok: true, wage: 300 });
  });

  it("celebrita dostane vždy svůj požadavek", () => {
    expect(resolveFreeAgentWage(1, 2000, true)).toEqual({ ok: true, wage: 2000 });
    expect(resolveFreeAgentWage(9000, 2000, true)).toEqual({ ok: true, wage: 2000 });
  });
});

describe("signFreeAgent a mzda", () => {
  let t: TransferTestDb;

  beforeAll(async () => { t = await createTransferTestDb(); });
  afterAll(async () => { await t.dispose(); });

  beforeEach(async () => {
    vi.clearAllMocks();
    await t.reset();
    await t.db.batch([
      t.db.prepare(`INSERT INTO free_agents (id, district, first_name, last_name, age, position, overall_rating, weekly_wage)
        VALUES ('fa', 'Test', 'Karel', 'Volný', 25, 'MID', 50, 300)`),
      t.db.prepare(`INSERT INTO free_agents (id, district, first_name, last_name, age, position, overall_rating, weekly_wage, is_celebrity, personality)
        VALUES ('celebrity', 'Test', 'Pavel', 'Slavný', 38, 'FWD', 70, 2000, 1, '{"celebrityTier":"C","celebrityType":"legend"}')`),
    ]);
  });

  const wageOf = async (playerId: string | undefined) =>
    (await t.db.prepare("SELECT weekly_wage FROM players WHERE id = ?").bind(playerId ?? "").first<{ weekly_wage: number }>())?.weekly_wage;

  it("nulová mzda: 400, hráč zůstává volný a o podpisu se vůbec nerozhoduje", async () => {
    const res = await signFreeAgent(t.env, "buyer-a", "fa", 0);
    expect(res).toMatchObject({ ok: false, status: 400 });
    expect(sideEffects.evaluateSigningChance).not.toHaveBeenCalled();
    expect(await t.db.prepare("SELECT id FROM free_agents WHERE id = 'fa'").first()).not.toBeNull();
    expect(await t.db.prepare("SELECT COUNT(*) AS n FROM players").first<{ n: number }>()).toEqual({ n: 0 });
  });

  it("mzda těsně pod 80 % požadavku neprojde, přesně 80 % ano", async () => {
    expect(await signFreeAgent(t.env, "buyer-a", "fa", 239)).toMatchObject({ ok: false, status: 400 });
    const res = await signFreeAgent(t.env, "buyer-a", "fa", 240);
    expect(res).toMatchObject({ ok: true, success: true });
    expect(await wageOf(res.ok ? res.playerId : undefined)).toBe(240);
  });

  it("celebritě se zapíše její požadavek, i když klient pošle 1 Kč", async () => {
    const res = await signFreeAgent(t.env, "buyer-a", "celebrity", 1);
    expect(res).toMatchObject({ ok: true, success: true });
    expect(await wageOf(res.ok ? res.playerId : undefined)).toBe(2000);
    // Rozhodnutí hráče se počítá se mzdou, která se opravdu zapíše.
    expect(sideEffects.evaluateSigningChance.mock.calls[0][3]).toBe(2000);
  });
});
