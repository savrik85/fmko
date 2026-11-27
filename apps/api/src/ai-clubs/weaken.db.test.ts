/**
 * Oslabení AI klubů ligy na skutečné D1 (Miniflare, všechny migrace): Strakonice 11/2026,
 * lidský nováček skončil uprostřed, AI kluby nad ním. Nanečisto nic nezapíše, naostro sníží
 * hráče AI klubů o daný počet bodů a strhne jim rozpočet na strop. Lidský klub, klub převzatý
 * od člověka a hostující hráč zůstanou, jak byli. Podruhé se oslabení samo nepustí.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { Miniflare } from "miniflare";
import { Hono } from "hono";
import { createSession } from "../auth/session";
import { createPlayer } from "../generators/create-player";
import { createRng } from "../generators/rng";
import type { VillageInfo } from "../generators/player";
import { adminAiClubsRouter } from "../routes/admin-ai-clubs";
import type { Bindings } from "../index";
import type { WeakeningPlan } from "./weaken";

const LEAGUE = "league-weaken-test";
const HUMAN = "team-human";
const AI_STRONG = "team-ai-strong";
const AI_TAKEN_OVER = "team-ai-taken";
const LOANED_IN = `${AI_STRONG}-loan`;

let mf: Miniflare;
let db: D1Database;
let env: Bindings;
let adminToken: string;

const app = new Hono<{ Bindings: Bindings }>();
app.route("/api/admin/ai-clubs", adminAiClubsRouter);

const village: VillageInfo = { region_code: "CZ031", category: "obec", population: 1500, district: "Strakonice" };
const names = {
  surnameData: { surnames: { Novák: 1, Dvořák: 1, Kubát: 1 }, female_forms: {} },
  firstnameData: { male: { "1990s": { Jan: 1, Petr: 1 }, "1980s": { Josef: 1 }, "2000s": { Jakub: 1 } }, female: {} },
};

async function insertPlayers(teamId: string, count: number, shift: number, seed: number): Promise<void> {
  const rng = createRng(seed);
  const positions = ["GK", "DEF", "DEF", "DEF", "DEF", "MID", "MID", "MID", "MID", "FWD", "FWD", "GK", "DEF", "MID", "FWD", "MID"] as const;
  const stmts: D1PreparedStatement[] = [];
  for (let i = 0; i < count; i++) {
    const p = createPlayer(rng, { position: positions[i % positions.length], village, names, level: "village", shift });
    stmts.push(db.prepare(
      `INSERT INTO players (id, team_id, first_name, last_name, nickname, age, position, overall_rating, skills, physical,
         personality, life_context, avatar, description, skills_max, hidden_talent, experience, weekly_wage, nationality)
       VALUES (?, ?, ?, ?, '', ?, ?, ?, ?, ?, ?, ?, '{}', '', ?, ?, ?, ?, 'CZ')`,
    ).bind(`${teamId}-p${i}`, teamId, p.firstName, p.lastName, p.age, p.position, p.rating,
      JSON.stringify(p.skills), JSON.stringify(p.physical), JSON.stringify(p.personality), JSON.stringify(p.lifeContext),
      JSON.stringify(p.skillsMax), p.hiddenTalent, p.experience, Math.round(10 + p.rating * 4)));
  }
  await db.batch(stmts);
}

async function ratings(teamId: string): Promise<Map<string, number>> {
  const rows = await db.prepare("SELECT id, overall_rating AS r FROM players WHERE team_id = ?").bind(teamId).all<{ id: string; r: number }>();
  return new Map(rows.results.map((x) => [x.id, x.r]));
}

async function top11(teamId: string): Promise<number> {
  const rows = await db.prepare(
    "SELECT overall_rating AS r FROM players WHERE team_id = ? AND (status IS NULL OR status = 'active') AND loan_from_team_id IS NULL ORDER BY overall_rating DESC LIMIT 11",
  ).bind(teamId).all<{ r: number }>();
  return rows.results.reduce((s, x) => s + x.r, 0) / rows.results.length;
}

async function budget(teamId: string): Promise<number> {
  return (await db.prepare("SELECT budget FROM teams WHERE id = ?").bind(teamId).first<{ budget: number }>())!.budget;
}

async function listingStatus(id: string): Promise<string | undefined> {
  return (await db.prepare("SELECT status FROM transfer_listings WHERE id = ?").bind(id).first<{ status: string }>())?.status;
}

async function call(query: string, token: string | null = adminToken): Promise<Response> {
  return app.request(`/api/admin/ai-clubs/weaken?${query}`, {
    method: "POST", headers: token ? { Authorization: `Bearer ${token}` } : {},
  }, env);
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
  const seasonId = (await db.prepare("SELECT id FROM seasons WHERE status = 'active' LIMIT 1").first<{ id: string }>())!.id;
  await db.batch([
    db.prepare("INSERT OR IGNORE INTO users (id, email, password_hash) VALUES ('ai', 'ai@system', 'none')"),
    db.prepare("INSERT INTO users (id, email, password_hash) VALUES ('user-k', 'k@example.test', 'x')"),
    db.prepare("INSERT INTO users (id, email, password_hash) VALUES ('user-gone', 'gone@example.test', 'x')"),
    db.prepare("INSERT INTO users (id, email, password_hash, is_admin) VALUES ('admin', 'admin@example.test', 'x', 1)"),
    db.prepare("INSERT INTO leagues (id, season_id, district, name, level, status, league_type) VALUES (?, ?, 'Strakonice', 'Okresní přebor Strakonice', 'okresni_prebor', 'active', 'senior')").bind(LEAGUE, seasonId),
    // Lidský klub nad stropem rozpočtu: strop platí jen pro AI.
    db.prepare("INSERT INTO teams (id, user_id, village_id, name, budget, reputation, league_id, game_date) VALUES (?, 'user-k', 'p04', 'SK Agrokat Strakonice', 90000, 90, ?, '2026-11-27T16:00:00.000Z')").bind(HUMAN, LEAGUE),
    db.prepare("INSERT INTO teams (id, user_id, village_id, name, budget, reputation, league_id, game_date) VALUES (?, 'ai', 'p05', 'FK Jatky Hradský Volyně', 204000, 93, ?, '2026-11-27T16:00:00.000Z')").bind(AI_STRONG, LEAGUE),
    db.prepare("INSERT INTO teams (id, user_id, village_id, name, budget, reputation, league_id, game_date, ai_since, ai_former_user_id) VALUES (?, 'ai', 'p06', 'TJ Převzatý', 150000, 90, ?, '2026-11-27T16:00:00.000Z', '2026-11-01', 'user-gone')").bind(AI_TAKEN_OVER, LEAGUE),
  ]);
  await insertPlayers(HUMAN, 16, 4, 1);
  await insertPlayers(AI_STRONG, 16, 14, 2);
  await insertPlayers(AI_TAKEN_OVER, 16, 14, 3);
  // Hostující hráč patří jinému klubu, oslabení se ho netýká.
  await db.prepare("INSERT INTO players (id, team_id, first_name, last_name, nickname, age, position, overall_rating, skills, physical, personality, life_context, avatar, description, skills_max, hidden_talent, experience, weekly_wage, nationality, loan_from_team_id) SELECT ?, team_id, first_name, last_name, nickname, age, position, overall_rating, skills, physical, personality, life_context, avatar, description, skills_max, hidden_talent, experience, weekly_wage, nationality, ? FROM players WHERE id = ?")
    .bind(LOANED_IN, HUMAN, `${AI_STRONG}-p1`).run();
  await db.batch([
    db.prepare("INSERT INTO transfer_listings (id, player_id, team_id, asking_price, league_id, expires_at) VALUES ('listing-ai', ?, ?, 50000, ?, '2099-01-01T00:00:00Z')").bind(`${AI_STRONG}-p2`, AI_STRONG, LEAGUE),
    db.prepare("INSERT INTO transfer_listings (id, player_id, team_id, asking_price, league_id, expires_at) VALUES ('listing-human', ?, ?, 20000, ?, '2099-01-01T00:00:00Z')").bind(`${HUMAN}-p2`, HUMAN, LEAGUE),
  ]);
  adminToken = await createSession(env.SESSION_KV, "admin", "admin@example.test", null);
}, 120_000);

afterAll(async () => {
  await mf?.dispose();
});

describe("oslabení AI klubů ligy", () => {
  it("bez admina nepustí, s nesmyslným posunem odmítne", async () => {
    const userToken = await createSession(env.SESSION_KV, "user-k", "k@example.test", HUMAN);
    expect((await call(`leagueId=${LEAGUE}&shift=8&dryRun=1`, userToken)).status).toBe(403);
    expect((await call(`leagueId=${LEAGUE}&shift=8&dryRun=1`, null)).status).toBe(401);
    expect((await call("shift=8&dryRun=1")).status).toBe(400);
    expect((await call(`leagueId=${LEAGUE}&shift=0&dryRun=1`)).status).toBe(400);
    expect((await call(`leagueId=${LEAGUE}&shift=21&dryRun=1`)).status).toBe(400);
    expect((await call(`leagueId=${LEAGUE}&shift=8&budgetCap=-5&dryRun=1`)).status).toBe(400);
    expect((await call("leagueId=nope&shift=8&dryRun=1")).status).toBe(404);
  });

  it("nanečisto ukáže plán jen pro původní AI kluby a nic nezapíše", async () => {
    const before = { strong: await ratings(AI_STRONG), budget: await budget(AI_STRONG) };
    const res = await call(`leagueId=${LEAGUE}&shift=8&budgetCap=60000&dryRun=1`);
    expect(res.status).toBe(200);
    const body = await res.json() as { dryRun: boolean; plan: WeakeningPlan };
    expect(body.dryRun).toBe(true);
    expect(body.plan.clubs.map((c) => c.teamId)).toEqual([AI_STRONG]);
    const club = body.plan.clubs[0];
    expect(club.top11Before - club.top11After).toBeGreaterThanOrEqual(7.5);
    expect(club.top11Before - club.top11After).toBeLessThanOrEqual(8.5);
    expect(club.budgetBefore).toBe(204000);
    expect(club.budgetAfter).toBe(60000);
    expect(body.plan.untouched.map((c) => c.teamId).sort()).toEqual([AI_TAKEN_OVER, HUMAN].sort());
    expect(await ratings(AI_STRONG)).toEqual(before.strong);
    expect(await budget(AI_STRONG)).toBe(before.budget);
  });

  it("naostro sníží hráče AI klubu o posun a strhne rozpočet, ostatní nechá", async () => {
    const before = {
      strong: await ratings(AI_STRONG), human: await ratings(HUMAN), taken: await ratings(AI_TAKEN_OVER),
      strongTop11: await top11(AI_STRONG), loaned: (await ratings(AI_STRONG)).get(LOANED_IN),
    };
    const res = await call(`leagueId=${LEAGUE}&shift=8&budgetCap=60000`);
    expect(res.status).toBe(200);
    const body = await res.json() as { dryRun: boolean; result: { playersLowered: number; failedStatements: number } };
    expect(body.dryRun).toBe(false);
    expect(body.result.failedStatements).toBe(0);
    expect(body.result.playersLowered).toBe(16);

    const after = await ratings(AI_STRONG);
    for (const [id, r] of before.strong) {
      if (id === LOANED_IN) continue;
      expect(after.get(id)!).toBeLessThanOrEqual(r - 7);
      expect(after.get(id)!).toBeGreaterThanOrEqual(r - 9);
    }
    expect(before.strongTop11 - await top11(AI_STRONG)).toBeGreaterThanOrEqual(7.5);
    expect(after.get(LOANED_IN)).toBe(before.loaned);
    expect(await ratings(HUMAN)).toEqual(before.human);
    expect(await ratings(AI_TAKEN_OVER)).toEqual(before.taken);

    expect(await budget(AI_STRONG)).toBe(60000);
    expect(await budget(HUMAN)).toBe(90000);
    expect(await budget(AI_TAKEN_OVER)).toBe(150000);

    // Inzerát AI hráče měl cenu ze starého hodnocení, lidský inzerát je věc vlastníka.
    expect(await listingStatus("listing-ai")).toBe("withdrawn");
    expect(await listingStatus("listing-human")).toBe("active");
  });

  it("podruhé se bez force nepustí, ani nanečisto", async () => {
    const before = await ratings(AI_STRONG);
    expect((await call(`leagueId=${LEAGUE}&shift=8`)).status).toBe(409);
    expect((await call(`leagueId=${LEAGUE}&shift=8&dryRun=1`)).status).toBe(409);
    expect(await ratings(AI_STRONG)).toEqual(before);
  });
});
