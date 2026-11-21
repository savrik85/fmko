/**
 * Dražba hráčů z opuštěných klubů nad sdílenou testovací DB přestupů (Miniflare):
 * příhoz pod minimum, prodloužení v posledních minutách, souběžný příhoz, vítěz bez peněz
 * → bere další, neprodaný hráč zůstane volný, dvojí uzavření nic nezdvojí, hráč v dražbě
 * není na běžném trhu a podepsat ho nejde.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { createTransferTestDb, budgetOf, type TransferTestDb } from "../test-support/transfer-db";

vi.mock("./attach-relations", () => ({ attachNewcomerRelations: async () => 0 }));
vi.mock("../lib/coach-relation", () => ({ initNewcomerCoachRelation: async () => undefined }));
vi.setConfig({ testTimeout: 30_000, hookTimeout: 60_000 });

import { BidError, closeDueAuctions, extendedEnd, minNextBid, placeBid, startPrice } from "./auctions";
import { findVisibleFreeAgents } from "./market-visibility";
import { signFreeAgent } from "../services/transfer-actions";

let t: TransferTestDb;
const NOW = new Date("2026-12-01T10:00:00Z");
const END = "2026-12-03T10:00:00.000Z";

beforeAll(async () => {
  t = await createTransferTestDb();
  const sql = readFileSync(new URL("../../migrations/0328_player_auctions.sql", import.meta.url), "utf8").replace(/--.*$/gm, "");
  for (const s of sql.split(";").map((x) => x.trim()).filter(Boolean)) await t.db.prepare(s).run();
});
afterAll(async () => { await t.dispose(); });

beforeEach(async () => {
  await t.reset();
  await t.db.prepare("DELETE FROM player_auctions").run();
  await t.db.prepare("DELETE FROM auction_bids").run();
  await t.db.batch([
    t.db.prepare(`INSERT INTO free_agents (id, district, first_name, last_name, age, position, overall_rating, weekly_wage, expires_at, source)
      VALUES ('fa1', 'Test', 'Karel', 'Dražený', 26, 'FWD', 60, 400, '2099-01-01T00:00:00Z', 'released')`),
    t.db.prepare(`INSERT INTO player_auctions (id, free_agent_id, source_team_id, source_team_name, district, player_name, position, age, start_price, ends_at)
      VALUES ('auc1', 'fa1', 'old-ai', 'AI Husinec', 'Test', 'Karel Dražený', 'FWD', 26, 10000, ?)`).bind(END),
  ]);
});

describe("dražba: počty", () => {
  it("start je polovina tržní ceny na stovky, další příhoz o 10 % víc", () => {
    expect(startPrice(60, 26, "FWD") % 100).toBe(0);
    expect(minNextBid({ start_price: 10000, current_bid: null })).toBe(10000);
    expect(minNextBid({ start_price: 10000, current_bid: 10000 })).toBe(11000);
    expect(minNextBid({ start_price: 10000, current_bid: 12345 })).toBe(13600);
  });

  it("příhoz v posledních 10 minutách prodlouží, dřív ne", () => {
    expect(extendedEnd(END, NOW)).toBe(END);
    expect(extendedEnd(END, new Date("2026-12-03T09:55:00Z"))).toBe("2026-12-03T10:05:00.000Z");
  });
});

describe("dražba v databázi", () => {
  it("pod minimum odmítnuto, vlastní nejvyšší příhoz nejde přehodit, bez peněz nejde", async () => {
    await expect(placeBid(t.db, "buyer-a", "auc1", 9000, NOW)).rejects.toThrow("Nejmenší příhoz je teď 10 000 Kč");
    await placeBid(t.db, "buyer-a", "auc1", 10000, NOW);
    await expect(placeBid(t.db, "buyer-a", "auc1", 20000, NOW)).rejects.toThrow("už je váš");
    await expect(placeBid(t.db, "third-a", "auc1", 10500, NOW)).rejects.toThrow("11 000 Kč");
    await t.db.prepare("UPDATE teams SET budget = 5000 WHERE id = 'seller-a'").run();
    await expect(placeBid(t.db, "seller-a", "auc1", 11000, NOW)).rejects.toThrow("nemáte peníze");
    await expect(placeBid(t.db, "buyer-u21", "auc1", 11000, NOW)).rejects.toThrow("jen áčko");
  });

  it("přehozený dostane SMS, příhoz po konci odmítnut", async () => {
    await placeBid(t.db, "buyer-a", "auc1", 10000, NOW);
    await placeBid(t.db, "third-a", "auc1", 11000, NOW);
    const sms = await t.db.prepare("SELECT c.team_id, m.body FROM messages m JOIN conversations c ON c.id = m.conversation_id").all<{ team_id: string; body: string }>();
    expect(sms.results).toHaveLength(1);
    expect(sms.results[0].team_id).toBe("buyer-a");
    await expect(placeBid(t.db, "buyer-a", "auc1", 20000, new Date("2026-12-03T10:00:01Z"))).rejects.toBeInstanceOf(BidError);
  });

  it("hráč v dražbě není na trhu a podepsat ho nejde", async () => {
    const visible = await findVisibleFreeAgents(t.db, { id: "buyer-a", district: "Test", userId: "user-buyer" });
    expect(visible.map((f) => f.id)).not.toContain("fa1");
    const res = await signFreeAgent(t.env, "buyer-a", "fa1", 400);
    expect(res).toMatchObject({ ok: false, status: 409 });
  });

  it("vítěz bez peněz → bere další v pořadí, platí jednou, dvojí uzavření nic nezdvojí", async () => {
    await placeBid(t.db, "third-a", "auc1", 10000, NOW);
    await placeBid(t.db, "buyer-a", "auc1", 15000, NOW);
    // Kupující mezitím utratil, nejvyšší příhoz nezaplatí.
    await t.db.prepare("UPDATE teams SET budget = 1000 WHERE id = 'buyer-a'").run();
    const after = new Date("2026-12-03T10:30:00Z");
    expect(await closeDueAuctions(t.db, after)).toEqual({ sold: 1, unsold: 0 });
    expect(await closeDueAuctions(t.db, after)).toEqual({ sold: 0, unsold: 0 });
    const a = await t.db.prepare("SELECT status, winner_team_id, sold_price FROM player_auctions WHERE id = 'auc1'").first();
    expect(a).toEqual({ status: "sold", winner_team_id: "third-a", sold_price: 10000 });
    expect(await budgetOf(t.db, "third-a")).toBe(490_000);
    expect(await budgetOf(t.db, "buyer-a")).toBe(1000);
    const player = await t.db.prepare("SELECT team_id, first_name, last_name FROM players").first();
    expect(player).toEqual({ team_id: "third-a", first_name: "Karel", last_name: "Dražený" });
    expect(await t.db.prepare("SELECT id FROM free_agents WHERE id = 'fa1'").first()).toBeNull();
    const contract = await t.db.prepare("SELECT join_type, fee FROM player_contracts").first();
    expect(contract).toEqual({ join_type: "transfer", fee: 10000 });
  });

  it("bez příhozů neprodáno a hráč zůstane volný (zase vidět na trhu)", async () => {
    expect(await closeDueAuctions(t.db, new Date("2026-12-03T10:30:00Z"))).toEqual({ sold: 0, unsold: 1 });
    const visible = await findVisibleFreeAgents(t.db, { id: "buyer-a", district: "Test", userId: "user-buyer" });
    expect(visible.map((f) => f.id)).toContain("fa1");
  });
});
