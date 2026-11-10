/**
 * Kontext klubu v chatu s hráčem nad skutečnou D1 (Miniflare): kluk z U21 a hráč na
 * hostování dostanou zápasy, tabulku a spoluhráče týmu, za který právě hrají.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { Miniflare } from "miniflare";

vi.mock("../stats/standings", () => ({
  calculateStandings: vi.fn(async (_db: unknown, leagueId: string) => leagueId === "l-senior"
    ? [{ teamId: "rival", pos: 1 }, { teamId: "club", pos: 2 }, { teamId: "host", pos: 7 }]
    : [{ teamId: "club-u21", pos: 5 }]),
}));

import { loadTeamContext } from "./ai-player-spawn";
import { buildSystemPrompt, playingForFact } from "./ai-player-chat";
import type { PlayerSnapshot } from "./ai-player-scenarios";

let miniflare: Miniflare;
let db: D1Database;

beforeAll(async () => {
  miniflare = new Miniflare({
    modules: true,
    script: "export default { fetch() { return new Response('ok'); } }",
    d1Databases: ["DB"],
  });
  db = await miniflare.getD1Database("DB");
  for (const sql of [
    "CREATE TABLE villages (id TEXT PRIMARY KEY, name TEXT, size TEXT, district TEXT)",
    "CREATE TABLE teams (id TEXT PRIMARY KEY, name TEXT, village_id TEXT, league_id TEXT, team_type TEXT, parent_team_id TEXT)",
    "CREATE TABLE managers (team_id TEXT, name TEXT)",
    "CREATE TABLE season_calendar (id TEXT PRIMARY KEY, scheduled_at TEXT)",
    "CREATE TABLE matches (id TEXT PRIMARY KEY, calendar_id TEXT, home_team_id TEXT, away_team_id TEXT, home_score INTEGER, away_score INTEGER, status TEXT, simulated_at TEXT)",
    "CREATE TABLE players (id TEXT PRIMARY KEY, team_id TEXT, first_name TEXT, last_name TEXT, status TEXT, overall_rating INTEGER)",
  ]) await db.prepare(sql).run();
  const future = new Date(Date.now() + 2 * 86400000).toISOString();
  const sooner = new Date(Date.now() + 86400000).toISOString();
  await db.batch([
    db.prepare("INSERT INTO villages VALUES ('v1', 'Dvory', 'village', 'Prachatice')"),
    db.prepare(`INSERT INTO teams VALUES
      ('club', 'TJ Dvory', 'v1', 'l-senior', 'main', NULL),
      ('club-u21', 'TJ Dvory U21', 'v1', 'l-u21', 'u21', 'club'),
      ('rival', 'SK Lhota', NULL, 'l-senior', 'main', NULL),
      ('rival-u21', 'SK Lhota U21', NULL, 'l-u21', 'u21', 'rival'),
      ('host', 'FK Vimperk', NULL, 'l-senior', 'main', NULL)`),
    db.prepare("INSERT INTO managers VALUES ('club', 'Zdeněk J.'), ('host', 'Karel V.')"),
    db.prepare("INSERT INTO season_calendar VALUES ('cal-a', ?), ('cal-u', ?), ('cal-h', ?)").bind(future, future, sooner),
    db.prepare(`INSERT INTO matches VALUES
      ('m-a', NULL, 'club', 'rival', 3, 0, 'simulated', '2026-11-08T17:00:00Z'),
      ('m-u', NULL, 'rival-u21', 'club-u21', 4, 1, 'simulated', '2026-11-09T17:00:00Z'),
      ('m-h', NULL, 'host', 'rival', 2, 2, 'simulated', '2026-11-08T17:00:00Z'),
      ('n-a', 'cal-a', 'club', 'host', NULL, NULL, 'scheduled', NULL),
      ('n-u', 'cal-u', 'club-u21', 'rival-u21', NULL, NULL, 'scheduled', NULL),
      ('n-h', 'cal-h', 'rival', 'host', NULL, NULL, 'scheduled', NULL)`),
    db.prepare(`INSERT INTO players VALUES
      ('a1', 'club', 'Adam', 'Áčkový', 'active', 60),
      ('u1', 'club-u21', 'Uršul', 'Dorostenec', 'active', 40),
      ('h1', 'host', 'Hugo', 'Hostitel', 'active', 55)`),
  ]);
}, 30_000);

afterAll(async () => { await miniflare.dispose(); });

const player: PlayerSnapshot = {
  id: "u1", firstName: "Uršul", lastName: "Dorostenec", age: 18, position: "MID",
  morale: 60, condition: 70, coachRelationship: 55,
  discipline: 50, patriotism: 50, alcohol: 20, temper: 50,
  leadership: 50, workRate: 50, aggression: 50,
  recentMinutes: 90, recentRatingAvg: 6.5, isCelebrity: false, occupation: "Student",
};

describe("loadTeamContext podle týmu hráče", () => {
  it("hráč áčka: fakta áčka jako dřív, i když se tým hráče nepředá", async () => {
    for (const ctx of [await loadTeamContext(db, "club"), await loadTeamContext(db, "club", "club")]) {
      expect(ctx).toMatchObject({
        teamName: "TJ Dvory", managerName: "Zdeněk J.", villageName: "Dvory", leaguePosition: 2,
        lastMatchResult: "výhra 3:0 doma s SK Lhota", squadNames: ["Adam Áčkový"],
      });
      expect(ctx.playingFor).toBeUndefined();
      expect(ctx.nextMatch).toContain("FK Vimperk");
    }
  });

  it("kluk z U21: zápasy, tabulka a spoluhráči dorostu, trenér a klub zůstávají", async () => {
    const ctx = await loadTeamContext(db, "club", "club-u21");
    expect(ctx).toMatchObject({
      teamName: "TJ Dvory", managerName: "Zdeněk J.", villageName: "Dvory",
      playingFor: { kind: "u21", teamName: "TJ Dvory U21" },
      lastMatchResult: "prohra 1:4 venku s SK Lhota U21", leaguePosition: 5, squadNames: ["Uršul Dorostenec"],
    });
    expect(ctx.nextMatch).toContain("SK Lhota U21");
    expect(ctx.nextMatch).not.toContain("FK Vimperk");
  });

  it("hráč na hostování: fakta týmu, kde hostuje, píše si s trenérem mateřského klubu", async () => {
    const ctx = await loadTeamContext(db, "club", "host");
    expect(ctx).toMatchObject({
      teamName: "TJ Dvory", managerName: "Zdeněk J.",
      playingFor: { kind: "loan", teamName: "FK Vimperk" },
      lastMatchResult: "remíza 2:2 doma s SK Lhota", leaguePosition: 7, squadNames: ["Hugo Hostitel"],
    });
    expect(ctx.nextMatch).toContain("SK Lhota");
  });

  it("neznámý tým hráče nic nerozbije, zůstane kontext klubu", async () => {
    const ctx = await loadTeamContext(db, "club", "missing");
    expect(ctx.playingFor).toBeUndefined();
    expect(ctx.lastMatchResult).toBe("výhra 3:0 doma s SK Lhota");
  });
});

describe("prompt říká, za koho hráč hraje", () => {
  it("dorostenec: řádek o dorostu a žádný výsledek áčka", async () => {
    const ctx = await loadTeamContext(db, "club", "club-u21");
    const prompt = buildSystemPrompt(player, ctx);
    expect(prompt).toContain("dorostu (U21) amatérského klubu TJ Dvory");
    expect(prompt).toContain("Hraješ za dorost (TJ Dvory U21), ne za áčko.");
    expect(prompt).toContain("prohra 1:4 venku s SK Lhota U21");
    expect(prompt).toContain("Tým, za který hraješ (TJ Dvory U21), je v tabulce na 5. místě.");
    expect(prompt).not.toContain("výhra 3:0");
    expect(prompt).not.toContain("Adam Áčkový");
  });

  it("hostující: řádek o hostování a fakta hostitele", async () => {
    const ctx = await loadTeamContext(db, "club", "host");
    const prompt = buildSystemPrompt({ ...player, age: 24 }, ctx);
    expect(prompt).toContain("teď na hostování v klubu FK Vimperk");
    expect(prompt).toContain("Jsi na hostování v klubu FK Vimperk. Patříš dál klubu TJ Dvory");
    expect(prompt).toContain("remíza 2:2 doma s SK Lhota");
    expect(prompt).not.toContain("výhra 3:0");
  });

  it("hráč áčka žádný řádek navíc nedostane", async () => {
    const ctx = await loadTeamContext(db, "club", "club");
    expect(playingForFact(ctx)).toBe("");
    const prompt = buildSystemPrompt({ ...player, age: 27 }, ctx);
    expect(prompt).toContain("amatérského týmu TJ Dvory");
    expect(prompt).toContain("- Tým je v tabulce na 2. místě.");
    expect(prompt).not.toContain("hostování");
    expect(prompt).not.toContain("dorost");
  });
});
