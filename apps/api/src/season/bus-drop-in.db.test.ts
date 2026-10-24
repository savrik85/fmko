import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { Miniflare } from "miniflare";
import { applyBusConversion, rollBusDropIn } from "./fanbase-helpers";
import { BUS_CONFIG } from "./fanbase-config";

/**
 * Kolik lidí přivezl autobus, se losovalo dvakrát: jednou do návštěvy zápasu
 * (match-runner, pohár) a podruhé po zápase do `bus_subsidies.attendees_brought`.
 * Přehled autobusu i reportér ve zpravodaji tak hlásili jiný počet, než kolik
 * lidí do návštěvy opravdu přibylo, a konverze na stálé fanoušky se počítala
 * z čísla, které nikdo nepřivezl.
 */

let miniflare: Miniflare;
let db: D1Database;

beforeAll(async () => {
  miniflare = new Miniflare({
    modules: true,
    script: "export default { fetch() { return new Response('ok'); } }",
    d1Databases: ["DB"],
  });
  db = await miniflare.getD1Database("DB");
  for (const sql of [
    "CREATE TABLE villages (id TEXT PRIMARY KEY, name TEXT, lat REAL, lng REAL)",
    "CREATE TABLE teams (id TEXT PRIMARY KEY, village_id TEXT)",
    `CREATE TABLE bus_subsidies (
      id TEXT PRIMARY KEY, team_id TEXT NOT NULL, match_id TEXT NOT NULL, source_village_id TEXT NOT NULL,
      bus_size TEXT NOT NULL, cost INTEGER NOT NULL, attendees_brought INTEGER,
      created_at TEXT NOT NULL DEFAULT (datetime('now')))`,
    `CREATE TABLE bus_satellite_fans (
      id TEXT PRIMARY KEY, team_id TEXT NOT NULL, village_id TEXT NOT NULL,
      casual_count INTEGER NOT NULL DEFAULT 0, regular_count INTEGER NOT NULL DEFAULT 0,
      hardcore_count INTEGER NOT NULL DEFAULT 0, consecutive_buses INTEGER NOT NULL DEFAULT 0,
      last_bus_match_id TEXT, updated_at TEXT)`,
    `INSERT INTO villages VALUES ('home', 'Čkyně', 49.11, 13.83), ('v1', 'Vacov', 49.13, 13.73),
      ('v2', 'Zdíkov', 49.08, 13.69), ('v3', 'Bohumilice', 49.10, 13.82)`,
    "INSERT INTO teams VALUES ('club', 'home')",
  ]) await db.prepare(sql).run();
});

afterAll(async () => {
  await miniflare.dispose();
});

beforeEach(async () => {
  await db.prepare("DELETE FROM bus_subsidies").run();
  await db.prepare("DELETE FROM bus_satellite_fans").run();
  await orderBus("b1", "v1", "karosa");
  await orderBus("b2", "v2", "autokar");
});

afterEach(() => {
  vi.restoreAllMocks();
});

async function orderBus(id: string, villageId: string, size: string) {
  await db.prepare(
    "INSERT INTO bus_subsidies (id, team_id, match_id, source_village_id, bus_size, cost) VALUES (?, 'club', 'm1', ?, ?, 2000)",
  ).bind(id, villageId, size).run();
}

async function stored() {
  const rows = await db.prepare("SELECT id, attendees_brought FROM bus_subsidies ORDER BY id")
    .all<{ id: string; attendees_brought: number | null }>();
  return Object.fromEntries(rows.results.map((r) => [r.id, r.attendees_brought]));
}

describe("kolik lidí přivezl autobus", () => {
  it("do záznamu jde stejné číslo, jaké přibylo do návštěvy", async () => {
    // Návštěva vylosuje nejmenší autobusy, případné druhé losování po zápase by dalo jiná čísla.
    vi.spyOn(Math, "random").mockReturnValueOnce(0).mockReturnValueOnce(0).mockReturnValue(0.99);
    const dropIn = await rollBusDropIn(db, "club", "m1");
    expect(dropIn.total).toBe(BUS_CONFIG.SIZES.karosa.attendeesMin + BUS_CONFIG.SIZES.autokar.attendeesMin);

    const conversion = await applyBusConversion(db, "club", "m1", dropIn.rolled);
    expect(await stored()).toEqual({
      b1: BUS_CONFIG.SIZES.karosa.attendeesMin,
      b2: BUS_CONFIG.SIZES.autokar.attendeesMin,
    });
    expect(conversion.totalDropIn).toBe(dropIn.total);
  });

  it("druhé zpracování po zápase nic nepřepíše ani nezdvojí", async () => {
    const dropIn = await rollBusDropIn(db, "club", "m1");
    await applyBusConversion(db, "club", "m1", dropIn.rolled);
    const first = await stored();
    const again = await applyBusConversion(db, "club", "m1", new Map([["b1", 1], ["b2", 1]]));
    expect(again.totalDropIn).toBe(0);
    expect(await stored()).toEqual(first);
    const streak = await db.prepare("SELECT MAX(consecutive_buses) AS n FROM bus_satellite_fans").first<{ n: number }>();
    expect(streak?.n).toBe(1);
  });

  it("opakovaná simulace zápasu vezme už uložené počty, nelosuje znovu", async () => {
    const dropIn = await rollBusDropIn(db, "club", "m1");
    await applyBusConversion(db, "club", "m1", dropIn.rolled);
    const rerun = await rollBusDropIn(db, "club", "m1");
    expect(rerun.total).toBe(dropIn.total);
    expect(rerun.rolled.size).toBe(0);
  });

  it("autobus objednaný až po výpočtu návštěvy nikoho nepřivezl", async () => {
    const dropIn = await rollBusDropIn(db, "club", "m1");
    await orderBus("b3", "v3", "traktor");
    await applyBusConversion(db, "club", "m1", dropIn.rolled);
    expect((await stored()).b3).toBe(0);
    const satellite = await db.prepare("SELECT COUNT(*) AS n FROM bus_satellite_fans WHERE village_id = 'v3'").first<{ n: number }>();
    expect(satellite?.n).toBe(0);
  });
});
