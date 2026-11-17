/**
 * Zpětné vyrovnání dohnaných kol na skutečné D1 (Miniflare): liga a její U21 dohnaly kola
 * po termínu za jeden večer jako Strakonice 16. 11. 2026. Zranění se zkrátí o zpoždění,
 * zahojená zmizí, únava z dohnaných kol se vrátí, kolo v termínu zůstane, jak je, a druhý
 * běh nic nezmění. Navíc hlídá, že sazba regenerace sedí s denním tickem.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { Miniflare } from "miniflare";
import { dailyConditionRecovery, settleCaughtUpLeague, settledKey } from "./catch-up-round";

let mf: Miniflare;
let db: D1Database;
let kv: KVNamespace;

const LEAGUE = "L-strakonice";
const U21 = "L-strakonice-u21";

async function condition(playerId: string): Promise<number | null> {
  const row = await db.prepare("SELECT json_extract(life_context, '$.condition') AS c FROM players WHERE id = ?").bind(playerId).first<{ c: number | null }>();
  return row?.c ?? null;
}

async function injuryDays(id: string): Promise<number | null> {
  const row = await db.prepare("SELECT days_remaining FROM injuries WHERE id = ?").bind(id).first<{ days_remaining: number }>();
  return row?.days_remaining ?? null;
}

beforeAll(async () => {
  mf = new Miniflare({
    modules: true, script: "export default { fetch() { return new Response('ok'); } }",
    d1Databases: ["DB"], kvNamespaces: ["CACHE_KV"],
  });
  db = await mf.getD1Database("DB");
  kv = await mf.getKVNamespace("CACHE_KV") as unknown as KVNamespace;
  for (const sql of [
    "CREATE TABLE leagues (id TEXT PRIMARY KEY, league_type TEXT DEFAULT 'senior', parent_league_id TEXT)",
    `CREATE TABLE season_calendar (id TEXT PRIMARY KEY, league_id TEXT NOT NULL, season_number INTEGER NOT NULL,
       game_week INTEGER NOT NULL, scheduled_at TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'scheduled')`,
    `CREATE TABLE matches (id TEXT PRIMARY KEY, calendar_id TEXT, home_team_id TEXT NOT NULL, away_team_id TEXT NOT NULL,
       home_score INTEGER, away_score INTEGER, status TEXT NOT NULL, simulated_at TEXT)`,
    "CREATE TABLE players (id TEXT PRIMARY KEY, team_id TEXT, age INTEGER, physical TEXT, skills TEXT, life_context TEXT)",
    "CREATE TABLE teams (id TEXT PRIMARY KEY, league_id TEXT)",
    `CREATE TABLE injuries (id TEXT PRIMARY KEY, player_id TEXT NOT NULL, team_id TEXT NOT NULL, description TEXT,
       days_remaining INTEGER NOT NULL, days_total INTEGER NOT NULL, match_id TEXT, is_fake INTEGER NOT NULL DEFAULT 0,
       osobni_volno INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL DEFAULT (datetime('now')))`,
    `CREATE TABLE condition_log (id INTEGER PRIMARY KEY AUTOINCREMENT, player_id TEXT NOT NULL, team_id TEXT NOT NULL,
       old_value INTEGER, new_value INTEGER, delta INTEGER, source TEXT, description TEXT, game_date TEXT,
       created_at TEXT NOT NULL DEFAULT (datetime('now')))`,
    `INSERT INTO leagues (id, league_type, parent_league_id) VALUES ('${LEAGUE}', 'senior', NULL), ('${U21}', 'u21', '${LEAGUE}')`,
    `INSERT INTO teams (id, league_id) VALUES ('t1', '${LEAGUE}'), ('t2', '${LEAGUE}'), ('y1', '${U21}'), ('y2', '${U21}')`,
    // Kolo 1 s termínem 26. 10. dohnané 16. 11. (zpoždění 21 dní), kolo 2 v termínu 16. 11.
    `INSERT INTO season_calendar (id, league_id, season_number, game_week, scheduled_at, status) VALUES
       ('c1', '${LEAGUE}', 3, 1, '2026-10-26T17:00:00.000Z', 'simulated'),
       ('c2', '${LEAGUE}', 3, 2, '2026-11-16T17:00:00.000Z', 'simulated'),
       ('c3', '${LEAGUE}', 3, 3, '2026-11-19T17:00:00.000Z', 'scheduled'),
       ('u1', '${U21}', 3, 1, '2026-10-27T17:00:00.000Z', 'simulated')`,
    `INSERT INTO matches (id, calendar_id, home_team_id, away_team_id, home_score, away_score, status, simulated_at) VALUES
       ('m1', 'c1', 't1', 't2', 1, 0, 'simulated', '2026-11-16T17:05:08Z'),
       ('m2', 'c2', 't1', 't2', 2, 2, 'simulated', '2026-11-16T17:30:00Z'),
       ('mu', 'u1', 'y1', 'y2', 0, 0, 'simulated', '2026-11-16T17:40:11Z')`,
    `INSERT INTO players (id, team_id, age, physical, life_context) VALUES
       ('p1', 't1', 22, '{"stamina":80}', '{"condition":0}'),
       ('p2', 't2', 33, '{"stamina":30}', '{"condition":20}'),
       ('p3', 't1', 27, '{"stamina":60}', '{"condition":70}'),
       ('y1p', 'y1', 19, '{"stamina":50}', '{"condition":10}')`,
    // Únava: p1 v dohnaném kole −56 a v kole v termínu −44 (ta zůstane), p2 jen v dohnaném,
    // p3 jen v kole v termínu. Záznam jiného zápasu (jiné skóre) se nepočítá.
    `INSERT INTO condition_log (player_id, team_id, old_value, new_value, delta, source, description, created_at) VALUES
       ('p1', 't1', 100, 44, -56, 'match', 'Zápas (1:0)', '2026-11-16 17:05:10'),
       ('p2', 't2', 60, 20, -40, 'match', 'Zápas (1:0)', '2026-11-16 17:05:11'),
       ('p1', 't1', 44, 0, -44, 'match', 'Zápas (2:2)', '2026-11-16 17:30:03'),
       ('p3', 't1', 100, 70, -30, 'match', 'Zápas (2:2)', '2026-11-16 17:30:03'),
       ('y1p', 'y1', 70, 10, -60, 'match', 'Zápas (0:0)', '2026-11-16 17:40:13')`,
    `INSERT INTO injuries (id, player_id, team_id, description, days_remaining, days_total, match_id) VALUES
       ('i1', 'p1', 't1', 'křeče', 9, 10, 'm1'),
       ('i2', 'p2', 't2', 'koleno', 30, 31, 'm1'),
       ('i3', 'p2', 't2', 'naraženina', 5, 5, 'm2'),
       ('i4', 'y1p', 'y1', 'natažený sval', 4, 5, 'mu')`,
    // Zranění z událostí mezi koly: po dohnaném kole 1 (zkrátí se) a po kole 2 v termínu (zůstane).
    `INSERT INTO injuries (id, player_id, team_id, description, days_remaining, days_total, match_id, created_at) VALUES
       ('i5', 'p3', 't1', 'podvrtnutý kotník', 25, 28, NULL, '2026-11-16 17:06:00'),
       ('i6', 'p3', 't1', 'natažený sval', 6, 7, NULL, '2026-11-16 17:31:00')`,
  ]) await db.prepare(sql).run();
});

afterAll(async () => { await mf?.dispose(); });

describe("zpětné vyrovnání dohnaných kol", () => {
  it("nanečisto ukáže dohnaná kola áčka i U21 a nic nezapíše", async () => {
    const r = await settleCaughtUpLeague(db, kv, LEAGUE, { dryRun: true });
    expect(r.ok).toBe(true);
    expect(r.rounds.map((x) => [x.calendarId, x.lagDays])).toEqual([["c1", 21], ["u1", 20]]);
    expect(r.rounds[0]).toMatchObject({ injuriesShortened: 2, injuriesHealed: 1, playersRecovered: 2 });
    expect(await condition("p1")).toBe(0);
    expect(await injuryDays("i1")).toBe(9);
    expect(await kv.get(settledKey("c1"))).toBeNull();
  });

  it("zkrátí zranění, zahojená smaže a vrátí únavu jen z dohnaných kol", async () => {
    const r = await settleCaughtUpLeague(db, kv, LEAGUE, { dryRun: false, now: new Date("2026-11-17T21:00:00Z") });
    expect(r.ok).toBe(true);
    // p1: 0 + 56 (únava z kola v termínu −44 zůstává), p2: 20 + 40, p3 beze změny, U21: 10 + 60.
    expect(await condition("p1")).toBe(56);
    expect(await condition("p2")).toBe(60);
    expect(await condition("p3")).toBe(70);
    expect(await condition("y1p")).toBe(70);
    expect(await injuryDays("i1")).toBeNull();
    expect(await injuryDays("i2")).toBe(9);
    expect(await injuryDays("i3")).toBe(5);
    expect(await injuryDays("i4")).toBeNull();
    expect(await injuryDays("i5")).toBe(4);
    expect(await injuryDays("i6")).toBe(6);
    const last = await db.prepare("SELECT json_extract(life_context, '$.lastInjury.description') AS d FROM players WHERE id = 'p1'").first<{ d: string }>();
    expect(last?.d).toBe("křeče");
    const logged = await db.prepare("SELECT COUNT(*) AS n FROM condition_log WHERE source = 'recovery'").first<{ n: number }>();
    expect(logged?.n).toBe(3);
  });

  it("druhý běh kola přeskočí a nic nezmění", async () => {
    const r = await settleCaughtUpLeague(db, kv, LEAGUE, { dryRun: false });
    expect(r.rounds.every((x) => x.alreadySettled)).toBe(true);
    expect(await condition("p1")).toBe(56);
    expect(await injuryDays("i2")).toBe(9);
  });

  it("U21 samotnou odmítne, vyrovnává se s áčkem", async () => {
    const r = await settleCaughtUpLeague(db, kv, U21, { dryRun: true });
    expect(r.ok).toBe(false);
  });

  it("sazba regenerace sedí se SQL denního ticku", async () => {
    const src = readFileSync(new URL("../season/daily-tick.ts", import.meta.url), "utf8");
    const expr = src.match(/const recoveryNewCondSql = `([\s\S]*?)`;/)?.[1];
    expect(expr).toBeTruthy();
    for (const stamina of [0, 24, 25, 49, 50, 74, 75, 100]) {
      for (const age of [17, 21, 22, 25, 26, 30, 31, 35, 36, 40]) {
        const row = await db.prepare(
          `SELECT ${expr} AS v FROM (SELECT '{"condition":0}' AS life_context, json_object('stamina', ?) AS physical, NULL AS skills, ? AS age)`,
        ).bind(stamina, age).first<{ v: number }>();
        expect(row?.v, `výdrž ${stamina}, věk ${age}`).toBe(dailyConditionRecovery(stamina, age));
      }
    }
  });
});
