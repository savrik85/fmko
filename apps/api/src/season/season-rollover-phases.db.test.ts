/**
 * Rollover po fázích na skutečné D1 (Miniflare, všechny migrace).
 *
 * 21. 10. 2026 běžel rollover jako jedna invokace a po stárnutí a dospívání dorostu přestal
 * zapisovat: dorostový cyklus, marker stárnutí ani marker celého rolloveru se nezapsaly
 * a v dorostu zůstalo 175 hráčů starších 21 let. Tady se hlídá, že rollover jde po krocích,
 * že se nic nevratného nezopakuje a že cyklus jde bezpečně doběhnout dodatečně, když
 * stárnutí už proběhlo.
 */
import { afterAll, describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { Miniflare } from "miniflare";
import { Hono } from "hono";
import { createRng } from "../generators/rng";
import { FIRSTNAMES } from "../data/czech-names";
import { backfillU21ForLeague, vygenerujDorostence } from "../league/u21-generator";
import { createSession } from "../auth/session";
import { developmentRouter } from "../routes/development";
import {
  ROLLOVER_PHASES, beginRollover, rolloverAllLeagues, rolloverPhaseKey, runRolloverStep,
  type RolloverPhase,
} from "./season-rollover";
import { runEndSeasonStep } from "./end-season";
import { readProgress, writeProgress } from "./season-progress";
import { runYouthCycleChunk, youthCycleKey, VEK_ODCHODU_Z_DOROSTU } from "./u21-lifecycle";
import type { Bindings } from "../index";

const DISTRICT = "Prachatice";
const LEAGUE = "league-senior";
const SENIOR_TEAMS = [
  { id: "team-human-1", user: "human-1", village: "village-1", name: "SK Lhota" },
  { id: "team-human-2", user: "human-2", village: "village-2", name: "FK Ves" },
  { id: "team-ai-1", user: "ai", village: "village-3", name: "TJ Dolní" },
  { id: "team-ai-2", user: "ai", village: "village-4", name: "Sokol Horní" },
];

const instances: Miniflare[] = [];
afterAll(async () => {
  for (const instance of instances) await instance.dispose();
});

interface World {
  db: D1Database;
  env: Bindings;
}

async function freshWorld(): Promise<World> {
  const mf = new Miniflare({
    modules: true,
    script: "export default { fetch() { return new Response('ok'); } }",
    d1Databases: ["DB"],
    kvNamespaces: ["SESSION_KV", "CACHE_KV"],
  });
  instances.push(mf);
  const db = await mf.getD1Database("DB");
  const env = { DB: db, SESSION_KV: await mf.getKVNamespace("SESSION_KV"), CACHE_KV: await mf.getKVNamespace("CACHE_KV") } as unknown as Bindings;
  const dir = new URL("../../migrations/", import.meta.url);
  for (const file of readdirSync(dir).filter((f) => f.endsWith(".sql")).sort()) {
    const source = readFileSync(new URL(file, dir), "utf8").replace(/--[^\n]*/g, "").replace(/\n/g, " ");
    await db.exec(source);
  }

  await db.prepare("INSERT INTO users (id, email, password_hash, is_admin) VALUES ('admin', 'admin@example.test', 'x', 1), ('human-1', 'h1@example.test', 'x', 0), ('human-2', 'h2@example.test', 'x', 0)").run();
  for (const [i, t] of SENIOR_TEAMS.entries()) {
    await db.prepare("INSERT INTO villages (id, name, district, region, population, size, lat, lng) VALUES (?, ?, ?, 'JC', ?, 'village', 49.0, 14.0)")
      .bind(t.village, `Obec ${i + 1}`, DISTRICT, 600 + i * 100).run();
  }
  await db.prepare("INSERT INTO leagues (id, season_id, district, name, level, status) VALUES (?, 'season-1', ?, 'Okresní přebor Prachatice', 'okresni_prebor', 'active')")
    .bind(LEAGUE, DISTRICT).run();

  const rng = createRng(42);
  const village = { region_code: DISTRICT, category: "obec" as const, population: 700, district: DISTRICT };
  const names = { surnames: { Novák: 10, Svoboda: 8, Dvořák: 6 }, female_forms: {} as Record<string, string> };
  const firstnames = { male: FIRSTNAMES, female: {} as Record<string, Record<string, number>> };
  for (const t of SENIOR_TEAMS) {
    await db.prepare("INSERT INTO teams (id, user_id, village_id, name, league_id, team_type, game_date) VALUES (?, ?, ?, ?, ?, 'senior', '2026-10-12T16:00:00.000Z')")
      .bind(t.id, t.user, t.village, t.name, LEAGUE).run();
    const positions = ["GK", "GK", "DEF", "DEF", "DEF", "DEF", "DEF", "MID", "MID", "MID", "MID", "MID", "FWD", "FWD", "FWD", "FWD"] as const;
    await vygenerujDorostence(db, t.id, [...positions], village, "village", rng, names, firstnames, "season-1", 24, 30);
  }
  await backfillU21ForLeague(db, LEAGUE, rng);

  // Dorost s jasnou věkovou stavbou: každý dorost má tři jednadvacetileté (po stárnutí
  // jim bude 22 a odejdou do áčka) a jinak mladší kluky.
  const youth = await db.prepare(
    "SELECT p.id, p.team_id FROM players p JOIN teams t ON t.id = p.team_id WHERE t.team_type = 'u21' ORDER BY p.team_id, p.id",
  ).all<{ id: string; team_id: string }>();
  const byTeam = new Map<string, string[]>();
  for (const p of youth.results) byTeam.set(p.team_id, [...(byTeam.get(p.team_id) ?? []), p.id]);
  for (const ids of byTeam.values()) {
    for (const [i, id] of ids.entries()) {
      await db.prepare("UPDATE players SET age = ? WHERE id = ?").bind(i < 3 ? 21 : 17 + (i % 4), id).run();
    }
  }
  return { db, env };
}

async function agesById(db: D1Database): Promise<Map<string, number>> {
  const rows = await db.prepare(
    "SELECT p.id, p.age FROM players p JOIN teams t ON t.id = p.team_id WHERE t.team_type = 'u21'",
  ).all<{ id: string; age: number }>();
  return new Map(rows.results.map((r) => [r.id, r.age]));
}

async function count(db: D1Database, sql: string, ...binds: unknown[]): Promise<number> {
  return (await db.prepare(sql).bind(...binds).first<{ n: number }>())?.n ?? 0;
}

async function ageOf(db: D1Database, playerId: string): Promise<number | undefined> {
  return (await db.prepare("SELECT age FROM players WHERE id = ?").bind(playerId).first<{ age: number }>())?.age;
}

const OVERAGE_IN_YOUTH = `SELECT COUNT(*) AS n FROM players p JOIN teams t ON t.id = p.team_id
  WHERE t.team_type = 'u21' AND p.age >= ${VEK_ODCHODU_Z_DOROSTU} AND p.loan_from_team_id IS NULL`;
const SIXTEEN_IN_YOUTH = "SELECT COUNT(*) AS n FROM players p JOIN teams t ON t.id = p.team_id WHERE t.team_type = 'u21' AND p.age = 16";

async function runUntilFinished(db: D1Database, oldSeason: number): Promise<Array<{ phase: RolloverPhase | null; status: string }>> {
  const steps: Array<{ phase: RolloverPhase | null; status: string }> = [];
  for (let i = 0; i < 200; i++) {
    const r = await runRolloverStep(db, oldSeason);
    steps.push({ phase: r.phase, status: r.status });
    if (r.finished) return steps;
  }
  throw new Error("rollover nedoběhl ani po 200 krocích");
}

describe("rollover po fázích", () => {
  it("jde po krocích, každý krok jednu fázi v původním pořadí, a doběhne celý včetně cyklu dorostu", async () => {
    const { db } = await freshWorld();
    const before = await agesById(db);
    expect(before.size).toBeGreaterThan(0);

    expect(await beginRollover(db, 1)).toBe("in_progress");
    const steps = await runUntilFinished(db, 1);

    expect(steps.filter((s) => s.status === "error")).toEqual([]);
    // Pořadí fází je ROLLOVER_PHASES, dávkové fáze se jen opakují za sebou.
    const order = steps.map((s) => s.phase).filter((p, i, all) => p !== null && p !== all[i - 1]);
    expect(order).toEqual([...ROLLOVER_PHASES]);
    for (const phase of ROLLOVER_PHASES) {
      expect((await readProgress(db, rolloverPhaseKey(phase, 1)))?.status, phase).toBe("done");
    }
    expect((await readProgress(db, { leagueId: "__global__", seasonNumber: 1, phase: "rollover" }))?.status).toBe("done");
    // Dřívější klíče zůstaly: stárnutí dorostu a volby pod číslem nové sezóny.
    expect((await readProgress(db, { leagueId: "__u21__", seasonNumber: 2, phase: "u21_aging" }))?.status).toBe("done");
    expect((await readProgress(db, { leagueId: "__villages__", seasonNumber: 2, phase: "municipal_elections" }))?.status).toBe("done");

    expect(await count(db, "SELECT COUNT(*) AS n FROM seasons WHERE number = 2 AND status = 'active'")).toBe(1);
    expect(await count(db, "SELECT COUNT(*) AS n FROM seasons WHERE number = 1 AND status = 'finished'")).toBe(1);
    expect(await count(db, "SELECT COUNT(*) AS n FROM matches m JOIN season_calendar sc ON sc.id = m.calendar_id WHERE sc.league_id = ? AND sc.season_number = 2", LEAGUE)).toBeGreaterThan(0);

    // Každý kluk zestárl přesně o rok, ať je teď kdekoli (v dorostu, nebo v áčku).
    for (const [id, age] of before) expect(await ageOf(db, id), id).toBe(age + 1);
    // Ti, komu je teď 22, odešli do áčka a dorosty dostaly nový ročník.
    expect(await count(db, OVERAGE_IN_YOUTH)).toBe(0);
    expect(await count(db, SIXTEEN_IN_YOUTH)).toBeGreaterThan(0);
    expect(await count(db, "SELECT COUNT(*) AS n FROM messages WHERE body LIKE 'Do áčka jd%'")).toBe(2); // dva lidské kluby
  }, 300_000);

  it("hotový rollover se znovu nespustí: nikdo nezestárne podruhé, smlouvy se neodečtou", async () => {
    const { db } = await freshWorld();
    await db.prepare(
      `INSERT INTO sponsor_contracts (id, team_id, sponsor_name, sponsor_type, monthly_amount, seasons_total, seasons_remaining, status, category)
       VALUES ('contract-1', 'team-human-1', 'Pila Novák', 'pila', 3000, 3, 3, 'active', 'stadium')`,
    ).run();
    await rolloverAllLeagues(db, 1);
    const ages = await agesById(db);
    const remaining = async () => (await db.prepare("SELECT seasons_remaining AS n FROM sponsor_contracts WHERE id = 'contract-1'").first<{ n: number }>())?.n;
    expect(await remaining()).toBe(2);
    const elections = await count(db, "SELECT COUNT(*) AS n FROM village_history WHERE event_type = 'election_held'");
    expect(elections).toBe(2);

    await rolloverAllLeagues(db, 1);
    const r = await runRolloverStep(db, 1);
    expect(r.finished).toBe(true);
    expect(r.phase).toBeNull();

    expect(await agesById(db)).toEqual(ages);
    expect(await remaining()).toBe(2);
    expect(await count(db, "SELECT COUNT(*) AS n FROM village_history WHERE event_type = 'election_held'")).toBe(elections);
  }, 300_000);

  it("fáze, která se přerušila uprostřed a nesmí běžet dvakrát, se znovu nepustí a rollover jde dál", async () => {
    const { db } = await freshWorld();
    await db.prepare(
      `INSERT INTO sponsor_contracts (id, team_id, sponsor_name, sponsor_type, monthly_amount, seasons_total, seasons_remaining, status, category)
       VALUES ('contract-1', 'team-human-1', 'Pila Novák', 'pila', 3000, 3, 3, 'active', 'stadium')`,
    ).run();
    await beginRollover(db, 1);
    for (let i = 0; i < 50; i++) {
      if ((await readProgress(db, rolloverPhaseKey("season_close", 1)))?.status === "done") break;
      await runRolloverStep(db, 1);
    }
    // Předchozí invokace fázi sponzorů zabrala a spadla.
    await writeProgress(db, rolloverPhaseKey("sponsors", 1), "claimed");

    const interrupted = await runRolloverStep(db, 1);
    expect(interrupted.phase).toBe("sponsors");
    expect(interrupted.status).toBe("error");
    expect(interrupted.detail).toContain("podruhé ji nepouštím");
    expect((await db.prepare("SELECT seasons_remaining AS n FROM sponsor_contracts WHERE id = 'contract-1'").first<{ n: number }>())?.n).toBe(3);

    const rest = await runUntilFinished(db, 1);
    expect(rest.some((s) => s.phase === "sponsors")).toBe(false);
    expect(rest.filter((s) => s.status === "error")).toEqual([]);
  }, 300_000);

  it("rozběhnutý rollover dokončí konec sezóny, i když už je aktivní nová sezóna", async () => {
    const { db } = await freshWorld();
    await beginRollover(db, 1);
    for (let i = 0; i < 3; i++) await runRolloverStep(db, 1);
    expect(await count(db, "SELECT COUNT(*) AS n FROM seasons WHERE number = 2 AND status = 'active'")).toBe(1);

    let last = await runEndSeasonStep(db, undefined);
    expect(last.phase).toMatch(/^rollover:/);
    for (let i = 0; i < 200 && !last.allDone; i++) {
      expect(last.status).not.toBe("error");
      last = await runEndSeasonStep(db, undefined);
    }
    expect(last.allDone).toBe(true);
    expect(last.phase).toBe("rollover");
    expect(last.status).toBe("done");
    expect(await count(db, OVERAGE_IN_YOUTH)).toBe(0);
  }, 300_000);
});

describe("dodatečný dorostový cyklus, když stárnutí už proběhlo", () => {
  /**
   * Stav jako na produkci po 21. 10. 2026: nová sezóna běží, dorost zestárl (jsou v něm
   * dvaadvacetiletí a nikdo šestnáctiletý), ale žádný marker dorostu není.
   */
  async function agedWithoutMarkers(): Promise<World> {
    const world = await freshWorld();
    await world.db.prepare("INSERT INTO seasons (id, number, status) VALUES ('season-2', 2, 'active')").run();
    await world.db.prepare("UPDATE seasons SET status = 'finished' WHERE number = 1").run();
    await world.db.prepare("UPDATE players SET age = age + 1 WHERE team_id IN (SELECT id FROM teams WHERE team_type = 'u21')").run();
    return world;
  }

  async function adminRequest(env: Bindings, query: string) {
    const app = new Hono<{ Bindings: Bindings }>();
    app.route("/api", developmentRouter);
    const token = await createSession(env.SESSION_KV, "admin", "admin@example.test", null);
    const res = await app.request(`/api/admin/u21/cyklus${query}`, { method: "POST", headers: { Authorization: `Bearer ${token}` } }, env);
    return { status: res.status, body: await res.json() as Record<string, unknown> };
  }

  it("bez potvrzení stárnutí odmítne, s potvrzením pošle přerostlé do áčka a doplní ročník, nikoho nezestárne", async () => {
    const { db, env } = await agedWithoutMarkers();
    const ages = await agesById(db);
    expect(await count(db, OVERAGE_IN_YOUTH)).toBe(12); // tři jednadvacetiletí × čtyři dorosty, teď 22
    expect(await count(db, SIXTEEN_IN_YOUTH)).toBe(0);

    expect((await adminRequest(env, "")).status).toBe(400);
    expect((await adminRequest(env, "?season=1")).status).toBe(409);
    const refused = await adminRequest(env, "?season=2");
    expect(refused.status).toBe(409);
    expect(String(refused.body.error)).toContain("agingDone=1");
    expect(await count(db, OVERAGE_IN_YOUTH)).toBe(12);

    const first = await adminRequest(env, "?season=2&agingDone=1");
    expect(first.status).toBe(200);
    expect(first.body).toMatchObject({ ok: true, season: 2, done: true, teamsDone: 4, teamsTotal: 4, promoted: 12, released: 0 });
    expect(Number(first.body.arrived)).toBeGreaterThan(0);

    // Stárnutí i dospívání jsou zapsané jako hotové, rollover sezóny je už nikdy nepustí.
    for (const phase of ["u21_aging", "u21_maturation"] as const) {
      const key = rolloverPhaseKey(phase, 1);
      expect(key).toEqual({ leagueId: "__u21__", seasonNumber: 2, phase });
      expect(await readProgress(db, key)).toEqual({ status: "done", cursor: JSON.stringify({ recorded: "manual" }) });
    }
    expect((await readProgress(db, youthCycleKey(2)))?.status).toBe("done");

    for (const [id, age] of ages) expect(await ageOf(db, id), id).toBe(age);
    expect(await count(db, OVERAGE_IN_YOUTH)).toBe(0);
    expect(await count(db, SIXTEEN_IN_YOUTH)).toBe(Number(first.body.arrived));
    // Lidské kluby: všichni přerostlí do áčka (6), AI kluby taky, dokud mají místo (6).
    expect(await count(db, "SELECT COUNT(*) AS n FROM players WHERE team_id IN ('team-human-1', 'team-human-2') AND age = 22")).toBe(6);
    expect(await count(db, "SELECT COUNT(*) AS n FROM messages WHERE body LIKE 'Do áčka jd%'")).toBe(2);

    // Druhé volání už nic nezmění.
    const players = await count(db, "SELECT COUNT(*) AS n FROM players");
    const second = await adminRequest(env, "?season=2&agingDone=1");
    expect(second.body).toMatchObject({ ok: true, done: true, teamsDone: 4, promoted: 12 });
    expect(await count(db, "SELECT COUNT(*) AS n FROM players")).toBe(players);
    for (const [id, age] of ages) expect(await ageOf(db, id), id).toBe(age);
    expect(await count(db, "SELECT COUNT(*) AS n FROM messages WHERE body LIKE 'Do áčka jd%'")).toBe(2);
  }, 300_000);

  it("po dávkách: každé volání projde jen část dorostů, kurzor nic nezopakuje", async () => {
    const { db } = await agedWithoutMarkers();
    const r1 = await runYouthCycleChunk(db, 2, 1);
    expect(r1).toMatchObject({ done: false, teamsDone: 1, teamsTotal: 4, promoted: 3 });
    const r2 = await runYouthCycleChunk(db, 2, 2);
    expect(r2).toMatchObject({ done: false, teamsDone: 3, promoted: 9 });
    const r3 = await runYouthCycleChunk(db, 2, 2);
    expect(r3).toMatchObject({ done: true, teamsDone: 4, promoted: 12 });
    const players = await count(db, "SELECT COUNT(*) AS n FROM players");
    expect(await runYouthCycleChunk(db, 2, 2)).toMatchObject({ done: true, teamsDone: 4, promoted: 12 });
    expect(await count(db, "SELECT COUNT(*) AS n FROM players")).toBe(players);
  }, 300_000);
});

describe("konec sezóny čeká na finále poháru", () => {
  /**
   * Odehraná a dohraná sezóna 1 (jedno kolo stačí) a pohár sezóny 1. Finále S3 vychází
   * na sobotu po posledním kole ligy (so 30. 1., liga končí ve čt 28. 1.). Rollover před
   * ním by pohár nechal navždy rozehraný: maybeAdvanceCup i admin advance berou jen pohár
   * aktivní sezóny, takže by se finále nikdy neodehrálo a nevyplatilo.
   */
  async function playedSeasonWithCup(cupStatus: "active" | "finished"): Promise<World> {
    const world = await freshWorld();
    const { db } = world;
    await db.prepare(
      "INSERT INTO season_calendar (id, league_id, season_number, game_week, match_day, scheduled_at, status) VALUES ('cal-1', ?, 1, 1, 'thursday', '2027-01-28T17:00:00.000Z', 'simulated')",
    ).bind(LEAGUE).run();
    await db.prepare(
      "INSERT INTO matches (id, league_id, calendar_id, round, home_team_id, away_team_id, status, home_score, away_score) VALUES ('match-1', ?, 'cal-1', 1, 'team-human-1', 'team-human-2', 'simulated', 2, 1)",
    ).bind(LEAGUE).run();
    await db.prepare(
      "INSERT INTO cup_competitions (id, season_number, name, status, total_rounds, current_round) VALUES ('cup-1', 1, 'Český amatérský pohár', ?, 8, 8)",
    ).bind(cupStatus).run();
    await db.prepare(
      "INSERT INTO cup_matches (id, cup_id, round, bracket_pos, status, scheduled_at) VALUES ('cup-final', 'cup-1', 8, 0, ?, '2027-01-30T16:00:00.000Z')",
    ).bind(cupStatus === "active" ? "scheduled" : "simulated").run();
    return world;
  }

  it("neodehrané finále zastaví konec sezóny i s force a nic se nespustí", async () => {
    const { db } = await playedSeasonWithCup("active");
    for (const force of [false, true]) {
      const r = await runEndSeasonStep(db, undefined, { force });
      expect(r).toMatchObject({ allDone: true, ready: false, seasonNumber: 1 });
      expect(r.detail).toBe("Český amatérský pohár ještě běží (Finále, so 30. 1.), sezónu jde zakončit až po finále");
    }
    expect(await count(db, "SELECT COUNT(*) AS n FROM season_end_progress WHERE season_number = 1")).toBe(0);
  }, 300_000);

  it("po finále konec sezóny normálně začne", async () => {
    const { db } = await playedSeasonWithCup("finished");
    const r = await runEndSeasonStep(db, undefined);
    expect(r).toMatchObject({ allDone: false, ready: true, seasonNumber: 1, phase: "finalize", status: "done" });
  }, 300_000);
});
