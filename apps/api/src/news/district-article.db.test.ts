/**
 * Vlastní článek admina do Zpravodaje okresu na skutečné D1 (Miniflare, všechny migrace):
 * jde do všech běžících seniorských lig okresu, ne do U21, čekající ligy ani jiného okresu.
 */
import { afterAll, describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { Miniflare } from "miniflare";
import { publishDistrictArticle } from "./district-article";

let db: D1Database;
const instances: Miniflare[] = [];
afterAll(async () => {
  for (const instance of instances) await instance.dispose();
});

async function freshDb(): Promise<void> {
  const mf = new Miniflare({ modules: true, script: "export default { fetch() { return new Response('ok'); } }", d1Databases: ["DB"] });
  instances.push(mf);
  db = await mf.getD1Database("DB");
  const dir = new URL("../../migrations/", import.meta.url);
  for (const file of readdirSync(dir).filter((f) => f.endsWith(".sql")).sort()) {
    await db.exec(readFileSync(new URL(file, dir), "utf8").replace(/--[^\n]*/g, "").replace(/\n/g, " "));
  }
  await db.batch([
    // Migrace zakládají první sezónu; test si drží vlastní, aktivní je jen 's-now'.
    db.prepare("UPDATE seasons SET status = 'finished'"),
    db.prepare("INSERT INTO seasons (id, number, status) VALUES ('s-old', 90, 'finished'), ('s-now', 91, 'active')"),
    db.prepare(
      `INSERT INTO leagues (id, season_id, district, name, level, league_type, waiting) VALUES
        ('l-top', 's-now', 'Prachatice', 'Přebor', 'okresni_prebor', 'senior', 0),
        ('l-low', 's-now', 'Prachatice', 'III. třída', 'okresni_soutez', 'senior', 0),
        ('l-u21', 's-now', 'Prachatice', 'III. třída U21', 'ib_trida', 'u21', 0),
        ('l-wait', 's-now', 'Prachatice', 'IV. třída', 'iv_trida', 'senior', 1),
        ('l-other', 's-now', 'Strakonice', 'Přebor ST', 'okresni_prebor', 'senior', 0),
        ('l-old', 's-old', 'Prachatice', 'Starý přebor', 'okresni_prebor', 'senior', 0)`,
    ),
  ]);
}

describe("vlastní článek do Zpravodaje okresu", () => {
  it("vyjde ve všech běžících seniorských ligách okresu, bez dlouhých pomlček; náhled nic nezapíše", async () => {
    await freshDb();
    const input = { district: "Prachatice", headline: "Trenér vyhozen — prý kvůli houbám", body: "Odstavec jedna – s pomlčkou.\n\nOdstavec dva.", teamId: "t-1" };

    const preview = await publishDistrictArticle(db, input, { dryRun: true });
    expect(preview).toMatchObject({ ok: true, dryRun: true, headline: "Trenér vyhozen, prý kvůli houbám", body: "Odstavec jedna, s pomlčkou.\n\nOdstavec dva." });
    expect(preview.ok && preview.leagues.map((l) => l.id).sort()).toEqual(["l-low", "l-top"]);
    expect((await db.prepare("SELECT COUNT(*) AS n FROM news").first<{ n: number }>())?.n).toBe(0);

    const done = await publishDistrictArticle(db, input, {});
    expect(done).toMatchObject({ ok: true, dryRun: false });
    const rows = await db.prepare("SELECT league_id, team_id, type, headline, body, season_number FROM news ORDER BY league_id").all();
    expect(rows.results).toEqual([
      { league_id: "l-low", team_id: "t-1", type: "district_event", headline: "Trenér vyhozen, prý kvůli houbám", body: "Odstavec jedna, s pomlčkou.\n\nOdstavec dva.", season_number: 91 },
      { league_id: "l-top", team_id: "t-1", type: "district_event", headline: "Trenér vyhozen, prý kvůli houbám", body: "Odstavec jedna, s pomlčkou.\n\nOdstavec dva.", season_number: 91 },
    ]);
  }, 120_000);

  it("bez titulku, textu nebo s okresem bez ligy nic nevydá", async () => {
    await freshDb();
    expect(await publishDistrictArticle(db, { district: "Prachatice", headline: " ", body: "x" }, {})).toMatchObject({ ok: false });
    expect(await publishDistrictArticle(db, { district: "Prachatice", headline: "x", body: "" }, {})).toMatchObject({ ok: false });
    expect(await publishDistrictArticle(db, { district: "Neexistuje", headline: "x", body: "y" }, {})).toMatchObject({ ok: false });
    expect((await db.prepare("SELECT COUNT(*) AS n FROM news").first<{ n: number }>())?.n).toBe(0);
  }, 120_000);
});
