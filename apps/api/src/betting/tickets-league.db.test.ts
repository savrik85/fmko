/**
 * Tiket jen na zápasy vlastní soutěže.
 *
 * Lístek ukazuje jen ligu klubu, server ale bral kurzy jakékoli ligy, takže přes API
 * šlo vsadit na cizí ligu. Běží nad skutečnou SQLite se skutečnými migracemi.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Miniflare } from "miniflare";
import { placeTicket } from "./tickets";

let mf: Miniflare;
let db: D1Database;

async function runMigration(file: string) {
  const sql = readFileSync(resolve(__dirname, `../../migrations/${file}`), "utf8");
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
  for (const sql of [
    "CREATE TABLE teams (id TEXT PRIMARY KEY, name TEXT, user_id TEXT, parent_team_id TEXT, league_id TEXT)",
    "CREATE TABLE matches (id TEXT PRIMARY KEY, home_team_id TEXT, away_team_id TEXT)",
    "CREATE TABLE season_calendar (id TEXT PRIMARY KEY, game_week INTEGER, status TEXT)",
    `INSERT INTO teams VALUES ('me', 'Sázkař', 'u1', NULL, 'L1'), ('h1', 'Domácí 1', 'u2', NULL, 'L1'),
       ('a1', 'Hosté 1', 'u3', NULL, 'L1'), ('h2', 'Domácí 2', 'u4', NULL, 'L2'), ('a2', 'Hosté 2', 'u5', NULL, 'L2')`,
    "INSERT INTO matches VALUES ('m1', 'h1', 'a1'), ('m2', 'h2', 'a2')",
  ]) await db.prepare(sql).run();
  // Z migrace 0157 jen tabulky sázek; zbytek sahá na sazebník soutěže, ten tu není.
  const betting = readFileSync(resolve(__dirname, "../../migrations/0157_sazkova_kancelar.sql"), "utf8").replace(/--.*$/gm, "");
  for (const stmt of betting.split(";").map((x) => x.trim()).filter((x) => /^CREATE TABLE IF NOT EXISTS bet_(odds|tickets)\b/.test(x))) {
    await db.prepare(stmt).run();
  }
  await runMigration("0273_club_links.sql");
  await db.prepare(
    `INSERT INTO bet_odds (id, match_id, market, selection, odds_x100, probability, label, game_date, calendar_id, league_id, season_number)
     VALUES ('o1', 'm1', '1x2', '1', 200, 0.5, 'Domácí 1', '2026-10-24', 'cal-1', 'L1', 4),
            ('o2', 'm2', '1x2', '1', 200, 0.5, 'Domácí 2', '2026-10-24', 'cal-2', 'L2', 4)`,
  ).run();
});

afterAll(async () => {
  await mf.dispose();
});

const ticket = (matchId: string) => ({
  teamId: "me",
  stake: 100,
  selections: [{ matchId, market: "1x2", selection: "1", oddsX100: 200 }],
  gameDate: "2026-10-24T12:00:00.000Z",
});

describe("tiket jen na vlastní soutěž", () => {
  it("na zápas cizí ligy tiket nevznikne", async () => {
    const res = await placeTicket(db, ticket("m2"));
    expect(res).toMatchObject({ ok: false, status: 400 });
    expect(res.ok ? "" : res.error).toContain("vlastní soutěže");
    const n = await db.prepare("SELECT COUNT(*) AS n FROM bet_tickets").first<{ n: number }>();
    expect(n?.n).toBe(0);
  });

  it("zápas vlastní ligy kontrolou soutěže projde", async () => {
    // Kolo v testu neexistuje, takže tiket skončí až na něm, ne na soutěži.
    const res = await placeTicket(db, ticket("m1"));
    expect(res.ok ? "" : res.error).not.toContain("vlastní soutěže");
    expect(res).toMatchObject({ ok: false, error: "Kolo nenalezeno." });
  });
});
