/**
 * Kluby mimo hru: od třetího prodeje v sezóně nabízejí míň (o 15 % za každý další, nejníž
 * 60 % tržní hodnoty).
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { marketValue } from "@okresni-masina/shared";
import { createRng } from "../generators/rng";
import { createTransferTestDb, insertTestOffer, insertTestPlayer, type TransferTestDb } from "../test-support/transfer-db";
import { calcOfferPrice, outsideSalePrice, outsideSalesThisSeason } from "./virtual-teams";

vi.setConfig({ testTimeout: 30_000, hookTimeout: 60_000 });

describe("outsideSalePrice", () => {
  it("první dva prodeje v sezóně jsou za plnou cenu", () => {
    expect(outsideSalePrice(12_000, 10_000, 0)).toBe(12_000);
    expect(outsideSalePrice(12_000, 10_000, 1)).toBe(12_000);
  });

  it("třetí prodej o 15 %, čtvrtý o 30 %, pátý o 45 % níž", () => {
    expect(outsideSalePrice(12_000, 10_000, 2)).toBeCloseTo(10_200);
    expect(outsideSalePrice(12_000, 10_000, 3)).toBeCloseTo(8_400);
    expect(outsideSalePrice(12_000, 10_000, 4)).toBeCloseTo(6_600);
  });

  it("nikdy neklesne pod 60 % tržní hodnoty", () => {
    expect(outsideSalePrice(12_000, 10_000, 5)).toBe(6_000);
    expect(outsideSalePrice(12_000, 10_000, 50)).toBe(6_000);
    // Nabídka přesně za tržní hodnotu: 4. prodej by vyšel na 70 %, 5. už drží podlaha.
    expect(outsideSalePrice(10_000, 10_000, 3)).toBeCloseTo(7_000);
    expect(outsideSalePrice(10_000, 10_000, 4)).toBe(6_000);
  });
});

describe("calcOfferPrice s předchozími prodeji", () => {
  const value = marketValue(55, 24, "MID");

  it("bez předchozích prodejů zůstává 100 až 125 % tržní hodnoty", () => {
    for (let seed = 1; seed <= 20; seed++) {
      const price = calcOfferPrice(55, 24, "MID", createRng(seed));
      expect(price).toBeGreaterThanOrEqual(Math.floor(value / 100) * 100);
      expect(price).toBeLessThanOrEqual(Math.ceil(value * 1.25 / 100) * 100);
      // Druhý prodej v sezóně (jeden předchozí) vyjde stejně jako první.
      expect(calcOfferPrice(55, 24, "MID", createRng(seed), false, 1)).toBe(price);
    }
  });

  it("třetí prodej je o 15 % levnější než stejná nabídka bez slevy", () => {
    for (let seed = 1; seed <= 20; seed++) {
      const full = calcOfferPrice(55, 24, "MID", createRng(seed));
      const third = calcOfferPrice(55, 24, "MID", createRng(seed), false, 2);
      expect(third).toBeLessThan(full);
      expect(Math.abs(third - full * 0.85)).toBeLessThanOrEqual(100);
    }
  });

  it("po mnoha prodejích platí klub 60 % tržní hodnoty, i německý", () => {
    const floor = Math.round(value * 0.6 / 100) * 100;
    expect(calcOfferPrice(55, 24, "MID", createRng(7), false, 30)).toBe(floor);
    expect(calcOfferPrice(55, 24, "MID", createRng(7), true, 30)).toBe(floor);
  });
});

describe("outsideSalesThisSeason", () => {
  let t: TransferTestDb;

  beforeAll(async () => { t = await createTransferTestDb(); });
  afterAll(async () => { await t.dispose(); });

  beforeEach(async () => {
    await t.reset();
    await t.db.prepare("UPDATE seasons SET created_at = '2026-10-01 10:00:00'").run();
    for (const id of ["p1", "p2", "p3", "p4", "p5", "p6"]) await insertTestPlayer(t.db, { id, teamId: "seller-a" });
  });

  const sale = async (id: string, to: string, from: string, status: string, resolvedAt: string) => {
    await insertTestOffer(t.db, { id, playerId: id, from, to, amount: 10_000, status });
    await t.db.prepare("UPDATE transfer_offers SET resolved_at = ? WHERE id = ?").bind(resolvedAt, id).run();
  };

  it("počítá jen přijaté nabídky klubů mimo hru z běžící sezóny, za áčko i U21 dohromady", async () => {
    await sale("p1", "seller-a", "virtual_ai", "accepted", "2026-10-05T12:00:00Z");
    await sale("p2", "seller-u21", "virtual_ai", "accepted", "2026-10-06T12:00:00Z");
    // Nepočítá se: minulá sezóna, odmítnutá nabídka, prodej klubu ve hře, prodej jiného klubu.
    await sale("p3", "seller-a", "virtual_ai", "accepted", "2026-09-20T12:00:00Z");
    await sale("p4", "seller-a", "virtual_ai", "rejected", "2026-10-07T12:00:00Z");
    await sale("p5", "seller-a", "buyer-a", "accepted", "2026-10-07T12:00:00Z");
    await sale("p6", "third-a", "virtual_ai", "accepted", "2026-10-07T12:00:00Z");

    expect(await outsideSalesThisSeason(t.db, "seller-a")).toBe(2);
    expect(await outsideSalesThisSeason(t.db, "seller-u21")).toBe(2);
    expect(await outsideSalesThisSeason(t.db, "third-a")).toBe(1);
    expect(await outsideSalesThisSeason(t.db, "buyer-a")).toBe(0);
  });
});
