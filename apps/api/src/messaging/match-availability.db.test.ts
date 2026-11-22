/**
 * Co hráč ví o zápasech, na které nejde nebo nesmí, nad skutečnou D1 (Miniflare):
 * přátelák jako příští zápas, stopka za karty, skutečný důvod omluvenky a staré absence
 * bez id hráče (před 1. 11. 2026).
 */
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { Miniflare } from "miniflare";

vi.mock("../stats/standings", () => ({ calculateStandings: vi.fn(async () => []) }));
// Los omluvenek potřebuje půl databáze (počasí, dodávka, incidenty); tady jde jen o to, co z něj prompt převezme.
vi.mock("../events/match-absences", async (orig) => ({
  ...(await orig<typeof import("../events/match-absences")>()),
  getAbsentPlayersMap: vi.fn(async (_db: unknown, _teamId: string, ctx: { matchKey: string }) => ctx.matchKey === "fr-today"
    ? new Map([["sedlak", { reason: "Kocovina", category: "hangover", emoji: "🍺", smsText: "Mám angínu, ležím" }]])
    : new Map()),
}));

import { loadLastMatchContext, loadPlayerSnapshot, loadTeamContext } from "./ai-player-spawn";
import { buildSystemPrompt } from "./ai-player-chat";
import { pragueDay } from "./next-match";

let miniflare: Miniflare;
let db: D1Database;
const today = pragueDay(new Date());
const yesterday = new Date(Date.parse(`${today}T12:00:00Z`) - 86400000).toISOString().slice(0, 10);

beforeAll(async () => {
  miniflare = new Miniflare({
    modules: true,
    script: "export default { fetch() { return new Response('ok'); } }",
    d1Databases: ["DB"],
  });
  db = await miniflare.getD1Database("DB");
  for (const sql of [
    "CREATE TABLE villages (id TEXT PRIMARY KEY, name TEXT, size TEXT, district TEXT)",
    "CREATE TABLE teams (id TEXT PRIMARY KEY, name TEXT, village_id TEXT, league_id TEXT, team_type TEXT, parent_team_id TEXT, game_date TEXT)",
    "CREATE TABLE managers (team_id TEXT, name TEXT)",
    "CREATE TABLE season_calendar (id TEXT PRIMARY KEY, scheduled_at TEXT, status TEXT)",
    `CREATE TABLE matches (id TEXT PRIMARY KEY, league_id TEXT, calendar_id TEXT, home_team_id TEXT, away_team_id TEXT, home_score INTEGER,
      away_score INTEGER, status TEXT, simulated_at TEXT, home_lineup_data TEXT, away_lineup_data TEXT, absences TEXT, created_at TEXT)`,
    "CREATE TABLE match_player_stats (match_id TEXT, player_id TEXT, minutes_played INTEGER, goals INTEGER, assists INTEGER, yellow_cards INTEGER, red_cards INTEGER, rating REAL)",
    "CREATE TABLE players (id TEXT PRIMARY KEY, team_id TEXT, first_name TEXT, last_name TEXT, status TEXT, overall_rating INTEGER, suspended_matches INTEGER DEFAULT 0)",
    "CREATE TABLE challenges (id TEXT PRIMARY KEY, match_id TEXT, venue TEXT, neutral_village_id TEXT)",
    "CREATE TABLE club_incident_absences (id TEXT PRIMARY KEY, team_id TEXT, player_id TEXT, kind TEXT, zapasu_zbyva INTEGER)",
    "CREATE TABLE conversations (id TEXT PRIMARY KEY, team_id TEXT, type TEXT, title TEXT)",
    "CREATE TABLE messages (id TEXT PRIMARY KEY, conversation_id TEXT, sender_type TEXT, sender_id TEXT, body TEXT, metadata TEXT, sent_at TEXT)",
  ]) await db.prepare(sql).run();
  // Spůle 29. 10.: absence ještě bez playerId, jen se jménem (zápis před commitem 4efa0340).
  const oldAbsences = JSON.stringify([
    { name: "Daniel Nárovec", reason: "Kocovina", smsText: "Strejda slavil padesát, nejde jít domů brzo", teamId: "spule" },
    { name: "Jan Novák", reason: "Práce", smsText: "Mám noční", teamId: "spule" },
    { name: "Petr Cizí", reason: "Osobní", smsText: "Jedu na chatu", teamId: "volary" },
  ]);
  const lineup = JSON.stringify({ starters: [{ id: "hrac" }], subs: [] });
  await db.batch([
    db.prepare("INSERT INTO villages VALUES ('v-spule', 'Spůle', 'village', 'Prachatice'), ('v-lhota', 'Lhota', 'village', 'Prachatice')"),
    db.prepare(`INSERT INTO teams VALUES
      ('spule', 'SK Budvar Spůle', 'v-spule', 'l1', 'main', NULL, '${today}T10:00:00.000Z'),
      ('volary', 'FK Madeta Volary', NULL, 'l1', 'main', NULL, '${today}T10:00:00.000Z'),
      ('ckyne', 'FK Čkyně', NULL, 'l1', 'main', NULL, '${today}T10:00:00.000Z')`),
    db.prepare(`INSERT INTO players (id, team_id, first_name, last_name, status, overall_rating, suspended_matches) VALUES
      ('narovec', 'spule', 'Daniel', 'Nárovec', 'active', 50, 0),
      ('novak1', 'spule', 'Jan', 'Novák', 'active', 50, 0),
      ('novak2', 'spule', 'Jan', 'Novák', 'active', 48, 0),
      ('hrac', 'spule', 'Karel', 'Hrající', 'active', 60, 0),
      ('stopka', 'spule', 'Tomáš', 'Stopkař', 'active', 55, 2),
      ('vyrazeny', 'spule', 'Radek', 'Turek', 'active', 52, 0),
      ('sedlak', 'spule', 'Milan', 'Sedlák', 'active', 51, 0)`),
    db.prepare("INSERT INTO club_incident_absences VALUES ('inc-1-abs-3', 'spule', 'vyrazeny', 'vyrazen', 1)"),
    db.prepare("INSERT INTO matches VALUES ('liga', 'l1', NULL, 'spule', 'volary', 4, 4, 'simulated', '2026-10-29T17:01:46Z', ?, NULL, ?, '2026-10-29')")
      .bind(lineup, oldAbsences),
    // Přátelák dnes doma (domluvený výzvou), včerejší neodehraný se nepočítá.
    db.prepare(`INSERT INTO matches VALUES ('fr-today', NULL, NULL, 'spule', 'ckyne', NULL, NULL, 'lineups_open', NULL, NULL, NULL, NULL, '${today}T16:00:00.000Z')`),
    db.prepare(`INSERT INTO matches VALUES ('fr-old', NULL, NULL, 'volary', 'spule', NULL, NULL, 'scheduled', NULL, NULL, NULL, NULL, '${yesterday}T16:00:00.000Z')`),
    db.prepare("INSERT INTO challenges VALUES ('ch-1', 'fr-today', 'challenger', NULL)"),
  ]);
}, 30_000);

afterAll(async () => { await miniflare.dispose(); });

const row = (id: string, first: string, last: string, personality = "{}") => ({
  id, first_name: first, last_name: last, age: 26, position: "MID", personality, life_context: "{}", coach_relationship: 50,
});

describe("přátelák jako příští zápas", () => {
  it("dnešní přátelák zná prompt ve stejném tvaru jako ligu, v 18:00 v Praze", async () => {
    const team = await loadTeamContext(db, "spule");
    expect(team.nextMatch).toBeUndefined();
    expect(team.nextFriendly).toMatch(/^DNES \(.+\) v 18:00 doma s FK Čkyně$/);
    const prompt = buildSystemPrompt(loadPlayerSnapshot(row("hrac", "Karel", "Hrající")), team);
    expect(prompt).toContain("- Domluvený přátelák: DNES");
    expect(prompt).toContain("se hraje i pohár a přáteláky");
  });

  it("na neutrální půdě „na hřišti v obci“, starý neodehraný přátelák se nepočítá", async () => {
    await db.prepare("UPDATE challenges SET venue = 'neutral', neutral_village_id = 'v-lhota'").run();
    expect((await loadTeamContext(db, "spule")).nextFriendly).toMatch(/v 18:00 na hřišti v obci Lhota s FK Čkyně$/);
    await db.prepare("UPDATE challenges SET venue = 'challenger', neutral_village_id = NULL").run();
    // Volary mají jen včerejší neodehraný přátelák.
    expect((await loadTeamContext(db, "volary")).nextFriendly).toBeUndefined();
  });

  it("omluvenka na dnešní přátelák (vidí ji sestava, do kabiny nechodí) i se skutečným důvodem", async () => {
    const ctx = await loadLastMatchContext(db, "spule");
    expect(ctx.upcomingAbsences?.get("sedlak")).toEqual({
      reason: "Kocovina", text: "Mám angínu, ležím", when: "dnes", opponent: "FK Čkyně", friendly: true,
    });
    const prompt = buildSystemPrompt(loadPlayerSnapshot(row("sedlak", "Milan", "Sedlák"), ctx), await loadTeamContext(db, "spule"));
    expect(prompt).toContain("Na dnešní přátelák proti FK Čkyně NEPŘIJDEŠ. Trenérovi ses omluvil: „Mám angínu, ležím“.");
    expect(prompt).toContain("Pravda je, že jsi měl kocovinu");
  });
});

describe("stopka a vyřazení", () => {
  it("hráč se stopkou za karty ví, kolik zápasů nesmí hrát", async () => {
    const ctx = await loadLastMatchContext(db, "spule");
    const p = loadPlayerSnapshot(row("stopka", "Tomáš", "Stopkař"), ctx);
    expect(p.suspension).toEqual({ cards: 2, coach: 0 });
    expect(buildSystemPrompt(p, { teamName: "SK Budvar Spůle" })).toContain("Máš stopku za karty: ještě 2 zápasy hrát nesmíš.");
  });

  it("vyřazení za trest od trenéra, hráč bez stopky nic", async () => {
    const ctx = await loadLastMatchContext(db, "spule");
    const p = loadPlayerSnapshot(row("vyrazeny", "Radek", "Turek"), ctx);
    expect(p.suspension).toEqual({ cards: 0, coach: 1 });
    expect(buildSystemPrompt(p, { teamName: "SK Budvar Spůle" })).toContain("Trenér tě za trest vyřadil: příští zápas hrát nesmíš.");
    expect(loadPlayerSnapshot(row("hrac", "Karel", "Hrající"), ctx).suspension).toBeUndefined();
  });
});

describe("staré absence bez id hráče", () => {
  it("omluvený se dohledá podle jména v kádru: neříká, že ho trenér nenominoval", async () => {
    const ctx = await loadLastMatchContext(db, "spule");
    const p = loadPlayerSnapshot(row("narovec", "Daniel", "Nárovec", JSON.stringify({ discipline: 30 })), ctx);
    expect(p.lastMatchSquad).toBe("absent");
    expect(p.lastMatchAbsence).toEqual({ reason: "Kocovina", text: "Strejda slavil padesát, nejde jít domů brzo" });
    const prompt = buildSystemPrompt(p, { teamName: "SK Budvar Spůle", lastMatchResult: "remíza 4:4 doma s FK Madeta Volary" });
    expect(prompt).toContain("tvoje omluvenka zněla: „Strejda slavil padesát, nejde jít domů brzo“. Pravda je, že jsi měl kocovinu");
    expect(prompt).toContain("Trenérovi to nepřiznáš a držíš se své výmluvy");
    expect(prompt).toContain("To, že jsi na zápas nepřišel, nikdy nepopírej.");
    expect(prompt).not.toContain("do nominace nedal");
  });

  it("dva hráči stejného jména se nehádají, absence soupeře se nepřipíše", async () => {
    const ctx = await loadLastMatchContext(db, "spule");
    expect(ctx.absences?.has("novak1")).toBe(false);
    expect(ctx.absences?.has("novak2")).toBe(false);
    expect([...(ctx.absences?.keys() ?? [])]).toEqual(["narovec"]);
  });
});
