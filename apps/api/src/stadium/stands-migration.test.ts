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
  it("L2 a L3 dostanou všechny čtyři strany, L1 jen obě tribuny za brankou, kapacita i vzhled zůstanou", async () => {
    await db.prepare("INSERT INTO stadiums VALUES ('s2','t2',2),('s1','t1',1),('s3','t3',3),('s0','t0',0)").run();
    await migrate();
    expect(await sides("t2")).toEqual({ stands: 2, stand_main: 2, stand_opposite: 2, stand_goal_west: 2, stand_goal_east: 2 });
    expect(await sides("t1")).toEqual({ stands: 1, stand_main: 0, stand_opposite: 0, stand_goal_west: 1, stand_goal_east: 1 });
    expect(await sides("t3")).toEqual({ stands: 3, stand_main: 3, stand_opposite: 3, stand_goal_west: 3, stand_goal_east: 3 });
    expect(await sides("t0")).toEqual({ stands: 0, stand_main: 0, stand_opposite: 0, stand_goal_west: 0, stand_goal_east: 0 });
    // Dnešní kapacity tribun: 0 / 90 / 290 / 500.
    for (const [team, cap] of [["t0", 0], ["t1", 90], ["t2", 290], ["t3", 500]] as const) {
      expect(standsCapacity(readStandLevels((await sides(team))!)), team).toBe(cap);
    }
  });

  it("klub sražený nezaplacenou škodou se převede podle současného stavu: kapacita se nezvedne", async () => {
    // Klub byl na L2, výtržníci srazili o úroveň, `stands` = 1. Teď má 90 míst a tolik mu zůstane.
    await db.prepare("INSERT INTO stadiums VALUES ('s1','t1',1)").run();
    await db.prepare("INSERT INTO stadium_damage VALUES ('d1','t1','stands',1,59500,NULL)").run();
    await migrate();
    expect(await sides("t1")).toEqual({ stands: 1, stand_main: 0, stand_opposite: 0, stand_goal_west: 1, stand_goal_east: 1 });
    expect(standsCapacity(readStandLevels((await sides("t1"))!))).toBe(90);
    const dmg = await db.prepare("SELECT facility, repair_cost FROM stadium_damage WHERE id = 'd1'").first<{ facility: string; repair_cost: number }>();
    // Škoda už není na `stands` (to nejde opravit), míří na jednu stranu a oprava jedné strany je levnější.
    expect(dmg?.facility).toBe("stand_goal_east");
    expect(dmg?.repair_cost).toBe(20800);
  });

  it("klub z L2 sražený škodou na L1 po opravě zvedne jednu stranu, nic navíc", async () => {
    await db.prepare("INSERT INTO stadiums VALUES ('s1','t1',2)").run();
    await db.prepare("INSERT INTO stadium_damage VALUES ('d1','t1','stands',1,59500,NULL)").run();
    await migrate();
    expect(await sides("t1")).toEqual({ stands: 2, stand_main: 2, stand_opposite: 2, stand_goal_west: 2, stand_goal_east: 2 });
    const dmg = await db.prepare("SELECT facility FROM stadium_damage WHERE id = 'd1'").first<{ facility: string }>();
    expect(dmg?.facility).toBe("stand_main");
    expect(standsCapacity(readStandLevels((await sides("t1"))!))).toBe(290);
  });

  it("klub bez tribun s otevřenou škodou zůstane na nule", async () => {
    await db.prepare("INSERT INTO stadiums VALUES ('s1','t1',0)").run();
    await db.prepare("INSERT INTO stadium_damage VALUES ('d1','t1','stands',1,19300,NULL)").run();
    await migrate();
    expect(await sides("t1")).toEqual({ stands: 0, stand_main: 0, stand_opposite: 0, stand_goal_west: 0, stand_goal_east: 0 });
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
