/**
 * Stažení inzerátu: jen vlastní a jen aktivní inzerát.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createTransferTestDb, insertTestOffer, insertTestPlayer, TEST_FUTURE, type TransferTestDb } from "../test-support/transfer-db";
import { withdrawListing } from "./transfer-actions";

vi.setConfig({ testTimeout: 30_000, hookTimeout: 60_000 });

describe("withdrawListing", () => {
  let t: TransferTestDb;

  beforeAll(async () => { t = await createTransferTestDb(); });
  afterAll(async () => { await t.dispose(); });

  const listing = (id: string, status: string, dealType = "transfer") => t.db.prepare(
    "INSERT INTO transfer_listings (id, player_id, team_id, asking_price, league_id, status, expires_at, deal_type) VALUES (?, 'star', 'seller-a', 20000, 'league-a', ?, ?, ?)",
  ).bind(id, status, TEST_FUTURE, dealType).run();
  const statusOf = async (id: string) =>
    (await t.db.prepare("SELECT status FROM transfer_listings WHERE id = ?").bind(id).first<{ status: string }>())?.status;

  beforeEach(async () => {
    await t.reset();
    await insertTestPlayer(t.db, { id: "star", teamId: "seller-a" });
  });

  it("vlastní aktivní inzerát stáhne a žádosti o hostování z něj odmítne", async () => {
    await listing("l-active", "active", "loan");
    await insertTestOffer(t.db, { id: "loan-request", playerId: "star", from: "buyer-a", to: "seller-a", amount: 0, offerType: "loan", loanDuration: 30 });
    await t.db.prepare("UPDATE transfer_offers SET listing_id = 'l-active' WHERE id = 'loan-request'").run();

    expect(await withdrawListing(t.env, "seller-a", "l-active")).toEqual({ ok: true });
    expect(await statusOf("l-active")).toBe("withdrawn");
    expect(await t.db.prepare("SELECT status FROM transfer_offers WHERE id = 'loan-request'").first()).toEqual({ status: "rejected" });
  });

  it("prodaný ani propadlý inzerát nepřepíše a vrátí 404", async () => {
    await listing("l-sold", "sold");
    await listing("l-expired", "expired");
    for (const id of ["l-sold", "l-expired"]) {
      expect(await withdrawListing(t.env, "seller-a", id)).toMatchObject({ ok: false, status: 404 });
    }
    expect(await statusOf("l-sold")).toBe("sold");
    expect(await statusOf("l-expired")).toBe("expired");
  });

  it("cizí inzerát nestáhne, vrátí 404 a jeho žádosti nechá být", async () => {
    await listing("l-foreign", "active", "loan");
    await insertTestOffer(t.db, { id: "loan-request", playerId: "star", from: "third-a", to: "seller-a", amount: 0, offerType: "loan", loanDuration: 30 });
    await t.db.prepare("UPDATE transfer_offers SET listing_id = 'l-foreign' WHERE id = 'loan-request'").run();

    expect(await withdrawListing(t.env, "buyer-a", "l-foreign")).toMatchObject({ ok: false, status: 404 });
    expect(await statusOf("l-foreign")).toBe("active");
    expect(await t.db.prepare("SELECT status FROM transfer_offers WHERE id = 'loan-request'").first()).toEqual({ status: "pending" });
  });

  it("neexistující inzerát vrátí 404", async () => {
    expect(await withdrawListing(t.env, "seller-a", "nothing")).toMatchObject({ ok: false, status: 404 });
  });

  it("inzerát klubu jde stáhnout i přes id jeho U21", async () => {
    await listing("l-club", "active");
    expect(await withdrawListing(t.env, "seller-u21", "l-club")).toEqual({ ok: true });
    expect(await statusOf("l-club")).toBe("withdrawn");
  });
});
