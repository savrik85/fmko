/**
 * Zápasový tick do fronty: mužské soutěže první, U21 se zpožděním, údržba lig až po kolech.
 * 2026-11-09 dostala U21 III. třídy slot dřív než Praha a dávka údržeb v 18:05 přišla
 * do instance s běžícími koly, která pak naráz spadla.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Miniflare } from "miniflare";
import { MAINTENANCE_DELAY_SECONDS, U21_ROUND_DELAY_SECONDS, enqueueMatchTick } from "./producer";
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
