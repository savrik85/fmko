/**
 * Předseda disciplinární rady nesmí sám pokutovat klub, se kterým má vyhrocený vztah.
 *
 * Kontrola četla `manager_relations.team_a/team_b`, sloupce se ale jmenují
 * `team_a_id/team_b_id`. Dotaz spadl do `.catch`, heat vyšel 0 a střet zájmů
 * nikdy nezabral. Test běží nad skutečnou SQLite, falešná D1 by to nepoznala.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Miniflare } from "miniflare";
import { canChairFine, CHAIR_HEAT_LIMIT } from "./discipline";

let mf: Miniflare;
let db: D1Database;

beforeAll(async () => {
  mf = new Miniflare({
    modules: true,
    script: "export default { fetch() { return new Response('ok'); } }",
    d1Databases: ["DB"],
  });
  db = await mf.getD1Database("DB");
  for (const sql of [
    `CREATE TABLE competition_officials (id TEXT PRIMARY KEY, league_id TEXT NOT NULL, role TEXT NOT NULL, team_id TEXT NOT NULL,
       season_number INTEGER NOT NULL, status TEXT NOT NULL DEFAULT 'active', used_fines INTEGER NOT NULL DEFAULT 0)`,
    `CREATE TABLE manager_relations (team_a_id TEXT NOT NULL, team_b_id TEXT NOT NULL, respect INTEGER NOT NULL DEFAULT 0,
       heat INTEGER NOT NULL DEFAULT 0, history TEXT NOT NULL DEFAULT '[]', PRIMARY KEY (team_a_id, team_b_id))`,
    "INSERT INTO competition_officials (id, league_id, role, team_id, season_number) VALUES ('o1', 'l1', 'disciplinarni', 'chair', 3)",
    // Pár se ukládá v abecedním pořadí, předseda je tu druhý.
    `INSERT INTO manager_relations (team_a_id, team_b_id, heat) VALUES ('arch-rival', 'chair', ${CHAIR_HEAT_LIMIT + 20}), ('calm', 'chair', 10)`,
  ]) await db.prepare(sql).run();
});

afterAll(async () => {
  await mf.dispose();
});

describe("střet zájmů předsedy disciplinární rady", () => {
  it("klub s vyhroceným vztahem sám pokutovat nesmí", async () => {
    const check = await canChairFine(db, "l1", "chair", "arch-rival", 3, 1000);
    expect(check.ok).toBe(false);
    expect(check.ok ? "" : check.reason).toContain("vyhrocený vztah");
  });

  it("klub s klidným vztahem pokutovat smí", async () => {
    expect((await canChairFine(db, "l1", "chair", "calm", 3, 1000)).ok).toBe(true);
  });
});
