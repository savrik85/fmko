/**
 * Chladnutí napětí mezi trenéry po ligovém kole, nad skutečnou D1 (Miniflare).
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { Miniflare } from "miniflare";
import { applyRelationEvent, coolHeatAfterLeagueRound } from "./manager-relations";

let miniflare: Miniflare;
let db: D1Database;

const hoursAgo = (h: number) => new Date(Date.now() - h * 3600_000).toISOString().replace(/\.\d{3}Z$/, "Z");

beforeAll(async () => {
  miniflare = new Miniflare({
    modules: true,
    script: "export default { fetch() { return new Response('ok'); } }",
    d1Databases: ["DB"],
  });
  db = await miniflare.getD1Database("DB");
  await db.exec("CREATE TABLE manager_relations (team_a_id TEXT NOT NULL, team_b_id TEXT NOT NULL, respect INTEGER NOT NULL DEFAULT 0, heat INTEGER NOT NULL DEFAULT 0, history TEXT NOT NULL DEFAULT '[]', updated_at TEXT, PRIMARY KEY (team_a_id, team_b_id))");
  await db.exec("CREATE TABLE matches (id TEXT PRIMARY KEY, league_id TEXT, home_team_id TEXT, away_team_id TEXT, status TEXT, simulated_at TEXT)");
}, 30_000);

afterAll(async () => { await miniflare.dispose(); });

beforeEach(async () => {
  await db.batch([
    db.prepare("DELETE FROM manager_relations"),
    db.prepare("DELETE FROM matches"),
    db.prepare(`INSERT INTO manager_relations (team_a_id, team_b_id, respect, heat) VALUES
      ('a', 'b', 10, 100), ('a', 'c', 0, 1), ('c', 'd', -5, 60), ('e', 'f', 0, 40), ('a', 'z', 0, 0)`),
  ]);
});

const heats = async () => Object.fromEntries(
  (await db.prepare("SELECT team_a_id || '-' || team_b_id AS k, heat FROM manager_relations").all<{ k: string; heat: number }>())
    .results.map((r) => [r.k, r.heat]),
);
const addMatch = (id: string, home: string, away: string, opts: { league?: string | null; status?: string; hours?: number } = {}) =>
  db.prepare("INSERT INTO matches (id, league_id, home_team_id, away_team_id, status, simulated_at) VALUES (?, ?, ?, ?, ?, ?)")
    .bind(id, opts.league === undefined ? "l1" : opts.league, home, away, opts.status ?? "simulated", hoursAgo(opts.hours ?? 10)).run();

describe("coolHeatAfterLeagueRound", () => {
  it("po odehraném kole ubere bod dvojicím, jejichž klub hrál, a respekt nechá", async () => {
    await addMatch("m1", "a", "b");
    await addMatch("m2", "c", "x");
    expect(await coolHeatAfterLeagueRound(db)).toBe(3);
    // a-b hráli spolu: bod, ne dva. e-f nehráli. a-z je na nule a pod ni nejde.
    expect(await heats()).toEqual({ "a-b": 99, "a-c": 0, "c-d": 59, "e-f": 40, "a-z": 0 });
    const respect = await db.prepare("SELECT respect FROM manager_relations WHERE team_a_id = 'a' AND team_b_id = 'b'").first<{ respect: number }>();
    expect(respect?.respect).toBe(10);
  });

  it("bez ligového kola se nic nehýbe: přátelák, neodehraný a starý zápas se nepočítají", async () => {
    await addMatch("m1", "a", "b", { league: null });
    await addMatch("m2", "c", "d", { status: "scheduled" });
    await addMatch("m3", "e", "f", { hours: 30 });
    expect(await coolHeatAfterLeagueRound(db)).toBe(0);
    expect(await heats()).toMatchObject({ "a-b": 100, "c-d": 60, "e-f": 40 });
  });
});

describe("záporný posun napětí", () => {
  it("smířlivé gesto ubere napětí a pod nulu nejde", async () => {
    await applyRelationEvent(db, "c", "d", { respect: 4, heat: -2, icon: "🤝", text: "po zápase napětí zchladil" });
    await applyRelationEvent(db, "a", "c", { heat: -2, icon: "🤝", text: "po zápase napětí zchladil" });
    expect(await heats()).toMatchObject({ "c-d": 58, "a-c": 0 });
  });
});
