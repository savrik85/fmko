import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Miniflare } from "miniflare";
import { loadScandals } from "./press-scandals";

/**
 * Nové zdroje kauz: nespokojený hráč, sponzoři a ostuda v poháru. Jen věty z dat,
 * ostatní zdroje (hospoda, pokuty…) tu tabulky nemají a tiše nic nevrátí.
 */
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
    "CREATE TABLE teams (id TEXT PRIMARY KEY, name TEXT, league_id TEXT, game_date TEXT, budget INTEGER)",
    "CREATE TABLE players (id TEXT PRIMARY KEY, team_id TEXT, first_name TEXT, last_name TEXT, status TEXT, life_context TEXT)",
    "CREATE TABLE club_events (id TEXT PRIMARY KEY, team_id TEXT, kind TEXT, payload TEXT, game_date TEXT, created_at TEXT)",
    "CREATE TABLE news (id TEXT PRIMARY KEY, league_id TEXT, type TEXT, headline TEXT, created_at TEXT)",
    "CREATE TABLE sponsor_contracts (id TEXT PRIMARY KEY, sponsor_name TEXT)",
    "CREATE TABLE sponsor_promises (id TEXT PRIMARY KEY, team_id TEXT, contract_id TEXT, kind TEXT, params TEXT, status TEXT, penalty INTEGER, resolved_at TEXT)",
    "CREATE TABLE cup_competitions (id TEXT PRIMARY KEY, total_rounds INTEGER)",
    "CREATE TABLE cup_teams (id TEXT PRIMARY KEY, cup_id TEXT, team_id TEXT, name TEXT)",
    `CREATE TABLE cup_matches (id TEXT PRIMARY KEY, cup_id TEXT, round INTEGER, home_cup_team_id TEXT, away_cup_team_id TEXT,
      home_score INTEGER, away_score INTEGER, home_pens INTEGER, away_pens INTEGER, winner_cup_team_id TEXT,
      status TEXT, upset INTEGER, scheduled_at TEXT)`,
    "INSERT INTO teams VALUES ('t1', 'FK Lékárna Lhota', 'l1', '2026-10-27T16:00:00Z', 50000), ('t2', 'SK Klid', 'l1', '2026-10-27T16:00:00Z', 50000)",
    `INSERT INTO players VALUES
      ('p1', 't1', 'Jan', 'Novák', 'active', '{"transferUnrest":{"level":75,"teamName":"FK Rohlík Břevnov","since":"2026-10-25T10:00:00Z"}}'),
      ('p2', 't1', 'Petr', 'Malý', 'active', '{"transferUnrest":{"level":20,"teamName":"SK Jinde"}}'),
      ('p3', 't2', 'Karel', 'Tichý', 'active', '{"transferUnrest":{"level":30}}')`,
    `INSERT INTO club_events VALUES
      ('e1', 't1', 'prejmenovani_klubu', '{"co":"Teď jsme FK Lékárna Lhota"}', '2026-10-20T16:00:00Z', '2026-10-20T16:00:00Z'),
      ('e2', 't1', 'prejmenovani_stadionu', '{"co":"Hřiště je teď Lékárna Arena"}', '2026-10-22T16:00:00Z', '2026-10-22T16:00:00Z'),
      ('e3', 't1', 'prejmenovani_stadionu', '{"co":"Staré je teď Dávná Arena"}', '2026-09-01T16:00:00Z', '2026-09-01T16:00:00Z')`,
    "INSERT INTO news VALUES ('n1', 'l1', 'rename', 'TJ Sokol Lhota mění název na FK Lékárna Lhota', '2026-10-20T16:00:00Z')",
    "INSERT INTO sponsor_contracts VALUES ('c1', 'Lékárna')",
    `INSERT INTO sponsor_promises VALUES
      ('s1', 't1', 'c1', 'attendance', '{"attendance":400}', 'broken', 12000, '2026-10-24T16:00:00Z'),
      ('s2', 't1', 'c1', 'attendance', '{"attendance":400}', 'fulfilled', 12000, '2026-10-24T16:00:00Z')`,
    "INSERT INTO cup_competitions VALUES ('cup', 6)",
    "INSERT INTO cup_teams VALUES ('ct1', 'cup', 't1', 'FK Lékárna Lhota'), ('ct2', 'cup', NULL, 'TJ Malá Ves'), ('ct3', 'cup', 't2', 'SK Klid')",
    `INSERT INTO cup_matches VALUES
      ('m1', 'cup', 1, 'ct1', 'ct2', 1, 1, 3, 5, 'ct2', 'simulated', 1, '2026-10-24T16:00:00Z'),
      ('m2', 'cup', 1, 'ct3', 'ct2', 0, 2, NULL, NULL, 'ct2', 'simulated', 0, '2026-10-24T16:00:00Z')`,
  ]) await db.prepare(sql).run();
});

afterAll(async () => {
  await miniflare.dispose();
});

describe("kauzy: nespokojený hráč, sponzoři, pohár", () => {
  it("naštvaný hráč, který chtěl jinam, je kauza s jeho jménem; tichá nespokojenost ne", async () => {
    const unrest = (await loadScandals(db, "t1")).filter((s) => s.kind === "unrest");
    expect(unrest).toHaveLength(1);
    expect(unrest[0].fact).toBe("Jan Novák chtěl přestoupit do týmu FK Rohlík Břevnov, klub ho nepustil a hráč je hodně naštvaný.");
    expect(unrest[0].names).toEqual(["Jan Novák"]);
    expect(unrest[0].ref).toBe("unrest:p1:2026-10-25");
    expect((await loadScandals(db, "t2")).some((s) => s.kind === "unrest")).toBe(false);
  });

  it("přejmenování klubu se starým jménem z novinky, stadion jen čerstvý, nesplněný slib s pokutou", async () => {
    const sponsor = (await loadScandals(db, "t1")).filter((s) => s.kind === "sponsor").map((s) => s.fact);
    expect(sponsor).toContain("Klub se nedávno přejmenoval podle hlavního sponzora: z TJ Sokol Lhota je teď FK Lékárna Lhota.");
    expect(sponsor).toContain("Stadion klubu nese nově jméno sponzora: Hřiště je teď Lékárna Arena.");
    expect(sponsor.some((f) => f.includes("Dávná Arena"))).toBe(false);
    expect(sponsor).toContain("Klub slíbil sponzorovi Lékárna průměrně aspoň 400 diváků doma a slib nesplnil, za porušení zaplatil 12 000 Kč.");
  });

  it("vyřazení slabším je kauza, obyčejná prohra v poháru ne", async () => {
    const cup = (await loadScandals(db, "t1")).filter((s) => s.kind === "cup");
    expect(cup).toHaveLength(1);
    expect(cup[0].fact).toBe("Klub vypadl z poháru (1. kolo) s výrazně slabším týmem TJ Malá Ves, prohrál 1:1 po penaltách 3:5.");
    expect((await loadScandals(db, "t2")).some((s) => s.kind === "cup")).toBe(false);
  });
});
