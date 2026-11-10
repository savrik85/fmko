/**
 * Ostatní pravidelné výdaje v prognóze financí: startovné (jednou za sezónu) do nich
 * nepatří a pokuty se průměrují za celou sezónu, ne za poslední čtyři týdny.
 * Běží nad skutečnou SQLite (Miniflare).
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { Miniflare } from "miniflare";
import { otherRunningCostsPerWeek, otherRunningPerWeek } from "./match-day-economics";

let mf: Miniflare;
let db: D1Database;

beforeAll(async () => {
  mf = new Miniflare({ modules: true, script: "export default { fetch() { return new Response('ok'); } }", d1Databases: ["DB"] });
  db = await mf.getD1Database("DB");
  await db.batch([
    db.prepare("CREATE TABLE teams (id TEXT PRIMARY KEY, game_date TEXT, season_start TEXT)"),
    db.prepare(
      `CREATE TABLE transactions (id TEXT PRIMARY KEY, team_id TEXT, type TEXT, amount INTEGER, balance_after INTEGER,
         description TEXT, reference_id TEXT, game_date TEXT, created_at TEXT NOT NULL DEFAULT (datetime('now')))`,
    ),
  ]);
});

afterAll(async () => { await mf.dispose(); });

beforeEach(async () => {
  await db.batch([
    db.prepare("DELETE FROM teams"),
    db.prepare("DELETE FROM transactions"),
    // Desátý týden sezóny.
    db.prepare("INSERT INTO teams VALUES ('club', '2026-12-30T16:00:00.000Z', '2026-10-21T16:00:00.000Z')"),
  ]);
});

let seq = 0;
/** Transakce zapsaná `daysAgo` dní zpátky (reálně), s herním datem `gameDate`. */
async function txn(type: string, amount: number, opts: { referenceId?: string; daysAgo?: number; gameDate?: string; teamId?: string } = {}) {
  await db.prepare(
    `INSERT INTO transactions (id, team_id, type, amount, balance_after, description, reference_id, game_date, created_at)
     VALUES (?, ?, ?, ?, 0, 'test', ?, ?, datetime('now', ?))`,
  ).bind(`t${seq++}`, opts.teamId ?? "club", type, amount, opts.referenceId ?? null,
    opts.gameDate ?? "2026-12-20T16:00:00.000Z", `-${opts.daysAgo ?? 1} days`).run();
}

describe("týdenní odhad ostatních výdajů", () => {
  it("pravidelné výdaje za čtyři týdny, pokuty za uběhlou sezónu", () => {
    expect(otherRunningPerWeek({ recentTotal: -4000, seasonFinesTotal: -12000, seasonWeeks: 10 })).toBe(-2200);
  });

  it("na začátku sezóny se pokuty dělí aspoň čtyřmi týdny", () => {
    expect(otherRunningPerWeek({ recentTotal: 0, seasonFinesTotal: -12000, seasonWeeks: 1 })).toBe(-3000);
    expect(otherRunningPerWeek({ recentTotal: 0, seasonFinesTotal: -12000, seasonWeeks: 4 })).toBe(-3000);
    expect(otherRunningPerWeek({ recentTotal: 0, seasonFinesTotal: -12000, seasonWeeks: 5 })).toBe(-2400);
  });

  it("bez výdajů nula", () => {
    expect(otherRunningPerWeek({ recentTotal: 0, seasonFinesTotal: 0, seasonWeeks: 0 })).toBe(0);
  });
});

describe("ostatní pravidelné výdaje z knihy klubu", () => {
  it("startovné a splátka půjčky soutěži se do týdnů nepromítají, průběžné odvody ano", async () => {
    await txn("competition_fee", -15000, { referenceId: "fee-3-club" });
    await txn("competition_fee", -8000, { referenceId: "loanrep-2-club" });
    await txn("competition_fee", -400, { referenceId: "levy-conc-m1" });
    await txn("competition_fee", -800);   // odvod z přestupu, bez reference
    // Jen odvody: 1 200 Kč za čtyři týdny.
    expect(await otherRunningCostsPerWeek(db, "club")).toBe(-300);
  });

  it("pokuta se rozpočítá na celou uběhlou sezónu, ne na čtyři týdny", async () => {
    // 12 000 Kč před třemi dny, sezóna běží deset týdnů: 1 200 Kč týdně, dřív 3 000 Kč.
    await txn("disciplinary_fine", -12000, { daysAgo: 3, gameDate: "2026-12-27T16:00:00.000Z" });
    expect(await otherRunningCostsPerWeek(db, "club")).toBe(-1200);
  });

  it("pokuta stará dva měsíce se počítá pořád, pokuta z minulé sezóny ne", async () => {
    await txn("disciplinary_fine", -5000, { daysAgo: 60, gameDate: "2026-10-30T16:00:00.000Z" });
    await txn("incident_fine", -1000, { daysAgo: 50, gameDate: "2026-11-10T16:00:00.000Z" });
    await txn("disciplinary_fine", -90000, { daysAgo: 90, gameDate: "2026-10-01T16:00:00.000Z" });
    expect(await otherRunningCostsPerWeek(db, "club")).toBe(-600);
  });

  it("vrácená pokuta se odečte", async () => {
    await txn("disciplinary_fine", -10000, { gameDate: "2026-11-05T16:00:00.000Z" });
    await txn("disciplinary_fine", 10000, { gameDate: "2026-11-20T16:00:00.000Z" });
    expect(await otherRunningCostsPerWeek(db, "club")).toBe(0);
  });

  it("ostatní pravidelné typy se průměrují za čtyři týdny jako dřív, starší se nepočítají", async () => {
    await txn("event", -2000, { daysAgo: 5 });
    await txn("scout_travel", -1000, { daysAgo: 20 });
    await txn("staff_task", -700, { daysAgo: 27 });
    await txn("event", -50000, { daysAgo: 40 });
    await txn("wage", -9000, { daysAgo: 2 });              // je v týdenním modelu, sem nepatří
    await txn("event", -4000, { daysAgo: 2, teamId: "other" });
    expect(await otherRunningCostsPerWeek(db, "club")).toBe(-925);
  });

  it("tým bez začátku sezóny: pokuty za poslední čtyři herní týdny", async () => {
    await db.prepare("UPDATE teams SET season_start = NULL").run();
    await txn("disciplinary_fine", -4000, { gameDate: "2026-12-20T16:00:00.000Z" });
    await txn("disciplinary_fine", -8000, { gameDate: "2026-11-01T16:00:00.000Z" });
    expect(await otherRunningCostsPerWeek(db, "club")).toBe(-1000);
  });

  it("neznámý tým nula", async () => {
    expect(await otherRunningCostsPerWeek(db, "ghost")).toBe(0);
  });
});
