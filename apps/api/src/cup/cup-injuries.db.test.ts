import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { Miniflare } from "miniflare";
import { createRng } from "../generators/rng";
import type { MatchEvent } from "../engine/types";
import { cupInjuryStatements } from "./cup";

/**
 * Zranění z poháru se neukládala: `injuries.match_id` má cizí klíč na ligové `matches(id)`,
 * pohár zapisoval id z `cup_matches`, cizí klíč shodil celou dávku a skončilo to jen
 * ve varování v logu. Na produ 255 odehraných pohárových zápasů a 0 zranění.
 * Turnaj má stejnou opravu (tournament/match.ts): zranění se zapíše bez odkazu na zápas.
 */

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
    "CREATE TABLE teams (id TEXT PRIMARY KEY)",
    "CREATE TABLE players (id TEXT PRIMARY KEY, team_id TEXT REFERENCES teams(id))",
    "CREATE TABLE matches (id TEXT PRIMARY KEY)",
    "CREATE TABLE cup_matches (id TEXT PRIMARY KEY)",
    // Jako migrace 0015 a 0173: match_id míří na ligové zápasy.
    `CREATE TABLE injuries (id TEXT PRIMARY KEY, player_id TEXT NOT NULL REFERENCES players(id),
      team_id TEXT NOT NULL REFERENCES teams(id), type TEXT NOT NULL, description TEXT NOT NULL,
      severity TEXT NOT NULL, days_remaining INTEGER NOT NULL, days_total INTEGER NOT NULL,
      match_id TEXT REFERENCES matches(id), created_at TEXT NOT NULL DEFAULT (datetime('now')))`,
    "INSERT INTO teams VALUES ('home'), ('away')",
    "INSERT INTO players VALUES ('p-home', 'home'), ('p-away', 'away')",
    "INSERT INTO cup_matches VALUES ('cup-1')",
  ]) {
    await db.prepare(sql).run();
  }
});

afterAll(async () => {
  await miniflare.dispose();
});

beforeEach(async () => {
  await db.exec("DELETE FROM injuries");
});

function injury(playerId: number, teamId: number): MatchEvent {
  return { minute: 30, type: "injury", playerId, playerName: "Jan Hráč", teamId, description: "zranění", detail: "natažený sval" };
}

const home = { teamId: "home", idMap: new Map([[1, "p-home"]]), players: [{ id: 1, age: 24, injuryProneness: 50 }] };
const away = { teamId: "away", idMap: new Map([[101, "p-away"]]), players: [{ id: 101, age: 31, injuryProneness: 80 }] };

describe("zranění z pohárového zápasu", () => {
  it("id pohárového zápasu do injuries.match_id nepatří, cizí klíč zápis odmítne", async () => {
    await expect(db.prepare(
      "INSERT INTO injuries (id, player_id, team_id, type, description, severity, days_remaining, days_total, match_id) VALUES ('x', 'p-home', 'home', 'sval', 'sval', 'lehke', 3, 3, 'cup-1')",
    ).run()).rejects.toThrow(/FOREIGN KEY/);
  });

  it("zranění obou týmů se uloží", async () => {
    const stmts = cupInjuryStatements(db, [injury(1, 1), injury(101, 2)], home, away, createRng(5));
    await db.batch(stmts);
    const rows = (await db.prepare("SELECT player_id, team_id, match_id, days_remaining, days_total FROM injuries ORDER BY player_id")
      .all<{ player_id: string; team_id: string; match_id: string | null; days_remaining: number; days_total: number }>()).results;
    expect(rows.map((r) => [r.player_id, r.team_id])).toEqual([["p-away", "away"], ["p-home", "home"]]);
    for (const r of rows) {
      expect(r.match_id).toBeNull();
      expect(r.days_remaining).toBeGreaterThan(0);
      expect(r.days_total).toBe(r.days_remaining);
    }
  });

  it("přátelák (zápas v matches) zranění na zápas odkáže", async () => {
    await db.prepare("INSERT OR IGNORE INTO matches VALUES ('friendly-1')").run();
    const stmts = cupInjuryStatements(db, [injury(1, 1)], home, away, createRng(5), "friendly-1");
    await db.batch(stmts);
    const row = await db.prepare("SELECT player_id, match_id FROM injuries").first<{ player_id: string; match_id: string }>();
    expect(row).toEqual({ player_id: "p-home", match_id: "friendly-1" });
  });

  it("hráč velkoklubu (tým mimo players) se nezapisuje", async () => {
    const stmts = cupInjuryStatements(db, [injury(1, 1), injury(101, 2)], home, { ...away, teamId: null }, createRng(5));
    await db.batch(stmts);
    const rows = (await db.prepare("SELECT player_id FROM injuries").all<{ player_id: string }>()).results;
    expect(rows.map((r) => r.player_id)).toEqual(["p-home"]);
  });
});

/**
 * Do `injuries.match_id` smí jen id z ligových `matches`. Zapisují ho liga (zápas z matches),
 * pohár a turnaj (oba bez odkazu, NULL). Kdo přidá další cestu, ať ji sem připíše.
 */
describe("kdo zapisuje injuries.match_id", () => {
  const SRC = join(__dirname, "..");
  const read = (file: string) => readFileSync(join(SRC, file), "utf-8");

  it("pohár ani turnaj neposílají do match_id id zápasu mimo matches", () => {
    expect(read("cup/cup.ts")).not.toMatch(/days, days, cupMatchId\)/);
    expect(read("tournament/match.ts")).not.toMatch(/days, days, m\.id\)/);
  });

  it("přátelák zranění zapisuje (dřív je nezapisoval vůbec)", () => {
    expect(read("multiplayer/friendly-runner.ts")).toMatch(/cupInjuryStatements\([\s\S]*?matchId\)/);
  });
});
