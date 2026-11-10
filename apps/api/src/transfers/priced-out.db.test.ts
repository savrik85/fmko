/**
 * Protinávrh s absurdní cenou: když po něm jednání skončí u kupce (odmítnutí, stažení,
 * propadnutí), počítá se to jako odmítnutí prodávajícím.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { marketValue } from "@okresni-masina/shared";
import { createTransferTestDb, insertTestOffer, insertTestPlayer, type TransferTestDb } from "../test-support/transfer-db";

const sideEffects = vi.hoisted(() => ({
  applyOfferRejectionImpact: vi.fn(async (_db: unknown, _offer: Record<string, unknown>, _trigger: string, _env?: unknown) => undefined),
  interestLevel: { value: 3 },
}));

vi.mock("./offer-rejection-impact", () => ({ applyOfferRejectionImpact: sideEffects.applyOfferRejectionImpact }));
vi.mock("./player-interest", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./player-interest")>()),
  computeInterestForOffer: async () => ({ level: sideEffects.interestLevel.value, score: 0, factors: [] }),
}));
vi.mock("../community/notifications", () => ({ createNotification: async () => undefined }));

vi.setConfig({ testTimeout: 30_000, hookTimeout: 60_000 });

import { rejectTransferOffer, withdrawTransferOffer } from "../services/transfer-actions";
import { expireIdleOffers } from "./offer-expiry";
import { offerRetryBlock } from "./offer-cooldown";
import { isPricedOutCounter } from "./priced-out";

const VALUE = marketValue(55, 24, "MID");
const BID = Math.round(VALUE * 0.9 / 100) * 100;
const PAST = "2020-01-01T00:00:00.000Z";

describe("isPricedOutCounter", () => {
  it("nad dvojnásobek poslední nabídky kupce", () => {
    expect(isPricedOutCounter(20_001, 10_000, 100_000)).toBe(true);
    expect(isPricedOutCounter(20_000, 10_000, 100_000)).toBe(false);
  });

  it("nad dvojnásobek tržní hodnoty, i když kupec nabízel hodně", () => {
    expect(isPricedOutCounter(60_001, 45_000, 30_000)).toBe(true);
    expect(isPricedOutCounter(60_000, 45_000, 30_000)).toBe(false);
  });

  it("u výměny bez doplatku rozhoduje jen tržní hodnota", () => {
    expect(isPricedOutCounter(5_000, 0, 30_000)).toBe(false);
    expect(isPricedOutCounter(70_000, 0, 30_000)).toBe(true);
  });
});

describe("konec jednání u kupce po protinávrhu prodávajícího", () => {
  let t: TransferTestDb;

  beforeAll(async () => { t = await createTransferTestDb(); });
  afterAll(async () => { await t.dispose(); });

  beforeEach(async () => {
    vi.clearAllMocks();
    sideEffects.interestLevel.value = 3;
    await t.reset();
    await insertTestPlayer(t.db, { id: "star", teamId: "seller-a", age: 24, rating: 55 });
  });

  /** Nabídka kupce za BID, na kterou prodávající odpověděl protinávrhem `counter`. Na tahu je kupec. */
  async function counteredOffer(counter: number, opts: { expiresAt?: string } = {}) {
    await insertTestOffer(t.db, {
      id: "offer", playerId: "star", from: "buyer-a", to: "seller-a", amount: BID, counterAmount: counter,
      status: "countered", lastActionBy: "seller-a", expiresAt: opts.expiresAt,
    });
    await t.db.batch([
      t.db.prepare("INSERT INTO transfer_offer_events (id, offer_id, team_id, event_type, amount, created_at) VALUES ('e1', 'offer', 'buyer-a', 'offer', ?, '2026-10-01 10:00:00')").bind(BID),
      t.db.prepare("INSERT INTO transfer_offer_events (id, offer_id, team_id, event_type, amount, created_at) VALUES ('e2', 'offer', 'seller-a', 'counter', ?, '2026-10-01 11:00:00')").bind(counter),
    ]);
  }
  const offerRow = () => t.db.prepare("SELECT status, cooldown_waived FROM transfer_offers WHERE id = 'offer'")
    .first<{ status: string; cooldown_waived: number }>();
  const impactOffer = () => sideEffects.applyOfferRejectionImpact.mock.calls[0]?.[1];

  it("kupec odmítne absurdní protinávrh: hráč reaguje jako na odmítnutí prodávajícím, kupec bez blokace", async () => {
    await counteredOffer(BID * 2 + 1000);
    expect(await rejectTransferOffer(t.env, "buyer-a", "offer")).toEqual({ ok: true });

    expect(await offerRow()).toEqual({ status: "rejected", cooldown_waived: 1 });
    expect(sideEffects.applyOfferRejectionImpact).toHaveBeenCalledTimes(1);
    // Hráč posuzuje nabídku kupce, ne protinávrh svého klubu.
    expect(impactOffer()).toMatchObject({ id: "offer", player_id: "star", offer_amount: BID, counter_amount: null });
    expect(sideEffects.applyOfferRejectionImpact.mock.calls[0][2]).toBe("reject");
    expect(await offerRetryBlock(t.db, "star", "buyer-a")).toBeNull();
  });

  it("kupec odmítne rozumný protinávrh: bez dopadu na hráče, blokace kupce zůstává jako dřív", async () => {
    await counteredOffer(Math.round(BID * 1.5));
    expect(await rejectTransferOffer(t.env, "buyer-a", "offer")).toEqual({ ok: true });

    expect(await offerRow()).toEqual({ status: "rejected", cooldown_waived: 0 });
    expect(sideEffects.applyOfferRejectionImpact).not.toHaveBeenCalled();
    expect(await offerRetryBlock(t.db, "star", "buyer-a")).toMatchObject({ reason: "rejected" });
  });

  it("přesně dvojnásobek nabídky kupce ještě absurdní není", async () => {
    await counteredOffer(BID * 2);
    await rejectTransferOffer(t.env, "buyer-a", "offer");
    expect(sideEffects.applyOfferRejectionImpact).not.toHaveBeenCalled();
  });

  it("kupec nabídku po absurdním protinávrhu stáhne: stejný dopad", async () => {
    await counteredOffer(BID * 3);
    expect(await withdrawTransferOffer(t.env, "buyer-a", "offer")).toEqual({ ok: true });

    expect(await offerRow()).toEqual({ status: "withdrawn", cooldown_waived: 1 });
    expect(sideEffects.applyOfferRejectionImpact).toHaveBeenCalledTimes(1);
    expect(impactOffer()).toMatchObject({ offer_amount: BID, counter_amount: null });
  });

  it("kupec nechá absurdní protinávrh propadnout: stejný dopad", async () => {
    await counteredOffer(BID * 3, { expiresAt: PAST });
    expect(await expireIdleOffers(t.env, new Date())).toBe(1);

    expect(await offerRow()).toEqual({ status: "expired", cooldown_waived: 1 });
    expect(sideEffects.applyOfferRejectionImpact).toHaveBeenCalledTimes(1);
    expect(impactOffer()).toMatchObject({ offer_amount: BID, counter_amount: null });
    expect(sideEffects.applyOfferRejectionImpact.mock.calls[0][2]).toBe("reject");
  });

  it("rozumný protinávrh, který kupec nechá propadnout, hráče nenaštve", async () => {
    await counteredOffer(Math.round(BID * 1.2), { expiresAt: PAST });
    expect(await expireIdleOffers(t.env, new Date())).toBe(1);
    expect(sideEffects.applyOfferRejectionImpact).not.toHaveBeenCalled();
  });

  it("hráč, který o přestup nestál (zájem 1), se nezlobí, kupec ale blokaci nedostane", async () => {
    sideEffects.interestLevel.value = 1;
    await counteredOffer(BID * 3);
    await rejectTransferOffer(t.env, "buyer-a", "offer");

    expect(sideEffects.applyOfferRejectionImpact).not.toHaveBeenCalled();
    expect(await offerRow()).toEqual({ status: "rejected", cooldown_waived: 1 });
  });

  it("srovnává se s posledním návrhem kupce, ne s úvodní nabídkou", async () => {
    // Kupec mezitím přihodil na 1,6× BID; protinávrh 2,4× BID je pod dvojnásobkem jeho
    // posledního návrhu, ale tržní hodnotu převyšuje víc než dvakrát.
    const raised = Math.round(BID * 1.6);
    await counteredOffer(Math.round(BID * 2.4));
    await t.db.prepare("INSERT INTO transfer_offer_events (id, offer_id, team_id, event_type, amount, created_at) VALUES ('e0', 'offer', 'buyer-a', 'counter', ?, '2026-10-01 10:30:00')").bind(raised).run();
    await rejectTransferOffer(t.env, "buyer-a", "offer");

    expect(sideEffects.applyOfferRejectionImpact).toHaveBeenCalledTimes(1);
    expect(impactOffer()).toMatchObject({ offer_amount: raised });
  });

  it("stažení kupcem, když na tahu byl prodávající, se jako odmítnutí nepočítá", async () => {
    await insertTestOffer(t.db, { id: "offer", playerId: "star", from: "buyer-a", to: "seller-a", amount: BID });
    expect(await withdrawTransferOffer(t.env, "buyer-a", "offer")).toEqual({ ok: true });
    expect(sideEffects.applyOfferRejectionImpact).not.toHaveBeenCalled();
    expect(await offerRow()).toEqual({ status: "withdrawn", cooldown_waived: 0 });
  });
});
