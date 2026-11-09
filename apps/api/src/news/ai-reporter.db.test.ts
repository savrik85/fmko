/**
 * Článek o kole nad skutečnou D1 (Miniflare): prázdná odpověď modelu je chyba
 * (fronta pak zprávu zopakuje) a opakování neuloží druhý článek.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { Miniflare } from "miniflare";

const fx = vi.hoisted(() => ({ generateText: vi.fn(async (): Promise<string | null> => null) }));

vi.mock("../lib/ai-provider", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../lib/ai-provider")>()),
  generateText: fx.generateText,
}));
vi.mock("../stats/standings", () => ({ calculateStandings: vi.fn(async () => []) }));

import { EmptyReportError, generateAiRoundReport } from "./ai-reporter";

let miniflare: Miniflare;
let db: D1Database;

const ARTICLE = "Dvory přejely Lhotu\nDomácí dali tři góly a hosté jen koukali.\nPo zápase se šlo na pivo.";

beforeAll(async () => {
  miniflare = new Miniflare({
    modules: true,
    script: "export default { fetch() { return new Response('ok'); } }",
    d1Databases: ["DB"],
  });
  db = await miniflare.getD1Database("DB");
  for (const sql of [
    "CREATE TABLE leagues (id TEXT PRIMARY KEY, name TEXT, district TEXT)",
    "CREATE TABLE teams (id TEXT PRIMARY KEY, name TEXT, league_id TEXT, village_id TEXT)",
    "CREATE TABLE villages (id TEXT PRIMARY KEY, name TEXT, flavor_facts TEXT)",
    "CREATE TABLE season_calendar (id TEXT PRIMARY KEY, league_id TEXT, game_week INTEGER, scheduled_at TEXT)",
    `CREATE TABLE matches (id TEXT PRIMARY KEY, calendar_id TEXT, league_id TEXT, home_team_id TEXT, away_team_id TEXT, home_score INTEGER,
      away_score INTEGER, events TEXT, attendance INTEGER, stadium_name TEXT, weather TEXT, pitch_condition INTEGER, status TEXT)`,
    "CREATE TABLE match_player_stats (match_id TEXT, player_id TEXT, team_id TEXT, goals INTEGER, assists INTEGER, yellow_cards INTEGER, red_cards INTEGER, rating REAL)",
    "CREATE TABLE players (id TEXT PRIMARY KEY, first_name TEXT, last_name TEXT, team_id TEXT, is_celebrity INTEGER, personality TEXT)",
    "CREATE TABLE departed_players (id TEXT PRIMARY KEY, first_name TEXT, last_name TEXT)",
    `CREATE TABLE news (id TEXT PRIMARY KEY, league_id TEXT NOT NULL, team_id TEXT, type TEXT NOT NULL, headline TEXT NOT NULL, body TEXT NOT NULL,
      game_week INTEGER, created_at TEXT NOT NULL, journalist_id TEXT)`,
  ]) await db.prepare(sql).run();
  await db.batch([
    db.prepare("INSERT INTO leagues VALUES ('l1', 'Okresní přebor', 'Prachatice')"),
    db.prepare("INSERT INTO teams VALUES ('t1', 'TJ Dvory', 'l1', NULL), ('t2', 'SK Lhota', 'l1', NULL)"),
    db.prepare("INSERT INTO season_calendar VALUES ('cal5', 'l1', 5, '2026-11-08T17:00:00Z')"),
    db.prepare(`INSERT INTO matches (id, calendar_id, league_id, home_team_id, away_team_id, home_score, away_score, events, status)
      VALUES ('m1', 'cal5', 'l1', 't1', 't2', 3, 0, '[]', 'simulated')`),
  ]);
}, 30_000);

afterAll(async () => { await miniflare.dispose(); });

beforeEach(async () => {
  fx.generateText.mockReset();
  await db.prepare("DELETE FROM news").run();
});

const run = () => generateAiRoundReport(db, "key", "l1", "cal5", 5, []);
const reports = async () =>
  (await db.prepare("SELECT headline, body FROM news WHERE type = 'ai_report'").all<{ headline: string; body: string }>()).results;

describe("generateAiRoundReport", () => {
  it("prázdná odpověď modelu vyhodí chybu a nic neuloží", async () => {
    fx.generateText.mockResolvedValueOnce(null);
    await expect(run()).rejects.toBeInstanceOf(EmptyReportError);
    expect(await reports()).toHaveLength(0);
  });

  it("odpověď bez těla (jen titulek) je taky chyba", async () => {
    fx.generateText.mockResolvedValueOnce("Jen titulek");
    await expect(run()).rejects.toBeInstanceOf(EmptyReportError);
    expect(await reports()).toHaveLength(0);
  });

  it("opakování po chybě uloží článek jednou a další běh už model nevolá", async () => {
    fx.generateText.mockResolvedValueOnce(null).mockResolvedValue(ARTICLE);
    await expect(run()).rejects.toThrow();
    await run();
    expect(await reports()).toEqual([{ headline: "Dvory přejely Lhotu", body: "Domácí dali tři góly a hosté jen koukali.\nPo zápase se šlo na pivo." }]);
    const calls = fx.generateText.mock.calls.length;
    await run();
    expect(fx.generateText.mock.calls.length).toBe(calls);
    expect(await reports()).toHaveLength(1);
  });

  it("dva souběžné běhy uloží jeden článek", async () => {
    fx.generateText.mockResolvedValue(ARTICLE);
    await Promise.all([run(), run(), run()]);
    expect(await reports()).toHaveLength(1);
  });

  it("článek ke stejnému číslu kola z minulé sezóny nový nezablokuje", async () => {
    await db.prepare("INSERT INTO news (id, league_id, type, headline, body, game_week, created_at) VALUES ('old', 'l1', 'ai_report', 'Loni', 'Loňské kolo', 5, '2026-07-12T18:00:00Z')").run();
    fx.generateText.mockResolvedValue(ARTICLE);
    await run();
    expect(await reports()).toHaveLength(2);
  });
});
