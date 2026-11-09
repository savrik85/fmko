/**
 * Zápasový tick do fronty: mužské soutěže první, U21 se zpožděním, údržba lig až po kolech.
 * 2026-11-09 dostala U21 III. třídy slot dřív než Praha a dávka údržeb v 18:05 přišla
 * do instance s běžícími koly, která pak naráz spadla.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Miniflare } from "miniflare";
import { MAINTENANCE_DELAY_SECONDS, U21_ROUND_DELAY_SECONDS, enqueueMatchTick, enqueueStuckRounds } from "./producer";
import { isMatchTickRetry } from "../lib/match-tick-schedule";
import { findLeaguesWithDueRound } from "../season/league-round";
import type { Bindings } from "../index";

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
    "CREATE TABLE leagues (id TEXT PRIMARY KEY, name TEXT, league_type TEXT)",
    "CREATE TABLE teams (id TEXT PRIMARY KEY, league_id TEXT, game_date TEXT, user_id TEXT)",
  ]) await db.prepare(sql).run();
  await db.batch([
    // Id schválně tak, aby U21 vyšla abecedně první (jako 2914ffa4 III. třída U21 na produ).
    db.prepare(`INSERT INTO leagues VALUES
      ('a-u21', 'III. třída Prachatice U21', 'u21'),
      ('b-prachatice', 'Schwan liga', 'league'),
      ('c-cb', 'Okresní přebor ČB', NULL),
      ('d-praha-u21', 'Přebor Prahy U21', 'u21'),
      ('e-praha', 'Přebor Prahy', 'league')`),
    db.prepare(`INSERT INTO teams VALUES
      ('t1', 'a-u21', '2026-11-09T16:00:00Z', 'u1'),
      ('t2', 'b-prachatice', '2026-11-09T16:00:00Z', 'u2'),
      ('t3', 'c-cb', '2026-11-09T16:00:00Z', 'ai'),
      ('t4', 'd-praha-u21', '2026-11-09T16:00:00Z', 'u4'),
      ('t5', 'e-praha', '2026-11-09T16:00:00Z', 'u5')`),
  ]);
});

afterAll(async () => {
  await miniflare.dispose();
});

describe("zápasový tick do fronty", () => {
  it("mužské soutěže jsou v seznamu první, U21 až za nimi", async () => {
    const due = await findLeaguesWithDueRound(db);
    expect(due.map((d) => [d.leagueId, d.isU21])).toEqual([
      ["b-prachatice", false], ["c-cb", false], ["e-praha", false], ["a-u21", true], ["d-praha-u21", true],
    ]);
  });

  it("kola mužů jdou hned, U21 o 8 minut později a údržba lig o 15 minut", async () => {
    const sent: Array<{ kind: string; leagueId: string; delay: number | undefined }> = [];
    const queue = {
      sendBatch: async (msgs: Array<{ body: { kind: string; leagueId: string }; delaySeconds?: number }>) => {
        for (const m of msgs) sent.push({ kind: m.body.kind, leagueId: m.body.leagueId, delay: m.delaySeconds });
      },
    };
    const res = await enqueueMatchTick({ DB: db, MATCH_QUEUE: queue } as unknown as Bindings);
    expect(res.rounds).toBe(5);

    const rounds = sent.filter((m) => m.kind === "league_round");
    expect(rounds.map((m) => [m.leagueId, m.delay])).toEqual([
      ["b-prachatice", undefined], ["c-cb", undefined], ["e-praha", undefined],
      ["a-u21", U21_ROUND_DELAY_SECONDS], ["d-praha-u21", U21_ROUND_DELAY_SECONDS],
    ]);
    expect(U21_ROUND_DELAY_SECONDS).toBe(480);

    const maintenance = sent.filter((m) => m.kind === "league_maintenance");
    expect(maintenance.length).toBeGreaterThan(0);
    expect(maintenance.every((m) => m.delay === MAINTENANCE_DELAY_SECONDS)).toBe(true);
    expect(MAINTENANCE_DELAY_SECONDS).toBe(900);
    // Údržba se do fronty dostane až po všech kolech.
    const lastRound = sent.map((m) => m.kind).lastIndexOf("league_round");
    expect(sent.findIndex((m) => m.kind === "league_maintenance")).toBeGreaterThan(lastRound);
  });
});

/**
 * Druhý zápasový cron (:05) posílal celou dávku podruhé do instance s běžícími koly.
 * Teď řadí jen ligy, jejichž kolo zůstalo nezamčené, a pojistka v 18:20 vrací do fronty
 * každé zaseklé kolo zvlášť (dřív dohrála v cronu jen jedno).
 */
describe("pojistný tick a zaseklá kola", () => {
  const collect = () => {
    const sent: Array<{ kind: string; leagueId: string; delay: number | undefined }> = [];
    const queue = {
      sendBatch: async (msgs: Array<{ body: { kind: string; leagueId: string }; delaySeconds?: number }>) => {
        for (const m of msgs) sent.push({ kind: m.body.kind, leagueId: m.body.leagueId, delay: m.delaySeconds });
      },
    };
    return { sent, env: { DB: db, MATCH_QUEUE: queue } as unknown as Bindings };
  };

  beforeAll(async () => {
    await db.prepare("CREATE TABLE season_calendar (id TEXT PRIMARY KEY, league_id TEXT, scheduled_at TEXT, status TEXT, locked_at TEXT, season_number INTEGER)").run();
    const stale = new Date(Date.now() - 20 * 60_000).toISOString();
    const fresh = new Date().toISOString();
    await db.batch([
      // Praha: první tick kolo nezařadil, pořád čeká. Loňské nezamčené kolo se nepočítá.
      db.prepare("INSERT INTO season_calendar VALUES ('c-praha', 'e-praha', '2026-11-09T17:00:00.000Z', 'scheduled', NULL, 3)"),
      db.prepare("INSERT INTO season_calendar VALUES ('c-cb-old', 'c-cb', '2026-06-11T16:00:00.000Z', 'scheduled', NULL, 1)"),
      db.prepare("INSERT INTO season_calendar VALUES ('c-cb', 'c-cb', '2026-11-09T17:00:00.000Z', 'lineup_locked', ?, 3)").bind(stale),
      // Prachatice právě hrají (čerstvý puls), U21 má kolo až zítra.
      db.prepare("INSERT INTO season_calendar VALUES ('c-prachatice', 'b-prachatice', '2026-11-09T17:00:00.000Z', 'lineup_locked', ?, 3)").bind(fresh),
      db.prepare("INSERT INTO season_calendar VALUES ('c-u21', 'a-u21', '2026-11-10T17:00:00.000Z', 'scheduled', NULL, 3)"),
    ]);
  });

  it("cron v :05 je pojistný, v :00 ne", () => {
    expect(isMatchTickRetry("5 17 * * *")).toBe(true);
    expect(isMatchTickRetry("5 16 * * *")).toBe(true);
    expect(isMatchTickRetry("0 17 * * *")).toBe(false);
    expect(isMatchTickRetry(undefined)).toBe(false);
  });

  it("pojistný tick zařadí jen ligu s nezamčeným dnešním kolem a žádnou údržbu", async () => {
    const { sent, env } = collect();
    const res = await enqueueMatchTick(env, { retryOnly: true });
    expect(sent).toEqual([{ kind: "league_round", leagueId: "e-praha", delay: undefined }]);
    expect(res).toMatchObject({ rounds: 1, maintenance: 0 });
  });

  it("pojistka vrátí do fronty každé kolo bez pulsu, běžící kolo nechá být", async () => {
    const { sent, env } = collect();
    expect(await enqueueStuckRounds(env, 6)).toBe(1);
    expect(sent).toEqual([{ kind: "league_round", leagueId: "c-cb", delay: undefined }]);
  });
});
