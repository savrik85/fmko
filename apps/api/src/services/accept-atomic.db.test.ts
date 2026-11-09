/**
 * Přijetí nabídky: peníze kupujícího, hráč a hráči na výměnu se zabírají jedním batchem.
 * Když něco neprojde nebo databáze spadne uprostřed, nezůstane nabídka přijatá, peníze
 * stržené ani hráč na cestě.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { Bindings } from "../index";
import { budgetOf, createTransferTestDb, insertTestOffer, insertTestPlayer, type TransferTestDb } from "../test-support/transfer-db";

vi.mock("../transfers/attach-relations", () => ({ attachNewcomerRelations: async () => 0 }));
vi.mock("../lib/coach-relation", () => ({ initNewcomerCoachRelation: async () => undefined }));
vi.mock("../transfers/transfer-news", () => ({ createTransferNews: async () => undefined }));
vi.mock("../players/squad-numbers", () => ({ ensureSquadNumbers: async () => undefined }));
vi.mock("../transfers/demands", () => ({ closeDemandsForArrival: async () => undefined }));
vi.mock("../community/notifications", () => ({ createNotification: async () => undefined }));
vi.mock("../community/web-push", () => ({ sendWebPushToPlayerWatchers: async () => undefined }));
vi.mock("../services/achievements", () => ({ checkTransferAchievements: async () => undefined }));
vi.mock("../transfers/registration-window", () => ({ registrationLockError: async () => null }));
vi.mock("../transfers/promises", () => ({ remindTransferPromise: async () => undefined, clearUnrestAfterTransfer: async () => undefined }));

vi.setConfig({ testTimeout: 30_000, hookTimeout: 60_000 });

import { acceptTransferOffer } from "./transfer-actions";

const PRICE = 30_000;
const BUYER_BUDGET = 500_000;
const SELLER_BUDGET = 100_000;

describe("přijetí nabídky je celé, nebo žádné", () => {
  let t: TransferTestDb;

  beforeAll(async () => { t = await createTransferTestDb(); });
  afterAll(async () => { await t.dispose(); });

  beforeEach(async () => {
    await t.reset();
    await insertTestPlayer(t.db, { id: "star", teamId: "seller-a" });
    await insertTestPlayer(t.db, { id: "swap-1", teamId: "buyer-a" });
    await insertTestPlayer(t.db, { id: "swap-2", teamId: "buyer-a" });
    for (const [id, team] of [["star", "seller-a"], ["swap-1", "buyer-a"], ["swap-2", "buyer-a"]]) {
      await t.db.prepare("INSERT INTO player_contracts (id, player_id, team_id, season_id, join_type, fee, is_active) VALUES (?, ?, ?, 'season', 'generated', 0, 1)")
        .bind(`c-${id}`, id, team).run();
    }
  });

  async function swapOffer() {
    await insertTestOffer(t.db, { id: "offer", playerId: "star", from: "buyer-a", to: "seller-a", amount: PRICE });
    await t.db.prepare("INSERT INTO transfer_offer_swap_players (offer_id, player_id, sort_order) VALUES ('offer', 'swap-1', 0), ('offer', 'swap-2', 1)").run();
  }
  const loanOffer = () => insertTestOffer(t.db, { id: "offer", playerId: "star", from: "buyer-a", to: "seller-a", amount: PRICE, offerType: "loan", loanDuration: 30 });

  /**
   * Databáze, která při `failAt`-tém batchi spadne, nebo těsně před ním pustí `before`
   * (souběžná změna, kterou kontroly před zabráním neviděly).
   */
  function envWith(hooks: { failAt?: number; before?: { at: number; run: () => Promise<unknown> } }): Bindings {
    let batches = 0;
    const db = new Proxy(t.db, {
      get(target, prop) {
        if (prop === "batch") {
          return async (statements: D1PreparedStatement[]) => {
            batches++;
            if (hooks.before && hooks.before.at === batches) await hooks.before.run();
            if (hooks.failAt === batches) throw new Error("D1 je dole");
            return target.batch(statements);
          };
        }
        const value = Reflect.get(target, prop);
        return typeof value === "function" ? value.bind(target) : value;
      },
    });
    return { ...t.env, DB: db } as Bindings;
  }

  const teamOf = async (id: string) =>
    (await t.db.prepare("SELECT team_id FROM players WHERE id = ?").bind(id).first<{ team_id: string }>())?.team_id;
  const offerStatus = async () =>
    (await t.db.prepare("SELECT status FROM transfer_offers WHERE id = 'offer'").first<{ status: string }>())?.status;

  async function expectNothingMoved(expectedOfferStatus = "pending") {
    expect(await offerStatus()).toBe(expectedOfferStatus);
    expect(await budgetOf(t.db, "buyer-a")).toBe(BUYER_BUDGET);
    expect(await budgetOf(t.db, "seller-a")).toBe(SELLER_BUDGET);
    expect(await teamOf("star")).toBe("seller-a");
    expect(await teamOf("swap-1")).toBe("buyer-a");
    expect(await teamOf("swap-2")).toBe("buyer-a");
    expect(await t.db.prepare("SELECT loan_from_team_id FROM players WHERE id = 'star'").first()).toEqual({ loan_from_team_id: null });
    expect(await t.db.prepare("SELECT COUNT(*) AS n FROM transactions").first()).toEqual({ n: 0 });
    expect(await t.db.prepare("SELECT COUNT(*) AS n FROM player_contracts WHERE is_active = 1").first()).toEqual({ n: 3 });
  }

  it("výměna s doplatkem projde celá: peníze, hráč i oba hráči na výměnu", async () => {
    await swapOffer();
    expect(await acceptTransferOffer(t.env, "seller-a", "offer")).toMatchObject({ ok: true });
    expect(await offerStatus()).toBe("accepted");
    expect(await budgetOf(t.db, "buyer-a")).toBe(BUYER_BUDGET - PRICE);
    expect(await budgetOf(t.db, "seller-a")).toBe(SELLER_BUDGET + PRICE);
    expect(await teamOf("star")).toBe("buyer-a");
    expect(await teamOf("swap-1")).toBe("seller-a");
    expect(await teamOf("swap-2")).toBe("seller-a");
  });

  it("výpadek databáze při zabírání peněz a hráčů: nic se nestane a nabídka čeká dál", async () => {
    await swapOffer();
    const res = await acceptTransferOffer(envWith({ failAt: 1 }), "seller-a", "offer");
    expect(res).toMatchObject({ ok: false, status: 500 });
    await expectNothingMoved();
    // Druhý pokus projde normálně.
    expect(await acceptTransferOffer(t.env, "seller-a", "offer")).toMatchObject({ ok: true });
  });

  it("výpadek databáze při závěrečném zápisu: peníze i všichni hráči se vrátí", async () => {
    await swapOffer();
    const res = await acceptTransferOffer(envWith({ failAt: 2 }), "seller-a", "offer");
    expect(res).toMatchObject({ ok: false, status: 500 });
    await expectNothingMoved();
  });

  it("kupující mezitím utratil peníze: hráč ani hráči na výměnu se nepohnou", async () => {
    await swapOffer();
    const env = envWith({ before: { at: 1, run: () => t.db.prepare("UPDATE teams SET budget = 100 WHERE id = 'buyer-a'").run() } });
    const res = await acceptTransferOffer(env, "seller-a", "offer");
    expect(res).toMatchObject({ ok: false, status: 400, reason: "buyer_funds" });
    expect(await offerStatus()).toBe("pending");
    expect(await budgetOf(t.db, "buyer-a")).toBe(100);
    expect(await budgetOf(t.db, "seller-a")).toBe(SELLER_BUDGET);
    expect(await teamOf("star")).toBe("seller-a");
    expect(await teamOf("swap-1")).toBe("buyer-a");
    expect(await teamOf("swap-2")).toBe("buyer-a");
  });

  it("druhý hráč na výměnu mezitím není k mání: peníze, hráč i první hráč na výměnu se vrátí", async () => {
    await swapOffer();
    const env = envWith({ before: { at: 1, run: () => t.db.prepare("UPDATE players SET status = 'transferring' WHERE id = 'swap-2'").run() } });
    const res = await acceptTransferOffer(env, "seller-a", "offer");
    expect(res).toMatchObject({ ok: false, status: 409 });
    await expectNothingMoved();
  });

  it("kupovaný hráč mezitím odešel jinam: peníze i hráči na výměnu zůstanou a nabídka skončí", async () => {
    await swapOffer();
    const env = envWith({ before: { at: 1, run: () => t.db.prepare("UPDATE players SET team_id = 'third-a' WHERE id = 'star'").run() } });
    const res = await acceptTransferOffer(env, "seller-a", "offer");
    expect(res).toMatchObject({ ok: false, status: 409 });
    expect(await offerStatus()).toBe("withdrawn");
    expect(await budgetOf(t.db, "buyer-a")).toBe(BUYER_BUDGET);
    expect(await teamOf("star")).toBe("third-a");
    expect(await teamOf("swap-1")).toBe("buyer-a");
    expect(await teamOf("swap-2")).toBe("buyer-a");
  });

  it("hostování: výpadek při zabírání i při závěrečném zápisu vrátí poplatek i hráče", async () => {
    await loanOffer();
    expect(await acceptTransferOffer(envWith({ failAt: 1 }), "seller-a", "offer")).toMatchObject({ ok: false, status: 500 });
    await expectNothingMoved();
    expect(await acceptTransferOffer(envWith({ failAt: 2 }), "seller-a", "offer")).toMatchObject({ ok: false, status: 500 });
    await expectNothingMoved();

    expect(await acceptTransferOffer(t.env, "seller-a", "offer")).toMatchObject({ ok: true });
    expect(await budgetOf(t.db, "buyer-a")).toBe(BUYER_BUDGET - PRICE);
    expect(await budgetOf(t.db, "seller-a")).toBe(SELLER_BUDGET + PRICE);
    expect(await t.db.prepare("SELECT team_id, loan_from_team_id FROM players WHERE id = 'star'").first())
      .toEqual({ team_id: "buyer-a", loan_from_team_id: "seller-a" });
  });

  it("hostování: hráč mezitím není k mání, stržený poplatek se vrátí", async () => {
    await loanOffer();
    const env = envWith({ before: { at: 1, run: () => t.db.prepare("UPDATE players SET status = 'transferring' WHERE id = 'star'").run() } });
    expect(await acceptTransferOffer(env, "seller-a", "offer")).toMatchObject({ ok: false, status: 409 });
    expect(await budgetOf(t.db, "buyer-a")).toBe(BUYER_BUDGET);
    expect(await budgetOf(t.db, "seller-a")).toBe(SELLER_BUDGET);
    expect(await offerStatus()).toBe("withdrawn");
  });

  it("hostování: kupující mezitím utratil peníze, hráč zůstane doma", async () => {
    await loanOffer();
    const env = envWith({ before: { at: 1, run: () => t.db.prepare("UPDATE teams SET budget = 100 WHERE id = 'buyer-a'").run() } });
    expect(await acceptTransferOffer(env, "seller-a", "offer")).toMatchObject({ ok: false, status: 400 });
    expect(await offerStatus()).toBe("pending");
    expect(await t.db.prepare("SELECT team_id, loan_from_team_id FROM players WHERE id = 'star'").first())
      .toEqual({ team_id: "seller-a", loan_from_team_id: null });
  });
});
