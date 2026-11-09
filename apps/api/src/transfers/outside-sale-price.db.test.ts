/**
 * Kluby mimo hru: od třetího prodeje v sezóně nabízejí míň (o 15 % za každý další, nejníž
 * 60 % tržní hodnoty).
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { marketValue } from "@okresni-masina/shared";
import { createRng } from "../generators/rng";
import { budgetOf, createTransferTestDb, insertTestOffer, insertTestPlayer, type TransferTestDb } from "../test-support/transfer-db";
import { acceptTransferOffer } from "../services/transfer-actions";
import { calcOfferPrice, OUTSIDE_SALES_UNKNOWN, outsideSaleCeiling, outsideSalePrice, outsideSalesThisSeason } from "./virtual-teams";

vi.mock("./transfer-news", () => ({ createTransferNews: async () => undefined }));
// Odchod hráče ze hry (archiv, úklid vazeb) má vlastní testy; tady stačí, že hráč zmizí.
vi.mock("./remove-player", () => ({
  removePlayer: async (db: D1Database, playerId: string) => {
    const row = await db.prepare("SELECT first_name, last_name, age, position, overall_rating FROM players WHERE id = ?").bind(playerId)
      .first<{ first_name: string; last_name: string; age: number; position: string; overall_rating: number }>();
    if (!row) return { ok: false };
    await db.prepare("DELETE FROM players WHERE id = ?").bind(playerId).run();
    return { ok: true, player: { id: playerId, firstName: row.first_name, lastName: row.last_name, age: row.age, position: row.position, overallRating: row.overall_rating } };
  },
}));
vi.mock("../community/notifications", () => ({ createNotification: async () => undefined }));

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

  it("pro cenu nové nabídky počítá i čekající nabídky, pro přijetí jen už přijaté", async () => {
    await sale("p1", "seller-a", "virtual_ai", "accepted", "2026-10-05T12:00:00Z");
    await insertTestOffer(t.db, { id: "p2", playerId: "p2", from: "virtual_ai", to: "seller-a", amount: 10_000 });
    await insertTestOffer(t.db, { id: "p3", playerId: "p3", from: "virtual_ai", to: "seller-u21", amount: 10_000, status: "countered" });

    expect(await outsideSalesThisSeason(t.db, "seller-a")).toBe(3);
    expect(await outsideSalesThisSeason(t.db, "seller-a", { pending: false })).toBe(1);
    expect(await outsideSalesThisSeason(t.db, "seller-a", { pending: false, exceptOfferId: "p1" })).toBe(0);
  });

  it("když se počet nepodaří zjistit, vrátí tolik prodejů, že cena spadne na podlahu", async () => {
    const failing = {
      prepare: () => ({ bind: () => ({ first: async () => { throw new Error("D1 je dole"); } }) }),
    } as unknown as D1Database;
    const unknown = await outsideSalesThisSeason(failing, "seller-a");
    expect(unknown).toBe(OUTSIDE_SALES_UNKNOWN);
    const value = marketValue(55, 24, "MID");
    expect(calcOfferPrice(55, 24, "MID", createRng(3), false, unknown)).toBe(Math.round(value * 0.6 / 100) * 100);
  });
});

describe("přijetí nabídek klubů mimo hru, které čekaly naráz", () => {
  let t: TransferTestDb;
  const VALUE = marketValue(55, 24, "MID");
  const FULL = Math.round(VALUE * 1.2 / 100) * 100;

  beforeAll(async () => { t = await createTransferTestDb(); });
  afterAll(async () => { await t.dispose(); });

  beforeEach(async () => {
    await t.reset();
    await t.db.prepare("UPDATE seasons SET created_at = '2026-10-01 10:00:00'").run();
    // Čtyři nabídky za plnou cenu vedle sebe (stav z doby před opravou, nebo souběh při vzniku).
    for (const id of ["s1", "s2", "s3", "s4"]) {
      await insertTestPlayer(t.db, { id, teamId: "seller-a" });
      await insertTestOffer(t.db, { id: `o-${id}`, playerId: id, from: "virtual_ai", to: "seller-a", amount: FULL, lastActionBy: null });
      await t.db.prepare("UPDATE transfer_offers SET virtual_team_data = ? WHERE id = ?")
        .bind(JSON.stringify({ name: "SK Strakonice 1908", city: "Strakonice", rating: 60 }), `o-${id}`).run();
    }
  });

  it("první dvě projdou za nabídnutou cenu, třetí a čtvrtá jen do stropu po slevě", async () => {
    const paid: number[] = [];
    for (const id of ["s1", "s2", "s3", "s4"]) {
      const before = await budgetOf(t.db, "seller-a");
      const res = await acceptTransferOffer(t.env, "seller-a", `o-${id}`);
      expect(res, `přijetí ${id}`).toMatchObject({ ok: true });
      paid.push(await budgetOf(t.db, "seller-a") - before);
    }
    expect(paid[0]).toBe(FULL);
    expect(paid[1]).toBe(FULL);
    expect(paid[2]).toBe(outsideSaleCeiling(55, 24, "MID", false, 2));
    expect(paid[3]).toBe(outsideSaleCeiling(55, 24, "MID", false, 3));
    expect(paid[2]).toBeLessThan(FULL);
    expect(paid[3]).toBeLessThan(paid[2]);
    // Nabídka i účetnictví nesou částku, která se opravdu zaplatila.
    expect(await t.db.prepare("SELECT offer_amount, status FROM transfer_offers WHERE id = 'o-s4'").first())
      .toEqual({ offer_amount: paid[3], status: "accepted" });
    const income = await t.db.prepare("SELECT SUM(amount) AS total FROM transactions WHERE team_id = 'seller-a' AND type = 'transfer_income'").first<{ total: number }>();
    expect(income?.total).toBe(paid.reduce((a, b) => a + b, 0));
  });
});
