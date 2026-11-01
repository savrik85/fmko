import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { Miniflare } from "miniflare";
import { redrawFirstRound } from "./cup";

/**
 * Pohár 3. sezóny měl 56 klubů a 8 volných losů pro nejsilnější. Uživatel 11-01 chce, aby
 * 1. kolo hráli všichni: přelosování doplní 8 hostů a vylosuje 32 zápasů.
 */
describe("přelosování 1. kola poháru", () => {
  let miniflare: Miniflare;
  let db: D1Database;
  const CUP = "cup-s3";

  beforeAll(async () => {
    miniflare = new Miniflare({ modules: true, script: "export default { fetch() { return new Response('ok'); } }", d1Databases: ["DB"] });
    db = await miniflare.getD1Database("DB");
    for (const sql of [
      "CREATE TABLE cup_competitions (id TEXT PRIMARY KEY, season_number INTEGER, status TEXT, total_rounds INTEGER, current_round INTEGER)",
      "CREATE TABLE cup_teams (id TEXT PRIMARY KEY, cup_id TEXT, team_id TEXT, name TEXT, strength INTEGER, is_big_club INTEGER, primary_color TEXT, eliminated_round INTEGER)",
      `CREATE TABLE cup_matches (id TEXT PRIMARY KEY, cup_id TEXT, round INTEGER, bracket_pos INTEGER, home_cup_team_id TEXT, away_cup_team_id TEXT,
        scheduled_at TEXT, status TEXT, UNIQUE (cup_id, round, bracket_pos))`,
      "CREATE TABLE lineups (id TEXT PRIMARY KEY, team_id TEXT, calendar_id TEXT)",
    ]) await db.prepare(sql).run();
  });

  afterAll(async () => { await miniflare.dispose(); });

  beforeEach(async () => {
    for (const t of ["cup_competitions", "cup_teams", "cup_matches", "lineups"]) await db.prepare(`DELETE FROM ${t}`).run();
    await db.prepare("INSERT INTO cup_competitions VALUES (?, 3, 'active', 6, 1)").bind(CUP).run();
    const stmts: D1PreparedStatement[] = [];
    for (let i = 0; i < 56; i++) {
      stmts.push(db.prepare("INSERT INTO cup_teams VALUES (?, ?, ?, ?, ?, 0, NULL, NULL)").bind(`ct${i}`, CUP, `team${i}`, `Klub ${i}`, 40 + (i % 20)));
    }
    // Starý los: 24 zápasů, ct0–ct7 (nejsilnější) mají volný los.
    for (let pos = 0; pos < 24; pos++) {
      stmts.push(db.prepare("INSERT INTO cup_matches VALUES (?, ?, 1, ?, ?, ?, '2026-11-14T16:00:00.000Z', 'scheduled')")
        .bind(`m${pos}`, CUP, pos, `ct${8 + pos * 2}`, `ct${9 + pos * 2}`));
    }
    stmts.push(db.prepare("INSERT INTO lineups VALUES ('l1', 'team8', 'm0')"));
    await db.batch(stmts);
  });

  async function roundOne() {
    return (await db.prepare("SELECT home_cup_team_id AS h, away_cup_team_id AS a, scheduled_at FROM cup_matches WHERE cup_id = ? AND round = 1").bind(CUP)
      .all<{ h: string; a: string; scheduled_at: string }>()).results;
  }

  it("doplní 8 hostů, vylosuje 32 zápasů, hrají všichni a termín zůstane", async () => {
    const r = await redrawFirstRound(db, CUP);
    expect(r).toMatchObject({ ok: true, guests: 8, matches: 32, byes: 0 });
    const matches = await roundOne();
    expect(matches).toHaveLength(32);
    const playing = new Set(matches.flatMap((m) => [m.h, m.a]));
    expect(playing.size).toBe(64);
    expect(matches.every((m) => m.scheduled_at === "2026-11-14T16:00:00.000Z")).toBe(true);
    const guests = (await db.prepare("SELECT id FROM cup_teams WHERE cup_id = ? AND team_id IS NULL").bind(CUP).all<{ id: string }>()).results.map((g) => g.id);
    expect(guests).toHaveLength(8);
    // Host hraje venku, nikdy proti jinému hostovi.
    for (const m of matches) expect(guests.includes(m.h)).toBe(false);
    // Sestava na zápas, který už neexistuje, zmizela.
    expect((await db.prepare("SELECT COUNT(*) AS n FROM lineups").first<{ n: number }>())?.n).toBe(0);
  });

  it("opakované přelosování hosty nepřidává", async () => {
    await redrawFirstRound(db, CUP);
    const again = await redrawFirstRound(db, CUP);
    expect(again).toMatchObject({ ok: true, guests: 8, matches: 32 });
    expect((await db.prepare("SELECT COUNT(*) AS n FROM cup_teams WHERE team_id IS NULL").first<{ n: number }>())?.n).toBe(8);
  });

  it("odehrané 1. kolo už přelosovat nejde", async () => {
    await db.prepare("UPDATE cup_matches SET status = 'simulated' WHERE id = 'm3'").run();
    expect(await redrawFirstRound(db, CUP)).toEqual({ ok: false, error: "1. kolo se už začalo hrát" });
  });
});
