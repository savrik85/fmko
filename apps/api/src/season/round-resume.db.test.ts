/**
 * Dohrání kola, které spadlo uprostřed (2026-11-09: běh fronty zmizel po 5 ze 7
 * zápasů a opakovaná zpráva skončila s „no-round“). Kolo bez pulsu se převezme,
 * kolo s pulsem pořád někdo hraje a nesmí se odehrát podruhé.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { Miniflare } from "miniflare";
import { claimStaleRound } from "./league-round";
import { touchRoundLock } from "../multiplayer/match-runner";

let miniflare: Miniflare;
let db: D1Database;
const now = new Date("2026-11-09T17:12:00Z");
const DAY_END = "2026-11-09T23:59:59.999Z";

beforeAll(async () => {
  miniflare = new Miniflare({
    modules: true,
    script: "export default { fetch() { return new Response('ok'); } }",
    d1Databases: ["DB"],
  });
  db = await miniflare.getD1Database("DB");
  await db.prepare(
    "CREATE TABLE season_calendar (id TEXT PRIMARY KEY, league_id TEXT, scheduled_at TEXT, status TEXT, locked_at TEXT, season_number INTEGER)",
  ).run();
});

afterAll(async () => {
  await miniflare.dispose();
});

beforeEach(async () => {
  await db.prepare("DELETE FROM season_calendar").run();
});

const round = (id: string, status: string, lockedAt: string | null, scheduledAt = "2026-11-09T17:00:00.000Z") =>
  db.prepare("INSERT INTO season_calendar VALUES (?, 'lg', ?, ?, ?, 4)").bind(id, scheduledAt, status, lockedAt).run();
const lockOf = async (id: string) => (await db.prepare("SELECT locked_at FROM season_calendar WHERE id = ?").bind(id).first<{ locked_at: string }>())?.locked_at;

describe("dohrání rozehraného kola", () => {
  it("kolo bez pulsu převezme a obnoví mu zámek", async () => {
    await round("c1", "lineup_locked", "2026-11-09T17:05:22.000Z");
    expect(await claimStaleRound(db, "lg", DAY_END, now)).toBe("c1");
    expect(await lockOf("c1")).toBe(now.toISOString());
  });

  it("kolo s čerstvým pulsem pořád někdo hraje: busy, zámek se nemění", async () => {
    await round("c1", "lineup_locked", "2026-11-09T17:10:00.000Z");
    expect(await claimStaleRound(db, "lg", DAY_END, now)).toBe("busy");
    expect(await lockOf("c1")).toBe("2026-11-09T17:10:00.000Z");
  });

  it("dva souběžné pokusy: kolo vezme jen jeden", async () => {
    await round("c1", "lineup_locked", "2026-11-09T17:00:30.000Z");
    const [a, b] = await Promise.all([claimStaleRound(db, "lg", DAY_END, now), claimStaleRound(db, "lg", DAY_END, now)]);
    expect([a, b].sort()).toEqual(["busy", "c1"]);
  });

  it("odehrané, naplánované ani budoucí kolo se nedohrává", async () => {
    await round("c1", "simulated", "2026-11-09T17:00:30.000Z");
    await round("c2", "scheduled", null);
    await round("c3", "lineup_locked", "2026-11-09T17:00:30.000Z", "2026-11-12T17:00:00.000Z");
    expect(await claimStaleRound(db, "lg", DAY_END, now)).toBeNull();
  });

  it("puls před zápasem obnoví zámek jen rozehranému kolu", async () => {
    await round("c1", "lineup_locked", "2026-11-09T17:00:30.000Z");
    await round("c2", "simulated", "2026-11-09T17:00:30.000Z");
    await touchRoundLock(db, "c1", now);
    await touchRoundLock(db, "c2", now);
    expect(await lockOf("c1")).toBe(now.toISOString());
    expect(await lockOf("c2")).toBe("2026-11-09T17:00:30.000Z");
    expect(await claimStaleRound(db, "lg", DAY_END, now)).toBe("busy");
  });
});
