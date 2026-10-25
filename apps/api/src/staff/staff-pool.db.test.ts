/**
 * Pool volných zaměstnanců počítá s AI kluby.
 *
 * AI klub najímá ze stejného okresního poolu jako lidský, takže velikost poolu i kvóta
 * skautů se počítají ze všech áček okresu. Dřív se počítaly jen lidské kluby a okres
 * bez lidského klubu pool neměl vůbec.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Miniflare } from "miniflare";
import { createRng } from "../generators/rng";
import { maintainStaffPool, poolTargetFor } from "./staff-generator";

let mf: Miniflare;
let db: D1Database;

async function runSql(sql: string) {
  for (const stmt of sql.replace(/--.*$/gm, "").split(";").map((s) => s.trim()).filter(Boolean)) {
    await db.prepare(stmt).run();
  }
}

beforeAll(async () => {
  mf = new Miniflare({
    modules: true,
    script: "export default { fetch() { return new Response('ok'); } }",
    d1Databases: ["DB"],
  });
  db = await mf.getD1Database("DB");
  await runSql(`
    CREATE TABLE villages (id TEXT PRIMARY KEY, name TEXT, district TEXT);
    CREATE TABLE teams (id TEXT PRIMARY KEY, user_id TEXT, village_id TEXT, parent_team_id TEXT, team_type TEXT DEFAULT 'senior', league_id TEXT);
  `);
  await runSql(readFileSync(resolve(__dirname, "../../migrations/0115_staff.sql"), "utf8"));

  const stmts: D1PreparedStatement[] = [
    db.prepare("INSERT INTO villages VALUES ('v-alfa', 'Alfa', 'Alfa'), ('v-beta', 'Beta', 'Beta')"),
    db.prepare("INSERT INTO teams (id, user_id, village_id, league_id) VALUES ('alfa-human', 'u1', 'v-alfa', 'l-alfa')"),
  ];
  for (let i = 0; i < 9; i++) {
    stmts.push(db.prepare("INSERT INTO teams (id, user_id, village_id, league_id) VALUES (?, 'ai', 'v-alfa', 'l-alfa')").bind(`alfa-ai-${i}`));
    // U21 se nepočítá, jen áčka.
    stmts.push(db.prepare("INSERT INTO teams (id, user_id, village_id, parent_team_id, team_type, league_id) VALUES (?, 'ai', 'v-alfa', ?, 'u21', 'l-alfa-u21')")
      .bind(`alfa-ai-${i}-u21`, `alfa-ai-${i}`));
  }
  for (let i = 0; i < 3; i++) {
    stmts.push(db.prepare("INSERT INTO teams (id, user_id, village_id, league_id) VALUES (?, 'ai', 'v-beta', 'l-beta')").bind(`beta-ai-${i}`));
  }
  // AI tým mimo ligu (pozůstatek) se nepočítá.
  stmts.push(db.prepare("INSERT INTO teams (id, user_id, village_id, league_id) VALUES ('beta-orphan', 'ai', 'v-beta', NULL)"));
  await db.batch(stmts);
});

afterAll(async () => {
  await mf.dispose();
});

describe("pool zaměstnanců a AI kluby", () => {
  it("cíl poolu roste s počtem klubů", () => {
    expect(poolTargetFor(1)).toBe(30);
    expect(poolTargetFor(10)).toBe(80);
    expect(poolTargetFor(40)).toBe(200);
  });

  it("okres jen s AI kluby dostane pool, kvóta skautů počítá i AI kluby", async () => {
    await maintainStaffPool(db, createRng(42), new Date("2026-11-02T05:00:00.000Z"));

    const pool = await db.prepare(
      "SELECT district, COUNT(*) AS n, SUM(CASE WHEN profession = 'skaut' THEN 1 ELSE 0 END) AS scouts FROM staff_members WHERE team_id IS NULL GROUP BY district",
    ).all<{ district: string; n: number; scouts: number }>();
    const byDistrict = new Map(pool.results.map((r) => [r.district, r]));

    // Alfa: 1 lidský + 9 AI áček = 10 klubů → kvóta 15 skautů, za jeden běh se jich doplní 10.
    expect(byDistrict.get("Alfa")?.scouts).toBeGreaterThanOrEqual(10);
    // Beta: jen 3 AI kluby → pool vznikne (dřív žádný), aspoň minimální kvóta 5 skautů.
    expect(byDistrict.get("Beta")?.n).toBeGreaterThanOrEqual(5);
    expect(byDistrict.get("Beta")?.scouts).toBeGreaterThanOrEqual(5);
  });
});
