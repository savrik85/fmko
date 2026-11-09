/**
 * Pro které ligy se ráno píše náhled kola, nad skutečnou D1 (Miniflare).
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Miniflare } from "miniflare";
import { PREVIEW_LEAGUES_SQL } from "./matchday-preview";

let miniflare: Miniflare;
let db: D1Database;

beforeAll(async () => {
  miniflare = new Miniflare({
    modules: true,
    script: "export default { fetch() { return new Response('ok'); } }",
    d1Databases: ["DB"],
  });
  db = await miniflare.getD1Database("DB");
  await db.exec("CREATE TABLE leagues (id TEXT PRIMARY KEY, league_type TEXT NOT NULL DEFAULT 'senior')");
  await db.exec("CREATE TABLE teams (id TEXT PRIMARY KEY, league_id TEXT, game_date TEXT, user_id TEXT)");
  await db.batch([
    db.prepare("INSERT INTO leagues VALUES ('senior', 'senior'), ('youth', 'u21'), ('ai-only', 'senior')"),
    db.prepare(`INSERT INTO teams VALUES
      ('t1', 'senior', '2026-11-09', 'u1'), ('t2', 'senior', '2026-11-09', 'ai'),
      ('t1-u21', 'youth', '2026-11-09', 'u1'),
      ('t3', 'ai-only', '2026-11-09', 'ai'),
      ('t4', NULL, '2026-11-09', 'u2')`),
  ]);
}, 30_000);

afterAll(async () => { await miniflare.dispose(); });

describe("ligy pro náhled kola", () => {
  it("jen mužská liga s lidským klubem; U21 se nepíše, dokud ji web neukazuje", async () => {
    const rows = await db.prepare(PREVIEW_LEAGUES_SQL).all<{ league_id: string; game_date: string }>();
    expect(rows.results).toEqual([{ league_id: "senior", game_date: "2026-11-09" }]);
  });
});
