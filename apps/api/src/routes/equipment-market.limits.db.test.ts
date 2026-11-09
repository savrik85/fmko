/**
 * Bazar vybavení: strop ceny (1,5× cena nového) a zákaz obchodu mezi kluby jednoho majitele.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { Miniflare } from "miniflare";
import type { Bindings } from "../index";
import { CATEGORIES, cumulativeInvestment, getBazarPriceCap } from "../equipment/equipment-generator";
import { equipmentMarketRouter } from "./equipment-market";

vi.setConfig({ testTimeout: 30_000, hookTimeout: 60_000 });

const CATEGORY = CATEGORIES[0];
const LEVEL = 2;

describe("bazar vybavení: strop ceny a propojené kluby", () => {
  let miniflare: Miniflare;
  let db: D1Database;
  let env: Bindings;

  beforeAll(async () => {
    miniflare = new Miniflare({
      modules: true, script: "export default { fetch() { return new Response('ok'); } }",
      d1Databases: ["DB"], kvNamespaces: ["SESSION_KV", "CACHE_KV"],
    });
    db = await miniflare.getD1Database("DB");
    const sessionKv = await miniflare.getKVNamespace("SESSION_KV") as unknown as KVNamespace;
    const equipmentColumns = CATEGORIES.map((c) => `${c} INTEGER NOT NULL DEFAULT 0, ${c}_condition INTEGER NOT NULL DEFAULT 50`).join(", ");
    for (const sql of [
      "CREATE TABLE villages (id TEXT PRIMARY KEY, name TEXT, district TEXT, size TEXT)",
      "CREATE TABLE club_links (team_id TEXT PRIMARY KEY, group_id TEXT NOT NULL, note TEXT, created_at TEXT)",
      `CREATE TABLE teams (id TEXT PRIMARY KEY, user_id TEXT, parent_team_id TEXT, name TEXT, budget INTEGER NOT NULL DEFAULT 0,
        league_id TEXT, village_id TEXT, reputation INTEGER NOT NULL DEFAULT 50, game_date TEXT)`,
      `CREATE TABLE equipment (id TEXT PRIMARY KEY, team_id TEXT NOT NULL, ${equipmentColumns})`,
      `CREATE TABLE equipment_listings (id TEXT PRIMARY KEY, team_id TEXT, league_id TEXT NOT NULL, category TEXT NOT NULL, level INTEGER NOT NULL,
        condition_at_listing INTEGER NOT NULL, price INTEGER NOT NULL, status TEXT NOT NULL DEFAULT 'active', buyer_team_id TEXT, sold_price INTEGER,
        sold_condition INTEGER, expires_at TEXT, created_at TEXT DEFAULT (datetime('now')), resolved_at TEXT, is_ai_listing INTEGER NOT NULL DEFAULT 0,
        seller_name TEXT, incident_id TEXT)`,
    ]) await db.prepare(sql).run();
    for (const [token, userId, teamId] of [["owner-token", "owner", "club-one"], ["other-token", "other", "club-other"]]) {
      await sessionKv.put(`session:${token}`, JSON.stringify({ userId, email: `${userId}@test.local`, teamId, createdAt: new Date().toISOString() }));
    }
    env = { DB: db, SESSION_KV: sessionKv, CACHE_KV: await miniflare.getKVNamespace("CACHE_KV") } as unknown as Bindings;
  });

  afterAll(async () => { await miniflare.dispose(); });

  beforeEach(async () => {
    for (const table of ["teams", "equipment", "equipment_listings", "club_links", "villages"]) await db.prepare(`DELETE FROM ${table}`).run();
    await db.batch([
      db.prepare("INSERT INTO villages (id, name, district, size) VALUES ('village', 'Testov', 'Test', 'village')"),
      // Dva kluby jednoho majitele a jeden cizí, všechny ve stejné soutěži.
      db.prepare(`INSERT INTO teams (id, user_id, name, budget, league_id, village_id) VALUES
        ('club-one', 'owner', 'První', 5000000, 'league', 'village'),
        ('club-two', 'owner', 'Druhý', 5000000, 'league', 'village'),
        ('club-other', 'other', 'Cizí', 5000000, 'league', 'village')`),
      db.prepare(`INSERT INTO equipment (id, team_id, ${CATEGORY}, ${CATEGORY}_condition) VALUES
        ('eq-one', 'club-one', 0, 50), ('eq-two', 'club-two', ${LEVEL}, 100), ('eq-other', 'club-other', ${LEVEL}, 100)`),
    ]);
  });

  async function call(path: string, token: string, body?: Record<string, unknown>) {
    const ctx = { waitUntil() {}, passThroughOnException() {} } as unknown as ExecutionContext;
    const res = await equipmentMarketRouter.fetch(new Request(`http://test.local${path}`, {
      method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify(body ?? {}),
    }), env, ctx);
    return { status: res.status, json: await res.json() as Record<string, unknown> };
  }

  const listing = (id: string, sellerTeamId: string, price: number) => db.prepare(
    `INSERT INTO equipment_listings (id, team_id, league_id, category, level, condition_at_listing, price, expires_at)
     VALUES (?, ?, 'league', ?, ?, 100, ?, '2099-01-01T00:00:00.000Z')`,
  ).bind(id, sellerTeamId, CATEGORY, LEVEL, price).run();
  const budget = async (teamId: string) =>
    (await db.prepare("SELECT budget FROM teams WHERE id = ?").bind(teamId).first<{ budget: number }>())?.budget;

  it("strop je jeden a půl ceny nového vybavení", () => {
    expect(getBazarPriceCap(CATEGORY, LEVEL)).toBe(Math.round(cumulativeInvestment(CATEGORY, LEVEL) * 1.5));
  });

  it("vystavit nad strop nejde, přesně na stropu ano", async () => {
    const cap = getBazarPriceCap(CATEGORY, LEVEL);
    const over = await call("/teams/club-other/equipment-market/list", "other-token", { category: CATEGORY, price: cap + 1 });
    expect(over.status).toBe(400);
    expect(String(over.json.error)).toContain("jeden a půl ceny");
    expect(await db.prepare("SELECT COUNT(*) AS n FROM equipment_listings").first()).toEqual({ n: 0 });

    const atCap = await call("/teams/club-other/equipment-market/list", "other-token", { category: CATEGORY, price: cap });
    expect(atCap.status).toBe(200);
    expect(await db.prepare("SELECT price FROM equipment_listings").first()).toEqual({ price: cap });
  });

  it("klub se stejným majitelem koupit nesmí a peníze zůstanou, kde byly", async () => {
    await listing("l-linked", "club-two", cumulativeInvestment(CATEGORY, LEVEL));
    const res = await call("/teams/club-one/equipment-market/l-linked/buy", "owner-token");
    expect(res.status).toBe(403);
    expect(String(res.json.error)).toContain("stejného majitele");
    expect(await budget("club-one")).toBe(5000000);
    expect(await budget("club-two")).toBe(5000000);
    expect(await db.prepare("SELECT status FROM equipment_listings WHERE id = 'l-linked'").first()).toEqual({ status: "active" });
  });

  it("kluby propojené adminem (club_links) spolu taky neobchodují", async () => {
    await db.prepare("INSERT INTO club_links (team_id, group_id) VALUES ('club-one', 'g1'), ('club-other', 'g1')").run();
    await listing("l-group", "club-other", cumulativeInvestment(CATEGORY, LEVEL));
    const res = await call("/teams/club-one/equipment-market/l-group/buy", "owner-token");
    expect(res.status).toBe(403);
    expect(String(res.json.error)).toContain("stejného majitele");
  });

  it("starý inzerát s cenou nad stropem koupit nejde", async () => {
    await listing("l-over", "club-other", getBazarPriceCap(CATEGORY, LEVEL) + 1);
    const res = await call("/teams/club-one/equipment-market/l-over/buy", "owner-token");
    expect(res.status).toBe(400);
    expect(String(res.json.error)).toContain("nad stropem");
    expect(await budget("club-one")).toBe(5000000);
    expect(await budget("club-other")).toBe(5000000);
  });
});
