/**
 * Zámek stavby musí fungovat i s triggerem, který drží odvozené `stands`.
 *
 * D1 vrací `meta.changes` včetně řádků změněných triggerem, takže úspěšná
 * stavba strany hlásí 2 změny, ne 1. Dřívější kontrola `=== 1` pak stavbu
 * zapsala, ale odmítla jako „už probíhá" a peníze se nestrhly (stavba zdarma).
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { Miniflare } from "miniflare";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { claimStadiumUpgrade } from "./upgrade-claim";

let miniflare: Miniflare;
let db: D1Database;

/** Příkazy z migrace: trigger obsahuje `;` uvnitř BEGIN…END, proto dělení podle začátku příkazu. */
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
  await db.prepare("CREATE TABLE stadiums (id TEXT PRIMARY KEY, team_id TEXT NOT NULL UNIQUE, stands INTEGER NOT NULL DEFAULT 0, fence INTEGER NOT NULL DEFAULT 0)").run();
  await db.prepare("CREATE TABLE stadium_damage (id TEXT, facility TEXT, repaired_at TEXT)").run();
  for (const st of migrationStatements()) await db.prepare(st).run();
  await db.prepare("INSERT INTO stadiums (id, team_id, stands) VALUES ('s1', 't1', 2)").run();
});

describe("claimStadiumUpgrade", () => {
  it("stavba strany s triggerem projde jednou a zvedne odvozené stands", async () => {
    const ok = await claimStadiumUpgrade(db, "t1", "stand_main", 2, 3);
    expect(ok).toBe(true);
    const row = await db.prepare("SELECT stand_main, stands FROM stadiums WHERE team_id = 't1'").first<{ stand_main: number; stands: number }>();
    expect(row).toEqual({ stand_main: 3, stands: 3 });
  });

  it("druhý požadavek na stejný přechod prohraje", async () => {
    expect(await claimStadiumUpgrade(db, "t1", "stand_main", 2, 3)).toBe(true);
    expect(await claimStadiumUpgrade(db, "t1", "stand_main", 2, 3)).toBe(false);
    const row = await db.prepare("SELECT stand_main FROM stadiums WHERE team_id = 't1'").first<{ stand_main: number }>();
    expect(row?.stand_main).toBe(3);
  });

  it("zařízení bez triggeru (plot) se zamyká stejně", async () => {
    expect(await claimStadiumUpgrade(db, "t1", "fence", 0, 1)).toBe(true);
    expect(await claimStadiumUpgrade(db, "t1", "fence", 0, 1)).toBe(false);
  });

  it("nesedí-li úroveň, nezmění se nic", async () => {
    expect(await claimStadiumUpgrade(db, "t1", "stand_opposite", 0, 1)).toBe(false);
    const row = await db.prepare("SELECT stand_opposite FROM stadiums WHERE team_id = 't1'").first<{ stand_opposite: number }>();
    expect(row?.stand_opposite).toBe(2);
  });
});
