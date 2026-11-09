/**
 * Rozpis ligy založené registrací uprostřed sezóny: dvoukolově, jednokolově, nebo
 * přípravné období. Plán je čistá funkce, zápis se ověřuje na skutečné D1 (Miniflare).
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Miniflare } from "miniflare";
import { createRng } from "../generators/rng";
import { isSeniorHolidayBlocked } from "../season/calendar";
import {
  MIN_MATCH_DAYS_FOR_SCHEDULE, countMatchDays, insertLeagueSchedule, midSeasonFormat, planMidSeasonSchedule,
  singleRoundRobinRounds,
} from "./mid-season-schedule";
import { totalRounds } from "./schedule";

const LAST_ROUND = new Date("2027-01-28T17:00:00.000Z");

function plan(gameDate: string, teamCount = 14) {
  return planMidSeasonSchedule(
    { leagueId: "L", seasonNumber: 3, gameDate: new Date(gameDate), lastDate: LAST_ROUND, teamCount },
    createRng(7),
  );
}

describe("formát podle zbývajících hracích dnů", () => {
  it("dvoukolově, jednokolově, nebo přípravné období", () => {
    expect(totalRounds(14)).toBe(26);
    expect(singleRoundRobinRounds(14)).toBe(13);
    expect(midSeasonFormat(26, 14)).toBe("double");
    expect(midSeasonFormat(25, 14)).toBe("single");
    expect(midSeasonFormat(13, 14)).toBe("single");
    // Osm až dvanáct dnů: jedno kolo pro 14 klubů se nevejde, liga počká na novou sezónu.
    expect(midSeasonFormat(12, 14)).toBe("preseason");
    expect(midSeasonFormat(MIN_MATCH_DAYS_FOR_SCHEDULE - 1, 6)).toBe("preseason");
    // Malá liga se do osmi dnů vejde i dvoukolově? Šest klubů = 10 kol, tedy jednokolově.
    expect(midSeasonFormat(8, 6)).toBe("single");
    expect(midSeasonFormat(10, 6)).toBe("double");
  });

  it("hrací dny se počítají od prvního možného termínu a bez svátků", () => {
    // Od pondělí 11. 1. do čtvrtka 28. 1. 2027: po, čt × 3 týdny = 6 dnů.
    expect(countMatchDays(new Date("2027-01-11T00:00:00.000Z"), LAST_ROUND)).toBe(6);
    // Od 14. 12.: 14. a 17. 12., pak až od 4. 1. (21. 12. až 2. 1. se nehraje).
    expect(countMatchDays(new Date("2026-12-14T00:00:00.000Z"), LAST_ROUND)).toBe(2 + 8);
  });
});

describe("plán rozpisu nové ligy", () => {
  it("v listopadu se dvě kola nevejdou: každý s každým jednou, první kolo nejdřív za dva dny", () => {
    // Dnešní stav produkce: herní den 9. 11. 2026, poslední kolo sezóny 28. 1. 2027.
    const p = plan("2026-11-09T16:00:00.000Z");
    expect(p.format).toBe("single");
    expect(p.entries).toHaveLength(13);
    expect(p.entries[0].scheduledAt).toBe("2026-11-12T17:00:00.000Z");
    expect(p.entries[12].scheduledAt <= LAST_ROUND.toISOString()).toBe(true);
    for (const e of p.entries) {
      const at = new Date(e.scheduledAt);
      expect([1, 4]).toContain(at.getUTCDay());
      expect(isSeniorHolidayBlocked(at), e.scheduledAt).toBe(false);
    }
    // 14 klubů, 13 kol po 7 zápasech, každá dvojice právě jednou.
    expect(p.matches).toHaveLength(13 * 7);
    const pairs = new Set(p.matches.map((m) => [m.homeTeamIndex, m.awayTeamIndex].sort((a, b) => a - b).join("-")));
    expect(pairs.size).toBe(91);
  });

  it("dvoukolově jen tehdy, když se všech 26 kol do konce sezóny vejde", () => {
    const p = plan("2026-10-22T16:00:00.000Z");
    expect(p.matchDays).toBeGreaterThanOrEqual(22);
    // Od 24. 10. do 28. 1. je bez svátků 24 hracích dnů: dvě kola (26) se nevejdou.
    expect(p.format).toBe("single");
    const early = planMidSeasonSchedule(
      { leagueId: "L", seasonNumber: 3, gameDate: new Date("2026-10-22T16:00:00.000Z"), lastDate: new Date("2027-02-08T17:00:00.000Z"), teamCount: 14 },
      createRng(7),
    );
    expect(early.format).toBe("double");
    expect(early.entries).toHaveLength(26);
    expect(early.matches).toHaveLength(26 * 7);
  });

  it("v lednu už zbývá málo hracích dnů: přípravné období bez rozpisu", () => {
    const p = plan("2027-01-09T16:00:00.000Z");
    expect(p.matchDays).toBe(6);
    expect(p).toMatchObject({ format: "preseason", entries: [], matches: [] });
  });
});

describe("zápis rozpisu", () => {
  let mf: Miniflare;
  let db: D1Database;

  beforeAll(async () => {
    mf = new Miniflare({ modules: true, script: "export default { fetch() { return new Response('ok'); } }", d1Databases: ["DB"] });
    db = await mf.getD1Database("DB");
    await db.prepare(
      `CREATE TABLE season_calendar (id TEXT PRIMARY KEY, league_id TEXT NOT NULL, season_number INTEGER NOT NULL, game_week INTEGER NOT NULL,
        match_day TEXT NOT NULL, scheduled_at TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'scheduled')`,
    ).run();
    await db.prepare(
      `CREATE TABLE matches (id TEXT PRIMARY KEY, league_id TEXT, calendar_id TEXT, round INTEGER, home_team_id TEXT NOT NULL,
        away_team_id TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'scheduled')`,
    ).run();
  });

  afterAll(async () => { await mf?.dispose(); });

  it("každé kolo má řádek kalendáře a každý klub v něm hraje jednou", async () => {
    const teamIds = Array.from({ length: 14 }, (_, i) => `team-${i}`);
    const p = plan("2026-11-09T16:00:00.000Z");
    expect(await insertLeagueSchedule(db, "L", 3, p, teamIds)).toEqual({ rounds: 13, matches: 91 });

    const rounds = await db.prepare(
      `SELECT sc.game_week, COUNT(m.id) AS matches, COUNT(DISTINCT m.home_team_id) + COUNT(DISTINCT m.away_team_id) AS teams
         FROM season_calendar sc JOIN matches m ON m.calendar_id = sc.id
        WHERE sc.league_id = 'L' AND sc.season_number = 3 GROUP BY sc.id ORDER BY sc.game_week`,
    ).all<{ game_week: number; matches: number; teams: number }>();
    expect(rounds.results).toHaveLength(13);
    for (const r of rounds.results) expect(r).toMatchObject({ matches: 7, teams: 14 });
  });
});
