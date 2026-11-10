/**
 * Neodehraná kola starších sezón na skutečné D1 (Miniflare, všechny migrace):
 * dotazy na „nejbližší kolo“ je s filtrem aktuální sezóny přeskočí a admin úklid je smaže.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { Miniflare } from "miniflare";
import { findUpcomingMatchContext } from "../events/match-absences";
import { currentSeasonSql } from "../lib/season";
import { cleanupStaleRounds } from "./stale-rounds";

let mf: Miniflare;
let db: D1Database;
let villages: string[] = [];

const LEAGUE = "l-1";
const HOME = "team-home";
const AWAY = "team-away";

async function count(sql: string): Promise<number> {
  return (await db.prepare(sql).first<{ n: number }>())?.n ?? 0;
}

async function addRound(id: string, season: number, scheduledAt: string, status: string, parent: string | null = null): Promise<void> {
  await db.batch([
    db.prepare("INSERT INTO season_calendar (id, league_id, season_number, game_week, match_day, scheduled_at, status, parent_calendar_id) VALUES (?, ?, ?, 1, 'monday', ?, ?, ?)")
      .bind(id, LEAGUE, season, scheduledAt, status, parent),
    db.prepare("INSERT INTO matches (id, league_id, calendar_id, round, home_team_id, away_team_id, status, home_score, away_score) VALUES (?, ?, ?, 1, ?, ?, ?, ?, ?)")
      .bind(`m-${id}`, LEAGUE, id, HOME, AWAY, status === "simulated" ? "simulated" : "scheduled", status === "simulated" ? 2 : null, status === "simulated" ? 1 : null),
  ]);
}

beforeAll(async () => {
  mf = new Miniflare({
    modules: true, script: "export default { fetch() { return new Response('ok'); } }",
    d1Databases: ["DB"],
  });
  db = await mf.getD1Database("DB");
  const dir = new URL("../../migrations/", import.meta.url);
  for (const file of readdirSync(dir).filter((f) => f.endsWith(".sql")).sort()) {
    await db.exec(readFileSync(new URL(file, dir), "utf8").replace(/--[^\n]*/g, "").replace(/\n/g, " "));
  }
  villages = (await db.prepare("SELECT id FROM villages WHERE district = 'Prachatice' ORDER BY id LIMIT 2").all<{ id: string }>()).results.map((r) => r.id);
  await db.batch([
    db.prepare("UPDATE seasons SET status = 'finished'"),
    db.prepare("INSERT INTO seasons (id, number, status) VALUES ('s-98', 98, 'finished'), ('s-99', 99, 'active')"),
    db.prepare("INSERT INTO leagues (id, season_id, district, name, level) VALUES (?, 's-99', 'Prachatice', 'Okresní přebor', 'okresni_prebor')").bind(LEAGUE),
    db.prepare("INSERT INTO teams (id, user_id, village_id, name, budget, league_id, team_type, game_date) VALUES (?, 'ai', ?, 'Domácí', 1000, ?, 'senior', '2026-11-09T16:00:00.000Z')")
      .bind(HOME, villages[0], LEAGUE),
    db.prepare("INSERT INTO teams (id, user_id, village_id, name, budget, league_id, team_type, game_date) VALUES (?, 'ai', ?, 'Hosté', 1000, ?, 'senior', '2026-11-09T16:00:00.000Z')")
      .bind(AWAY, villages[1], LEAGUE),
  ]);
}, 120_000);

afterAll(async () => { await mf?.dispose(); });

beforeEach(async () => {
  await db.batch([
    db.prepare("UPDATE matches SET parent_match_id = NULL"),
    db.prepare("DELETE FROM matches"),
    db.prepare("DELETE FROM lineups"),
    db.prepare("UPDATE season_calendar SET parent_calendar_id = NULL"),
    db.prepare("DELETE FROM season_calendar"),
  ]);
  // Sezóna 98: jedno odehrané a dvě nikdy neodehraná kola (druhé navázané na první jako U21).
  await addRound("old-played", 98, "2026-06-01T16:00:00.000Z", "simulated");
  await addRound("old-open", 98, "2026-06-11T16:00:00.000Z", "scheduled");
  await addRound("old-open-child", 98, "2026-06-12T16:00:00.000Z", "scheduled", "old-open");
  await db.prepare("UPDATE matches SET parent_match_id = 'm-old-open' WHERE id = 'm-old-open-child'").run();
  await db.prepare("INSERT INTO lineups (id, team_id, calendar_id) VALUES ('lu-old', ?, 'old-open')").bind(HOME).run();
  // Sezóna 99: dnešní kolo.
  await addRound("new-open", 99, "2026-11-12T17:00:00.000Z", "scheduled");
  await db.prepare("INSERT INTO lineups (id, team_id, calendar_id) VALUES ('lu-new', ?, 'new-open')").bind(HOME).run();
});

describe("filtr aktuální sezóny", () => {
  it("nejstarší neodehrané kolo ligy bez filtru je z loňska, s filtrem z aktuální sezóny", async () => {
    const unfiltered = await db.prepare("SELECT id FROM season_calendar sc WHERE sc.league_id = ? AND sc.status = 'scheduled' ORDER BY sc.scheduled_at LIMIT 1")
      .bind(LEAGUE).first<{ id: string }>();
    expect(unfiltered?.id).toBe("old-open");
    const filtered = await db.prepare(`SELECT id FROM season_calendar sc WHERE sc.league_id = ? AND sc.status = 'scheduled' AND ${currentSeasonSql("sc")} ORDER BY sc.scheduled_at LIMIT 1`)
      .bind(LEAGUE).first<{ id: string }>();
    expect(filtered?.id).toBe("new-open");
    // Bez aliasu, se jménem tabulky.
    const plain = await db.prepare(`SELECT id FROM season_calendar WHERE league_id = ? AND status = 'scheduled' AND ${currentSeasonSql("season_calendar")} ORDER BY scheduled_at LIMIT 1`)
      .bind(LEAGUE).first<{ id: string }>();
    expect(plain?.id).toBe("new-open");
  });

  it("omluvenky se počítají k nejbližšímu kolu aktuální sezóny", async () => {
    const ctx = await findUpcomingMatchContext(db, HOME);
    expect(ctx).toMatchObject({ matchKey: "new-open", isFriendly: false, scheduledAt: "2026-11-12T17:00:00.000Z" });
  });
});

describe("úklid neodehraných kol starších sezón", () => {
  it("dryRun jen spočítá a nic nesmaže", async () => {
    const res = await cleanupStaleRounds(db, { dryRun: true });
    expect(res).toMatchObject({ dryRun: true, rounds: 2, matches: 2, lineups: 1, blockedBy: [], deleted: null });
    expect(res.leagues).toEqual([{
      leagueId: LEAGUE, name: "Okresní přebor", seasonNumber: 98, rounds: 2, matches: 2,
      firstAt: "2026-06-11T16:00:00.000Z", lastAt: "2026-06-12T16:00:00.000Z",
    }]);
    expect(await count("SELECT COUNT(*) AS n FROM season_calendar")).toBe(4);
  });

  it("smaže jen stará neodehraná kola s jejich zápasy a sestavami; odehrané a aktuální nechá", async () => {
    const res = await cleanupStaleRounds(db, { dryRun: false });
    expect(res.deleted).toEqual({ matches: 2, lineups: 1, rounds: 2 });
    const left = await db.prepare("SELECT id FROM season_calendar ORDER BY id").all<{ id: string }>();
    expect(left.results.map((r) => r.id)).toEqual(["new-open", "old-played"]);
    expect(await count("SELECT COUNT(*) AS n FROM matches")).toBe(2);
    expect(await count("SELECT COUNT(*) AS n FROM lineups WHERE id = 'lu-new'")).toBe(1);

    // Druhý běh už nemá co mazat.
    expect(await cleanupStaleRounds(db, { dryRun: false })).toMatchObject({ rounds: 0, matches: 0, deleted: null });
  });

  it("kolo s výsledkem nebo jiným odkazem úklid zastaví a nic se nesmaže", async () => {
    await db.prepare("UPDATE matches SET home_score = 1, away_score = 0 WHERE id = 'm-old-open'").run();
    const res = await cleanupStaleRounds(db, { dryRun: false });
    expect(res.blockedBy).toEqual([{ table: "matches (odehrané nebo rozehrané)", rows: 1 }]);
    expect(res.deleted).toBeNull();
    expect(await count("SELECT COUNT(*) AS n FROM season_calendar")).toBe(4);
  });

  it("neodehraná kola nejnovější sezóny ligy nejsou stará, ani když aktivní sezóna je novější", async () => {
    await db.prepare("DELETE FROM matches WHERE calendar_id = 'new-open'").run();
    await db.prepare("DELETE FROM lineups WHERE calendar_id = 'new-open'").run();
    await db.prepare("DELETE FROM season_calendar WHERE id = 'new-open'").run();
    // Liga ještě nemá rozpis sezóny 99: kola sezóny 98 jsou její poslední a zůstávají.
    expect(await cleanupStaleRounds(db, { dryRun: true })).toMatchObject({ rounds: 0, matches: 0 });
  });
});
