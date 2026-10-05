import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { Miniflare } from "miniflare";

const odpovedi: string[] = [];
vi.mock("../lib/ai-provider", () => ({
  aiContextFromEnv: vi.fn(async () => ({ provider: "gemini" })),
  generateText: vi.fn(async () => odpovedi.shift() ?? null),
}));

import { prepoctiTransparent } from "./fan-banner";
import type { FanGroupRow } from "./fan-group-generator";

let miniflare: Miniflare;
let db: D1Database;
const env = {} as never;

const kotel: FanGroupRow = {
  id: "g1", team_id: "t1", kind: "kotel", name: "Kotel", share: 0.3, size: 40, mood: 60, heat: 20,
  passion: 70, aggression: 30, loyalty: 60, spending: 40, noise: 50, sector: "sever",
  closed_matches: 0, ticket_discount: 0, core: 10, leader_id: null,
};

beforeAll(async () => {
  miniflare = new Miniflare({ modules: true, script: "export default { fetch() { return new Response('ok'); } }", d1Databases: ["DB"] });
  db = await miniflare.getD1Database("DB");
  for (const sql of [
    "CREATE TABLE villages (id TEXT PRIMARY KEY, name TEXT, district TEXT)",
    "CREATE TABLE teams (id TEXT PRIMARY KEY, name TEXT, village_id TEXT, tactic TEXT, league_id TEXT)",
    "CREATE TABLE stadiums (team_id TEXT PRIMARY KEY, ultras_text TEXT, ultras_text_duvod TEXT, ultras_stand INTEGER)",
    "CREATE TABLE fan_campaigns (team_id TEXT, kind TEXT, target_name TEXT, status TEXT)",
    "CREATE TABLE fan_group_players (group_id TEXT, player_id TEXT, stance TEXT)",
    "CREATE TABLE players (id TEXT PRIMARY KEY, first_name TEXT, last_name TEXT, status TEXT)",
    "CREATE TABLE managers (team_id TEXT PRIMARY KEY, name TEXT)",
    "CREATE TABLE fan_rivalries (id TEXT, team_a TEXT, team_b TEXT, heat INTEGER, fights INTEGER, incidents INTEGER, last_game_date TEXT, history TEXT)",
    "CREATE TABLE matches (home_team_id TEXT, away_team_id TEXT, home_score INTEGER, away_score INTEGER, simulated_at TEXT, created_at TEXT)",
  ]) await db.exec(sql);
  await db.batch([
    db.prepare("INSERT INTO villages VALUES ('v1', 'Čkyně', 'Prachatice'), ('v2', 'Vimperk', 'Prachatice')"),
    db.prepare("INSERT INTO teams VALUES ('t1', 'FK Forpsi Čkyně', 'v1', NULL, 'l1'), ('t2', 'FK Engel Vimperk', 'v2', NULL, 'l1')"),
    db.prepare("INSERT INTO stadiums VALUES ('t1', NULL, NULL, 1), ('t2', 'TADY JSME DOMA', 'x', 1)"),
  ]);
});

afterAll(async () => { await miniflare.dispose(); });
beforeEach(async () => {
  odpovedi.length = 0;
  await db.prepare("UPDATE stadiums SET ultras_text = NULL, ultras_text_duvod = NULL WHERE team_id = 't1'").run();
});

const plachta = async () => (await db.prepare("SELECT ultras_text FROM stadiums WHERE team_id = 't1'").first<{ ultras_text: string }>())!.ultras_text;

describe("plachta od modelu", () => {
  it("schválené heslo visí velkými písmeny", async () => {
    odpovedi.push("Čkyně, kde i krávy fandí", "ANO");
    await prepoctiTransparent(db, "t1", [kotel], "2026-10-01", env);
    expect(await plachta()).toBe("ČKYNĚ, KDE I KRÁVY FANDÍ");
  });

  it("patvar zahodí kód, nesmysl korektor; pak visí katalog", async () => {
    odpovedi.push("Čkyně je naše krvou, srdcem, duší", "Čkyně domov věrnost", "NE");
    await prepoctiTransparent(db, "t1", [kotel], "2026-10-01", env);
    const t = await plachta();
    expect(t).not.toMatch(/krvou|věrnost/i);
    expect(t.length).toBeGreaterThan(0);
  });

  it("co v lize visí, se nezopakuje ani od modelu, ani z katalogu", async () => {
    odpovedi.push("Tady jsme doma");
    await prepoctiTransparent(db, "t1", [kotel], "2026-10-01", env);
    expect(await plachta()).not.toBe("TADY JSME DOMA");
  });

  it("platná plachta od modelu se další den nemění", async () => {
    odpovedi.push("Čkyně, kde i krávy fandí", "ANO");
    await prepoctiTransparent(db, "t1", [kotel], "2026-10-01", env);
    odpovedi.push("Něco úplně jinýho", "ANO");
    expect(await prepoctiTransparent(db, "t1", [kotel], "2026-10-02", env)).toBeNull();
    expect(await plachta()).toBe("ČKYNĚ, KDE I KRÁVY FANDÍ");
  });
});
