import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { Miniflare } from "miniflare";
import { offerRetryBlock } from "./offer-cooldown";

let miniflare: Miniflare;
let db: D1Database;

const NOW = new Date("2026-10-24T10:00:00.000Z");

beforeAll(async () => {
  miniflare = new Miniflare({
    modules: true,
    script: "export default { fetch() { return new Response('ok'); } }",
    d1Databases: ["DB"],
  });
  db = await miniflare.getD1Database("DB");
  for (const sql of [
    "CREATE TABLE teams (id TEXT PRIMARY KEY, name TEXT NOT NULL, parent_team_id TEXT)",
    `CREATE TABLE transfer_offers (
      id TEXT PRIMARY KEY, player_id TEXT NOT NULL, from_team_id TEXT NOT NULL, to_team_id TEXT NOT NULL,
      offer_amount INTEGER NOT NULL DEFAULT 1000, status TEXT NOT NULL, last_action_by TEXT,
      expires_at TEXT NOT NULL DEFAULT '2026-10-30T00:00:00Z', resolved_at TEXT)`,
    `CREATE TABLE transfer_offer_events (
      id TEXT PRIMARY KEY, offer_id TEXT NOT NULL, team_id TEXT NOT NULL, event_type TEXT NOT NULL,
      amount INTEGER, message TEXT, created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')))`,
    `INSERT INTO teams VALUES ('buyer', 'FK Kupec', NULL), ('buyer-u21', 'FK Kupec U21', 'buyer'),
      ('seller', 'SK Prodej', NULL), ('other', 'TJ Jiný', NULL)`,
  ]) await db.prepare(sql).run();
});

afterAll(async () => {
  await miniflare.dispose();
});

beforeEach(async () => {
  await db.prepare("DELETE FROM transfer_offers").run();
  await db.prepare("DELETE FROM transfer_offer_events").run();
});

async function closedOffer(id: string, o: {
  status: "rejected" | "expired" | "withdrawn";
  resolvedAt: string;
  from?: string;
  lastActionBy?: string | null;
  withdrawnBy?: string;
}) {
  await db.prepare(
    "INSERT INTO transfer_offers (id, player_id, from_team_id, to_team_id, status, last_action_by, resolved_at) VALUES (?, 'p1', ?, 'seller', ?, ?, ?)",
  ).bind(id, o.from ?? "buyer", o.status, o.lastActionBy === undefined ? (o.from ?? "buyer") : o.lastActionBy, o.resolvedAt).run();
  if (o.withdrawnBy) {
    await db.prepare(
      "INSERT INTO transfer_offer_events (id, offer_id, team_id, event_type, created_at) VALUES (?, ?, ?, 'withdraw', ?)",
    ).bind(`${id}-w`, id, o.withdrawnBy, o.resolvedAt).run();
  }
}

describe("offerRetryBlock — kdy smí kupec na stejného hráče nabídnout znovu", () => {
  it("kupec, který nabídku sám stáhl, může nabídnout hned", async () => {
    await closedOffer("o1", { status: "withdrawn", resolvedAt: "2026-10-23T09:00:00Z", withdrawnBy: "buyer" });
    expect(await offerRetryBlock(db, "p1", "buyer", NOW)).toBeNull();
  });

  it("odmítnutí blokuje deset dní od vyřízení", async () => {
    await closedOffer("o1", { status: "rejected", resolvedAt: "2026-10-21T10:00:00Z" });
    expect(await offerRetryBlock(db, "p1", "buyer", NOW)).toEqual({ daysLeft: 7, reason: "rejected" });
  });

  it("ukončení jednání prodávajícím blokuje stejně jako odmítnutí", async () => {
    await closedOffer("o1", { status: "withdrawn", resolvedAt: "2026-10-23T10:00:00Z", withdrawnBy: "seller", lastActionBy: "buyer" });
    expect(await offerRetryBlock(db, "p1", "buyer", NOW)).toEqual({ daysLeft: 9, reason: "ended_by_seller" });
  });

  it("propadnutí, na které neodpověděl prodávající, blokuje", async () => {
    await closedOffer("o1", { status: "expired", resolvedAt: "2026-10-20T10:00:00Z", lastActionBy: "buyer" });
    expect(await offerRetryBlock(db, "p1", "buyer", NOW)).toEqual({ daysLeft: 6, reason: "seller_silent" });
  });

  it("propadnutí protinávrhu, na který neodpověděl kupec, neblokuje", async () => {
    await closedOffer("o1", { status: "expired", resolvedAt: "2026-10-20T10:00:00Z", lastActionBy: "seller" });
    expect(await offerRetryBlock(db, "p1", "buyer", NOW)).toBeNull();
  });

  it("systémový úklid bez záznamu o stažení neblokuje", async () => {
    await closedOffer("o1", { status: "withdrawn", resolvedAt: "2026-10-23T09:00:00Z", lastActionBy: "seller" });
    expect(await offerRetryBlock(db, "p1", "buyer", NOW)).toBeNull();
  });

  it("po deseti dnech blokace končí", async () => {
    await closedOffer("o1", { status: "rejected", resolvedAt: "2026-10-14T09:00:00Z" });
    expect(await offerRetryBlock(db, "p1", "buyer", NOW)).toBeNull();
  });

  it("poslední den blokace ukáže jeden den, ne nula", async () => {
    await closedOffer("o1", { status: "rejected", resolvedAt: "2026-10-14T11:00:00Z" });
    expect(await offerRetryBlock(db, "p1", "buyer", NOW)).toEqual({ daysLeft: 1, reason: "rejected" });
  });

  it("odmítnutá nabídka za U21 blokuje celý klub", async () => {
    await closedOffer("o1", { status: "rejected", resolvedAt: "2026-10-22T10:00:00Z", from: "buyer-u21" });
    expect(await offerRetryBlock(db, "p1", "buyer", NOW)).toEqual({ daysLeft: 8, reason: "rejected" });
  });

  it("poslední tah U21 kupce se u propadnutí počítá jako tah kupce", async () => {
    await closedOffer("o1", { status: "expired", resolvedAt: "2026-10-22T10:00:00Z", from: "buyer-u21", lastActionBy: "buyer-u21" });
    expect(await offerRetryBlock(db, "p1", "buyer", NOW)).toEqual({ daysLeft: 8, reason: "seller_silent" });
  });

  it("odmítnutí jiného klubu kupce neblokuje", async () => {
    await closedOffer("o1", { status: "rejected", resolvedAt: "2026-10-23T10:00:00Z", from: "other" });
    expect(await offerRetryBlock(db, "p1", "buyer", NOW)).toBeNull();
  });

  it("rozhoduje nejnovější blokující konec", async () => {
    await closedOffer("o1", { status: "rejected", resolvedAt: "2026-10-16T10:00:00Z" });
    await closedOffer("o2", { status: "withdrawn", resolvedAt: "2026-10-23T10:00:00Z", withdrawnBy: "seller", lastActionBy: "buyer" });
    await closedOffer("o3", { status: "withdrawn", resolvedAt: "2026-10-24T08:00:00Z", withdrawnBy: "buyer" });
    expect(await offerRetryBlock(db, "p1", "buyer", NOW)).toEqual({ daysLeft: 9, reason: "ended_by_seller" });
  });

  it("mlčení AI klubu (výpadek, režim nanečisto) kupce neblokuje, odmítnutí AI ano", async () => {
    await db.prepare("ALTER TABLE teams ADD COLUMN user_id TEXT").run();
    await db.prepare("INSERT INTO teams (id, name, parent_team_id, user_id) VALUES ('ai-seller', 'Sokol AI', NULL, 'ai')").run();
    await db.prepare(
      "INSERT INTO transfer_offers (id, player_id, from_team_id, to_team_id, status, last_action_by, resolved_at) VALUES ('o1', 'p1', 'buyer', 'ai-seller', 'expired', 'buyer', '2026-10-23T10:00:00Z')",
    ).run();
    expect(await offerRetryBlock(db, "p1", "buyer", NOW)).toBeNull();
    await db.prepare(
      "INSERT INTO transfer_offers (id, player_id, from_team_id, to_team_id, status, last_action_by, resolved_at) VALUES ('o2', 'p1', 'buyer', 'ai-seller', 'rejected', 'ai-seller', '2026-10-23T11:00:00Z')",
    ).run();
    expect((await offerRetryBlock(db, "p1", "buyer", NOW))?.reason).toBe("rejected");
  });
});
