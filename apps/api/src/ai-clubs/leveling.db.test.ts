/**
 * Narovnání AI klubů na skutečné D1 (Miniflare, všechny migrace): liga se dvěma lidskými
 * a dvěma AI kluby, nanečisto nic nezapíše, naostro zvedne AI kluby do rozsahu vzoru,
 * založí stadion, vybavení i zaměstnance a převzatému klubu nic nevezme. Totéž pro U21.
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
import { applyLeveling, planLeveling, TOP11_TOLERANCE, type LevelingPlan } from "./leveling";

const LEAGUE = "league-level-test";
const U21_LEAGUE = "league-level-test-u21";
const HUMANS = ["team-human-a", "team-human-b"];
const AI = ["team-ai-a", "team-ai-b"];
const TAKEN_OVER = "team-ai-b";

let mf: Miniflare;
let db: D1Database;
let env: Bindings;
let seasonId: string;

const app = new Hono<{ Bindings: Bindings }>();
app.route("/api/admin/ai-clubs", adminAiClubsRouter);

const village: VillageInfo = { region_code: "CZ031", category: "obec", population: 1500, district: "Prachatice" };
const names = {
  surnameData: { surnames: { Novák: 1, Dvořák: 1, Kubát: 1 }, female_forms: {} },
  firstnameData: { male: { "1990s": { Jan: 1, Petr: 1 }, "1980s": { Josef: 1 }, "2000s": { Jakub: 1 } }, female: {} },
};

async function insertPlayers(teamId: string, count: number, shift: number, seed: number, u21 = false): Promise<void> {
  const rng = createRng(seed);
  const positions = ["GK", "GK", "DEF", "DEF", "DEF", "DEF", "DEF", "MID", "MID", "MID", "MID", "MID", "FWD", "FWD", "FWD", "FWD", "DEF", "MID", "FWD", "MID"] as const;
  const stmts: D1PreparedStatement[] = [];
  for (let i = 0; i < count; i++) {
    const p = createPlayer(rng, {
      position: positions[i % positions.length], village, names, level: "village", shift,
      ...(u21 ? { age: rng.int(16, 21) } : {}),
    });
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

async function top11(teamId: string): Promise<number> {
  const rows = await db.prepare(
    "SELECT overall_rating AS r FROM players WHERE team_id = ? AND (status IS NULL OR status = 'active') ORDER BY overall_rating DESC LIMIT 11",
  ).bind(teamId).all<{ r: number }>();
  return rows.results.reduce((s, x) => s + x.r, 0) / rows.results.length;
}

async function count(sql: string, ...binds: unknown[]): Promise<number> {
  return (await db.prepare(sql).bind(...binds).first<{ n: number }>())?.n ?? 0;
}

async function snapshot(): Promise<Record<string, number | string>> {
  return {
    players: await count("SELECT COUNT(*) AS n FROM players"),
    ratings: await count("SELECT SUM(overall_rating) AS n FROM players"),
    stadiums: await count("SELECT COUNT(*) AS n FROM stadiums"),
    equipment: await count("SELECT COUNT(*) AS n FROM equipment"),
    staff: await count("SELECT COUNT(*) AS n FROM staff_members"),
    managers: await count("SELECT COUNT(*) AS n FROM managers"),
    budgets: await count("SELECT SUM(budget) AS n FROM teams"),
    reputation: await count("SELECT SUM(reputation) AS n FROM teams"),
    reputationLog: await count("SELECT COUNT(*) AS n FROM reputation_log"),
  };
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
  const hasActivity = await db.prepare("SELECT 1 FROM pragma_table_info('users') WHERE name = 'last_activity_at'").first();
  if (!hasActivity) await db.exec("ALTER TABLE users ADD COLUMN last_activity_at TEXT");
  seasonId = (await db.prepare("SELECT id FROM seasons WHERE status = 'active' LIMIT 1").first<{ id: string }>())!.id;

  const now = new Date().toISOString().slice(0, 19) + "Z";
  const old = new Date(Date.now() - 60 * 86_400_000).toISOString().slice(0, 19) + "Z";
  await db.batch([
    db.prepare("INSERT OR IGNORE INTO users (id, email, password_hash) VALUES ('ai', 'ai@system', 'none')"),
    db.prepare("INSERT INTO users (id, email, password_hash, last_activity_at) VALUES ('user-a', 'a@example.test', 'x', ?)").bind(now),
    db.prepare("INSERT INTO users (id, email, password_hash, last_activity_at) VALUES ('user-b', 'b@example.test', 'x', ?)").bind(now),
    db.prepare("INSERT INTO users (id, email, password_hash, last_activity_at) VALUES ('user-gone', 'gone@example.test', 'x', ?)").bind(old),
    db.prepare("INSERT INTO users (id, email, password_hash, is_admin) VALUES ('admin', 'admin@example.test', 'x', 1)"),
    db.prepare("INSERT INTO leagues (id, season_id, district, name, level, status, league_type) VALUES (?, ?, 'Prachatice', 'Testovací přebor', 'okresni_prebor', 'active', 'senior')").bind(LEAGUE, seasonId),
    db.prepare("INSERT INTO leagues (id, season_id, district, name, level, status, league_type, parent_league_id) VALUES (?, ?, 'Prachatice U21', 'Testovací přebor U21', 'okresni_prebor', 'active', 'u21', ?)").bind(U21_LEAGUE, seasonId, LEAGUE),
    db.prepare("INSERT INTO teams (id, user_id, village_id, name, budget, reputation, league_id, game_date) VALUES ('team-human-a', 'user-a', 'p04', 'FK Netolice', 120000, 88, ?, '2026-10-25T16:00:00.000Z')").bind(LEAGUE),
    db.prepare("INSERT INTO teams (id, user_id, village_id, name, budget, reputation, league_id, game_date) VALUES ('team-human-b', 'user-b', 'p05', 'SK Lhenice', 60000, 80, ?, '2026-10-25T16:00:00.000Z')").bind(LEAGUE),
    db.prepare("INSERT INTO teams (id, user_id, village_id, name, budget, reputation, league_id, game_date) VALUES ('team-ai-a', 'ai', 'p06', 'Sokol Vlachovo Březí', 150000, 50, ?, '2026-10-25T16:00:00.000Z')").bind(LEAGUE),
    // Převzatý klub: bohatší než vzor, rozpočet mu narovnání nesmí vzít.
    db.prepare("INSERT INTO teams (id, user_id, village_id, name, budget, reputation, league_id, game_date, ai_since, ai_former_user_id) VALUES ('team-ai-b', 'ai', 'p07', 'TJ Čkyně', 900000, 95, ?, '2026-10-25T16:00:00.000Z', '2026-10-01', 'user-gone')").bind(LEAGUE),
  ]);
  for (const [i, teamId] of [...HUMANS, ...AI].entries()) {
    const owner = (await db.prepare("SELECT user_id, village_id, name FROM teams WHERE id = ?").bind(teamId).first<{ user_id: string; village_id: string; name: string }>())!;
    await db.prepare("INSERT INTO teams (id, user_id, village_id, name, budget, league_id, team_type, parent_team_id, game_date) VALUES (?, ?, ?, ?, 0, ?, 'u21', ?, '2026-10-25T16:00:00.000Z')")
      .bind(`${teamId}-u21`, owner.user_id, owner.village_id, `${owner.name} U21`, U21_LEAGUE, teamId).run();
    await insertPlayers(`${teamId}-u21`, 14, HUMANS.includes(teamId) ? 12 : -6, 500 + i, true);
  }
  await insertPlayers("team-human-a", 24, 24, 1);
  await insertPlayers("team-human-b", 22, 16, 2);
  await insertPlayers("team-ai-a", 18, -8, 3);
  await insertPlayers("team-ai-b", 20, -6, 4);

  // Zázemí lidských klubů (vzor): stadion, vybavení, zaměstnanci.
  await db.batch([
    db.prepare(`INSERT INTO stadiums (id, team_id, pitch_condition, pitch_type, changing_rooms, showers, refreshments, lighting, stands, parking, fence, toilets, security, scoreboard_level)
                VALUES ('st-a', 'team-human-a', 96, 'hybrid', 2, 3, 2, 1, 2, 2, 2, 2, 1, 3)`),
    db.prepare(`INSERT INTO stadiums (id, team_id, pitch_condition, pitch_type, changing_rooms, showers, refreshments, lighting, stands, parking, fence, toilets, security, scoreboard_level)
                VALUES ('st-b', 'team-human-b', 90, 'natural', 1, 2, 1, 0, 1, 1, 1, 1, 1, 2)`),
    db.prepare("INSERT INTO equipment (id, team_id, balls, jerseys, training_cones, first_aid, balls_condition) VALUES ('eq-a', 'team-human-a', 3, 3, 2, 2, 95)"),
    db.prepare("INSERT INTO equipment (id, team_id, balls, jerseys, training_cones, first_aid, balls_condition) VALUES ('eq-b', 'team-human-b', 2, 2, 1, 1, 85)"),
    // Lidští trenéři (vzor pro AI trenéry) a odpojený trenér bývalého majitele převzatého klubu.
    db.prepare(`INSERT INTO managers (id, user_id, team_id, name, backstory, avatar, coaching, motivation, tactics, discipline, youth_development)
                VALUES ('mgr-a', 'user-a', 'team-human-a', 'Petr Novák', '', '{}', 70, 60, 66, 72, 50)`),
    db.prepare(`INSERT INTO managers (id, user_id, team_id, name, backstory, avatar, coaching, motivation, tactics, discipline, youth_development)
                VALUES ('mgr-b', 'user-b', 'team-human-b', 'Jan Dvořák', '', '{}', 60, 50, 56, 62, 44)`),
    db.prepare(`INSERT INTO managers (id, user_id, team_id, name, backstory, avatar, coaching, motivation, tactics, discipline, youth_development)
                VALUES ('mgr-gone', 'user-gone', NULL, 'Karel Pryč', '', '{}', 30, 30, 30, 30, 30)`),
  ]);
  const roles = ["asistent", "trener_mladeze", "trener_brankaru", "kondicni_trener", "maser", "lekar", "spravce_hriste", "skaut", "obsluha", "ekonom", "skaut"];
  const staff: D1PreparedStatement[] = [];
  for (const [teamId, n] of [["team-human-a", 11], ["team-human-b", 7]] as const) {
    for (const role of roles.slice(0, n)) {
      staff.push(db.prepare(
        `INSERT INTO staff_members (id, district, team_id, role, profession, first_name, last_name, age, weekly_wage, signing_fee, avatar)
         VALUES (?, 'Prachatice', ?, ?, ?, 'Jan', 'Novák', 40, 150, 600, '{}')`,
      ).bind(crypto.randomUUID(), teamId, role, role));
    }
  }
  await db.batch(staff);
}, 180_000);

afterAll(async () => {
  await mf.dispose();
});

describe("narovnání AI klubů v lize s lidmi", () => {
  let plan: LevelingPlan;

  it("nanečisto nic nezapíše a vzorem jsou jen aktivní lidské kluby", async () => {
    const before = await snapshot();
    plan = await planLeveling(db, { leagueId: LEAGUE, mode: "league-humans", seed: 42 });
    expect(await snapshot()).toEqual(before);

    expect(plan.reference.teams).toBe(2);
    expect(plan.clubs.map((c) => c.teamId).sort()).toEqual([...AI].sort());
    const refTop11 = [await top11("team-human-a"), await top11("team-human-b")];
    for (const club of plan.clubs) {
      expect(club.percentile).toBeGreaterThanOrEqual(0.15);
      expect(club.percentile).toBeLessThanOrEqual(0.85);
      expect(club.target.top11).toBeGreaterThanOrEqual(Math.min(...refTop11) - 0.1);
      expect(club.target.top11).toBeLessThanOrEqual(Math.max(...refTop11) + 0.1);
      expect(Math.abs(club.after.top11 - club.target.top11)).toBeLessThanOrEqual(TOP11_TOLERANCE + 0.05);
      expect(club.after.top11).toBeGreaterThan(club.before.top11);
      expect(club.after.squadSize).toBeGreaterThanOrEqual(club.before.squadSize);
    }
  });

  it("naostro zvedne AI kluby do rozsahu vzoru a založí stadion, vybavení i zaměstnance", async () => {
    const result = await applyLeveling(db, plan);
    expect(result.failedStatements).toBe(0);
    expect(result.clubs).toBe(2);
    expect(result.playersRaised).toBeGreaterThan(0);
    expect(result.staffHired).toBeGreaterThan(0);

    for (const club of plan.clubs) {
      // Plán a provedení dají totéž (stejné semínko, stejný stav).
      expect(Math.abs((await top11(club.teamId)) - club.after.top11)).toBeLessThanOrEqual(0.1);
      expect(await count("SELECT COUNT(*) AS n FROM players WHERE team_id = ?", club.teamId)).toBe(club.after.squadSize);
      expect(await count("SELECT COUNT(*) AS n FROM stadiums WHERE team_id = ?", club.teamId)).toBe(1);
      expect(await count("SELECT COUNT(*) AS n FROM equipment WHERE team_id = ?", club.teamId)).toBe(1);
      expect(await count("SELECT COUNT(*) AS n FROM staff_members WHERE team_id = ?", club.teamId)).toBe(club.after.staffRoles.length);
      const stadium = (await db.prepare("SELECT showers, pitch_condition FROM stadiums WHERE team_id = ?").bind(club.teamId).first<{ showers: number; pitch_condition: number }>())!;
      expect(stadium.showers).toBeGreaterThanOrEqual(2);
      expect(stadium.pitch_condition).toBeGreaterThanOrEqual(90);
      const balls = (await db.prepare("SELECT balls FROM equipment WHERE team_id = ?").bind(club.teamId).first<{ balls: number }>())!;
      expect(balls.balls).toBeGreaterThanOrEqual(2);
      // AI trenér má uloženou povahu.
      expect(await count("SELECT COUNT(*) AS n FROM managers WHERE team_id = ? AND user_id = 'ai' AND ai_profile IS NOT NULL", club.teamId)).toBe(1);
      // Noví hráči mají smlouvu a číslo dresu, nikdo v kádru nemá číslo dvakrát.
      expect(await count("SELECT COUNT(*) AS n FROM players p WHERE p.team_id = ? AND NOT EXISTS (SELECT 1 FROM player_contracts c WHERE c.player_id = p.id) AND p.id NOT LIKE ?", club.teamId, `${club.teamId}-p%`)).toBe(0);
      expect(await count("SELECT COUNT(*) AS n FROM (SELECT squad_number FROM players WHERE team_id = ? AND squad_number IS NOT NULL GROUP BY squad_number HAVING COUNT(*) > 1)", club.teamId)).toBe(0);
    }

    // Původní AI klub jde rozpočtem na cíl, převzatý o nic nepřijde.
    const original = plan.clubs.find((c) => c.teamId === "team-ai-a")!;
    const takenOver = (await db.prepare("SELECT budget, reputation FROM teams WHERE id = ?").bind(TAKEN_OVER).first<{ budget: number; reputation: number }>())!;
    expect(takenOver.budget).toBe(900000);
    expect(takenOver.reputation).toBe(95);
    const originalRow = (await db.prepare("SELECT budget, reputation FROM teams WHERE id = ?").bind("team-ai-a").first<{ budget: number; reputation: number }>())!;
    expect(originalRow.budget).toBe(original.target.budget);
    expect(originalRow.reputation).toBe(original.target.reputation);
    expect(await count("SELECT COUNT(*) AS n FROM reputation_log WHERE team_id = 'team-ai-a' AND source = 'admin'")).toBe(1);
    // Lidských klubů se narovnání nedotklo.
    expect(await count("SELECT COUNT(*) AS n FROM staff_members WHERE team_id IN ('team-human-a', 'team-human-b')")).toBe(18);

    // AI trenér má vlastnosti aspoň na cíli z lidských trenérů (60–70 koučování), lidští ani odpojený trenér se nemění.
    expect(result.managersRaised).toBe(2);
    for (const club of plan.clubs) {
      expect(club.target.manager?.coaching).toBeGreaterThanOrEqual(60);
      expect(club.target.manager?.coaching).toBeLessThanOrEqual(70);
      const m = (await db.prepare("SELECT coaching, motivation, tactics, discipline, youth_development FROM managers WHERE team_id = ? AND user_id = 'ai'")
        .bind(club.teamId).first<Record<string, number>>())!;
      for (const [attr, target] of Object.entries(club.target.manager ?? {})) expect(m[attr], attr).toBeGreaterThanOrEqual(target);
    }
    const humans = await db.prepare("SELECT id, coaching, discipline FROM managers WHERE id IN ('mgr-a', 'mgr-b', 'mgr-gone') ORDER BY id")
      .all<{ id: string; coaching: number; discipline: number }>();
    expect(humans.results).toEqual([
      { id: "mgr-a", coaching: 70, discipline: 72 },
      { id: "mgr-b", coaching: 60, discipline: 62 },
      { id: "mgr-gone", coaching: 30, discipline: 30 },
    ]);
  });

  it("druhé provedení už nic nezvedá (jen nahoru, nic dvakrát)", async () => {
    const again = await planLeveling(db, { leagueId: LEAGUE, mode: "league-humans", seed: 42 });
    for (const club of again.clubs) {
      expect(club.skillShift).toBe(0);
      expect(club.newPlayers).toBe(0);
    }
    const before = await snapshot();
    const result = await applyLeveling(db, again);
    expect(result.playersRaised).toBe(0);
    expect(result.playersCreated).toBe(0);
    expect(result.staffHired).toBe(0);
    expect(result.managersRaised).toBe(0);
    expect(await snapshot()).toEqual(before);
  });

  it("U21 liga: vzorem lidské U21 týmy, zvedají se jen hráči", async () => {
    const before = await snapshot();
    const u21Plan = await planLeveling(db, { leagueId: U21_LEAGUE, mode: "league-humans", seed: 7 });
    expect(await snapshot()).toEqual(before);
    expect(u21Plan.reference.teams).toBe(2);
    expect(u21Plan.clubs.map((c) => c.teamId).sort()).toEqual(AI.map((id) => `${id}-u21`).sort());
    for (const club of u21Plan.clubs) {
      expect(club.teamType).toBe("u21");
      expect(club.target.staffRoles).toEqual([]);
      expect(club.target.stadium).toEqual({});
    }
    const result = await applyLeveling(db, u21Plan);
    expect(result.failedStatements).toBe(0);
    expect(result.staffHired).toBe(0);
    for (const club of u21Plan.clubs) {
      expect(Math.abs((await top11(club.teamId)) - club.target.top11)).toBeLessThanOrEqual(TOP11_TOLERANCE + 0.05);
      expect(await count("SELECT COUNT(*) AS n FROM stadiums WHERE team_id = ?", club.teamId)).toBe(0);
      expect(await count("SELECT COUNT(*) AS n FROM staff_members WHERE team_id = ?", club.teamId)).toBe(0);
      const ages = await db.prepare("SELECT MIN(age) AS lo, MAX(age) AS hi FROM players WHERE team_id = ?").bind(club.teamId).first<{ lo: number; hi: number }>();
      expect(ages!.lo).toBeGreaterThanOrEqual(16);
      expect(ages!.hi).toBeLessThanOrEqual(21);
    }
    expect((await db.prepare("SELECT budget FROM teams WHERE id = 'team-ai-a-u21'").first<{ budget: number }>())!.budget).toBe(0);
  });

  it("endpoint: nanečisto jen pro admina, neznámý režim odmítne", async () => {
    const adminToken = await createSession(env.SESSION_KV, "admin", "admin@example.test", null);
    const userToken = await createSession(env.SESSION_KV, "user-a", "a@example.test", "team-human-a");
    const url = `/api/admin/ai-clubs/level?leagueId=${LEAGUE}&mode=league-humans&seed=42&dryRun=1`;
    const before = await snapshot();
    const ok = await app.request(url, { method: "POST", headers: { Authorization: `Bearer ${adminToken}` } }, env);
    expect(ok.status).toBe(200);
    const body = await ok.json() as { dryRun: boolean; plan: LevelingPlan };
    expect(body.dryRun).toBe(true);
    expect(body.plan.seed).toBe(42);
    expect(body.plan.clubs).toHaveLength(2);
    expect(await snapshot()).toEqual(before);

    const forbidden = await app.request(url, { method: "POST", headers: { Authorization: `Bearer ${userToken}` } }, env);
    expect(forbidden.status).toBe(403);
    const anonymous = await app.request(url, { method: "POST" }, env);
    expect(anonymous.status).toBe(401);
    const badMode = await app.request(`/api/admin/ai-clubs/level?leagueId=${LEAGUE}&mode=praha&dryRun=1`, { method: "POST", headers: { Authorization: `Bearer ${adminToken}` } }, env);
    expect(badMode.status).toBe(400);
    const missing = await app.request("/api/admin/ai-clubs/level?leagueId=nope&mode=league-humans&dryRun=1", { method: "POST", headers: { Authorization: `Bearer ${adminToken}` } }, env);
    expect(missing.status).toBe(404);
  });

  it("vzor z jiné ligy: lidé z vzorové ligy, jen pro league-humans, neznámá vzorová liga 404", async () => {
    const adminToken = await createSession(env.SESSION_KV, "admin", "admin@example.test", null);
    const call = (query: string) => app.request(`/api/admin/ai-clubs/level?${query}`, { method: "POST", headers: { Authorization: `Bearer ${adminToken}` } }, env);
    const before = await snapshot();
    const ok = await call(`leagueId=${LEAGUE}&mode=league-humans&refLeagueId=${U21_LEAGUE}&seed=42&dryRun=1`);
    expect(ok.status).toBe(200);
    const body = await ok.json() as { plan: LevelingPlan };
    expect(body.plan.reference.leagueIds).toEqual([U21_LEAGUE]);
    expect(await snapshot()).toEqual(before);
    expect((await call(`leagueId=${LEAGUE}&mode=newcomer&refLeagueId=${U21_LEAGUE}&dryRun=1`)).status).toBe(400);
    expect((await call(`leagueId=${LEAGUE}&mode=league-humans&refLeagueId=nope&dryRun=1`)).status).toBe(404);
  });
});
