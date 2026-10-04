/**
 * Migrace 0239 nesmí nikomu vzít místa ani peníze.
 *
 * Klub s rozbitou tribunou má v DB už sraženou úroveň `stands` a otevřený
 * záznam o škodě. Kdyby se všechny strany prostě zkopírovaly z poškozené
 * hodnoty a oprava zvedla jen hlavní stranu, klub by nikdy nedostal zpět
 * všechna místa. Škoda se proto bere jako zásah jen hlavní tribuny.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { Miniflare } from "miniflare";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { standsCapacity, readStandLevels } from "./stands-model";

let miniflare: Miniflare;
let db: D1Database;

function migrationStatements(): string[] {
  const sql = readFileSync(join(__dirname, "..", "..", "migrations", "0239_tribuny_po_stranach.sql"), "utf8")
    .split("\n").filter((l) => !l.trim().startsWith("--")).join("\n");
  return sql.split(/;\n(?=(?:ALTER|UPDATE|CREATE) )/).map((s) => s.trim().replace(/;$/, "")).filter(Boolean);
}

async function migrate() {
  for (const st of migrationStatements()) await db.prepare(st).run();
}

const sides = (teamId: string) =>
  db.prepare("SELECT stands, stand_main, stand_opposite, stand_goal_west, stand_goal_east FROM stadiums WHERE team_id = ?").bind(teamId)
    .first<Record<string, number>>();

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
});

describe("migrace tribun po stranách", () => {
  it("klub bez škody dostane všechny strany na dnešní úroveň a stejnou kapacitu", async () => {
    await db.prepare("INSERT INTO stadiums VALUES ('s1','t1',2),('s0','t0',0)").run();
    await migrate();
    const a = await sides("t1");
    expect(a).toEqual({ stands: 2, stand_main: 2, stand_opposite: 2, stand_goal_west: 2, stand_goal_east: 2 });
    expect(standsCapacity(readStandLevels(a!))).toBe(290);
    expect(standsCapacity(readStandLevels((await sides("t0"))!))).toBe(0);
  });

  it("rozbitá tribuna: ostatní strany zůstanou, oprava hlavní vrátí celých 290 míst", async () => {
    // Klub byl na L2, výtržníci srazili o úroveň, `stands` = 1.
    await db.prepare("INSERT INTO stadiums VALUES ('s1','t1',1)").run();
    await db.prepare("INSERT INTO stadium_damage VALUES ('d1','t1','stands',1,59500,NULL)").run();
    await migrate();
    const a = await sides("t1");
    expect(a).toEqual({ stands: 2, stand_main: 1, stand_opposite: 2, stand_goal_west: 2, stand_goal_east: 2 });

    const dmg = await db.prepare("SELECT facility, repair_cost FROM stadium_damage WHERE id = 'd1'").first<{ facility: string; repair_cost: number }>();
    expect(dmg?.facility).toBe("stand_main");
    // Oprava jedné strany nesmí stát cenu opravy všech čtyř.
    expect(dmg?.repair_cost).toBe(20800);

    // Přesně to dělá `opravVybaveni`.
    await db.prepare("UPDATE stadiums SET stand_main = MIN(3, stand_main + 1) WHERE team_id = 't1'").run();
    expect(standsCapacity(readStandLevels((await sides("t1"))!))).toBe(290);
  });

  it("dvě otevřené škody se sečtou a úroveň se nepřehoupne přes 3", async () => {
    await db.prepare("INSERT INTO stadiums VALUES ('s1','t1',1)").run();
    await db.prepare("INSERT INTO stadium_damage VALUES ('d1','t1','stands',1,59500,NULL),('d2','t1','stands',2,100000,NULL)").run();
    await migrate();
    const a = await sides("t1");
    expect(a?.stand_opposite).toBe(3);
    expect(a?.stand_main).toBe(1);
  });

  it("už opravená škoda strany nezvedá a jiné zařízení se nepřepisuje", async () => {
    await db.prepare("INSERT INTO stadiums VALUES ('s1','t1',2)").run();
    await db.prepare("INSERT INTO stadium_damage VALUES ('d1','t1','stands',1,59500,'2026-01-01'),('d2','t1','fence',1,5000,NULL)").run();
    await migrate();
    expect((await sides("t1"))?.stand_opposite).toBe(2);
    const rows = await db.prepare("SELECT id, facility, repair_cost FROM stadium_damage ORDER BY id").all<{ id: string; facility: string; repair_cost: number }>();
    expect(rows.results).toEqual([
      { id: "d1", facility: "stands", repair_cost: 59500 },
      { id: "d2", facility: "fence", repair_cost: 5000 },
    ]);
  });
});
