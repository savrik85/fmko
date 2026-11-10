/**
 * Zátěž D1 z /auth/me a rozpisu na skutečné D1 (Miniflare, všechny migrace):
 * ligové údaje hlavičky se drží v KV, rozpis bere jen aktuální sezónu a dotazy jdou přes indexy.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { Miniflare } from "miniflare";
import { Hono } from "hono";
import { createSession } from "../auth/session";
import type { Bindings } from "../index";
import { authRouter, meLeagueCacheKey } from "./auth";
import { loadScheduleSeasonBounds, matchesRouter } from "./matches";

const app = new Hono<{ Bindings: Bindings }>();
app.route("/auth", authRouter);
app.route("/api", matchesRouter);

let mf: Miniflare;
let db: D1Database;
let env: Bindings;
let token: string;

const LEAGUE = "l-1";
const MINE = "team-mine";
const RIVAL = "team-rival";
const GAME_DATE = "2026-11-09T16:00:00.000Z";

async function me(): Promise<{ leaguePosition: number | null; nextMatch: { opponent: string; daysUntil: number } | null }> {
  const res = await app.request("/auth/me", { headers: { Authorization: `Bearer ${token}` } }, env);
  expect(res.status).toBe(200);
  return await res.json();
}

async function plan(sql: string, ...binds: unknown[]): Promise<string> {
  const rows = await db.prepare(`EXPLAIN QUERY PLAN ${sql}`).bind(...binds).all<{ detail: string }>();
  return rows.results.map((r) => r.detail).join(" | ");
}

async function addRound(id: string, season: number, scheduledAt: string, played: null | [number, number]): Promise<void> {
  await db.batch([
    db.prepare("INSERT INTO season_calendar (id, league_id, season_number, game_week, match_day, scheduled_at, status) VALUES (?, ?, ?, 1, 'monday', ?, ?)")
      .bind(id, LEAGUE, season, scheduledAt, played ? "simulated" : "scheduled"),
    db.prepare("INSERT INTO matches (id, league_id, calendar_id, round, home_team_id, away_team_id, status, home_score, away_score) VALUES (?, ?, ?, 1, ?, ?, ?, ?, ?)")
      .bind(`m-${id}`, LEAGUE, id, MINE, RIVAL, played ? "simulated" : "scheduled", played?.[0] ?? null, played?.[1] ?? null),
  ]);
}

beforeAll(async () => {
  mf = new Miniflare({
    modules: true, script: "export default { fetch() { return new Response('ok'); } }",
    d1Databases: ["DB"], kvNamespaces: ["SESSION_KV", "CACHE_KV"],
  });
  db = await mf.getD1Database("DB");
  env = { DB: db, SESSION_KV: await mf.getKVNamespace("SESSION_KV"), CACHE_KV: await mf.getKVNamespace("CACHE_KV") } as unknown as Bindings;
  const dir = new URL("../../migrations/", import.meta.url);
  for (const file of readdirSync(dir).filter((f) => f.endsWith(".sql")).sort()) {
    await db.exec(readFileSync(new URL(file, dir), "utf8").replace(/--[^\n]*/g, "").replace(/\n/g, " "));
  }
  const villages = (await db.prepare("SELECT id FROM villages WHERE district = 'Prachatice' ORDER BY id LIMIT 2").all<{ id: string }>()).results.map((r) => r.id);
  await db.batch([
    db.prepare("UPDATE seasons SET status = 'finished'"),
    db.prepare("INSERT INTO seasons (id, number, status) VALUES ('s-99', 99, 'active')"),
    db.prepare("INSERT INTO users (id, email, password_hash) VALUES ('u-1', 'u1@example.test', 'x')"),
    db.prepare("INSERT INTO leagues (id, season_id, district, name, level) VALUES (?, 's-99', 'Prachatice', 'Okresní přebor', 'okresni_prebor')").bind(LEAGUE),
    db.prepare("INSERT INTO teams (id, user_id, village_id, name, budget, league_id, team_type, game_date) VALUES (?, 'u-1', ?, 'Moji', 1000, ?, 'senior', ?)")
      .bind(MINE, villages[0], LEAGUE, GAME_DATE),
    db.prepare("INSERT INTO teams (id, user_id, village_id, name, budget, league_id, team_type, game_date) VALUES (?, 'ai', ?, 'Soupeř', 1000, ?, 'senior', ?)")
      .bind(RIVAL, villages[1], LEAGUE, GAME_DATE),
  ]);
  token = await createSession(env.SESSION_KV, "u-1", "u1@example.test", MINE);
}, 120_000);

afterAll(async () => { await mf?.dispose(); });

beforeEach(async () => {
  await db.batch([db.prepare("DELETE FROM matches"), db.prepare("DELETE FROM season_calendar")]);
  await env.CACHE_KV.delete(meLeagueCacheKey(MINE, GAME_DATE));
  // Sezóna 98: odehrané kolo a jedno, které se nikdy neodehrálo. Sezóna 99: jedno odehrané, jedno čeká.
  await addRound("old-played", 98, "2026-06-01T16:00:00.000Z", [0, 3]);
  await addRound("old-open", 98, "2026-06-11T16:00:00.000Z", null);
  await addRound("new-played", 99, "2026-11-05T17:00:00.000Z", [2, 0]);
  await addRound("new-open", 99, "2026-11-12T17:00:00.000Z", null);
});

describe("/auth/me: ligové údaje z KV", () => {
  it("příští zápas je z aktuální sezóny, ne neodehrané kolo z loňska", async () => {
    const first = await me();
    expect(first.leaguePosition).toBe(1);
    // 12. 11. je tři dny po herním dni 9. 11.; staré kolo z června by dalo 0.
    expect(first.nextMatch).toMatchObject({ opponent: "Soupeř", daysUntil: 3 });
  });

  it("druhé volání do pěti minut databázi na tabulku ani zápas nesahá", async () => {
    expect((await me()).leaguePosition).toBe(1);
    // Výsledek se změní (soupeř vede tabulku), hlavička ale ještě pět minut ukazuje uložené.
    await db.prepare("UPDATE matches SET home_score = 0, away_score = 5 WHERE id = 'm-new-played'").run();
    expect((await me()).leaguePosition).toBe(1);
    await env.CACHE_KV.delete(meLeagueCacheKey(MINE, GAME_DATE));
    expect((await me()).leaguePosition).toBe(2);
  });

  it("klíč nese herní den, po půlnoci se počítá znovu", () => {
    expect(meLeagueCacheKey("t", "2026-11-09T16:00:00.000Z")).not.toBe(meLeagueCacheKey("t", "2026-11-10T16:00:00.000Z"));
    expect(meLeagueCacheKey("t", null)).toBe("auth-me-league:v1:t:");
  });
});

describe("rozpis klubu jen z aktuální sezóny", () => {
  it("hranice: nejvyšší sezóna ligy a poslední kolo té předchozí", async () => {
    expect(await loadScheduleSeasonBounds(db, LEAGUE)).toEqual({ seasonNumber: 99, previousSeasonEnd: "2026-06-11T16:00:00.000Z" });
    expect(await loadScheduleSeasonBounds(db, "nezname")).toEqual({ seasonNumber: null, previousSeasonEnd: "" });
    expect(await loadScheduleSeasonBounds(db, null)).toEqual({ seasonNumber: null, previousSeasonEnd: "" });
  });

  it("vrací zápasy sezóny 99 a přátelák po konci sezóny 98, starší ne", async () => {
    await db.batch([
      db.prepare("INSERT INTO matches (id, home_team_id, away_team_id, status, created_at) VALUES ('fr-old', ?, ?, 'simulated', '2026-05-01T10:00:00.000Z')").bind(MINE, RIVAL),
      db.prepare("INSERT INTO matches (id, home_team_id, away_team_id, status, created_at) VALUES ('fr-new', ?, ?, 'simulated', '2026-10-01T10:00:00.000Z')").bind(MINE, RIVAL),
    ]);
    const res = await app.request(`/api/teams/${MINE}/schedule`, { headers: { Authorization: `Bearer ${token}` } }, env);
    expect(res.status).toBe(200);
    const body = await res.json() as { matches: Array<{ id: string }> };
    expect(body.matches.map((m) => m.id).sort()).toEqual(["fr-new", "m-new-open", "m-new-played"]);
  });
});

describe("indexy z migrace 0307", () => {
  it("pojistka výplaty podle reference_id nečte celou tabulku transakcí", async () => {
    expect(await plan("SELECT 1 FROM transactions WHERE reference_id = ? LIMIT 1", "x")).toContain("idx_txn_reference");
  });

  it("aktuální sezóna ligy se čte z indexu (league_id, season_number)", async () => {
    expect(await plan("SELECT MAX(season_number) AS n FROM season_calendar WHERE league_id = ?", LEAGUE)).toContain("idx_calendar_league_season");
  });

  it("sestava klubu na kolo jde přes index (team_id, calendar_id)", async () => {
    expect(await plan("SELECT COUNT(*) FROM lineups l WHERE l.team_id = ? AND l.calendar_id = ?", MINE, "new-open")).toContain("idx_lineups_team_calendar");
  });

  it("poplatky za přestupy v lize jdou přes kluby ligy a index transakcí", async () => {
    const detail = await plan(
      "SELECT SUM(ABS(tx.amount)) AS total FROM transactions tx WHERE tx.type = 'transfer_admin_fee' AND tx.team_id IN (SELECT t.id FROM teams t WHERE t.league_id = ?)",
      LEAGUE,
    );
    expect(detail).toContain("idx_txn_team_type");
    expect(detail).not.toMatch(/SCAN (TABLE )?tx/);
  });
});
