/**
 * Rozpis ligy založené registrací uprostřed sezóny: vždy dvoukolový (když je potřeba,
 * i se sobotami), jinak přípravné období. Plán je čistá funkce, zápis se ověřuje na
 * skutečné D1 (Miniflare).
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Miniflare } from "miniflare";
import { createRng } from "../generators/rng";
import { MAX_ROUNDS_PER_WEEK, isSeniorHolidayBlocked } from "../season/calendar";
import { countRoundSlots, insertLeagueSchedule, midSeasonFormat, planMidSeasonSchedule } from "./mid-season-schedule";
import { totalRounds } from "./schedule";

const LAST_ROUND = new Date("2027-01-28T17:00:00.000Z");

function plan(gameDate: string, teamCount = 14) {
  return planMidSeasonSchedule(
    { leagueId: "L", seasonNumber: 3, gameDate: new Date(gameDate), lastDate: LAST_ROUND, teamCount },
    createRng(7),
  );
}

describe("formát podle zbývajících termínů", () => {
  it("dvoukolově, nebo přípravné období; jednokolová varianta není", () => {
    expect(totalRounds(14)).toBe(26);
    expect(midSeasonFormat(26, 14)).toBe("double");
    expect(midSeasonFormat(25, 14)).toBe("preseason");
    expect(midSeasonFormat(13, 14)).toBe("preseason");
    expect(midSeasonFormat(10, 6)).toBe("double");
    expect(midSeasonFormat(9, 6)).toBe("preseason");
    expect(midSeasonFormat(40, 1)).toBe("preseason");
  });

  it("termíny jsou hrací dny a soboty, nejvýš tři kola týdně a bez svátků", () => {
    // Od pondělí 11. 1. do čtvrtka 28. 1. 2027: po, čt × 3 týdny = 6, k tomu soboty 16. a 23. 1.
    expect(countRoundSlots(new Date("2027-01-11T00:00:00.000Z"), LAST_ROUND)).toBe(6 + 2);
    // Bez dne navíc jen hrací dny.
    expect(countRoundSlots(new Date("2027-01-11T00:00:00.000Z"), LAST_ROUND, [1, 4], -1)).toBe(6);
    // Od 14. 12.: 14., 17. a 19. 12., pak až od 4. 1. (21. 12. až 2. 1. se nehraje).
    expect(countRoundSlots(new Date("2026-12-14T00:00:00.000Z"), LAST_ROUND)).toBe(3 + 8 + 3);
  });
});

describe("plán rozpisu nové ligy", () => {
  it("v listopadu se dvoukolo vejde jen se sobotami: 26 kol, první nejdřív za dva dny", () => {
    // Stav produkce 14. 11. 2026 (Strakonice): poslední kolo sezóny 28. 1. 2027.
    const p = plan("2026-11-14T16:00:00.000Z");
    expect(p.format).toBe("double");
    expect(p.entries).toHaveLength(26);
    expect(p.entries[0].scheduledAt).toBe("2026-11-16T17:00:00.000Z");
    expect(p.entries[25].scheduledAt <= LAST_ROUND.toISOString()).toBe(true);
    const perWeek = new Map<string, number>();
    for (const e of p.entries) {
      const at = new Date(e.scheduledAt);
      expect([1, 4, 6]).toContain(at.getUTCDay());
      expect(isSeniorHolidayBlocked(at), e.scheduledAt).toBe(false);
      const monday = new Date(at.getTime() - ((at.getUTCDay() + 6) % 7) * 86_400_000).toISOString().slice(0, 10);
      perWeek.set(monday, (perWeek.get(monday) ?? 0) + 1);
    }
    for (const [week, count] of perWeek) expect(count, week).toBeLessThanOrEqual(MAX_ROUNDS_PER_WEEK);
    // 14 klubů, 26 kol po 7 zápasech, každá dvojice doma i venku.
    expect(p.matches).toHaveLength(26 * 7);
    expect(new Set(p.matches.map((m) => `${m.homeTeamIndex}-${m.awayTeamIndex}`)).size).toBe(182);
  });

  it("s dostatkem času se hraje jen v hracích dnech ligy", () => {
    const early = planMidSeasonSchedule(
      { leagueId: "L", seasonNumber: 3, gameDate: new Date("2026-10-22T16:00:00.000Z"), lastDate: new Date("2027-02-08T17:00:00.000Z"), teamCount: 14 },
      createRng(7),
    );
    expect(early.format).toBe("double");
    expect(early.entries).toHaveLength(26);
    for (const e of early.entries) expect([1, 4]).toContain(new Date(e.scheduledAt).getUTCDay());
  });

  it("když se dvoukolo nevejde ani se sobotami: přípravné období bez rozpisu", () => {
    const p = plan("2026-11-21T16:00:00.000Z");
    expect(p.matchDays).toBeLessThan(26);
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
    expect(await insertLeagueSchedule(db, "L", 3, p, teamIds)).toEqual({ rounds: 26, matches: 182 });

    const rounds = await db.prepare(
      `SELECT sc.game_week, COUNT(m.id) AS matches, COUNT(DISTINCT m.home_team_id) + COUNT(DISTINCT m.away_team_id) AS teams
         FROM season_calendar sc JOIN matches m ON m.calendar_id = sc.id
        WHERE sc.league_id = 'L' AND sc.season_number = 3 GROUP BY sc.id ORDER BY sc.game_week`,
    ).all<{ game_week: number; matches: number; teams: number }>();
    expect(rounds.results).toHaveLength(26);
    for (const r of rounds.results) expect(r).toMatchObject({ matches: 7, teams: 14 });
  });
});
