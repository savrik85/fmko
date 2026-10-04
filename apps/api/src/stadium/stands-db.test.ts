import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { Miniflare } from "miniflare";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { raiseAllStandSides } from "./stands-db";

let miniflare: Miniflare;
let db: D1Database;

function migrationStatements(): string[] {
  const sql = readFileSync(join(__dirname, "..", "..", "migrations", "0239_tribuny_po_stranach.sql"), "utf8")
    .split("\n").filter((l) => !l.trim().startsWith("--")).join("\n");
  return sql.split(/;\n(?=(?:ALTER|UPDATE|CREATE) )/).map((s) => s.trim().replace(/;$/, "")).filter(Boolean);
}

beforeAll(async () => {
  miniflare = new Miniflare({
    modules: true,
    script: "export default { fetch() { return new Response('ok'); } }",
    d1Databases: ["DB"],
  });
  db = await miniflare.getD1Database("DB");
});

afterAll(async () => {
  await miniflare.dispose();
});

beforeEach(async () => {
  await db.prepare("DROP TABLE IF EXISTS stadium_damage").run();
  await db.prepare("DROP TABLE IF EXISTS stadiums").run();
  await db.prepare("CREATE TABLE stadiums (id TEXT PRIMARY KEY, team_id TEXT NOT NULL UNIQUE, stands INTEGER NOT NULL DEFAULT 0)").run();
  await db.prepare("CREATE TABLE stadium_damage (id TEXT PRIMARY KEY, team_id TEXT, facility TEXT, levels INTEGER, repair_cost INTEGER, repaired_at TEXT)").run();
  await db.prepare("INSERT INTO stadiums VALUES ('s1','t1',0)").run();
  for (const st of migrationStatements()) await db.prepare(st).run();
});

describe("raiseAllStandSides (obecní rozšíření tribun)", () => {
  it("zvedne každou stranu o jednu úroveň a odvozené stands s ní", async () => {
    await db.prepare("UPDATE stadiums SET stand_main = 0, stand_opposite = 1, stand_goal_west = 2, stand_goal_east = 0 WHERE team_id = 't1'").run();
    await raiseAllStandSides(db, "t1");
    const r = await db.prepare("SELECT stands, stand_main, stand_opposite, stand_goal_west, stand_goal_east FROM stadiums WHERE team_id = 't1'").first();
    expect(r).toEqual({ stands: 3, stand_main: 1, stand_opposite: 2, stand_goal_west: 3, stand_goal_east: 1 });
  });

  it("strop je úroveň 3", async () => {
    await db.prepare("UPDATE stadiums SET stand_main = 3, stand_opposite = 3, stand_goal_west = 3, stand_goal_east = 2 WHERE team_id = 't1'").run();
    await raiseAllStandSides(db, "t1");
    const r = await db.prepare("SELECT stand_main, stand_goal_east FROM stadiums WHERE team_id = 't1'").first();
    expect(r).toEqual({ stand_main: 3, stand_goal_east: 3 });
  });

  it("klub bez tribun dostane čtyři tribuny L1, tedy +90 míst za 45 000 Kč podílu", async () => {
    await raiseAllStandSides(db, "t1");
    const r = await db.prepare("SELECT stands, stand_main, stand_opposite, stand_goal_west, stand_goal_east FROM stadiums WHERE team_id = 't1'").first();
    expect(r).toEqual({ stands: 1, stand_main: 1, stand_opposite: 1, stand_goal_west: 1, stand_goal_east: 1 });
  });
});
