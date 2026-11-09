/**
 * Strop sázky v přáteláku podle pravidel soutěže a přáteláky o peníze v knize komisaře.
 * Běží nad skutečnou SQLite (Miniflare).
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { Miniflare } from "miniflare";

const betMaxStakeByLeague = vi.hoisted(() => ({ value: {} as Record<string, number> }));
vi.mock("../competition/rules", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../competition/rules")>()),
  resolveRules: async (_db: unknown, leagueId: string | null) => ({ bet_max_stake: betMaxStakeByLeague.value[leagueId ?? ""] ?? 5_000 }),
  districtLeagueIds: async (_db: unknown, leagueId: string) => [leagueId],
}));

import { FRIENDLY_MAX_STAKE, friendlyStakeCap, loadFriendlyStakeCap, stakeCapError } from "./friendlies";
import { friendlyStakeBook } from "../competition/integrity";

let mf: Miniflare;
let db: D1Database;

beforeAll(async () => {
  mf = new Miniflare({ modules: true, script: "export default { fetch() { return new Response('ok'); } }", d1Databases: ["DB"] });
  db = await mf.getD1Database("DB");
  for (const sql of [
    "CREATE TABLE teams (id TEXT PRIMARY KEY, name TEXT, league_id TEXT)",
    "CREATE TABLE season_calendar (id TEXT PRIMARY KEY, league_id TEXT, season_number INTEGER)",
    "CREATE TABLE matches (id TEXT PRIMARY KEY, home_team_id TEXT, away_team_id TEXT, home_score INTEGER, away_score INTEGER, status TEXT)",
    `CREATE TABLE challenges (id TEXT PRIMARY KEY, challenger_team_id TEXT, challenged_team_id TEXT, status TEXT, match_id TEXT,
       created_at TEXT, match_date TEXT, stake INTEGER, stake_status TEXT)`,
  ]) await db.prepare(sql).run();
  const links = readFileSync(resolve(__dirname, "../../migrations/0273_club_links.sql"), "utf8").replace(/--.*$/gm, "");
  for (const stmt of links.split(";").map((s) => s.trim()).filter(Boolean)) await db.prepare(stmt).run();
});

afterAll(async () => { await mf.dispose(); });

beforeEach(async () => {
  betMaxStakeByLeague.value = {};
  for (const t of ["teams", "season_calendar", "matches", "challenges", "club_links"]) await db.prepare(`DELETE FROM ${t}`).run();
  await db.batch([
    db.prepare("INSERT INTO teams VALUES ('a', 'Jitona Spůle', 'L1'), ('b', 'Greenwatt Čkyně', 'L1'), ('c', 'Klamovka', 'L2'), ('free', 'Bez soutěže', NULL)"),
    db.prepare("INSERT INTO season_calendar VALUES ('c1', 'L1', 3), ('c2', 'L2', 3)"),
  ]);
});

describe("strop sázky v přáteláku", () => {
  it("nejvýš strop běžné sázky, nikdy nad pevný strop přáteláku", () => {
    expect(friendlyStakeCap([5_000])).toBe(5_000);
    expect(friendlyStakeCap([20_000])).toBe(FRIENDLY_MAX_STAKE);
    expect(friendlyStakeCap([5_000, 2_000])).toBe(2_000);
    expect(friendlyStakeCap([])).toBe(FRIENDLY_MAX_STAKE);
  });

  it("zaokrouhluje dolů na krok sázky, pod krokem se o peníze nehraje", () => {
    expect(friendlyStakeCap([1_800])).toBe(1_500);
    expect(friendlyStakeCap([499])).toBe(0);
    expect(friendlyStakeCap([0])).toBe(0);
  });

  it("výchozí sazebník: 5 000 Kč, ne dřívějších 10 000", async () => {
    expect(await loadFriendlyStakeCap(db, ["a", "b"])).toBe(5_000);
    expect(await stakeCapError(db, ["a", "b"], 5_000)).toBeNull();
    expect(await stakeCapError(db, ["a", "b"], 5_500)).toBe("Podle pravidel soutěže se dá hrát nejvýš o 5 000 Kč.".replace(" 000", " 000"));
  });

  it("grémium strop zvedne nebo sníží a přátelák ho následuje", async () => {
    betMaxStakeByLeague.value = { L1: 8_000 };
    expect(await loadFriendlyStakeCap(db, ["a", "b"])).toBe(8_000);
    betMaxStakeByLeague.value = { L1: 500 };
    expect(await stakeCapError(db, ["a", "b"], 500)).toBeNull();
    expect(await stakeCapError(db, ["a", "b"], 1_000)).not.toBeNull();
  });

  it("kluby z různých soutěží: platí nižší strop", async () => {
    betMaxStakeByLeague.value = { L1: 8_000, L2: 3_000 };
    expect(await loadFriendlyStakeCap(db, ["a", "c"])).toBe(3_000);
    expect(await loadFriendlyStakeCap(db, ["a"])).toBe(8_000);
  });

  it("přátelák bez sázky projde vždycky", async () => {
    betMaxStakeByLeague.value = { L1: 0 };
    expect(await stakeCapError(db, ["a", "b"], 0)).toBeNull();
    expect(await stakeCapError(db, ["a", "b"], 500)).toBe("Podle pravidel soutěže se o peníze hrát nedá.");
  });
});

describe("přáteláky o peníze v knize komisaře", () => {
  it("ukáže složené, vyplacené i vrácené sázky klubů soutěže, nejnovější první", async () => {
    await db.batch([
      db.prepare("INSERT INTO matches VALUES ('m1', 'b', 'a', 1, 3, 'simulated'), ('m2', 'a', 'c', NULL, NULL, 'scheduled')"),
      db.prepare(
        `INSERT INTO challenges VALUES
           ('paid', 'a', 'b', 'played', 'm1', '2026-11-01T10:00:00Z', '2026-11-03', 5000, 'paid'),
           ('held', 'a', 'c', 'accepted', 'm2', '2026-11-05T10:00:00Z', '2026-11-12', 2000, 'held'),
           ('refunded', 'b', 'a', 'expired', NULL, '2026-10-20T10:00:00Z', '2026-10-22', 1000, 'refunded'),
           ('no-stake', 'a', 'b', 'played', NULL, '2026-11-06T10:00:00Z', '2026-11-07', 0, NULL),
           ('not-agreed', 'a', 'b', 'pending', NULL, '2026-11-08T10:00:00Z', '2026-11-13', 5000, NULL),
           ('elsewhere', 'c', 'free', 'played', NULL, '2026-11-08T10:00:00Z', '2026-11-09', 5000, 'paid')`,
      ),
    ]);
    const book = await friendlyStakeBook(db, "L1");
    expect(book.map((r) => r.challengeId)).toEqual(["held", "paid", "refunded"]);
    // Skóre z pohledu vyzyvatele: 'a' hrál venku a vyhrál 3:1.
    expect(book[1]).toMatchObject({
      challengerName: "Jitona Spůle", opponentName: "Greenwatt Čkyně", stake: 5000, status: "paid",
      challengerGoals: 3, opponentGoals: 1, date: "2026-11-03", linked: false,
    });
    expect(book[0]).toMatchObject({ status: "held", challengerGoals: null, opponentGoals: null });
  });

  it("označí dvojici klubů se stejným majitelem", async () => {
    await db.batch([
      db.prepare("INSERT INTO club_links (team_id, group_id) VALUES ('a', 'g1'), ('b', 'g1')"),
      db.prepare("INSERT INTO challenges VALUES ('x', 'a', 'b', 'played', NULL, '2026-11-01T10:00:00Z', '2026-11-03', 500, 'paid')"),
    ]);
    expect((await friendlyStakeBook(db, "L1"))[0].linked).toBe(true);
  });
});
