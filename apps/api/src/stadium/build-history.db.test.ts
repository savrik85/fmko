/**
 * Historie staveb stadionu a vrácení omylem postavené tribuny, nad skutečným schématem.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { Miniflare } from "miniflare";
import { upgradeStadiumFacility } from "../services/stadium";
import { STAND_BUILD_UNDO_HOURS, loadStadiumBuilds, revertStandBuild } from "./build-history";

let miniflare: Miniflare;
let db: D1Database;
const TEAM = "club";
const START_BUDGET = 500_000;

beforeAll(async () => {
  miniflare = new Miniflare({
    modules: true,
    script: "export default { fetch() { return new Response('ok'); } }",
    d1Databases: ["DB"],
  });
  db = await miniflare.getD1Database("DB");
  const dir = new URL("../../migrations/", import.meta.url);
  for (const file of readdirSync(dir).filter((f) => f.endsWith(".sql")).sort()) {
    const source = readFileSync(new URL(file, dir), "utf8").replace(/--[^\n]*/g, "").replace(/\n/g, " ");
    await db.exec(source);
  }
  const village = await db.prepare("SELECT id FROM villages LIMIT 1").first<{ id: string }>();
  await db.batch([
    db.prepare("INSERT INTO users (id, email, password_hash) VALUES ('u-club', 'club@example.test', 'x')"),
    db.prepare("INSERT INTO seasons (id, number, status) VALUES ('season-3', 3, 'active')"),
    db.prepare("INSERT INTO teams (id, user_id, village_id, name, budget, reputation, game_date) VALUES (?, 'u-club', ?, 'Jiskra', ?, 50, '2026-11-12T16:00:00.000Z')")
      .bind(TEAM, village!.id, START_BUDGET),
    db.prepare("INSERT INTO teams (id, user_id, village_id, name, budget, reputation, game_date) VALUES ('other', 'ai', ?, 'Soupeř', 50000, 50, '2026-11-12T16:00:00.000Z')")
      .bind(village!.id),
    db.prepare("INSERT INTO stadiums (id, team_id) VALUES ('st-club', ?)").bind(TEAM),
  ]);
}, 180_000);

afterAll(async () => { await miniflare.dispose(); });

beforeEach(async () => {
  await db.batch([
    db.prepare("DELETE FROM stadium_builds"),
    db.prepare("DELETE FROM stadium_extensions"),
    db.prepare("DELETE FROM stadium_damage"),
    db.prepare("DELETE FROM transactions"),
    db.prepare("UPDATE stadiums SET stand_main = 0, stand_opposite = 0, stand_goal_west = 0, stand_goal_east = 0, roof = 0, vip_box = 0 WHERE team_id = ?").bind(TEAM),
    db.prepare("UPDATE teams SET budget = ? WHERE id = ?").bind(START_BUDGET, TEAM),
  ]);
});

const budget = async () => (await db.prepare("SELECT budget FROM teams WHERE id = ?").bind(TEAM).first<{ budget: number }>())!.budget;
const levelOf = async (side: string) =>
  (await db.prepare(`SELECT ${side} AS level FROM stadiums WHERE team_id = ?`).bind(TEAM).first<{ level: number }>())!.level;
async function build(facility: string): Promise<number> {
  const res = await upgradeStadiumFacility(db, TEAM, facility, { ignoreProgressLocks: true });
  if (!res.ok) throw new Error(`stavba ${facility} neprošla: ${res.error}`);
  return res.cost;
}
const hoursLater = (h: number) => new Date(Date.now() + h * 3600_000);

describe("historie staveb", () => {
  it("stavba zapíše, co se postavilo, z jaké na jakou úroveň a za kolik", async () => {
    const first = await build("stand_main");
    const second = await build("stand_main");
    const builds = await loadStadiumBuilds(db, TEAM);
    expect(builds.map((b) => ({ label: b.label, from: b.fromLevel, to: b.toLevel, cost: b.cost }))).toEqual(
      expect.arrayContaining([
        { label: "Hlavní tribuna", from: 0, to: 1, cost: first },
        { label: "Hlavní tribuna", from: 1, to: 2, cost: second },
      ]),
    );
    expect(builds).toHaveLength(2);
  });

  it("starší stavby bez záznamu se dohledají z plateb ve financích", async () => {
    await db.prepare(
      "INSERT INTO transactions (id, team_id, type, amount, balance_after, description, game_date, created_at) VALUES ('t-old', ?, 'stadium_upgrade', -43700, 0, 'Vylepšení stadionu: Hlavní tribuna', '2026-10-10', '2026-10-10 12:00:00')",
    ).bind(TEAM).run();
    const builds = await loadStadiumBuilds(db, TEAM);
    expect(builds).toEqual([expect.objectContaining({ label: "Hlavní tribuna", cost: 43700, toLevel: null, undo: null, builtAt: "2026-10-10T12:00:00Z" })]);
  });
});

describe("vrácení omylem postavené tribuny", () => {
  it("do 48 hodin vrátí úroveň i celou částku, podruhé už ne", async () => {
    const cost = await build("stand_goal_west");
    expect(await budget()).toBe(START_BUDGET - cost);
    const [entry] = await loadStadiumBuilds(db, TEAM);
    expect(entry.undo).toMatchObject({ available: true, blockedReason: null });

    const res = await revertStandBuild(db, TEAM, entry.id);
    expect(res).toEqual({ ok: true, refund: cost, level: 0 });
    expect(await levelOf("stand_goal_west")).toBe(0);
    expect(await levelOf("stands")).toBe(0);
    expect(await budget()).toBe(START_BUDGET);
    const refund = await db.prepare("SELECT amount, description FROM transactions WHERE type = 'stadium_refund'").first();
    expect(refund).toEqual({ amount: cost, description: "Vrácení stavby: Tribuna za levou brankou" });

    expect(await revertStandBuild(db, TEAM, entry.id)).toMatchObject({ ok: false, status: 409 });
    expect(await budget()).toBe(START_BUDGET);
    expect((await loadStadiumBuilds(db, TEAM))[0]).toMatchObject({ undo: null });
  });

  it("po 48 hodinách už vrátit nejde", async () => {
    await build("stand_main");
    const [entry] = await loadStadiumBuilds(db, TEAM);
    const late = hoursLater(STAND_BUILD_UNDO_HOURS + 1);
    expect(await revertStandBuild(db, TEAM, entry.id, late)).toMatchObject({ ok: false, status: 400 });
    expect((await loadStadiumBuilds(db, TEAM, late))[0].undo).toBeNull();
    expect(await levelOf("stand_main")).toBe(1);
  });

  it("vrátit jde jen poslední stavba na dané straně", async () => {
    await build("stand_main");
    await new Promise((r) => setTimeout(r, 1100));
    await build("stand_main");
    const builds = await loadStadiumBuilds(db, TEAM);
    const older = builds.find((b) => b.toLevel === 1)!;
    const newer = builds.find((b) => b.toLevel === 2)!;
    expect(older.undo).toMatchObject({ available: false });
    expect(await revertStandBuild(db, TEAM, older.id)).toMatchObject({ ok: false, status: 409 });
    expect(await revertStandBuild(db, TEAM, newer.id)).toMatchObject({ ok: true, level: 1 });
    // Po vrácení novější je na řadě ta starší.
    expect(await revertStandBuild(db, TEAM, older.id)).toMatchObject({ ok: true, level: 0 });
  });

  it("jiné zařízení než tribunu vrátit nejde", async () => {
    await build("fence");
    const [entry] = await loadStadiumBuilds(db, TEAM);
    expect(entry.undo).toBeNull();
    expect(await revertStandBuild(db, TEAM, entry.id)).toMatchObject({ ok: false, status: 400 });
  });

  it("nevrátí tribunu, na které stojí zastřešení, přístavba, nebo je poškozená", async () => {
    await build("stand_main");
    const [entry] = await loadStadiumBuilds(db, TEAM);

    await db.prepare("UPDATE stadiums SET roof = 1 WHERE team_id = ?").bind(TEAM).run();
    expect(await revertStandBuild(db, TEAM, entry.id)).toMatchObject({ ok: false, status: 409, error: expect.stringContaining("zastřešit") });
    await db.prepare("UPDATE stadiums SET roof = 0 WHERE team_id = ?").bind(TEAM).run();

    await db.prepare("INSERT INTO stadium_extensions (team_id, slot, kind, level) VALUES (?, 'ext_main', 'length', 1)").bind(TEAM).run();
    expect(await revertStandBuild(db, TEAM, entry.id)).toMatchObject({ ok: false, status: 409, error: expect.stringContaining("přístavba") });
    await db.prepare("DELETE FROM stadium_extensions").run();

    await db.prepare(
      "INSERT INTO stadium_damage (id, team_id, facility, levels, repair_cost, popis, game_date) VALUES ('d1', ?, 'stand_main', 1, 1000, 'rozbité sedačky', '2026-11-12')",
    ).bind(TEAM).run();
    expect(await revertStandBuild(db, TEAM, entry.id)).toMatchObject({ ok: false, status: 409, error: expect.stringContaining("poškozená") });
    expect(await levelOf("stand_main")).toBe(1);
  });

  it("po odehraném domácím zápase už vrátit nejde (kapacita by se půjčila zadarmo)", async () => {
    await build("stand_main");
    const [entry] = await loadStadiumBuilds(db, TEAM);
    const soon = new Date(Date.now() + 3600_000).toISOString().replace(/\.\d{3}Z$/, "Z");
    // Venkovní zápas nevadí, domácí ano.
    await db.prepare("INSERT INTO matches (id, home_team_id, away_team_id, status, simulated_at) VALUES ('m-away', 'other', ?, 'simulated', ?)").bind(TEAM, soon).run();
    expect((await loadStadiumBuilds(db, TEAM))[0].undo).toMatchObject({ available: true });
    await db.prepare("INSERT INTO matches (id, home_team_id, away_team_id, status, simulated_at) VALUES ('m-home', ?, 'other', 'simulated', ?)").bind(TEAM, soon).run();
    expect((await loadStadiumBuilds(db, TEAM))[0].undo).toMatchObject({ available: false, blockedReason: expect.stringContaining("domácí zápas") });
    expect(await revertStandBuild(db, TEAM, entry.id)).toMatchObject({ ok: false, status: 409 });
    expect(await levelOf("stand_main")).toBe(1);
    await db.prepare("DELETE FROM matches WHERE id IN ('m-away', 'm-home')").run();
  });

  it("vrací se jen to, co se za stavbu opravdu strhlo", async () => {
    const cost = await build("stand_opposite");
    const [entry] = await loadStadiumBuilds(db, TEAM);
    // Stržení při stavbě selhalo: platba chybí, není co vracet.
    await db.prepare("DELETE FROM transactions WHERE type = 'stadium_upgrade'").run();
    await db.prepare("UPDATE teams SET budget = ? WHERE id = ?").bind(START_BUDGET, TEAM).run();
    expect(cost).toBeGreaterThan(0);
    expect(await revertStandBuild(db, TEAM, entry.id)).toEqual({ ok: true, refund: 0, level: 0 });
    expect(await budget()).toBe(START_BUDGET);
  });

  it("cizí klub stavbu nevrátí", async () => {
    await build("stand_main");
    const [entry] = await loadStadiumBuilds(db, TEAM);
    expect(await revertStandBuild(db, "someone-else", entry.id)).toMatchObject({ ok: false, status: 404 });
  });
});
