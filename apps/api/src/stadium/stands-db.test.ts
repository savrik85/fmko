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
  const sides = () => db.prepare("SELECT stands, stand_main, stand_opposite, stand_goal_west, stand_goal_east FROM stadiums WHERE team_id = 't1'").first();

  it("klub bez tribun dostane tribuny za brankami (L1 jako dřív)", async () => {
    await raiseAllStandSides(db, "t1");
    expect(await sides()).toEqual({ stands: 1, stand_main: 0, stand_opposite: 0, stand_goal_west: 1, stand_goal_east: 1 });
  });

  it("převedený klub z L1 dostane všechny čtyři strany na L2 (290 míst jako dřív)", async () => {
    await db.prepare("UPDATE stadiums SET stand_goal_west = 1, stand_goal_east = 1 WHERE team_id = 't1'").run();
    await raiseAllStandSides(db, "t1");
    expect(await sides()).toEqual({ stands: 2, stand_main: 2, stand_opposite: 2, stand_goal_west: 2, stand_goal_east: 2 });
  });

  it("nikdy nesníží stranu, která je už výš", async () => {
    await db.prepare("UPDATE stadiums SET stand_main = 3, stand_goal_west = 1, stand_goal_east = 1 WHERE team_id = 't1'").run();
    await raiseAllStandSides(db, "t1");
    const r = await sides() as Record<string, number>;
    expect(r.stand_main).toBe(3);
    expect(r.stand_goal_west).toBe(2);
  });

  it("strop je úroveň 3", async () => {
    await db.prepare("UPDATE stadiums SET stand_main = 3, stand_opposite = 3, stand_goal_west = 3, stand_goal_east = 3 WHERE team_id = 't1'").run();
    await raiseAllStandSides(db, "t1");
    expect(await sides()).toEqual({ stands: 3, stand_main: 3, stand_opposite: 3, stand_goal_west: 3, stand_goal_east: 3 });
  });
});
