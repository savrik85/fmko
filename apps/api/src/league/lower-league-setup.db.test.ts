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
import { districtLeagueIds } from "../competition/rules";
import { alignLeagueSchedule } from "./align-schedule";
import { clearLeagueSchedule, deleteLeague } from "./delete-league";
import { resolveDistrictSlot } from "./district-leagues";
import { enqueueLeagueCatchUp, startWaitingLeague } from "./start-league";
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
let fourth: LowerLeagueResult;
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
      // Slabší po narovnání jen tehdy, když dorostence srazil strop podle lidských vrstevníků
      if (club.youthLowered === 0) expect(club.after.top11).toBeGreaterThanOrEqual(club.before.top11);
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

  it("IV. třída: bez III. třídy nevznikne, špatná úroveň skončí chybou", async () => {
    const res = await app.request(`/api/admin/ai-clubs/lower-league?district=${encodeURIComponent(DISTRICT)}&level=krajsky_prebor&dryRun=1`,
      { method: "POST", headers: { Authorization: `Bearer ${await createSession(env.SESSION_KV, "admin", "admin@example.test", null)}` } }, env);
    expect(res.status).toBe(400);
    await db.prepare("UPDATE leagues SET status = 'finished' WHERE id = ?").bind(created.leagueId).run();
    await expect(createLowerLeague(db, { district: DISTRICT, seed: 5, dryRun: true, level: "iv_trida" })).rejects.toThrow(/III\. třída/);
    await db.prepare("UPDATE leagues SET status = 'active' WHERE id = ?").bind(created.leagueId).run();
  }, 60_000);

  it("IV. třída: 14 AI klubů z dalších obcí, celé dvoukolo, síla pod III. třídou, nový hráč jde do ní", async () => {
    const thirdId = created.leagueId!;
    await fillWithHumans(thirdId, "third");
    // Migrace mají v okrese míň obcí než produkce (tam je volných 55), osm zbylých nestačí.
    const extraVillages = ["Zdíkov Horní", "Lenora Nová", "Stachy Dolní", "Vacov Malý", "Ktiš Horní", "Záblatí Dolní", "Nová Pec Zadní", "Strážný Dolní"];
    for (const [i, villageName] of extraVillages.entries()) {
      await db.prepare(
        "INSERT INTO villages (id, name, district, region, population, size, lat, lng) VALUES (?, ?, ?, 'Jihočeský kraj', ?, 'hamlet', 49.0, 13.9)",
      ).bind(`extra-village-${i}`, villageName, DISTRICT, 300 + i).run();
    }
    const thirdVillages = (await db.prepare("SELECT village_id FROM teams WHERE league_id = ?").bind(thirdId).all<{ village_id: string }>())
      .results.map((r) => r.village_id);
    const thirdCalendar = await db.prepare("SELECT id, scheduled_at FROM season_calendar WHERE league_id = ? ORDER BY game_week")
      .bind(thirdId).all<{ id: string; scheduled_at: string }>();
    const before = await snapshot();

    const dry = await createLowerLeague(db, { district: DISTRICT, seed: 91, dryRun: true, level: "iv_trida" });
    expect(await snapshot()).toEqual(before);
    expect(dry.name).toBe("IV. třída Prachatice");
    expect(dry.calendar.rounds).toBe(26);

    fourth = await createLowerLeague(db, { district: DISTRICT, seed: 91, dryRun: false, level: "iv_trida" });
    const leagueId = fourth.leagueId!;
    expect(leagueId).not.toBe(thirdId);
    const league = await db.prepare("SELECT name, level, league_type, match_weekdays, promotion_enabled FROM leagues WHERE id = ?")
      .bind(leagueId).first();
    expect(league).toEqual({ name: "IV. třída Prachatice", level: "iv_trida", league_type: "senior", match_weekdays: "2,6", promotion_enabled: 0 });
    expect(fourth.promotionDisabled).toEqual([leagueId]);

    // Kluby z obcí, které nemá přebor ani III. třída, všechny AI.
    const teams = await db.prepare("SELECT id, user_id, village_id FROM teams WHERE league_id = ?").bind(leagueId)
      .all<{ id: string; user_id: string; village_id: string }>();
    expect(teams.results).toHaveLength(14);
    for (const t of teams.results) {
      expect(t.user_id).toBe("ai");
      expect(thirdVillages).not.toContain(t.village_id);
      expect(await count("SELECT COUNT(*) AS n FROM stadiums WHERE team_id = ?", t.id)).toBe(1);
    }
    expect(fourth.teams.map((t) => t.name).sort()).toEqual(dry.teams.map((t) => t.name).sort());
    expect(fourth.calendar.entries.map((e) => e.scheduledAt)).toEqual(dry.calendar.entries.map((e) => e.scheduledAt));

    // Rozpis: 26 kol po sedmi zápasech, úterý a sobota, doplňkový čtvrtek, dohrávková neděle; nejvýš čtyři kola týdně.
    const calendar = await db.prepare("SELECT id, match_day, scheduled_at FROM season_calendar WHERE league_id = ? ORDER BY scheduled_at")
      .bind(leagueId).all<{ id: string; match_day: string; scheduled_at: string }>();
    expect(calendar.results).toHaveLength(26);
    expect(await count("SELECT COUNT(*) AS n FROM matches WHERE league_id = ?", leagueId)).toBe(14 * 13);
    const preborLast = (await db.prepare("SELECT MAX(scheduled_at) AS d FROM season_calendar WHERE league_id = ?").bind(preborId).first<{ d: string }>())!.d;
    const perWeek = new Map<string, number>();
    for (const c of calendar.results) {
      expect(["tuesday", "saturday", "thursday", "sunday"]).toContain(c.match_day);
      expect(c.scheduled_at <= preborLast).toBe(true);
      expect(await count("SELECT COUNT(*) AS n FROM matches WHERE calendar_id = ?", c.id)).toBe(7);
      const d = new Date(c.scheduled_at);
      const monday = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - ((d.getUTCDay() + 6) % 7)));
      perWeek.set(monday.toISOString(), (perWeek.get(monday.toISOString()) ?? 0) + 1);
    }
    expect(Math.max(...perWeek.values())).toBeLessThanOrEqual(4);
    // Každá dvojice se potká dvakrát, jednou doma a jednou venku.
    expect(await count(
      `SELECT COUNT(*) AS n FROM (SELECT home_team_id, away_team_id FROM matches WHERE league_id = ?
        GROUP BY home_team_id, away_team_id HAVING COUNT(*) <> 1)`, leagueId)).toBe(0);

    // U21 den po áčku.
    const mirrored = await db.prepare(
      `SELECT u.scheduled_at AS u21, s.scheduled_at AS senior FROM season_calendar u JOIN season_calendar s ON s.id = u.parent_calendar_id
        WHERE u.league_id = ?`,
    ).bind(fourth.u21LeagueId).all<{ u21: string; senior: string }>();
    expect(mirrored.results).toHaveLength(26);
    for (const r of mirrored.results) expect(new Date(r.u21).getTime() - new Date(r.senior).getTime()).toBe(86_400_000);

    // Vzor síly je III. třída, ne přebor.
    const senior = fourth.leveling.senior!;
    expect(senior.plan.reference.leagueIds).toEqual([thirdId]);
    expect(senior.plan.reference.teams).toBe(14);
    expect(senior.result!.failedStatements).toBe(0);
    const min = senior.plan.reference.top11!.min;
    for (const club of senior.plan.clubs) {
      expect(club.target.top11).toBeGreaterThanOrEqual(min - 12 - 0.1);
      expect(club.target.top11).toBeLessThanOrEqual(min + 0.1);
    }
    expect(fourth.leveling.u21!.plan.reference.leagueIds).toEqual([created.u21LeagueId]);

    // III. třída zůstala, jak byla, a postup ani sestup nikde nepřibyl.
    const thirdAfter = await db.prepare("SELECT id, scheduled_at FROM season_calendar WHERE league_id = ? ORDER BY game_week")
      .bind(thirdId).all<{ id: string; scheduled_at: string }>();
    expect(thirdAfter.results).toEqual(thirdCalendar.results);
    for (const id of [preborId, thirdId, leagueId]) expect(await leagueMovement(db, id)).toEqual({ promotion: false, relegation: false });

    // Grémium okresu vede přebor i pro IV. třídu.
    expect(await districtLeagueIds(db, leagueId)).toEqual([preborId, thirdId, leagueId]);

    // Okres už není plný: nový hráč převezme AI klub ve IV. třídě.
    const slot = await resolveDistrictSlot(db, DISTRICT, (await db.prepare("SELECT season_id FROM leagues WHERE id = ?").bind(leagueId).first<{ season_id: string }>())!.season_id, null);
    expect(slot.kind).toBe("join");
    if (slot.kind === "join") expect(slot.league.id).toBe(leagueId);

    const again = await createLowerLeague(db, { district: DISTRICT, seed: 91, dryRun: false, level: "iv_trida" });
    expect(again.resumed).toBe(true);
    expect(again.leagueId).toBe(leagueId);
    expect(await count("SELECT COUNT(*) AS n FROM teams WHERE league_id = ?", leagueId)).toBe(14);
    expect(await count("SELECT COUNT(*) AS n FROM season_calendar WHERE league_id = ?", leagueId)).toBe(26);
  }, 600_000);

  it("po odehrané sezóně se nic nepřesune a rollover nechá III. třídě středu a neděli", async () => {
    const leagueId = created.leagueId!;
    await playLeague(preborId);
    await playLeague(leagueId);
    await playLeague(fourth.leagueId!);
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
    expect(await days(fourth.leagueId!)).toEqual(["saturday", "tuesday"]);
    expect((await db.prepare("SELECT level FROM leagues WHERE id = ?").bind(fourth.leagueId).first<{ level: string }>())!.level).toBe("iv_trida");
    expect(await days(created.u21LeagueId!)).toEqual(["monday", "thursday"]);
    expect(await count(
      "SELECT COUNT(*) AS n FROM matches m JOIN season_calendar sc ON sc.id = m.calendar_id WHERE sc.league_id = ? AND sc.season_number = 2",
      leagueId)).toBe(14 * 13);
  }, 600_000);

  it("smazání ligy: nanečisto nic, naostro zmizí liga, U21, kluby i hráči a zbytek zůstane", async () => {
    const target = (await db.prepare(
      "SELECT id FROM leagues WHERE level = 'iv_trida' AND league_type = 'senior' AND status = 'active' ORDER BY created_at DESC LIMIT 1",
    ).first<{ id: string }>())!.id;
    const teamIds = (await db.prepare(
      "SELECT id FROM teams WHERE league_id = ?1 OR league_id IN (SELECT id FROM leagues WHERE parent_league_id = ?1)",
    ).bind(target).all<{ id: string }>()).results.map((r) => r.id);
    expect(teamIds).toHaveLength(28);
    const marks = teamIds.map(() => "?").join(",");
    const others = async () => ({
      teams: await count(`SELECT COUNT(*) AS n FROM teams WHERE id NOT IN (${marks})`, ...teamIds),
      players: await count(`SELECT COUNT(*) AS n FROM players WHERE team_id NOT IN (${marks})`, ...teamIds),
      matches: await count("SELECT COUNT(*) AS n FROM matches WHERE league_id <> ?1 AND league_id NOT IN (SELECT id FROM leagues WHERE parent_league_id = ?1)", target),
      stadiums: await count(`SELECT COUNT(*) AS n FROM stadiums WHERE team_id NOT IN (${marks})`, ...teamIds),
      leagues: await count("SELECT COUNT(*) AS n FROM leagues WHERE id <> ?1 AND COALESCE(parent_league_id, '') <> ?1", target),
    });
    const u21 = (await db.prepare("SELECT id FROM leagues WHERE parent_league_id = ?").bind(target).first<{ id: string }>())!.id;
    expect((await deleteLeague(db, u21, { dryRun: true })).ok).toBe(false);

    // Po rolloveru jsou kluby přihlášené do poháru: los by smazání rozbilo, proto ho zastaví.
    const inCup = await deleteLeague(db, target, { dryRun: true });
    expect(inCup.blockers).toEqual(["14 přihlášek do poháru"]);
    expect((await deleteLeague(db, target, { dryRun: false, expectedHumanTeams: 0 })).reason).toMatch(/poháru/);
    for (const table of ["cup_matches", "cup_club_players", "cup_teams", "cup_entries"]) await db.prepare(`DELETE FROM ${table}`).run();
    const untouched = await others();
    const before = await snapshot();

    const dry = await deleteLeague(db, target, { dryRun: true });
    expect(dry.ok).toBe(true);
    expect(dry.teams).toBe(28);
    expect(dry.humanTeams).toEqual([]);
    expect(dry.blockers).toEqual([]);
    expect(await snapshot()).toEqual(before);

    // Klub vedený člověkem musí být potvrzen počtem, jinak se nic nesmaže.
    await db.prepare("UPDATE teams SET user_id = 'founder' WHERE id = ?").bind(teamIds[0]).run();
    const refused = await deleteLeague(db, target, { dryRun: false, expectedHumanTeams: 0 });
    expect(refused.ok).toBe(false);
    expect(await snapshot()).toEqual({ ...before });
    await db.prepare("UPDATE teams SET user_id = 'ai' WHERE id = ?").bind(teamIds[0]).run();

    // Rozehraná sázka cizího klubu na zápas ligy smazání zastaví.
    const match = (await db.prepare("SELECT id, calendar_id FROM matches WHERE league_id = ? LIMIT 1").bind(target).first<{ id: string; calendar_id: string }>())!;
    const outsider = (await db.prepare("SELECT id FROM teams WHERE league_id = ? LIMIT 1").bind(preborId).first<{ id: string }>())!.id;
    const ticketColumns = (await db.prepare("SELECT name FROM pragma_table_info('bet_tickets') WHERE \"notnull\" = 1 AND dflt_value IS NULL AND pk = 0").all<{ name: string }>())
      .results.map((r) => r.name);
    const ticketValues: Record<string, unknown> = { team_id: outsider, league_id: target, calendar_id: match.calendar_id, status: "open" };
    const insertColumns = ["id", ...new Set([...ticketColumns, "team_id", "league_id", "calendar_id", "status"])];
    await db.prepare(`INSERT INTO bet_tickets (${insertColumns.join(", ")}) VALUES (${insertColumns.map(() => "?").join(", ")})`)
      .bind(...insertColumns.map((c) => (c === "id" ? "ticket-outside" : ticketValues[c] ?? 1))).run();
    const blocked = await deleteLeague(db, target, { dryRun: false, expectedHumanTeams: 0 });
    expect(blocked.ok).toBe(false);
    expect(blocked.reason).toMatch(/sázek/);
    await db.prepare("DELETE FROM bet_tickets WHERE id = 'ticket-outside'").run();

    const done = await deleteLeague(db, target, { dryRun: false, expectedHumanTeams: 0, closeDistrict: true });
    expect(done.ok).toBe(true);
    expect(await count("SELECT COUNT(*) AS n FROM leagues WHERE id = ?1 OR parent_league_id = ?1", target)).toBe(0);
    expect(await count(`SELECT COUNT(*) AS n FROM teams WHERE id IN (${marks})`, ...teamIds)).toBe(0);
    for (const table of ["players", "stadiums", "equipment", "managers", "transactions", "player_contracts", "team_fanbase"]) {
      expect(await count(`SELECT COUNT(*) AS n FROM ${table} WHERE team_id IN (${marks})`, ...teamIds), table).toBe(0);
    }
    expect(await count(`SELECT COUNT(*) AS n FROM matches WHERE home_team_id IN (${marks}) OR away_team_id IN (${marks})`, ...teamIds, ...teamIds)).toBe(0);
    expect(await others()).toEqual(untouched);
    expect((await db.prepare("SELECT registration_closed FROM district_registrations WHERE district = ?").bind(DISTRICT).first<{ registration_closed: number }>())!.registration_closed).toBe(1);
    expect((await db.prepare("PRAGMA foreign_key_check").all()).results).toEqual([]);

    expect((await deleteLeague(db, target, { dryRun: false, expectedHumanTeams: 0 })).reason).toBe("Soutěž nenalezena.");
  }, 600_000);

  it("srovnání rozpisu: III. třída dostane termíny přeboru, U21 o den později, zameškaná kola zůstanou splatná", async () => {
    const third = (await db.prepare(
      "SELECT id FROM leagues WHERE level = 'okresni_soutez' AND league_type = 'senior' AND district = ?",
    ).bind(DISTRICT).first<{ id: string }>())!.id;
    const thirdU21 = (await db.prepare("SELECT id FROM leagues WHERE parent_league_id = ?").bind(third).first<{ id: string }>())!.id;
    const season = (await db.prepare("SELECT MAX(season_number) AS n FROM season_calendar WHERE league_id = ?").bind(third).first<{ n: number }>())!.n;
    const datesOf = async (id: string) => (await db.prepare(
      "SELECT scheduled_at FROM season_calendar WHERE league_id = ? AND season_number = ? ORDER BY game_week",
    ).bind(id, season).all<{ scheduled_at: string }>()).results.map((r) => r.scheduled_at);
    const preborDates = await datesOf(preborId);
    expect(await datesOf(third)).not.toEqual(preborDates);
    // „Teď“ je po šestém kole přeboru: šest kol se má dopočítat.
    const now = new Date(Date.parse(preborDates[5]) + 3_600_000);

    expect((await alignLeagueSchedule(db, third, third, { dryRun: true })).ok).toBe(false);
    expect((await alignLeagueSchedule(db, thirdU21, preborId, { dryRun: true })).ok).toBe(false);
    const dry = await alignLeagueSchedule(db, third, preborId, { dryRun: true, now });
    expect(dry.ok).toBe(true);
    expect(dry.overdue).toBe(6);
    expect(await datesOf(third)).not.toEqual(preborDates);

    const done = await alignLeagueSchedule(db, third, preborId, { dryRun: false, now });
    expect(done.ok).toBe(true);
    expect(await datesOf(third)).toEqual(preborDates);
    expect(await datesOf(thirdU21)).toEqual(preborDates.map((d) => new Date(Date.parse(d) + 86_400_000).toISOString()));
    expect((await db.prepare("SELECT match_weekdays FROM leagues WHERE id = ?").bind(third).first<{ match_weekdays: string | null }>())!.match_weekdays).toBeNull();
    expect(await count("SELECT COUNT(*) AS n FROM season_calendar WHERE league_id = ? AND season_number = ? AND match_day NOT IN ('monday', 'thursday')", third, season)).toBe(0);
    expect(await count("SELECT COUNT(*) AS n FROM matches m JOIN season_calendar sc ON sc.id = m.calendar_id WHERE sc.league_id = ? AND sc.season_number = ?", third, season)).toBe(14 * 13);

    const again = await alignLeagueSchedule(db, third, preborId, { dryRun: false, now });
    expect(again.rounds).toEqual([]);
    expect(again.u21!.rounds).toEqual([]);

    await db.prepare("UPDATE season_calendar SET status = 'lineup_locked' WHERE league_id = ? AND season_number = ? AND game_week = 1").bind(third, season).run();
    expect((await alignLeagueSchedule(db, third, preborId, { dryRun: false, now })).reason).toMatch(/právě hraje/);
    await db.prepare("UPDATE season_calendar SET status = 'scheduled' WHERE league_id = ? AND season_number = ? AND game_week = 1").bind(third, season).run();
  }, 120_000);

  it("zrušení rozpisu: neodehraná sezóna zmizí i s U21, starší sezóna a kluby zůstanou, rozehraná liga se nezruší", async () => {
    const third = (await db.prepare(
      "SELECT id FROM leagues WHERE level = 'okresni_soutez' AND league_type = 'senior' AND district = ?",
    ).bind(DISTRICT).first<{ id: string }>())!.id;
    const thirdU21 = (await db.prepare("SELECT id FROM leagues WHERE parent_league_id = ?").bind(third).first<{ id: string }>())!.id;
    const season = (await db.prepare("SELECT MAX(season_number) AS n FROM season_calendar WHERE league_id = ?").bind(third).first<{ n: number }>())!.n;
    const roundsOf = (id: string, seasonNumber: number) => count("SELECT COUNT(*) AS n FROM season_calendar WHERE league_id = ? AND season_number = ?", id, seasonNumber);
    const older = [await roundsOf(third, season - 1), await roundsOf(thirdU21, season - 1)];
    expect(older[0]).toBe(26);
    const teams = await count("SELECT COUNT(*) AS n FROM teams WHERE league_id IN (?, ?)", third, thirdU21);

    // Přebor s jedním odehraným kolem nové sezóny zrušit nejde.
    await db.prepare("UPDATE season_calendar SET status = 'simulated' WHERE league_id = ? AND season_number = ? AND game_week = 1").bind(preborId, season).run();
    expect((await clearLeagueSchedule(db, preborId, { dryRun: false })).reason).toMatch(/už hrála/);
    expect(await roundsOf(preborId, season)).toBe(26);
    expect((await clearLeagueSchedule(db, thirdU21, { dryRun: true })).ok).toBe(false);

    const dry = await clearLeagueSchedule(db, third, { dryRun: true });
    expect(dry).toMatchObject({ ok: true, rounds: 52, matches: 2 * 14 * 13 });
    expect(await roundsOf(third, season)).toBe(26);

    expect((await clearLeagueSchedule(db, third, { dryRun: false })).ok).toBe(true);
    expect([await roundsOf(third, season), await roundsOf(thirdU21, season)]).toEqual([0, 0]);
    expect([await roundsOf(third, season - 1), await roundsOf(thirdU21, season - 1)]).toEqual(older);
    expect(await count(
      "SELECT COUNT(*) AS n FROM matches m JOIN season_calendar sc ON sc.id = m.calendar_id WHERE m.league_id IN (?, ?) AND sc.season_number = ?",
      third, thirdU21, season)).toBe(0);
    expect(await count("SELECT COUNT(*) AS n FROM matches m WHERE m.league_id IN (?, ?) AND m.calendar_id NOT IN (SELECT id FROM season_calendar)", third, thirdU21)).toBe(0);
    expect(await count("SELECT COUNT(*) AS n FROM teams WHERE league_id IN (?, ?)", third, thirdU21)).toBe(teams);
    expect((await db.prepare("PRAGMA foreign_key_check").all()).results).toEqual([]);
  }, 120_000);

  it("spuštění čekající ligy: rozpis podle vyšší soutěže okresu, U21 o den později, zameškaná kola do fronty", async () => {
    const third = (await db.prepare(
      "SELECT id FROM leagues WHERE level = 'okresni_soutez' AND league_type = 'senior' AND district = ?",
    ).bind(DISTRICT).first<{ id: string }>())!.id;
    const thirdU21 = (await db.prepare("SELECT id FROM leagues WHERE parent_league_id = ?").bind(third).first<{ id: string }>())!.id;
    const season = (await db.prepare("SELECT MAX(season_number) AS n FROM season_calendar WHERE league_id = ?").bind(preborId).first<{ n: number }>())!.n;
    const datesOf = async (id: string) => (await db.prepare(
      "SELECT scheduled_at FROM season_calendar WHERE league_id = ? AND season_number = ? ORDER BY game_week",
    ).bind(id, season).all<{ scheduled_at: string }>()).results.map((r) => r.scheduled_at);
    const preborDates = await datesOf(preborId);
    expect(await datesOf(third)).toEqual([]);
    const now = new Date(Date.parse(preborDates[3]) + 3_600_000);

    expect((await startWaitingLeague(db, preborId, { dryRun: true })).reason).toBe("Soutěž už rozpis má.");
    expect((await startWaitingLeague(db, thirdU21, { dryRun: true })).ok).toBe(false);
    const dry = await startWaitingLeague(db, third, { dryRun: true, now });
    expect(dry).toMatchObject({ ok: true, referenceLeagueId: preborId, rounds: 26, matches: 14 * 13, overdue: 4 });
    expect(dry.u21).toMatchObject({ leagueId: thirdU21, overdue: 3 });
    expect(await datesOf(third)).toEqual([]);

    const started = await startWaitingLeague(db, third, { dryRun: false, now, seed: 11 });
    expect(started.ok).toBe(true);
    expect(await datesOf(third)).toEqual(preborDates);
    expect(await datesOf(thirdU21)).toEqual(preborDates.map((d) => new Date(Date.parse(d) + 86_400_000).toISOString()));
    for (const id of [third, thirdU21]) {
      expect(await count("SELECT COUNT(*) AS n FROM matches m JOIN season_calendar sc ON sc.id = m.calendar_id WHERE sc.league_id = ? AND sc.season_number = ?", id, season)).toBe(14 * 13);
      expect(await count(
        `SELECT COUNT(*) AS n FROM (SELECT sc.id FROM season_calendar sc LEFT JOIN matches m ON m.calendar_id = sc.id
          WHERE sc.league_id = ? AND sc.season_number = ? GROUP BY sc.id HAVING COUNT(m.id) <> 7)`, id, season)).toBe(0);
    }
    // Každá dvojice jednou doma a jednou venku.
    expect(await count(
      `SELECT COUNT(*) AS n FROM (SELECT m.home_team_id, m.away_team_id FROM matches m JOIN season_calendar sc ON sc.id = m.calendar_id
        WHERE sc.league_id = ? AND sc.season_number = ? GROUP BY m.home_team_id, m.away_team_id HAVING COUNT(*) <> 1)`, third, season)).toBe(0);
    expect((await startWaitingLeague(db, third, { dryRun: false, now })).reason).toBe("Soutěž už rozpis má.");

    // Dopočítání: jedno kolo na zprávu, áčko před U21, s rozestupem; večer až po kole.
    const sent: Array<{ leagueId: string; delay: number }> = [];
    const queueEnv = { ...env, MATCH_QUEUE: { send: async (body: { leagueId: string }, o?: { delaySeconds?: number }) => { sent.push({ leagueId: body.leagueId, delay: o?.delaySeconds ?? 0 }); } } } as unknown as Bindings;
    expect(await enqueueLeagueCatchUp(queueEnv, started, third, new Date("2026-11-20T10:00:00Z"))).toBe(7);
    expect(sent.map((m) => m.leagueId)).toEqual([third, third, third, third, thirdU21, thirdU21, thirdU21]);
    expect(sent.map((m) => m.delay)).toEqual([0, 240, 480, 720, 960, 1200, 1440]);
    sent.length = 0;
    await enqueueLeagueCatchUp(queueEnv, started, third, new Date("2026-11-20T16:30:00Z"));
    expect(sent[0].delay).toBe(7200);
  }, 120_000);

  it("registrace do čekající IV. třídy ji spustí: nový klub má hned rozpis podle vyšší soutěže", async () => {
    // IV. třída je po předchozích testech smazaná, čekající ligu zastoupí bývalá III. třída.
    const waiting = (await db.prepare(
      "SELECT id FROM leagues WHERE level = 'okresni_soutez' AND league_type = 'senior' AND district = ?",
    ).bind(DISTRICT).first<{ id: string }>())!.id;
    const waitingU21 = (await db.prepare("SELECT id FROM leagues WHERE parent_league_id = ?").bind(waiting).first<{ id: string }>())!.id;
    const season = (await db.prepare("SELECT MAX(season_number) AS n FROM season_calendar WHERE league_id = ?").bind(preborId).first<{ n: number }>())!.n;
    await db.prepare("UPDATE leagues SET level = 'iv_trida' WHERE id IN (?, ?)").bind(waiting, waitingU21).run();
    await db.prepare("UPDATE district_registrations SET registration_closed = 0 WHERE district = ?").bind(DISTRICT).run();
    expect((await clearLeagueSchedule(db, waiting, { dryRun: false })).ok).toBe(true);
    const freed = (await db.prepare("SELECT id FROM teams WHERE league_id = ? ORDER BY id LIMIT 1").bind(waiting).first<{ id: string }>())!.id;
    await db.prepare("UPDATE teams SET user_id = 'ai', ai_former_user_id = NULL WHERE id = ? OR parent_team_id = ?").bind(freed, freed).run();
    const roundsOf = (id: string) => count("SELECT COUNT(*) AS n FROM season_calendar WHERE league_id = ? AND season_number = ?", id, season);
    expect([await roundsOf(waiting), await roundsOf(waitingU21)]).toEqual([0, 0]);

    const village = (await db.prepare(
      "SELECT v.id FROM villages v WHERE v.district = ? AND COALESCE(v.registration_locked, 0) = 0 AND NOT EXISTS (SELECT 1 FROM teams t WHERE t.village_id = v.id) LIMIT 1",
    ).bind(DISTRICT).first<{ id: string }>())!.id;
    const joined = await createTeam("newcomer-iv", village, "FK Nováček");
    expect(joined.status).toBe(201);
    expect(joined.body.leagueId).toBe(waiting);

    expect([await roundsOf(waiting), await roundsOf(waitingU21)]).toEqual([26, 26]);
    const dates = async (id: string) => (await db.prepare(
      "SELECT scheduled_at FROM season_calendar WHERE league_id = ? AND season_number = ? ORDER BY game_week",
    ).bind(id, season).all<{ scheduled_at: string }>()).results.map((r) => r.scheduled_at);
    expect(await dates(waiting)).toEqual(await dates(preborId));
    // Nový klub je v rozpisu: 26 zápasů, 13 doma.
    const ownId = String(joined.body.id);
    expect(await count(
      "SELECT COUNT(*) AS n FROM matches m JOIN season_calendar sc ON sc.id = m.calendar_id WHERE sc.league_id = ? AND sc.season_number = ? AND (m.home_team_id = ?3 OR m.away_team_id = ?3)",
      waiting, season, ownId)).toBe(26);

    // Zamčená obec: klub v ní založit nejde.
    await db.prepare("UPDATE villages SET registration_locked = 1 WHERE id = ?").bind(village).run();
    const lockedOut = await createTeam("newcomer-locked", village, "FK Zamčeno");
    expect(lockedOut.status).toBe(400);
    expect(String(lockedOut.body.error)).toMatch(/klubů dost/);
  }, 300_000);
});
