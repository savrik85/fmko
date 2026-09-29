/**
 * Dvě okresní soutěže nad sebou na skutečné D1 (Miniflare, všechny migrace):
 * zakládání III. třídy, přípravné období, postup a sestup 2 ↔ 2 a konec sezóny.
 */
import { afterAll, describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { Miniflare } from "miniflare";
import { Hono } from "hono";
import { teamsRouter } from "../routes/teams";
import { createSession } from "../auth/session";
import { rolloverAllLeagues } from "../season/season-rollover";
import { runEndSeasonStep } from "../season/end-season";
import { calculateStandings } from "../stats/standings";
import { getLeaguePreseason, resolveDistrictSlot } from "./district-leagues";
import type { Bindings } from "../index";

const DISTRICT = "Strakonice";
const app = new Hono<{ Bindings: Bindings }>();
app.route("/api/teams", teamsRouter);

let mf: Miniflare | null = null;
let db: D1Database;
let env: Bindings;

async function freshDb(): Promise<void> {
  mf = new Miniflare({
    modules: true,
    script: "export default { fetch() { return new Response('ok'); } }",
    d1Databases: ["DB"],
    kvNamespaces: ["SESSION_KV", "CACHE_KV"],
  });
  instances.push(mf);
  db = await mf.getD1Database("DB");
  env = { DB: db, SESSION_KV: await mf.getKVNamespace("SESSION_KV"), CACHE_KV: await mf.getKVNamespace("CACHE_KV") } as unknown as Bindings;
  const dir = new URL("../../migrations/", import.meta.url);
  for (const file of readdirSync(dir).filter((f) => f.endsWith(".sql")).sort()) {
    const source = readFileSync(new URL(file, dir), "utf8").replace(/--[^\n]*/g, "").replace(/\n/g, " ");
    await db.exec(source);
  }
  await db.prepare("INSERT OR REPLACE INTO district_registrations (district, status, ready_at) VALUES (?, 'ready', '2026-09-01')")
    .bind(DISTRICT).run();
}

// Založení týmu pouští práci na pozadí, která doběhne až po odpovědi. Kdyby se instance
// rušila po každém testu, tahle práce by narazila na zrušenou D1 a v zatíženém CI shodila
// další test. Instance se proto ruší až na konci souboru.
const instances: Miniflare[] = [];
afterAll(async () => {
  for (const instance of instances) await instance.dispose();
});

/** Obce okresu v pevném pořadí, ať test ví, kdo z které obce hraje. */
async function districtVillages(): Promise<string[]> {
  const rows = await db.prepare("SELECT id FROM villages WHERE district = ? ORDER BY id").bind(DISTRICT).all<{ id: string }>();
  return rows.results.map((r) => r.id);
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

/** Všem AI týmům ligy dá lidského majitele, liga tím přestane mít volné místo. */
async function fillWithHumans(leagueId: string, prefix: string): Promise<void> {
  const ai = await db.prepare("SELECT id FROM teams WHERE league_id = ? AND user_id = 'ai'").bind(leagueId).all<{ id: string }>();
  for (const [i, t] of ai.results.entries()) {
    const uid = `${prefix}-${i}`;
    await db.prepare("INSERT OR IGNORE INTO users (id, email, password_hash) VALUES (?, ?, 'x')").bind(uid, `${uid}@example.test`).run();
    await db.prepare("UPDATE teams SET user_id = ? WHERE id = ?").bind(uid, t.id).run();
  }
}

async function seniorLeagues() {
  const rows = await db.prepare(
    "SELECT id, name, level FROM leagues WHERE district = ? AND league_type = 'senior'",
  ).bind(DISTRICT).all<{ id: string; name: string; level: string }>();
  return {
    prebor: rows.results.find((r) => r.level === "okresni_prebor"),
    soutez: rows.results.find((r) => r.level === "okresni_soutez"),
  };
}

async function count(sql: string, ...binds: unknown[]): Promise<number> {
  const row = await db.prepare(sql).bind(...binds).first<{ n: number }>();
  return row?.n ?? 0;
}

/**
 * Odehraje zápasy ligy tak, aby tabulka byla předem známá: silnější je tým
 * s menším pořadím v `order`, vždy vyhraje 1:0.
 */
async function playLeague(leagueId: string, order: string[], onlyFirstRound = false): Promise<void> {
  const rank = new Map(order.map((id, i) => [id, i]));
  const matches = await db.prepare(
    `SELECT m.id, m.home_team_id, m.away_team_id, m.calendar_id, m.round FROM matches m
      WHERE m.league_id = ? ${onlyFirstRound ? "AND m.round = 1" : ""}`,
  ).bind(leagueId).all<{ id: string; home_team_id: string; away_team_id: string; calendar_id: string }>();
  for (const m of matches.results) {
    const homeWins = (rank.get(m.home_team_id) ?? 99) < (rank.get(m.away_team_id) ?? 99);
    await db.prepare("UPDATE matches SET status = 'simulated', home_score = ?, away_score = ? WHERE id = ?")
      .bind(homeWins ? 1 : 0, homeWins ? 0 : 1, m.id).run();
  }
  await db.prepare(
    `UPDATE season_calendar SET status = 'simulated'
      WHERE league_id = ? AND id IN (SELECT calendar_id FROM matches WHERE league_id = ? AND status = 'simulated')`,
  ).bind(leagueId, leagueId).run();
}

async function teamIdsByName(leagueId: string): Promise<string[]> {
  const rows = await db.prepare("SELECT id FROM teams WHERE league_id = ? ORDER BY name").bind(leagueId).all<{ id: string }>();
  return rows.results.map((r) => r.id);
}

describe("III. třída a přípravné období", () => {
  it("(a) plný přebor v běžící sezóně: nový klub založí III. třídu bez zápasů, (b) druhý manažer převezme její AI tým", async () => {
    await freshDb();
    const villages = await districtVillages();
    const founder = await createTeam("founder", villages[0], "SK Zakladatel");
    expect(founder.status).toBe(201);
    const { prebor } = await seniorLeagues();
    expect(prebor?.name).toBe("Okresní přebor Strakonice");
    expect(await count("SELECT COUNT(*) AS n FROM matches WHERE league_id = ?", prebor!.id)).toBeGreaterThan(0);

    await fillWithHumans(prebor!.id, "prebor");
    const preborIds = await teamIdsByName(prebor!.id);
    await playLeague(prebor!.id, preborIds, true); // sezóna běží: odehrané první kolo

    const preborVillages = new Set((await db.prepare("SELECT village_id FROM teams WHERE league_id = ?").bind(prebor!.id).all<{ village_id: string }>()).results.map((r) => r.village_id));
    const freeVillage = villages.find((v) => !preborVillages.has(v))!;
    const second = await createTeam("second", freeVillage, "FK Nováček");
    expect(second.status).toBe(201);
    expect(second.body.preseason).toBe(true);

    const { soutez } = await seniorLeagues();
    expect(soutez?.name).toBe("III. třída Strakonice");
    expect(second.body.leagueId).toBe(soutez!.id);
    const soutezTeams = await db.prepare("SELECT id, user_id, village_id, game_date, season_start, season_end FROM teams WHERE league_id = ?")
      .bind(soutez!.id).all<{ id: string; user_id: string; village_id: string; game_date: string | null; season_start: string | null; season_end: string | null }>();
    expect(soutezTeams.results.length).toBeGreaterThanOrEqual(12);
    expect(soutezTeams.results.length).toBeLessThanOrEqual(14);
    // AI týmy jen z obcí, které přebor nepoužívá
    for (const t of soutezTeams.results) expect(preborVillages.has(t.village_id)).toBe(false);
    // Bez rozpisu, ale se sdíleným herním časem
    expect(await count("SELECT COUNT(*) AS n FROM matches WHERE league_id = ?", soutez!.id)).toBe(0);
    expect(await count("SELECT COUNT(*) AS n FROM season_calendar WHERE league_id = ?", soutez!.id)).toBe(0);
    const peer = await db.prepare("SELECT game_date FROM teams WHERE league_id = ? LIMIT 1").bind(prebor!.id).first<{ game_date: string }>();
    for (const t of soutezTeams.results) {
      expect(t.game_date).toBe(peer!.game_date);
      expect(t.season_start).not.toBeNull();
      expect(t.season_end).not.toBeNull();
    }
    // U21 druhé úrovně existuje (unikátní season_id + district + level projde)
    const u21 = await db.prepare("SELECT id FROM leagues WHERE parent_league_id = ? AND league_type = 'u21'").bind(soutez!.id).first<{ id: string }>();
    expect(u21).not.toBeNull();
    expect(await count("SELECT COUNT(*) AS n FROM teams WHERE league_id = ? AND team_type = 'u21'", u21!.id)).toBe(soutezTeams.results.length);

    const preseason = await getLeaguePreseason(db, soutez!.id);
    const lastMatch = await db.prepare(
      "SELECT MAX(scheduled_at) AS d FROM season_calendar sc WHERE league_id = ? AND EXISTS (SELECT 1 FROM matches m WHERE m.calendar_id = sc.id)",
    ).bind(prebor!.id).first<{ d: string }>();
    expect(preseason).toEqual({ startsAfter: lastMatch!.d });
    expect(await getLeaguePreseason(db, prebor!.id)).toBeNull();

    // (b) další manažer převezme AI tým v III. třídě
    const soutezVillages = new Set(soutezTeams.results.map((t) => t.village_id));
    const thirdVillage = villages.find((v) => !preborVillages.has(v) && !soutezVillages.has(v)) ?? villages[1];
    const aiBefore = await count("SELECT COUNT(*) AS n FROM teams WHERE league_id = ? AND user_id = 'ai'", soutez!.id);
    const third = await createTeam("third", thirdVillage, "TJ Třetí");
    expect(third.status).toBe(201);
    expect(third.body.leagueId).toBe(soutez!.id);
    expect(await count("SELECT COUNT(*) AS n FROM teams WHERE league_id = ? AND user_id = 'ai'", soutez!.id)).toBe(aiBefore - 1);
    expect(await count("SELECT COUNT(*) AS n FROM matches WHERE league_id = ?", soutez!.id)).toBe(0);
    const leagueCount = await count("SELECT COUNT(*) AS n FROM leagues WHERE district = ? AND league_type = 'senior'", DISTRICT);
    expect(leagueCount).toBe(2);

    // Obě soutěže plné → 409 league_full
    await fillWithHumans(soutez!.id, "soutez");
    const season = await db.prepare("SELECT id FROM seasons WHERE status = 'active'").first<{ id: string }>();
    expect((await resolveDistrictSlot(db, DISTRICT, season!.id, null)).kind).toBe("full");
    const full = await createTeam("fourth", villages[villages.length - 1], "SK Pozdě");
    expect(full.status).toBe(409);
    expect(full.body.error).toBe("league_full");
  }, 120_000);

  it("(c) rollover prohodí 2 ↔ 2 včetně U21, druhý běh nic nezmění", async () => {
    await freshDb();
    const villages = await districtVillages();
    expect((await createTeam("founder", villages[0], "SK Zakladatel")).status).toBe(201);
    const { prebor } = await seniorLeagues();
    await fillWithHumans(prebor!.id, "prebor");
    // Sezóna ještě neběží: III. třída dostane rozpis hned (dnešní chování)
    const preborVillages = new Set((await db.prepare("SELECT village_id FROM teams WHERE league_id = ?").bind(prebor!.id).all<{ village_id: string }>()).results.map((r) => r.village_id));
    const second = await createTeam("second", villages.find((v) => !preborVillages.has(v))!, "FK Nováček");
    expect(second.status).toBe(201);
    expect(second.body.preseason).toBe(false);
    const { soutez } = await seniorLeagues();
    expect(await count("SELECT COUNT(*) AS n FROM matches WHERE league_id = ?", soutez!.id)).toBeGreaterThan(0);

    const preborOrder = await teamIdsByName(prebor!.id);
    const soutezOrder = await teamIdsByName(soutez!.id);
    await playLeague(prebor!.id, preborOrder);
    await playLeague(soutez!.id, soutezOrder);
    const preborTable = await calculateStandings(db, prebor!.id, 1);
    const soutezTable = await calculateStandings(db, soutez!.id, 1);
    const relegated = preborTable.slice(-2).map((s) => s.teamId);
    const promoted = soutezTable.slice(0, 2).map((s) => s.teamId);
    expect(relegated).toEqual(preborOrder.slice(-2));
    expect(promoted).toEqual(soutezOrder.slice(0, 2));

    const u21Of = async (leagueId: string) =>
      (await db.prepare("SELECT id FROM leagues WHERE parent_league_id = ? AND league_type = 'u21'").bind(leagueId).first<{ id: string }>())!.id;
    const u21Prebor = await u21Of(prebor!.id);
    const u21Soutez = await u21Of(soutez!.id);
    const repBefore = new Map((await db.prepare("SELECT id, reputation FROM teams WHERE id IN (?, ?, ?, ?)")
      .bind(...relegated, ...promoted).all<{ id: string; reputation: number }>()).results.map((r) => [r.id, r.reputation]));

    await rolloverAllLeagues(db, 1);

    for (const id of relegated) {
      expect((await db.prepare("SELECT league_id FROM teams WHERE id = ?").bind(id).first<{ league_id: string }>())!.league_id).toBe(soutez!.id);
      expect((await db.prepare("SELECT league_id FROM teams WHERE parent_team_id = ? AND team_type = 'u21'").bind(id).first<{ league_id: string }>())!.league_id).toBe(u21Soutez);
      expect((await db.prepare("SELECT reputation FROM teams WHERE id = ?").bind(id).first<{ reputation: number }>())!.reputation).toBeLessThan(repBefore.get(id)!);
    }
    for (const id of promoted) {
      expect((await db.prepare("SELECT league_id FROM teams WHERE id = ?").bind(id).first<{ league_id: string }>())!.league_id).toBe(prebor!.id);
      expect((await db.prepare("SELECT league_id FROM teams WHERE parent_team_id = ? AND team_type = 'u21'").bind(id).first<{ league_id: string }>())!.league_id).toBe(u21Prebor);
      expect((await db.prepare("SELECT reputation FROM teams WHERE id = ?").bind(id).first<{ reputation: number }>())!.reputation).toBeGreaterThan(repBefore.get(id)!);
    }
    expect(await count("SELECT COUNT(*) AS n FROM teams WHERE league_id = ?", prebor!.id)).toBe(preborOrder.length);
    expect(await count("SELECT COUNT(*) AS n FROM teams WHERE league_id = ?", soutez!.id)).toBe(soutezOrder.length);
    expect(await count("SELECT COUNT(*) AS n FROM news WHERE type = 'league_movement'")).toBe(2);
    const news = await db.prepare("SELECT headline, body FROM news WHERE type = 'league_movement'").all<{ headline: string; body: string }>();
    for (const n of news.results) expect(`${n.headline} ${n.body}`).not.toContain("—");
    // Nová sezóna: rozpis vznikl až s novým složením lig
    const newSeasonMatches = await db.prepare(
      `SELECT m.home_team_id, m.away_team_id FROM matches m JOIN season_calendar sc ON sc.id = m.calendar_id
        WHERE sc.league_id = ? AND sc.season_number = 2`,
    ).bind(prebor!.id).all<{ home_team_id: string; away_team_id: string }>();
    expect(newSeasonMatches.results.length).toBeGreaterThan(0);
    expect(newSeasonMatches.results.some((m) => promoted.includes(m.home_team_id) || promoted.includes(m.away_team_id))).toBe(true);
    expect(newSeasonMatches.results.some((m) => relegated.includes(m.home_team_id) || relegated.includes(m.away_team_id))).toBe(false);

    // Druhý běh (např. po pádu): marker zabrání dalšímu přehození
    const snapshot = async () => (await db.prepare("SELECT id, league_id FROM teams WHERE league_id IN (?, ?, ?, ?) ORDER BY id")
      .bind(prebor!.id, soutez!.id, u21Prebor, u21Soutez).all()).results;
    const before = await snapshot();
    await rolloverAllLeagues(db, 1);
    expect(await snapshot()).toEqual(before);
    expect(await count("SELECT COUNT(*) AS n FROM news WHERE type = 'league_movement'")).toBe(2);
  }, 180_000);

  it("(d) liga bez zápasů neblokuje konec sezóny a po rolloveru má rozpis", async () => {
    await freshDb();
    const villages = await districtVillages();
    expect((await createTeam("founder", villages[0], "SK Zakladatel")).status).toBe(201);
    const { prebor } = await seniorLeagues();
    await fillWithHumans(prebor!.id, "prebor");
    await playLeague(prebor!.id, await teamIdsByName(prebor!.id), true);
    const preborVillages = new Set((await db.prepare("SELECT village_id FROM teams WHERE league_id = ?").bind(prebor!.id).all<{ village_id: string }>()).results.map((r) => r.village_id));
    const second = await createTeam("second", villages.find((v) => !preborVillages.has(v))!, "FK Nováček");
    expect(second.body.preseason).toBe(true);
    const { soutez } = await seniorLeagues();

    // Přebor dohraje sezónu, III. třída celou dobu bez zápasů
    await playLeague(prebor!.id, await teamIdsByName(prebor!.id));
    let last = await runEndSeasonStep(db, undefined);
    for (let i = 0; i < 300 && last.phase !== "rollover"; i++) {
      expect(last.status).not.toBe("error");
      expect(last.ready).toBe(true);
      last = await runEndSeasonStep(db, undefined);
    }
    expect(last.phase).toBe("rollover");
    expect(last.status).toBe("done");
    // Wrap fáze běžely jen pro přebor
    const wrapped = "SELECT COUNT(*) AS n FROM season_end_progress WHERE league_id = ? AND season_number = 1 AND phase IN ('finalize', 'rewards', 'departures')";
    expect(await count(wrapped, soutez!.id)).toBe(0);
    expect(await count(wrapped, prebor!.id)).toBe(3);

    expect(await count(
      `SELECT COUNT(*) AS n FROM matches m JOIN season_calendar sc ON sc.id = m.calendar_id
        WHERE sc.league_id = ? AND sc.season_number = 2`, soutez!.id)).toBeGreaterThan(0);
    const u21 = await db.prepare("SELECT id FROM leagues WHERE parent_league_id = ? AND league_type = 'u21'").bind(soutez!.id).first<{ id: string }>();
    expect(await count(
      `SELECT COUNT(*) AS n FROM matches m JOIN season_calendar sc ON sc.id = m.calendar_id
        WHERE sc.league_id = ? AND sc.season_number = 2`, u21!.id)).toBeGreaterThan(0);
    expect(await getLeaguePreseason(db, soutez!.id)).toBeNull();
    // III. třída ve staré sezóně nehrála → žádný postup ani sestup
    expect(await count("SELECT COUNT(*) AS n FROM news WHERE type = 'league_movement'")).toBe(0);
  }, 300_000);
});
