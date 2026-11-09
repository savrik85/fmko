/**
 * Admin přehled: přestupy mezi lidskými kluby za cenu daleko od tržní hodnoty.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { marketValue } from "@okresni-masina/shared";
import { createTransferTestDb, insertTestOffer, insertTestPlayer, type TransferTestDb } from "../test-support/transfer-db";
import { isOffPrice, offPriceTransfers } from "./club-links";

vi.setConfig({ testTimeout: 30_000, hookTimeout: 60_000 });

const NOW = new Date("2026-11-09T12:00:00.000Z");
const VALUE = marketValue(55, 24, "MID");

describe("isOffPrice", () => {
  it("pásmo třetina až trojnásobek je v pořádku, hranice včetně", () => {
    expect(isOffPrice(30_000, 30_000)).toBe(false);
    expect(isOffPrice(90_000, 30_000)).toBe(false);
    expect(isOffPrice(10_000, 30_000)).toBe(false);
  });

  it("nad trojnásobek a pod třetinu je podezřelé", () => {
    expect(isOffPrice(90_001, 30_000)).toBe(true);
    expect(isOffPrice(9_999, 30_000)).toBe(true);
    expect(isOffPrice(0, 30_000)).toBe(true);
  });
});

describe("offPriceTransfers", () => {
  let t: TransferTestDb;

  beforeAll(async () => { t = await createTransferTestDb(); });
  afterAll(async () => { await t.dispose(); });

  beforeEach(async () => {
    await t.reset();
    await t.db.prepare(
      "INSERT INTO teams (id, user_id, team_type, name, budget, league_id, village_id) VALUES ('ai-club', 'ai', 'senior', 'AI klub', 0, 'league-a', 'village')",
    ).run();
  });

  /** Přijatý přestup hráče s hodnocením 55 (MID, 24 let). */
  async function deal(id: string, opts: {
    amount: number; from?: string; to?: string; resolvedAt?: string; status?: string; offerType?: "transfer" | "loan";
  }) {
    await insertTestPlayer(t.db, { id: `p-${id}`, teamId: opts.from ?? "buyer-a" });
    await insertTestOffer(t.db, {
      id, playerId: `p-${id}`, from: opts.from ?? "buyer-a", to: opts.to ?? "seller-a", amount: opts.amount,
      status: opts.status ?? "accepted", offerType: opts.offerType ?? "transfer", loanDuration: opts.offerType === "loan" ? 30 : null,
    });
    await t.db.prepare("UPDATE transfer_offers SET resolved_at = ? WHERE id = ?").bind(opts.resolvedAt ?? "2026-11-01T10:00:00Z", id).run();
  }

  it("vrátí přestup nad trojnásobek i pod třetinu tržní hodnoty, běžnou cenu ne", async () => {
    await deal("high", { amount: VALUE * 3 + 1000 });
    await deal("low", { amount: Math.floor(VALUE / 3) - 1000 });
    await deal("fair", { amount: VALUE });
    await deal("edge-high", { amount: VALUE * 3 });

    const found = await offPriceTransfers(t.db, NOW);
    expect(found.map((x) => x.offerId).sort()).toEqual(["high", "low"]);
    const high = found.find((x) => x.offerId === "high");
    expect(high).toMatchObject({
      paid: VALUE * 3 + 1000, marketValue: VALUE, swapValue: 0, linked: false,
      buyer: { teamId: "buyer-a", name: "Kupující" }, seller: { teamId: "seller-a", name: "Prodávající" },
    });
    expect(high?.ratio).toBeGreaterThan(3);
  });

  it("nebere hostování, nepřijaté nabídky, obchody s AI klubem ani starší než 30 dní", async () => {
    await deal("loan", { amount: 0, offerType: "loan" });
    await deal("rejected", { amount: 1, status: "rejected" });
    await deal("ai-seller", { amount: 1, to: "ai-club" });
    await deal("ai-buyer", { amount: 1, from: "ai-club" });
    await deal("old", { amount: 1, resolvedAt: "2026-10-01T10:00:00Z" });
    await deal("recent", { amount: 1, resolvedAt: "2026-10-11T10:00:00Z" });

    expect((await offPriceTransfers(t.db, NOW)).map((x) => x.offerId)).toEqual(["recent"]);
  });

  it("výměna hráčů za nulový doplatek není podezřelá, hodnota hráčů se počítá do ceny", async () => {
    await deal("swap", { amount: 0 });
    await insertTestPlayer(t.db, { id: "swap-player", teamId: "seller-a" });
    await t.db.prepare("INSERT INTO transfer_offer_swap_players (offer_id, player_id, sort_order) VALUES ('swap', 'swap-player', 0)").run();

    expect(await offPriceTransfers(t.db, NOW)).toEqual([]);
  });

  it("nabídka přes U21 se počítá na kluby a označí propojené", async () => {
    await deal("u21", { amount: 1, from: "buyer-u21", to: "seller-u21" });
    await t.db.prepare("INSERT INTO club_links (team_id, group_id) VALUES ('buyer-a', 'g1'), ('seller-a', 'g1')").run();

    const found = await offPriceTransfers(t.db, NOW);
    expect(found).toHaveLength(1);
    expect(found[0]).toMatchObject({ buyer: { teamId: "buyer-a" }, seller: { teamId: "seller-a" }, linked: true });
  });
});
