/**
 * III. třída založená uprostřed sezóny na skutečné D1 (Miniflare, všechny migrace):
 * výběr obcí, nanečisto bez zápisu, 14 AI klubů se stadionem, rozpis středa a neděle do
 * posledního kola přeboru, U21 den po áčku, bez postupu a sestupu i po odehrané sezóně
 * a rollover, který III. třídě nechá středu a neděli.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { Miniflare } from "miniflare";
import { Hono } from "hono";
import { teamsRouter } from "../routes/teams";
import { adminAiClubsRouter } from "../routes/admin-ai-clubs";
import { createSession } from "../auth/session";
import { rolloverAllLeagues } from "../season/season-rollover";
import { modestBudgetTarget } from "../ai-clubs/leveling";
import type { Bindings } from "../index";
import { applyDistrictPromotions, leagueMovement } from "./district-promotion";
import { createLowerLeague, LowerLeagueError, pickLowerLeagueVillages, type LowerLeagueResult } from "./lower-league-setup";

const DISTRICT = "Prachatice";
const app = new Hono<{ Bindings: Bindings }>();
app.route("/api/teams", teamsRouter);
app.route("/api/admin/ai-clubs", adminAiClubsRouter);

let mf: Miniflare;
let db: D1Database;
let env: Bindings;
let preborId: string;
let created: LowerLeagueResult;
let dryRun: LowerLeagueResult;

async function count(sql: string, ...binds: unknown[]): Promise<number> {
  return (await db.prepare(sql).bind(...binds).first<{ n: number }>())?.n ?? 0;
}

async function snapshot(): Promise<Record<string, number>> {
  const out: Record<string, number> = {};
  for (const table of ["leagues", "teams", "players", "season_calendar", "matches", "stadiums", "equipment", "staff_members", "managers"]) {
    out[table] = await count(`SELECT COUNT(*) AS n FROM ${table}`);
  }
  out.promotionOff = await count("SELECT COUNT(*) AS n FROM leagues WHERE promotion_enabled = 0");
  return out;
}

async function createTeam(userId: string, villageId: string, name: string) {
  await db.prepare("INSERT OR IGNORE INTO users (id, email, password_hash) VALUES (?, ?, 'x')").bind(userId, `${userId}@example.test`).run();
  const token = await createSession(env.SESSION_KV, userId, `${userId}@example.test`, null);
  const res = await app.request("/api/teams", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ villageId, name, managerName: `Trenér ${name}`, managerBackstory: "hospodsky" }),
  }, env);
  return { status: res.status, body: await res.json() as Record<string, unknown> };
}

/** Všem AI týmům ligy dá aktivního lidského majitele (vzor narovnání). */
async function fillWithHumans(leagueId: string, prefix: string): Promise<void> {
  const ai = await db.prepare("SELECT id FROM teams WHERE league_id = ? AND user_id = 'ai'").bind(leagueId).all<{ id: string }>();
  const now = new Date().toISOString().slice(0, 19) + "Z";
  for (const [i, t] of ai.results.entries()) {
    const uid = `${prefix}-${i}`;
    await db.prepare("INSERT OR IGNORE INTO users (id, email, password_hash) VALUES (?, ?, 'x')").bind(uid, `${uid}@example.test`).run();
    await db.prepare("UPDATE teams SET user_id = ? WHERE id = ? OR parent_team_id = ?").bind(uid, t.id, t.id).run();
  }
  await db.prepare("UPDATE users SET last_activity_at = ? WHERE id <> 'ai'").bind(now).run();
}

/** Odehraje všechny zápasy ligy (domácí vyhrají 1:0) a kola označí za odehraná. */
async function playLeague(leagueId: string): Promise<void> {
  await db.prepare("UPDATE matches SET status = 'simulated', home_score = 1, away_score = 0 WHERE league_id = ?").bind(leagueId).run();
  await db.prepare("UPDATE season_calendar SET status = 'simulated' WHERE league_id = ?").bind(leagueId).run();
}

beforeAll(async () => {
  mf = new Miniflare({
    modules: true,
    script: "export default { fetch() { return new Response('ok'); } }",
    d1Databases: ["DB"],
    kvNamespaces: ["SESSION_KV", "CACHE_KV"],
  });
  db = await mf.getD1Database("DB");
  env = { DB: db, SESSION_KV: await mf.getKVNamespace("SESSION_KV"), CACHE_KV: await mf.getKVNamespace("CACHE_KV") } as unknown as Bindings;
  const dir = new URL("../../migrations/", import.meta.url);
  for (const file of readdirSync(dir).filter((f) => f.endsWith(".sql")).sort()) {
    await db.exec(readFileSync(new URL(file, dir), "utf8").replace(/--[^\n]*/g, "").replace(/\n/g, " "));
  }
  // `users.last_activity_at` má produkce, ale žádná migrace ho nezakládá (přidán ručně).
  if (!(await db.prepare("SELECT 1 FROM pragma_table_info('users') WHERE name = 'last_activity_at'").first())) {
    await db.exec("ALTER TABLE users ADD COLUMN last_activity_at TEXT");
  }
  await db.prepare("INSERT OR REPLACE INTO district_registrations (district, status, ready_at) VALUES (?, 'ready', '2026-09-01')").bind(DISTRICT).run();
  await db.prepare("INSERT INTO users (id, email, password_hash, is_admin) VALUES ('admin', 'admin@example.test', 'x', 1)").run();

  // Přebor okresu: zakladatel z Vimperka, ostatní kluby převezmou lidé (všechny aktivní).
  const founder = await createTeam("founder", "p02", "FK Vimperk");
  expect(founder.status).toBe(201);
  preborId = String(founder.body.leagueId);
  await fillWithHumans(preborId, "prebor");
}, 300_000);

afterAll(async () => {
  await mf.dispose();
});

describe("III. třída uprostřed sezóny", () => {
  it("obce: 14 největších bez klubu (ani U21), bez okresního města", async () => {
    // Obec, kde hraje jen rezerva cizího klubu, má klub (na produkci Bohumilice).
    const free = await pickLowerLeagueVillages(db, DISTRICT, 40);
    const u21Only = free[0];
    const someU21 = await db.prepare("SELECT id FROM teams WHERE league_id <> ? AND team_type = 'u21' LIMIT 1").bind(preborId).first<{ id: string }>();
    expect(someU21).not.toBeNull();
    const original = await db.prepare("SELECT village_id FROM teams WHERE id = ?").bind(someU21!.id).first<{ village_id: string }>();
    await db.prepare("UPDATE teams SET village_id = ? WHERE id = ?").bind(u21Only, someU21!.id).run();

    const picked = await pickLowerLeagueVillages(db, DISTRICT);
    expect(picked).toHaveLength(14);
    expect(picked).not.toContain(u21Only);
    const rows = await db.prepare(`SELECT id, size, population FROM villages WHERE id IN (${picked.map(() => "?").join(",")})`)
      .bind(...picked).all<{ id: string; size: string; population: number }>();
    for (const r of rows.results) expect(["small_city", "city"]).not.toContain(r.size);
    expect(await count(`SELECT COUNT(*) AS n FROM teams WHERE village_id IN (${picked.map(() => "?").join(",")})`, ...picked)).toBe(0);
    const pops = picked.map((id) => rows.results.find((r) => r.id === id)!.population);
    expect([...pops].sort((a, b) => b - a)).toEqual(pops);
    expect(picked).not.toContain("p01"); // Prachatice (small_city) zůstává volná pro hráče

    await db.prepare("UPDATE teams SET village_id = ? WHERE id = ?").bind(original!.village_id, someU21!.id).run();
  }, 60_000);

  it("nanečisto nic nezapíše a ukáže obce, kluby a rozpis", async () => {
    const before = await snapshot();
    const dry = await createLowerLeague(db, { district: DISTRICT, seed: 77, dryRun: true });
    dryRun = dry;
    expect(await snapshot()).toEqual(before);
    expect(dry.dryRun).toBe(true);
    expect(dry.leagueId).toBeNull();
    expect(dry.name).toBe("III. třída Prachatice");
    expect(dry.villages).toHaveLength(14);
    expect(dry.teams).toHaveLength(14);
    expect(dry.calendar.rounds).toBe(26);

    // Endpoint nanečisto dá totéž (stejné semínko) a jen adminovi.
    const adminToken = await createSession(env.SESSION_KV, "admin", "admin@example.test", null);
    const res = await app.request(`/api/admin/ai-clubs/lower-league?district=${encodeURIComponent(DISTRICT)}&seed=77&dryRun=1`,
      { method: "POST", headers: { Authorization: `Bearer ${adminToken}` } }, env);
    expect(res.status).toBe(200);
    const body = await res.json() as LowerLeagueResult & { seed: number };
    expect(body.seed).toBe(77);
    expect(body.teams.map((t) => t.name)).toEqual(dry.teams.map((t) => t.name));
    expect(body.calendar.entries).toEqual(dry.calendar.entries);
    expect(await snapshot()).toEqual(before);
    const noPrebor = await app.request("/api/admin/ai-clubs/lower-league?district=Benešov&dryRun=1",
      { method: "POST", headers: { Authorization: `Bearer ${adminToken}` } }, env);
    expect(noPrebor.status).toBe(400);
    await expect(createLowerLeague(db, { district: "Benešov", seed: 1, dryRun: true })).rejects.toBeInstanceOf(LowerLeagueError);
  }, 60_000);

  it("naostro: 14 AI klubů se zázemím, 26 kol ve středu a v neděli, U21 den po áčku, bez postupu", async () => {
    created = await createLowerLeague(db, { district: DISTRICT, seed: 77, dryRun: false });
    const leagueId = created.leagueId!;
    const u21Id = created.u21LeagueId!;
    expect(created.resumed).toBe(false);

    const league = await db.prepare("SELECT name, level, league_type, match_weekdays, promotion_enabled FROM leagues WHERE id = ?")
      .bind(leagueId).first<{ name: string; level: string; league_type: string; match_weekdays: string; promotion_enabled: number }>();
    expect(league).toEqual({ name: "III. třída Prachatice", level: "okresni_soutez", league_type: "senior", match_weekdays: "3,0", promotion_enabled: 0 });
    expect((await db.prepare("SELECT promotion_enabled FROM leagues WHERE id = ?").bind(preborId).first<{ promotion_enabled: number }>())!.promotion_enabled).toBe(0);

    // Kluby: AI, každý se stadionem, vybavením a AI trenérem s povahou.
    const teams = await db.prepare("SELECT id, user_id, village_id, game_date, season_start, season_end FROM teams WHERE league_id = ?")
      .bind(leagueId).all<{ id: string; user_id: string; village_id: string; game_date: string; season_start: string | null; season_end: string | null }>();
    expect(teams.results).toHaveLength(14);
    // Naostro vzniklo přesně to, co ukázal plán nanečisto (stejné semínko): obce, jména, rozpis.
    expect(created.teams.map((t) => t.name).sort()).toEqual(dryRun.teams.map((t) => t.name).sort());
    expect(teams.results.map((t) => t.village_id).sort()).toEqual(dryRun.villages.map((v) => v.id).sort());
    expect(created.calendar.entries.map((e) => e.scheduledAt)).toEqual(dryRun.calendar.entries.map((e) => e.scheduledAt));
    const prebor = await db.prepare("SELECT MAX(game_date) AS game_date, MAX(season_start) AS season_start, MAX(season_end) AS season_end FROM teams WHERE league_id = ?")
      .bind(preborId).first<{ game_date: string; season_start: string; season_end: string }>();
    for (const t of teams.results) {
      expect(t.user_id).toBe("ai");
      expect(t.game_date).toBe(prebor!.game_date);
      expect(t.season_start).toBe(prebor!.season_start);
      expect(t.season_end).toBe(prebor!.season_end);
      expect(await count("SELECT COUNT(*) AS n FROM stadiums WHERE team_id = ?", t.id)).toBe(1);
      expect(await count("SELECT COUNT(*) AS n FROM equipment WHERE team_id = ?", t.id)).toBe(1);
      expect(await count("SELECT COUNT(*) AS n FROM managers WHERE team_id = ? AND user_id = 'ai' AND ai_profile IS NOT NULL", t.id)).toBe(1);
      expect(await count("SELECT COUNT(*) AS n FROM players WHERE team_id = ? AND (residence IS NULL OR squad_number IS NULL)", t.id)).toBe(0);
    }

    // Rozpis: 26 kol, 182 zápasů, jen středa a neděle (případně pátek), nejdřív 2 dny po herním dni, nejpozději s přeborem.
    const calendar = await db.prepare("SELECT id, game_week, match_day, scheduled_at FROM season_calendar WHERE league_id = ? ORDER BY scheduled_at")
      .bind(leagueId).all<{ id: string; game_week: number; match_day: string; scheduled_at: string }>();
    expect(calendar.results).toHaveLength(26);
    expect(await count("SELECT COUNT(*) AS n FROM matches WHERE league_id = ?", leagueId)).toBe(14 * 13);
    const preborLast = (await db.prepare("SELECT MAX(scheduled_at) AS d FROM season_calendar WHERE league_id = ?").bind(preborId).first<{ d: string }>())!.d;
    const earliest = new Date(prebor!.game_date).getTime() + 2 * 86_400_000;
    for (const c of calendar.results) {
      expect(["wednesday", "sunday", "friday"]).toContain(c.match_day);
      expect(new Date(c.scheduled_at).getTime()).toBeGreaterThanOrEqual(earliest);
      expect(c.scheduled_at <= preborLast).toBe(true);
      expect(await count("SELECT COUNT(*) AS n FROM matches WHERE calendar_id = ?", c.id)).toBe(7);
    }
    // Každý tým hraje v každém kole právě jednou.
    expect(await count(
      `SELECT COUNT(*) AS n FROM (SELECT calendar_id, team FROM (
          SELECT calendar_id, home_team_id AS team FROM matches WHERE league_id = ?1
          UNION ALL SELECT calendar_id, away_team_id FROM matches WHERE league_id = ?1)
        GROUP BY calendar_id, team HAVING COUNT(*) > 1)`, leagueId)).toBe(0);

    // U21: 14 týmů, kolo vždy 24 h po kole áčka se stejnými páry.
    expect(await count("SELECT COUNT(*) AS n FROM teams WHERE league_id = ? AND team_type = 'u21'", u21Id)).toBe(14);
    expect(await count("SELECT COUNT(*) AS n FROM matches WHERE league_id = ?", u21Id)).toBe(14 * 13);
    const mirrored = await db.prepare(
      `SELECT u.scheduled_at AS u21, s.scheduled_at AS senior FROM season_calendar u JOIN season_calendar s ON s.id = u.parent_calendar_id
        WHERE u.league_id = ?`,
    ).bind(u21Id).all<{ u21: string; senior: string }>();
    expect(mirrored.results).toHaveLength(26);
    for (const r of mirrored.results) expect(new Date(r.u21).getTime() - new Date(r.senior).getTime()).toBe(86_400_000);
    for (const t of (await db.prepare("SELECT game_date FROM teams WHERE league_id = ?").bind(u21Id).all<{ game_date: string }>()).results) {
      expect(t.game_date).toBe(prebor!.game_date);
    }

    // Narovnání pod přebor: síla mezi nejslabším klubem přeboru minus 12 a nejslabším klubem.
    const senior = created.leveling.senior!;
    expect(senior.plan.mode).toBe("below-league");
    expect(senior.plan.reference.teams).toBe(14);
    expect(senior.result!.failedStatements).toBe(0);
    const min = senior.plan.reference.top11!.min;
    for (const club of senior.plan.clubs) {
      expect(club.target.top11).toBeGreaterThanOrEqual(min - 12 - 0.1);
      expect(club.target.top11).toBeLessThanOrEqual(min + 0.1);
      expect(club.after.top11).toBeGreaterThanOrEqual(club.before.top11);
      const village = (await db.prepare("SELECT v.population FROM teams t JOIN villages v ON v.id = t.village_id WHERE t.id = ?")
        .bind(club.teamId).first<{ population: number }>())!;
      expect(club.target.budget).toBe(modestBudgetTarget(village.population, club.percentile));
      expect((await db.prepare("SELECT budget FROM teams WHERE id = ?").bind(club.teamId).first<{ budget: number }>())!.budget).toBe(club.target.budget);
    }
    expect(created.leveling.u21!.plan.clubs).toHaveLength(14);
    expect(created.leveling.u21!.result!.failedStatements).toBe(0);

    expect(await leagueMovement(db, preborId)).toEqual({ promotion: false, relegation: false });
    expect(await leagueMovement(db, leagueId)).toEqual({ promotion: false, relegation: false });
  }, 300_000);

  it("opakované volání nic nezdvojí", async () => {
    const before = await snapshot();
    const again = await createLowerLeague(db, { district: DISTRICT, seed: 77, dryRun: false });
    expect(again.resumed).toBe(true);
    expect(again.leagueId).toBe(created.leagueId);
    expect(again.u21LeagueId).toBe(created.u21LeagueId);
    expect(again.calendar.rounds).toBe(26);
    expect(await snapshot()).toEqual(before);
  }, 300_000);

  it("po odehrané sezóně se nic nepřesune a rollover nechá III. třídě středu a neděli", async () => {
    const leagueId = created.leagueId!;
    await playLeague(preborId);
    await playLeague(leagueId);
    const leaguesOf = async () => (await db.prepare("SELECT id, league_id FROM teams WHERE league_id IN (?, ?) ORDER BY id")
      .bind(preborId, leagueId).all()).results;
    const before = await leaguesOf();
    expect(await applyDistrictPromotions(db, 1, "2027-02-01T16:00:00.000Z")).toEqual([]);
    expect(await leaguesOf()).toEqual(before);

    await rolloverAllLeagues(db, 1);
    expect(await leaguesOf()).toEqual(before);
    expect(await count("SELECT COUNT(*) AS n FROM news WHERE type = 'league_movement'")).toBe(0);
    const days = async (id: string) => (await db.prepare(
      "SELECT DISTINCT match_day FROM season_calendar WHERE league_id = ? AND season_number = 2 ORDER BY match_day",
    ).bind(id).all<{ match_day: string }>()).results.map((r) => r.match_day);
    expect(await days(leagueId)).toEqual(["sunday", "wednesday"]);
    expect(await days(preborId)).toEqual(["monday", "thursday"]);
    expect(await days(created.u21LeagueId!)).toEqual(["monday", "thursday"]);
    expect(await count(
      "SELECT COUNT(*) AS n FROM matches m JOIN season_calendar sc ON sc.id = m.calendar_id WHERE sc.league_id = ? AND sc.season_number = 2",
      leagueId)).toBe(14 * 13);
  }, 600_000);
});
