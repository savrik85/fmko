/**
 * Kořaly, které dřív nešly získat: šampion ligy a první koupe od klubu mimo hru.
 *
 * `champion` neuděloval nikdo, `checkTransferAchievements` nikdo nevolal.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { Miniflare } from "miniflare";
import { awardLeagueChampion, checkTransferAchievements } from "./achievements";
import { purchaseVirtualPlayer } from "../transfers/virtual-purchase";

let miniflare: Miniflare;
let db: D1Database;

beforeAll(async () => {
  miniflare = new Miniflare({
    modules: true,
    script: "export default { fetch() { return new Response('ok'); } }",
    d1Databases: ["DB"],
  });
  db = await miniflare.getD1Database("DB");
  for (const sql of [
    `CREATE TABLE team_achievements (team_id TEXT NOT NULL, achievement_key TEXT NOT NULL, earned_at TEXT NOT NULL,
      tier TEXT, meta TEXT, PRIMARY KEY (team_id, achievement_key))`,
    `CREATE TABLE season_awards (id TEXT PRIMARY KEY, league_id TEXT NOT NULL, season_number INTEGER NOT NULL,
      champion_team_id TEXT, UNIQUE (league_id, season_number))`,
    "CREATE TABLE villages (id TEXT PRIMARY KEY, name TEXT, size TEXT, district TEXT)",
    "CREATE TABLE teams (id TEXT PRIMARY KEY, name TEXT, league_id TEXT, village_id TEXT, budget INTEGER, game_date TEXT)",
    "CREATE TABLE seasons (id TEXT PRIMARY KEY, number INTEGER, status TEXT)",
    `CREATE TABLE players (id TEXT PRIMARY KEY, team_id TEXT, first_name TEXT, last_name TEXT, age INTEGER, position TEXT,
      overall_rating INTEGER, skills TEXT, physical TEXT, personality TEXT, life_context TEXT, avatar TEXT, weekly_wage INTEGER,
      status TEXT, nationality TEXT, skills_max TEXT, hidden_talent INTEGER, residence TEXT, commute_km REAL, squad_number INTEGER,
      is_celebrity INTEGER DEFAULT 0)`,
    `CREATE TABLE player_contracts (id TEXT PRIMARY KEY, player_id TEXT, team_id TEXT, season_id TEXT, join_type TEXT,
      fee INTEGER, is_active INTEGER, from_club_name TEXT)`,
    `CREATE TABLE transactions (id TEXT PRIMARY KEY, team_id TEXT, type TEXT, amount INTEGER, balance_after INTEGER,
      description TEXT, game_date TEXT)`,
    "INSERT INTO villages VALUES ('v1', 'Vimperk', 'mesto', 'Prachatice')",
    "INSERT INTO seasons VALUES ('season-3', 3, 'active')",
    "INSERT INTO teams VALUES ('buyer', 'SK Vimperk', 'l1', 'v1', 100000, '2026-10-20T16:00:00.000Z')",
  ]) await db.prepare(sql).run();
});

afterAll(async () => {
  await miniflare.dispose();
});

beforeEach(async () => {
  await db.prepare("DELETE FROM team_achievements").run();
});

async function achievementsOf(teamId: string): Promise<string[]> {
  const rows = await db.prepare("SELECT achievement_key FROM team_achievements WHERE team_id = ? ORDER BY achievement_key")
    .bind(teamId).all<{ achievement_key: string }>();
  return rows.results.map((r) => r.achievement_key);
}

describe("šampion ligy", () => {
  it("vítěz z ocenění sezóny dostane šampiona, opakovaný běh fáze nic nepřidá", async () => {
    await db.prepare("INSERT INTO season_awards (id, league_id, season_number, champion_team_id) VALUES ('aw-1', 'l1', 3, 'winner')").run();

    expect(await awardLeagueChampion(db, "l1", 3)).toBe("winner");
    expect(await awardLeagueChampion(db, "l1", 3)).toBe("winner");

    const rows = await db.prepare("SELECT team_id, achievement_key, tier FROM team_achievements").all();
    expect(rows.results).toEqual([{ team_id: "winner", achievement_key: "champion", tier: "gold" }]);
  });

  it("bez ocenění sezóny se nic neudělí", async () => {
    expect(await awardLeagueChampion(db, "l1", 99)).toBeNull();
    expect(await achievementsOf("winner")).toEqual([]);
  });
});

describe("koupě od klubu mimo hru", () => {
  it("je první koupě kupujícího", async () => {
    let claimed = false;
    const res = await purchaseVirtualPlayer({
      db,
      playerId: "bought",
      player: {
        firstName: "Hans", lastName: "Müller", age: 27, position: "MID", overallRating: 50,
        skills: { passing: 50 }, physical: {}, personality: {},
      },
      buyerClubTeamId: "buyer",
      destTeamId: "buyer",
      sellerName: "SpVgg Grafenau",
      terms: { amount: 10_000, upfrontPct: 100, installments: 0, sellOnPct: 0 },
      dealId: "deal-1",
      claimSource: async () => { claimed = true; return true; },
      releaseSource: async () => { claimed = false; },
      description: "Přestup: Hans Müller",
    });
    expect(res.ok).toBe(true);
    expect(claimed).toBe(true);
    expect(await achievementsOf("buyer")).toEqual(["first_signing"]);
  });

  it("koupě celebrity dá i Showmana, druhá koupě už nic", async () => {
    await db.prepare(
      "INSERT INTO players (id, team_id, first_name, last_name, age, position, overall_rating, is_celebrity) VALUES ('celeb', 'buyer', 'Jan', 'Hvězda', 33, 'FWD', 70, 1)",
    ).run();
    expect((await checkTransferAchievements(db, "buyer", "celeb")).sort()).toEqual(["celebrity_signing", "first_signing"]);
    expect(await checkTransferAchievements(db, "buyer", "celeb")).toEqual([]);
    expect(await achievementsOf("buyer")).toEqual(["celebrity_signing", "first_signing"]);
  });
});
