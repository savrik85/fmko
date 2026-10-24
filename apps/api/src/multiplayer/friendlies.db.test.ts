/**
 * Přáteláky s podmínkami: den, místo, náklady, sázka, kolize v rozpisu a bilance.
 * Běží nad skutečnou SQLite se skutečnými migracemi výzev a nabídek.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { Miniflare } from "miniflare";
import {
  FRIENDLY_MAX_STAKE, addDays, busyText, computeCosts, dateError, earliestDay, expireStaleFriendlies, findBusy,
  linkedTermsError, loadHeadToHead, offerToChallengeTerms, openDueFriendlies, parseTerms, pickNeutralVillage,
  loadClubGeo, refundStake, settleStake, travelCost, currentStreak, loadFriendlyTable, holdStakes,
} from "./friendlies";

let mf: Miniflare;
let db: D1Database;

async function runSql(sql: string) {
  for (const stmt of sql.replace(/--.*$/gm, "").split(";").map((s) => s.trim()).filter(Boolean)) {
    await db.prepare(stmt).run();
  }
}
const migration = (file: string) => readFileSync(resolve(__dirname, `../../migrations/${file}`), "utf8");

const TODAY = "2026-10-24";

beforeAll(async () => {
  mf = new Miniflare({
    modules: true,
    script: "export default { fetch() { return new Response('ok'); } }",
    d1Databases: ["DB"],
  });
  db = await mf.getD1Database("DB");
  await runSql(`
    CREATE TABLE villages (id TEXT PRIMARY KEY, name TEXT, lat REAL, lng REAL, district TEXT);
    CREATE TABLE teams (id TEXT PRIMARY KEY, name TEXT, user_id TEXT, parent_team_id TEXT, team_type TEXT, village_id TEXT, budget INTEGER DEFAULT 0, game_date TEXT,
      primary_color TEXT, secondary_color TEXT, badge_primary_color TEXT, badge_secondary_color TEXT, badge_pattern TEXT, badge_initials TEXT, badge_symbol TEXT);
    CREATE TABLE seasons (id TEXT PRIMARY KEY, number INTEGER, status TEXT);
    CREATE TABLE season_calendar (id TEXT PRIMARY KEY, league_id TEXT, season_number INTEGER, scheduled_at TEXT, status TEXT);
    CREATE TABLE matches (id TEXT PRIMARY KEY, league_id TEXT, calendar_id TEXT, home_team_id TEXT, away_team_id TEXT,
      home_score INTEGER, away_score INTEGER, status TEXT NOT NULL DEFAULT 'scheduled', created_at TEXT, simulated_at TEXT);
    CREATE TABLE cup_teams (id TEXT PRIMARY KEY, cup_id TEXT, team_id TEXT, name TEXT);
    CREATE TABLE cup_matches (id TEXT PRIMARY KEY, cup_id TEXT, home_cup_team_id TEXT, away_cup_team_id TEXT, scheduled_at TEXT, status TEXT);
    CREATE TABLE tournament_matches (id TEXT PRIMARY KEY, home_team_id TEXT, away_team_id TEXT, scheduled_at TEXT, status TEXT);
    CREATE TABLE transactions (id TEXT PRIMARY KEY, team_id TEXT, type TEXT, amount INTEGER, balance_after INTEGER,
      description TEXT, reference_id TEXT, game_date TEXT);
    CREATE TABLE challenges (
      id TEXT PRIMARY KEY, challenger_team_id TEXT NOT NULL, challenged_team_id TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','accepted','declined','expired','played')),
      match_id TEXT, message TEXT, created_at TEXT NOT NULL DEFAULT (datetime('now')), expires_at TEXT NOT NULL
    );
  `);
  await runSql(migration("0273_club_links.sql"));
  await runSql(migration("0274_friendlies.sql"));
});

beforeEach(async () => {
  await runSql(`
    DELETE FROM villages; DELETE FROM teams; DELETE FROM seasons; DELETE FROM season_calendar; DELETE FROM matches;
    DELETE FROM cup_teams; DELETE FROM cup_matches; DELETE FROM tournament_matches; DELETE FROM transactions;
    DELETE FROM challenges; DELETE FROM friendly_offers; DELETE FROM club_links;
    INSERT INTO villages VALUES ('v-spule', 'Spůle', 49.02, 14.01, 'Prachatice'), ('v-ckyne', 'Čkyně', 49.11, 13.83, 'Prachatice'),
      ('v-praha', 'Praha', 50.08, 14.43, 'Praha'), ('v-pisek', 'Písek', 49.31, 14.15, 'Písek'), ('v-tabor', 'Tábor', 49.41, 14.68, 'Tábor');
    INSERT INTO teams (id, name, user_id, parent_team_id, team_type, village_id, budget, game_date, primary_color, badge_initials) VALUES
      ('a', 'Jitona Spůle', 'u1', NULL, 'senior', 'v-spule', 50000, '${TODAY}T16:00:00.000Z', '#9F1239', NULL),
      ('b', 'Greenwatt Čkyně', 'u2', NULL, 'senior', 'v-ckyne', 50000, '${TODAY}T16:00:00.000Z', '#1D4ED8', 'GW'),
      ('c', 'Klamovka', 'u3', NULL, 'senior', 'v-praha', 50000, '${TODAY}T16:00:00.000Z', NULL, NULL);
    INSERT INTO seasons VALUES ('s4', 4, 'active');
  `);
});

afterAll(async () => {
  await mf.dispose();
});

describe("den zápasu", () => {
  it("dnes jen do 18:00, nejdál 14 dní dopředu, minulost ne", () => {
    expect(dateError(TODAY, TODAY, 17)).toBeNull();
    expect(dateError(TODAY, TODAY, 18)).toContain("Dnešní");
    expect(dateError(TODAY, TODAY, null)).toContain("Dnešní");
    expect(dateError("2026-10-23", TODAY, 10)).toContain("pryč");
    expect(dateError(addDays(TODAY, 14), TODAY, 10)).toBeNull();
    expect(dateError(addDays(TODAY, 15), TODAY, 10)).toContain("14 dní");
    expect(dateError("26. 10.", TODAY, 10)).toContain("Vyber den");
  });

  it("nejbližší den je dnes před zápasy, jinak zítra", () => {
    expect(earliestDay(TODAY, 12)).toBe(TODAY);
    expect(earliestDay(TODAY, 19)).toBe("2026-10-25");
  });
});

describe("podmínky výzvy", () => {
  it("sázka po 500 Kč do stropu, vzkaz do 200 znaků, známé místo a plátce", () => {
    expect(parseTerms({ stake: 750 }, TODAY)).toMatchObject({ ok: false });
    expect(parseTerms({ stake: FRIENDLY_MAX_STAKE + 500 }, TODAY)).toMatchObject({ ok: false });
    expect(parseTerms({ stake: -500 }, TODAY)).toMatchObject({ ok: false });
    expect(parseTerms({ message: "x".repeat(201) }, TODAY)).toMatchObject({ ok: false });
    expect(parseTerms({ venue: "hospoda" }, TODAY)).toMatchObject({ ok: false });
    expect(parseTerms({ costPayer: "opponent" }, TODAY)).toMatchObject({ ok: false });
    expect(parseTerms({ date: "2026-10-30", venue: "neutral", costPayer: "challenger", stake: 2000, message: "  Přijďte!  " }, TODAY))
      .toEqual({ ok: true, terms: { date: "2026-10-30", venue: "neutral", costPayer: "challenger", stake: 2000, message: "Přijďte!" } });
  });

  it("starý klient bez dne dostane nejbližší den a výchozí podmínky", () => {
    expect(parseTerms({}, "2026-10-25")).toEqual({ ok: true, terms: { date: "2026-10-25", venue: "challenger", costPayer: "each", stake: 0, message: null } });
  });

  it("nabídka termínu se z pohledu toho, kdo ji vypsal, převede na výzvu", () => {
    expect(offerToChallengeTerms({ venue: "poster", cost_payer: "each" })).toEqual({ venue: "challenger", costPayer: "each" });
    expect(offerToChallengeTerms({ venue: "taker", cost_payer: "poster" })).toEqual({ venue: "opponent", costPayer: "challenger" });
    expect(offerToChallengeTerms({ venue: "neutral", cost_payer: "each" })).toEqual({ venue: "neutral", costPayer: "each" });
  });
});

describe("náklady", () => {
  it("cestovné roste se vzdáleností a zaokrouhluje se na desetikoruny", () => {
    expect(travelCost(0)).toBe(200);
    expect(travelCost(14.6)).toBe(320);
    expect(travelCost(125)).toBe(1200);
  });

  it("u vyzyvatele platí rozhodčího on, soupeř cestovné", () => {
    expect(computeCosts({ venue: "challenger", costPayer: "each", distanceKm: 20 })).toEqual({
      challenger: [{ label: "Rozhodčí", amount: 800 }],
      opponent: [{ label: "Cestovné", amount: 360 }],
    });
  });

  it("u soupeře je to naopak", () => {
    expect(computeCosts({ venue: "opponent", costPayer: "each", distanceKm: 20 })).toEqual({
      challenger: [{ label: "Cestovné", amount: 360 }],
      opponent: [{ label: "Rozhodčí", amount: 800 }],
    });
  });

  it("na neutrálu se rozhodčí a pronájem dělí a každý jede na své", () => {
    const costs = computeCosts({ venue: "neutral", costPayer: "each", distanceKm: 100, neutralKm: { challenger: 40, opponent: 60 } });
    expect(costs.challenger).toEqual([
      { label: "Rozhodčí (napůl)", amount: 400 }, { label: "Pronájem hřiště (napůl)", amount: 750 }, { label: "Cestovné", amount: 520 },
    ]);
    expect(costs.opponent.at(-1)).toEqual({ label: "Cestovné", amount: 680 });
  });

  it("kdo platí za oba, převezme i soupeřovy položky", () => {
    const costs = computeCosts({ venue: "challenger", costPayer: "challenger", distanceKm: 20 });
    expect(costs.opponent).toEqual([]);
    expect(costs.challenger).toEqual([{ label: "Rozhodčí", amount: 800 }, { label: "Cestovné za soupeře", amount: 360 }]);
  });

  it("neutrální hřiště je obec nejblíž půli cesty, ne vesnice jednoho z klubů", async () => {
    const geo = await loadClubGeo(db, ["a", "c"]);
    const village = await pickNeutralVillage(db, geo.get("a")!, geo.get("c")!);
    // Půle cesty Spůle–Praha je u Písku; Tábor je dál na východ.
    expect(village?.name).toBe("Písek");
  });
});

describe("kolize v rozpisu", () => {
  it("ligový zápas ten den", async () => {
    await runSql(`
      INSERT INTO season_calendar VALUES ('cal', 'L', 4, '2026-10-26T17:00:00.000Z', 'scheduled');
      INSERT INTO matches (id, calendar_id, league_id, home_team_id, away_team_id, created_at) VALUES ('lm', 'cal', 'L', 'a', 'b', '${TODAY}');
    `);
    const busy = await findBusy(db, "a", "2026-10-26");
    expect(busy).toMatchObject({ kind: "league", opponent: "Greenwatt Čkyně" });
    expect(busyText(busy!, true)).toBe("Ten den hraješ ligu s Greenwatt Čkyně.");
    expect(busyText(busy!, false)).toBe("Soupeř ten den hraje ligu.");
    expect(await findBusy(db, "a", "2026-10-27")).toBeNull();
  });

  it("liga z minulé sezóny nevadí", async () => {
    await runSql(`
      INSERT INTO season_calendar VALUES ('old', 'L', 3, '2026-10-26T17:00:00.000Z', 'simulated');
      INSERT INTO matches (id, calendar_id, league_id, home_team_id, away_team_id) VALUES ('om', 'old', 'L', 'a', 'b');
    `);
    expect(await findBusy(db, "a", "2026-10-26")).toBeNull();
  });

  it("pohár a turnaj", async () => {
    await runSql(`
      INSERT INTO cup_teams VALUES ('ct-a', 'cup', 'a', 'Jitona Spůle'), ('ct-x', 'cup', NULL, 'Sokol Lhenice');
      INSERT INTO cup_matches VALUES ('cm', 'cup', 'ct-x', 'ct-a', '2026-11-14T16:00:00.000Z', 'scheduled');
      INSERT INTO tournament_matches VALUES ('tm', 'b', 'c', '2026-10-28T16:00:00.000Z', 'scheduled');
    `);
    expect(await findBusy(db, "a", "2026-11-14")).toMatchObject({ kind: "cup", opponent: "Sokol Lhenice" });
    expect(await findBusy(db, "c", "2026-10-28")).toMatchObject({ kind: "tournament", opponent: "Greenwatt Čkyně" });
  });

  it("přátelák ten den a odstup tří dní, vlastní zápas se dá vynechat", async () => {
    await runSql(`INSERT INTO matches (id, home_team_id, away_team_id, status, created_at) VALUES ('fm', 'a', 'c', 'scheduled', '2026-10-28T16:00:00.000Z')`);
    expect(await findBusy(db, "a", "2026-10-28")).toMatchObject({ kind: "friendly", opponent: "Klamovka" });
    const rest = await findBusy(db, "a", "2026-10-30");
    expect(rest).toMatchObject({ kind: "rest", date: "2026-10-28" });
    expect(busyText(rest!, true)).toBe("Mezi přáteláky musí být aspoň 3 dny, 28. 10. máš přátelák s Klamovka.");
    expect(await findBusy(db, "a", "2026-10-31")).toBeNull();
    expect(await findBusy(db, "a", "2026-10-28", { ignoreMatchId: "fm" })).toBeNull();
    expect(await findBusy(db, "a", "2026-10-28", { competitiveOnly: true })).toBeNull();
  });
});

describe("kluby se stejným majitelem", () => {
  it("smí hrát jen bez sázky a každý za své", async () => {
    await runSql("INSERT INTO club_links (team_id, group_id) VALUES ('a', 'g'), ('c', 'g')");
    expect(await linkedTermsError(db, "a", "c", { stake: 0, costPayer: "each" })).toBeNull();
    expect(await linkedTermsError(db, "a", "c", { stake: 500, costPayer: "each" })).toContain("stejného majitele");
    expect(await linkedTermsError(db, "a", "c", { stake: 0, costPayer: "challenger" })).toContain("stejného majitele");
    expect(await linkedTermsError(db, "a", "b", { stake: 5000, costPayer: "challenger" })).toBeNull();
  });
});

describe("vypršení a otevření dne", () => {
  it("výzvy a nabídky s prošlým dnem vyprší, dnešní až po 18:00", async () => {
    await runSql(`
      INSERT INTO challenges (id, challenger_team_id, challenged_team_id, status, expires_at, match_date) VALUES
        ('yesterday', 'a', 'b', 'pending', 'x', '2026-10-23'), ('today', 'a', 'c', 'pending', 'x', '${TODAY}'),
        ('later', 'b', 'c', 'pending', 'x', '2026-10-27'), ('legacy-old', 'b', 'a', 'pending', '2026-05-28T20:00:00.000Z', NULL),
        ('legacy-new', 'c', 'a', 'pending', '2026-10-30T20:00:00.000Z', NULL);
      INSERT INTO friendly_offers (id, team_id, match_date) VALUES ('o-today', 'a', '${TODAY}'), ('o-later', 'b', '2026-10-27');
    `);
    expect(await expireStaleFriendlies(db, TODAY, 12)).toEqual({ challenges: 2, offers: 0 });
    expect(await expireStaleFriendlies(db, TODAY, 18)).toEqual({ challenges: 1, offers: 1 });
    const left = await db.prepare("SELECT id FROM challenges WHERE status = 'pending' ORDER BY id").all<{ id: string }>();
    expect(left.results.map((r) => r.id)).toEqual(["later", "legacy-new"]);
  });

  it("domluvený přátelák se otevře na sestavu až v den zápasu", async () => {
    await runSql(`
      INSERT INTO matches (id, home_team_id, away_team_id, status, created_at) VALUES
        ('m-today', 'a', 'b', 'scheduled', '${TODAY}T16:00:00.000Z'), ('m-later', 'a', 'c', 'scheduled', '2026-10-28T16:00:00.000Z');
      INSERT INTO challenges (id, challenger_team_id, challenged_team_id, status, expires_at, match_id, match_date) VALUES
        ('c1', 'a', 'b', 'accepted', 'x', 'm-today', '${TODAY}'), ('c2', 'a', 'c', 'accepted', 'x', 'm-later', '2026-10-28');
    `);
    expect(await openDueFriendlies(db, TODAY)).toBe(1);
    const rows = await db.prepare("SELECT id, status FROM matches ORDER BY id").all<{ id: string; status: string }>();
    expect(rows.results).toEqual([{ id: "m-later", status: "scheduled" }, { id: "m-today", status: "lineups_open" }]);
  });
});

describe("sázka", () => {
  const names = { challenger: "Jitona Spůle", opponent: "Greenwatt Čkyně" };
  const held = (id: string) => ({ id, challenger_team_id: "a", challenged_team_id: "b", stake: 2000, stake_status: "held" });
  const budgets = async () => Object.fromEntries((await db.prepare("SELECT id, budget FROM teams WHERE id IN ('a', 'b')").all<{ id: string; budget: number }>()).results.map((r) => [r.id, r.budget]));
  const insertHeld = (id: string) => runSql(`INSERT INTO challenges (id, challenger_team_id, challenged_team_id, status, expires_at, stake, stake_status) VALUES ('${id}', 'a', 'b', 'accepted', 'x', 2000, 'held')`);

  const insertAccepted = (id: string) => runSql(`INSERT INTO challenges (id, challenger_team_id, challenged_team_id, status, expires_at, stake) VALUES ('${id}', 'a', 'b', 'accepted', 'x', 2000)`);
  const pending = (id: string) => ({ id, challengerId: "a", opponentId: "b", stake: 2000 });
  const stakeStatus = async (id: string) => (await db.prepare("SELECT stake_status FROM challenges WHERE id = ?").bind(id).first<{ stake_status: string | null }>())?.stake_status;

  it("složení strhne sázku oběma naráz a označí ji jako složenou", async () => {
    await insertAccepted("h");
    expect(await holdStakes(db, pending("h"), TODAY, names)).toBe(true);
    expect(await budgets()).toEqual({ a: 48000, b: 48000 });
    expect(await stakeStatus("h")).toBe("held");
    const tx = await db.prepare("SELECT team_id, type, amount, balance_after, reference_id FROM transactions ORDER BY team_id").all();
    expect(tx.results).toEqual([
      { team_id: "a", type: "friendly_stake", amount: -2000, balance_after: 48000, reference_id: "h" },
      { team_id: "b", type: "friendly_stake", amount: -2000, balance_after: 48000, reference_id: "h" },
    ]);
  });

  it("když jeden z klubů mezitím na sázku nemá, nestrhne se nikomu nic", async () => {
    await insertAccepted("p");
    await runSql("UPDATE teams SET budget = 1500 WHERE id = 'b'");
    expect(await holdStakes(db, pending("p"), TODAY, names)).toBe(false);
    expect(await budgets()).toEqual({ a: 50000, b: 1500 });
    expect(await stakeStatus("p")).toBeNull();
    expect((await db.prepare("SELECT COUNT(*) AS n FROM transactions").first<{ n: number }>())?.n).toBe(0);
  });

  it("složenou sázku podruhé složit nejde", async () => {
    await insertAccepted("twice");
    await holdStakes(db, pending("twice"), TODAY, names);
    expect(await holdStakes(db, pending("twice"), TODAY, names)).toBe(false);
    expect(await budgets()).toEqual({ a: 48000, b: 48000 });
  });

  it("vítěz bere obě sázky a jen jednou", async () => {
    await insertHeld("w");
    await settleStake(db, held("w"), "opponent", names, TODAY);
    await settleStake(db, held("w"), "opponent", names, TODAY);
    expect(await budgets()).toEqual({ a: 50000, b: 54000 });
    const tx = await db.prepare("SELECT team_id, type, amount, description FROM transactions").all();
    expect(tx.results).toEqual([{ team_id: "b", type: "friendly_stake_payout", amount: 4000, description: "Výhra v přáteláku o peníze s Jitona Spůle" }]);
  });

  it("remíza vrátí sázku oběma", async () => {
    await insertHeld("d");
    await settleStake(db, held("d"), null, names, TODAY);
    expect(await budgets()).toEqual({ a: 52000, b: 52000 });
  });

  it("zrušený přátelák vrátí sázku a vyplatit už ji nejde", async () => {
    await insertHeld("r");
    await refundStake(db, held("r"), names, TODAY);
    await settleStake(db, held("r"), "challenger", names, TODAY);
    expect(await budgets()).toEqual({ a: 52000, b: 52000 });
    const st = await db.prepare("SELECT stake_status FROM challenges WHERE id = 'r'").first<{ stake_status: string }>();
    expect(st?.stake_status).toBe("refunded");
  });

  it("bez složené sázky se nevyplácí nic", async () => {
    await settleStake(db, { ...held("none"), stake_status: null }, "challenger", names, TODAY);
    await settleStake(db, { ...held("zero"), stake: 0 }, "challenger", names, TODAY);
    expect(await budgets()).toEqual({ a: 50000, b: 50000 });
  });
});

describe("bilance se soupeři", () => {
  it("sečte zápasy, skóre i sázky z pohledu klubu", async () => {
    await runSql(`
      INSERT INTO matches (id, home_team_id, away_team_id, home_score, away_score, status, created_at) VALUES
        ('p1', 'a', 'b', 3, 1, 'simulated', '2026-10-01T16:00:00.000Z'),
        ('p2', 'b', 'a', 2, 2, 'simulated', '2026-10-05T16:00:00.000Z'),
        ('p3', 'b', 'a', 1, 0, 'simulated', '2026-10-10T16:00:00.000Z'),
        ('p4', 'a', 'c', 4, 0, 'simulated', '2026-10-12T16:00:00.000Z');
      INSERT INTO challenges (id, challenger_team_id, challenged_team_id, status, expires_at, match_id, match_date, stake, stake_status) VALUES
        ('h1', 'a', 'b', 'played', 'x', 'p1', '2026-10-01', 1000, 'paid'),
        ('h2', 'b', 'a', 'played', 'x', 'p2', '2026-10-05', 1000, 'paid'),
        ('h3', 'b', 'a', 'played', 'x', 'p3', NULL, 0, NULL),
        ('h4', 'c', 'a', 'played', 'x', 'p4', '2026-10-12', 3000, 'paid');
    `);
    const rec = await loadHeadToHead(db, "a");
    expect(rec.overall).toEqual({ played: 4, won: 2, drawn: 1, lost: 1, goalsFor: 9, goalsAgainst: 4, stakeNet: 4000 });
    expect(rec.opponents[0]).toMatchObject({ teamId: "b", played: 3, won: 1, drawn: 1, lost: 1, goalsFor: 5, goalsAgainst: 4, stakeNet: 1000, lastScore: "0:1" });
    expect(rec.opponents[1]).toMatchObject({ teamId: "c", played: 1, won: 1, stakeNet: 3000, lastScore: "4:0" });
    const other = await loadHeadToHead(db, "b");
    expect(other.overall).toMatchObject({ played: 3, won: 1, drawn: 1, lost: 1, stakeNet: -1000 });

    // Forma od nejstaršího, série od posledního zápasu, nejvyšší výhra a erb soupeře.
    expect(rec.form).toEqual(["W", "D", "L", "W"]);
    expect(rec.streak).toEqual({ kind: "W", length: 1 });
    expect(rec.unbeaten).toBe(1);
    expect(rec.biggestWin).toMatchObject({ teamId: "c", goalsFor: 4, goalsAgainst: 0, opponent: "Klamovka" });
    expect(rec.opponents[0]).toMatchObject({ name: "Greenwatt Čkyně", lastResult: "L", streak: { kind: "L", length: 1 } });
    expect(rec.opponents[0].crest).toMatchObject({ primary: "#1D4ED8", initials: "GW", pattern: "shield" });
    // Bez vlastních barev erbu: zelená a iniciály z názvu.
    expect(rec.opponents[1].crest).toMatchObject({ primary: "#2D5F2D", initials: "K" });
  });

  it("série počítá stejné výsledky od posledního zápasu", () => {
    expect(currentStreak([])).toBeNull();
    expect(currentStreak(["L", "L", "W"])).toEqual({ kind: "L", length: 2 });
    expect(currentStreak(["W", "W", "W"])).toEqual({ kind: "W", length: 3 });
  });

  it("žebříček sezóny: body 3/1/0, pak rozdíl skóre; staré zápasy se nepočítají", async () => {
    await runSql(`
      INSERT INTO matches (id, home_team_id, away_team_id, home_score, away_score, status, created_at) VALUES
        ('t1', 'a', 'b', 2, 0, 'simulated', '2026-10-01T16:00:00.000Z'),
        ('t2', 'c', 'b', 1, 1, 'simulated', '2026-10-05T16:00:00.000Z'),
        ('t3', 'c', 'a', 5, 0, 'simulated', '2026-10-06T16:00:00.000Z'),
        ('old', 'b', 'a', 9, 0, 'simulated', '2026-05-01T16:00:00.000Z');
      INSERT INTO challenges (id, challenger_team_id, challenged_team_id, status, expires_at, match_id, match_date) VALUES
        ('x1', 'a', 'b', 'played', 'x', 't1', '2026-10-01'), ('x2', 'c', 'b', 'played', 'x', 't2', '2026-10-05'),
        ('x3', 'c', 'a', 'played', 'x', 't3', '2026-10-06'), ('x4', 'b', 'a', 'played', 'x', 'old', '2026-05-01');
    `);
    const table = await loadFriendlyTable(db, "2026-09-01");
    expect(table.map((r) => [r.pos, r.teamId, r.points, r.goalsFor - r.goalsAgainst])).toEqual([
      [1, "c", 4, 5], [2, "a", 3, -3], [3, "b", 1, -2],
    ]);
    expect(table[0]).toMatchObject({ name: "Klamovka", won: 1, drawn: 1, lost: 0 });
  });
});
