import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { Miniflare } from "miniflare";
import type { Bindings } from "../index";

const sideEffects = vi.hoisted(() => ({
  applyOfferRejectionImpact: vi.fn(async (_db: unknown, _offer: { id: string }, _trigger: string, _env: unknown) => undefined),
  sendSystemSMS: vi.fn(async (_db: unknown, _teamId: string, _role: string, _body: string) => undefined),
}));

vi.mock("./offer-rejection-impact", () => ({ applyOfferRejectionImpact: sideEffects.applyOfferRejectionImpact }));
vi.mock("../messaging/system-sms", () => ({ sendSystemSMS: sideEffects.sendSystemSMS }));

import { expireIdleOffers } from "./offer-expiry";
import { OFFER_REPLY_DAYS, offerReplyDeadline } from "./offer-deadline";

let miniflare: Miniflare;
let db: D1Database;
let env: Bindings;

const NOW = new Date("2026-10-11T10:00:00.000Z");
const PAST = "2026-10-10T09:00:00.000Z";
const FUTURE = "2026-10-12T09:00:00.000Z";

beforeAll(async () => {
  miniflare = new Miniflare({
    modules: true,
    script: "export default { fetch() { return new Response('ok'); } }",
    d1Databases: ["DB"],
  });
  db = await miniflare.getD1Database("DB");
  for (const sql of [
    "CREATE TABLE teams (id TEXT PRIMARY KEY, name TEXT NOT NULL, parent_team_id TEXT)",
    "CREATE TABLE players (id TEXT PRIMARY KEY, first_name TEXT NOT NULL, last_name TEXT NOT NULL)",
    `CREATE TABLE transfer_offers (
      id TEXT PRIMARY KEY, player_id TEXT NOT NULL, from_team_id TEXT NOT NULL, to_team_id TEXT NOT NULL,
      offer_amount INTEGER NOT NULL, counter_amount INTEGER, status TEXT NOT NULL, last_action_by TEXT,
      offer_type TEXT, virtual_team_data TEXT, expires_at TEXT NOT NULL, resolved_at TEXT)`,
    `INSERT INTO teams VALUES ('buyer', 'FK Kupec', NULL), ('seller', 'SK Prodej', NULL), ('seller-u21', 'SK Prodej U21', 'seller')`,
    `INSERT INTO players VALUES ('p1', 'Karel', 'Chtivý')`,
  ]) await db.prepare(sql).run();
  env = { DB: db } as unknown as Bindings;
});

afterAll(async () => {
  await miniflare.dispose();
});

beforeEach(async () => {
  sideEffects.applyOfferRejectionImpact.mockClear();
  sideEffects.sendSystemSMS.mockClear();
  await db.prepare("DELETE FROM transfer_offers").run();
});

async function addOffer(id: string, o: { status: string; lastActionBy: string | null; expiresAt: string; from?: string; to?: string; virtual?: string }) {
  await db.prepare(
    `INSERT INTO transfer_offers (id, player_id, from_team_id, to_team_id, offer_amount, status, last_action_by, offer_type, virtual_team_data, expires_at)
     VALUES (?, 'p1', ?, ?, 10000, ?, ?, 'transfer', ?, ?)`,
  ).bind(id, o.from ?? "buyer", o.to ?? "seller", o.status, o.lastActionBy, o.virtual ?? null, o.expiresAt).run();
}

async function statusOf(id: string) {
  return (await db.prepare("SELECT status FROM transfer_offers WHERE id = ?").bind(id).first<{ status: string }>())?.status;
}

const impactedOffers = () => sideEffects.applyOfferRejectionImpact.mock.calls.map((call) => call[1].id);
const smsTo = (teamId: string) => sideEffects.sendSystemSMS.mock.calls.filter((call) => call[1] === teamId).map((call) => call[3]);

describe("propadnutí nabídek bez odpovědi", () => {
  it("lhůta je tři dny od tahu", () => {
    expect(OFFER_REPLY_DAYS).toBe(3);
    expect(offerReplyDeadline(NOW)).toBe("2026-10-14T10:00:00.000Z");
  });

  it("prodávající mlčí: nabídka propadne a hráč to bere jako odmítnutí", async () => {
    await addOffer("silent-seller", { status: "pending", lastActionBy: "buyer", expiresAt: PAST });
    expect(await expireIdleOffers(env, NOW)).toBe(1);
    expect(await statusOf("silent-seller")).toBe("expired");
    expect(impactedOffers()).toEqual(["silent-seller"]);
    expect(sideEffects.applyOfferRejectionImpact.mock.calls[0][2]).toBe("expire");
    expect(smsTo("seller")[0]).toContain("jsi neodpověděl");
    expect(smsTo("buyer")[0]).toContain("SK Prodej na tvou nabídku");
  });

  it("prodávající mlčí i po protinávrhu kupce", async () => {
    await addOffer("buyer-countered", { status: "countered", lastActionBy: "buyer", expiresAt: PAST });
    await expireIdleOffers(env, NOW);
    expect(await statusOf("buyer-countered")).toBe("expired");
    expect(impactedOffers()).toEqual(["buyer-countered"]);
  });

  it("kupec mlčí po protinávrhu prodávajícího: propadne bez dopadu na hráče", async () => {
    await addOffer("silent-buyer", { status: "countered", lastActionBy: "seller", expiresAt: PAST });
    await expireIdleOffers(env, NOW);
    expect(await statusOf("silent-buyer")).toBe("expired");
    expect(impactedOffers()).toEqual([]);
    expect(smsTo("buyer")[0]).toContain("Na protinabídku od SK Prodej");
  });

  it("hráč v U21: na tahu je mateřský klub", async () => {
    await addOffer("u21", { status: "pending", lastActionBy: "buyer", expiresAt: PAST, to: "seller-u21" });
    await expireIdleOffers(env, NOW);
    expect(impactedOffers()).toEqual(["u21"]);
    expect(smsTo("seller")).toHaveLength(1);
  });

  it("nabídka cizího klubu: dopad ano, cizí klub SMS nedostává", async () => {
    await addOffer("virtual", {
      status: "pending", lastActionBy: null, expiresAt: PAST, from: "virtual_ai", virtual: '{"name":"Slavoj Výšlap"}',
    });
    await expireIdleOffers(env, NOW);
    expect(impactedOffers()).toEqual(["virtual"]);
    expect(smsTo("seller")[0]).toContain("Slavoj Výšlap");
    expect(smsTo("virtual_ai")).toEqual([]);
  });

  it("nabídka ve lhůtě zůstává", async () => {
    await addOffer("fresh", { status: "pending", lastActionBy: "buyer", expiresAt: FUTURE });
    expect(await expireIdleOffers(env, NOW)).toBe(0);
    expect(await statusOf("fresh")).toBe("pending");
    expect(impactedOffers()).toEqual([]);
  });
});
