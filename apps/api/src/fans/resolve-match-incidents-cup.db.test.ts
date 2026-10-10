/**
 * Pohárový zápas proti velkoklubu na skutečné D1 (Miniflare, všechny migrace).
 *
 * Velkoklub nemá ve hře skutečný tým. Dřív se za něj dosazoval domácí, takže
 * domácí klub hrál „sám se sebou": na Tribuně mu fanoušci psali za obě strany
 * (prohra 5:8 i výhra 8:5 s vlastním klubem) a vznikla rivalita klubu se sebou.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { Miniflare } from "miniflare";
import { resolveMatchIncidents } from "./resolve-match-incidents";

const HOME = "t-home";
const HOME_NAME = "AC Jitona Spůle";
const BIG_CLUB = "AC Pardubice";
const CUP_MATCH = "cm-big-club";

let mf: Miniflare;
let db: D1Database;

beforeAll(async () => {
  mf = new Miniflare({
    modules: true,
    script: "export default { fetch() { return new Response('ok'); } }",
    d1Databases: ["DB"],
  });
  db = await mf.getD1Database("DB");
  const dir = new URL("../../migrations/", import.meta.url);
  for (const file of readdirSync(dir).filter((f) => f.endsWith(".sql")).sort()) {
    const source = readFileSync(new URL(file, dir), "utf8").replace(/--[^\n]*/g, "").replace(/\n/g, " ");
    await db.exec(source);
  }
  await db.batch([
    db.prepare("INSERT INTO users (id, email, password_hash) VALUES ('u1', 'u1@test.cz', 'x')"),
    db.prepare(`INSERT INTO villages (id, name, district, region, population, size, lat, lng)
                VALUES ('v1', 'Spůle', 'Prachatice', 'Jihočeský', 300, 'village', 49.0, 14.0)`),
    db.prepare("INSERT INTO teams (id, user_id, village_id, name) VALUES (?, 'u1', 'v1', ?)").bind(HOME, HOME_NAME),
    db.prepare(`INSERT INTO cup_matches (id, cup_id, round, bracket_pos, home_cup_team_id, away_cup_team_id, home_score, away_score, status)
                VALUES (?, 'cup1', 8, 1, 'ct-home', 'ct-big', 5, 8, 'simulated')`).bind(CUP_MATCH),
  ]);

  await resolveMatchIncidents(db, {
    matchId: CUP_MATCH, table: "cup_matches",
    homeTeamId: HOME, awayTeamId: null, awayName: BIG_CLUB,
    homeScore: 5, awayScore: 8,
    attendance: 300, preMatchHeat: 0,
    leagueId: null, seasonNumber: 0, gameDate: "2026-10-10",
    sporneVerdikty: false, refereeId: null,
  });
});

afterAll(async () => {
  await mf.dispose();
});

describe("pohár proti velkoklubu bez skutečného týmu", () => {
  it("fanoušci píšou jen za domácí a soupeřem je velkoklub", async () => {
    const posts = await db.prepare("SELECT reference_id, body FROM fan_posts WHERE team_id = ?")
      .bind(HOME).all<{ reference_id: string; body: string }>();
    const matchPosts = posts.results.filter((p) => p.reference_id.startsWith(`zap-${CUP_MATCH}`));
    expect(matchPosts.length).toBeGreaterThan(0);
    for (const p of matchPosts) {
      expect(p.reference_id.startsWith(`zap-${CUP_MATCH}-a`)).toBe(false);
      expect(p.body).toContain(`5:8 s týmem ${BIG_CLUB}`);
      expect(p.body).not.toContain(`s týmem ${HOME_NAME}`);
    }
  });

  it("nevznikne rivalita klubu se sebou samým", async () => {
    const self = await db.prepare("SELECT count(*) AS n FROM fan_rivalries WHERE team_a = team_b").first<{ n: number }>();
    expect(self!.n).toBe(0);
  });

  it("hostující sektor je velkoklub, žádní vlastní fanoušci", async () => {
    const row = await db.prepare("SELECT away_fans FROM cup_matches WHERE id = ?").bind(CUP_MATCH)
      .first<{ away_fans: string }>();
    expect(JSON.parse(row!.away_fans)).toEqual({ pocet: 0, nazev: BIG_CLUB, incidenty: [] });
  });

  it("domácí klub nedostane žádný incident ani pokutu za hosty", async () => {
    const own = await db.prepare("SELECT count(*) AS n FROM fan_incidents WHERE opponent_team_id = team_id OR team_id IS NULL")
      .first<{ n: number }>();
    expect(own!.n).toBe(0);
  });
});
