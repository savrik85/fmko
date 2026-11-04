/**
 * Sponzor soutěže platí za každou sezónu, kterou smlouva pokrývá, včetně té,
 * ve které ho grémium schválilo. Dřív se platilo jen při rolloveru, takže
 * sezóna podpisu zůstala nezaplacená a jednosezónní sponzor nezaplatil nic.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { Miniflare } from "miniflare";
import { readBalance } from "./ledger";
import { settleSponsor } from "./rollover";
import { acceptOffer, paySponsorSeason } from "./sponsors";

let mf: Miniflare;
let db: D1Database;

const LEAGUE = "L-prebor";
const ORIGINAL = "Okresní přebor Prachatice";
const MEETING = "2026-11-04T16:00:00.000Z";

async function runMigration(file: string) {
  const sql = readFileSync(resolve(__dirname, `../../migrations/${file}`), "utf8");
  for (const stmt of sql.replace(/--.*$/gm, "").split(";").map((s) => s.trim()).filter(Boolean)) {
    await db.prepare(stmt).run();
  }
}

async function sponsorEntries() {
  return (await db.prepare(
    "SELECT season_number, amount, reference_id FROM competition_ledger WHERE league_id = ? AND type = 'sponsor' ORDER BY season_number",
  ).bind(LEAGUE).all<{ season_number: number; amount: number; reference_id: string }>()).results;
}

async function leagueName() {
  return (await db.prepare("SELECT name FROM leagues WHERE id = ?").bind(LEAGUE).first<{ name: string }>())?.name;
}

beforeAll(async () => {
  mf = new Miniflare({
    modules: true,
    script: "export default { fetch() { return new Response('ok'); } }",
    d1Databases: ["DB"],
  });
  db = await mf.getD1Database("DB");
  await runMigration("0150_competition_governance.sql");
  await runMigration("0156_competition_sponsors.sql");
  for (const sql of [
    "CREATE TABLE leagues (id TEXT PRIMARY KEY, name TEXT)",
    "CREATE TABLE group_chats (id TEXT PRIMARY KEY, title TEXT)",
  ]) await db.prepare(sql).run();
});

afterAll(async () => {
  await mf.dispose();
});

beforeEach(async () => {
  for (const t of ["competition_ledger", "competition_sponsor_offers", "competition_governance", "leagues", "group_chats"]) {
    await db.prepare(`DELETE FROM ${t}`).run();
  }
  await db.batch([
    db.prepare("INSERT INTO leagues (id, name) VALUES (?, ?)").bind(LEAGUE, ORIGINAL),
    db.prepare("INSERT INTO group_chats (id, title) VALUES (?, ?)").bind(`league:${LEAGUE}`, ORIGINAL),
    db.prepare("INSERT INTO competition_governance (league_id, enabled, enabled_from_season) VALUES (?, 1, 1)").bind(LEAGUE),
  ]);
});

async function offer(id: string, name: string, amount: number, seasons: number) {
  await db.prepare(
    `INSERT INTO competition_sponsor_offers (id, league_id, season_number, name, amount, seasons, tier, opened_game_date)
     VALUES (?, ?, 3, ?, ?, ?, 'okresni', '2026-10-21T16:00:00.000Z')`,
  ).bind(id, LEAGUE, name, amount, seasons).run();
}

describe("sponzor soutěže platí", () => {
  it("dvousezónní smlouva: sezóna podpisu hned, další při rolloveru, pak konec", async () => {
    await offer("o1", "Schwan", 190_000, 2);

    const out = await acceptOffer(db, { leagueId: LEAGUE, offerId: "o1", seasonNumber: 3, gameDate: MEETING });
    expect(out.ok).toBe(true);
    expect(await leagueName()).toBe("Schwan liga");
    expect(await sponsorEntries()).toEqual([{ season_number: 3, amount: 190_000, reference_id: `spon-${LEAGUE}-3` }]);
    expect(await readBalance(db, LEAGUE)).toBe(190_000);
    const cache = await db.prepare("SELECT balance_cache FROM competition_governance WHERE league_id = ?")
      .bind(LEAGUE).first<{ balance_cache: number }>();
    expect(cache?.balance_cache).toBe(190_000);

    // Opakované doplacení téže sezóny nic nepřipíše.
    expect((await paySponsorSeason(db, { leagueId: LEAGUE, seasonNumber: 3, gameDate: MEETING })).paid).toBe(false);
    expect(await sponsorEntries()).toHaveLength(1);

    await settleSponsor(db, LEAGUE, 4, "2027-02-01T10:00:00.000Z");
    expect((await sponsorEntries()).map((e) => e.season_number)).toEqual([3, 4]);
    expect(await leagueName()).toBe("Schwan liga");

    await settleSponsor(db, LEAGUE, 5, "2027-06-01T10:00:00.000Z");
    expect((await sponsorEntries()).map((e) => e.season_number)).toEqual([3, 4]);
    expect(await readBalance(db, LEAGUE)).toBe(380_000);
    expect(await leagueName()).toBe(ORIGINAL);
  });

  it("jednosezónní smlouva zaplatí sezónu podpisu a při rolloveru skončí", async () => {
    await offer("o2", "Gambrinus", 93_000, 1);

    expect((await acceptOffer(db, { leagueId: LEAGUE, offerId: "o2", seasonNumber: 3, gameDate: MEETING })).ok).toBe(true);
    await settleSponsor(db, LEAGUE, 4, "2027-02-01T10:00:00.000Z");

    expect(await sponsorEntries()).toEqual([{ season_number: 3, amount: 93_000, reference_id: `spon-${LEAGUE}-3` }]);
    expect(await leagueName()).toBe(ORIGINAL);
  });

  it("doplacení bez sponzora nebo po konci smlouvy nic nezapíše", async () => {
    expect((await paySponsorSeason(db, { leagueId: LEAGUE, seasonNumber: 3, gameDate: MEETING })).paid).toBe(false);

    await db.prepare(
      "UPDATE competition_governance SET sponsor_name = 'Schwan', sponsor_amount = 190000, sponsor_until_season = 4 WHERE league_id = ?",
    ).bind(LEAGUE).run();
    expect((await paySponsorSeason(db, { leagueId: LEAGUE, seasonNumber: 5, gameDate: MEETING })).paid).toBe(false);
    expect(await sponsorEntries()).toHaveLength(0);

    // Sponzor schválený před opravou: doplacení běžící sezóny projde jednou.
    expect((await paySponsorSeason(db, { leagueId: LEAGUE, seasonNumber: 3, gameDate: MEETING }))).toEqual({
      paid: true, name: "Schwan", amount: 190_000,
    });
    expect((await paySponsorSeason(db, { leagueId: LEAGUE, seasonNumber: 3, gameDate: MEETING })).paid).toBe(false);
    expect(await readBalance(db, LEAGUE)).toBe(190_000);
  });
});
