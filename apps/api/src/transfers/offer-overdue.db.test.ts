/**
 * Nabídka po lhůtě na odpověď: nejde přijmout, odmítnout, stáhnout ani na ni odpovědět
 * (propadne hned, s následky mlčení) a ve výpisech aktivních nabídek není.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { budgetOf, createTransferTestDb, insertTestOffer, insertTestPlayer, TEST_FUTURE, TEST_GAME_DATE, type TransferTestDb } from "../test-support/transfer-db";

const sideEffects = vi.hoisted(() => ({
  applyOfferRejectionImpact: vi.fn(async (_db: unknown, _offer: Record<string, unknown>, _trigger: string, _env?: unknown) => undefined),
}));

vi.mock("./offer-rejection-impact", () => ({ applyOfferRejectionImpact: sideEffects.applyOfferRejectionImpact }));
vi.mock("./player-interest", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./player-interest")>()),
  computeInterestForOffer: async () => null,
}));
vi.mock("../community/notifications", () => ({ createNotification: async () => undefined }));
vi.mock("./registration-window", () => ({ registrationLockError: async () => null }));

vi.setConfig({ testTimeout: 30_000, hookTimeout: 60_000 });

import { gameRouter } from "../routes/game";
import { menuBadgesRouter } from "../routes/menu-badges";
import {
  acceptTransferOffer, counterTransferOffer, createTransferOffer, rejectTransferOffer, withdrawTransferOffer,
} from "../services/transfer-actions";
import { isOfferOverdue } from "./offer-expiry";

const PAST = "2020-01-01T00:00:00.000Z";

describe("isOfferOverdue", () => {
  const now = new Date("2026-11-09T12:00:00.000Z");
  it("po lhůtě je nabídka až po jejím konci", () => {
    expect(isOfferOverdue("2026-11-09T11:59:59.000Z", now)).toBe(true);
    expect(isOfferOverdue("2026-11-09T12:00:00.000Z", now)).toBe(false);
    expect(isOfferOverdue("2026-11-09T12:00:01.000Z", now)).toBe(false);
  });
  it("nabídka bez lhůty nebo s nesmyslnou lhůtou po lhůtě není", () => {
    expect(isOfferOverdue(null, now)).toBe(false);
    expect(isOfferOverdue("", now)).toBe(false);
    expect(isOfferOverdue("nesmysl", now)).toBe(false);
  });
});

describe("akce nad nabídkou po lhůtě", () => {
  let t: TransferTestDb;

  beforeAll(async () => {
    t = await createTransferTestDb();
    await t.env.SESSION_KV.put("session:seller-token", JSON.stringify({ userId: "user-seller", email: "s@test.local", teamId: "seller-a", createdAt: TEST_GAME_DATE }));
    await t.env.SESSION_KV.put("session:buyer-token", JSON.stringify({ userId: "user-buyer", email: "b@test.local", teamId: "buyer-a", createdAt: TEST_GAME_DATE }));
  });
  afterAll(async () => { await t.dispose(); });

  beforeEach(async () => {
    vi.clearAllMocks();
    await t.reset();
    await insertTestPlayer(t.db, { id: "star", teamId: "seller-a" });
    await insertTestPlayer(t.db, { id: "other", teamId: "seller-a" });
  });

  /** Nabídka kupce po lhůtě: na tahu je prodávající, který mlčel. */
  const overduePending = () => insertTestOffer(t.db, { id: "late", playerId: "star", from: "buyer-a", to: "seller-a", amount: 30_000, expiresAt: PAST });
  const statusOf = async (id: string) =>
    (await t.db.prepare("SELECT status FROM transfer_offers WHERE id = ?").bind(id).first<{ status: string }>())?.status;
  const expectSilenceImpact = () => {
    expect(sideEffects.applyOfferRejectionImpact).toHaveBeenCalledTimes(1);
    expect(sideEffects.applyOfferRejectionImpact.mock.calls[0][1]).toMatchObject({ id: "late" });
    expect(sideEffects.applyOfferRejectionImpact.mock.calls[0][2]).toBe("expire");
  };

  it("přijmout nejde: 410, nabídka propadne a peníze ani hráč se nepohnou", async () => {
    await overduePending();
    expect(await acceptTransferOffer(t.env, "seller-a", "late")).toMatchObject({ ok: false, status: 410 });
    expect(await statusOf("late")).toBe("expired");
    expect(await budgetOf(t.db, "buyer-a")).toBe(500_000);
    expect(await t.db.prepare("SELECT team_id FROM players WHERE id = 'star'").first()).toEqual({ team_id: "seller-a" });
    expectSilenceImpact();
  });

  it("prodávající ji dodatečně neodmítne: propadne s následky mlčení", async () => {
    await overduePending();
    expect(await rejectTransferOffer(t.env, "seller-a", "late")).toMatchObject({ ok: false, status: 410 });
    expect(await statusOf("late")).toBe("expired");
    expectSilenceImpact();
  });

  it("prodávající jednání dodatečně neukončí a kupec ji nestáhne: propadne", async () => {
    await overduePending();
    expect(await withdrawTransferOffer(t.env, "seller-a", "late")).toMatchObject({ ok: false, status: 410 });
    expect(await statusOf("late")).toBe("expired");
    expectSilenceImpact();

    // Druhý pokus (kupec): nabídka už je propadlá, nic dalšího se nestane.
    expect((await withdrawTransferOffer(t.env, "buyer-a", "late")).ok).toBe(false);
    expect(sideEffects.applyOfferRejectionImpact).toHaveBeenCalledTimes(1);
  });

  it("protinávrh na ni poslat nejde", async () => {
    await overduePending();
    expect(await counterTransferOffer(t.env, "seller-a", "late", { amount: 40_000 })).toMatchObject({ ok: false, status: 410 });
    expect(await statusOf("late")).toBe("expired");
    expect(await t.db.prepare("SELECT counter_amount FROM transfer_offers WHERE id = 'late'").first()).toEqual({ counter_amount: null });
  });

  it("nabídka před koncem lhůty funguje jako dřív", async () => {
    await insertTestOffer(t.db, { id: "fresh", playerId: "star", from: "buyer-a", to: "seller-a", amount: 30_000 });
    expect(await rejectTransferOffer(t.env, "seller-a", "fresh")).toEqual({ ok: true });
    expect(await statusOf("fresh")).toBe("rejected");
    expect(sideEffects.applyOfferRejectionImpact.mock.calls[0][2]).toBe("reject");
  });

  it("nová nabídka na téhož hráče starou po lhůtě nechá propadnout, místo aby ji hlásila jako aktivní", async () => {
    await overduePending();
    const res = await createTransferOffer(t.env, "buyer-a", { playerId: "star", amount: 35_000 });
    expect(await statusOf("late")).toBe("expired");
    // Prodávající mlčel, takže platí běžná blokace po propadnutí, ne „již máte aktivní nabídku“.
    expect(res).toMatchObject({ ok: false, status: 429 });
  });

  async function get(router: typeof gameRouter, path: string, token: string) {
    const ctx = { waitUntil() {}, passThroughOnException() {} } as unknown as ExecutionContext;
    const res = await router.fetch(new Request(`http://test.local${path}`, { headers: { Authorization: `Bearer ${token}` } }), t.env, ctx);
    return { status: res.status, json: await res.json() as Record<string, unknown> };
  }
  const ids = (list: unknown) => (list as Array<{ id: string }>).map((o) => o.id).sort();

  it("ve výpisu aktivních nabídek ani v odznaku menu nabídka po lhůtě není", async () => {
    await overduePending();
    await insertTestOffer(t.db, { id: "fresh", playerId: "other", from: "buyer-a", to: "seller-a", amount: 30_000, expiresAt: TEST_FUTURE });

    const seller = await get(gameRouter, "/teams/seller-a/offers", "seller-token");
    expect(seller.status).toBe(200);
    expect(ids(seller.json.incoming)).toEqual(["fresh"]);
    const buyer = await get(gameRouter, "/teams/buyer-a/offers", "buyer-token");
    expect(ids(buyer.json.outgoing)).toEqual(["fresh"]);

    const badge = await get(menuBadgesRouter as unknown as typeof gameRouter, "/teams/seller-a/menu-badges/offers", "seller-token");
    expect(badge.status).toBe(200);
    expect(JSON.stringify(badge.json)).toContain("fresh");
    expect(JSON.stringify(badge.json)).not.toContain("late");
  });
});
