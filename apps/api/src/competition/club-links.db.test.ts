/**
 * Propojené kluby: víc účtů téhož člověka, propojení zapisuje admin ručně.
 * Běží nad skutečnou SQLite se skutečnou migrací, falešná D1 by nepoznala chybu v SQL.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Miniflare } from "miniflare";
import { areClubsLinked, linkedTeamIds, listLinkGroups, sameOwnerClubs, suspiciousPairs } from "./club-links";

let mf: Miniflare;
let db: D1Database;

beforeAll(async () => {
  mf = new Miniflare({
    modules: true,
    script: "export default { fetch() { return new Response('ok'); } }",
    d1Databases: ["DB"],
  });
  db = await mf.getD1Database("DB");
  const migration = readFileSync(resolve(__dirname, "../../migrations/0273_club_links.sql"), "utf8");
  for (const stmt of migration.split(";").map((s) => s.replace(/--.*$/gm, "").trim()).filter(Boolean)) {
    await db.prepare(stmt).run();
  }
  for (const sql of [
    "CREATE TABLE users (id TEXT PRIMARY KEY, email TEXT)",
    "CREATE TABLE villages (id TEXT PRIMARY KEY, district TEXT)",
    `CREATE TABLE teams (id TEXT PRIMARY KEY, name TEXT NOT NULL, user_id TEXT, parent_team_id TEXT,
       team_type TEXT, village_id TEXT)`,
    `CREATE TABLE challenges (id TEXT PRIMARY KEY, challenger_team_id TEXT, challenged_team_id TEXT, status TEXT,
       stake INTEGER NOT NULL DEFAULT 0, stake_status TEXT)`,
    `CREATE TABLE transfer_offers (id TEXT PRIMARY KEY, from_team_id TEXT, to_team_id TEXT, offer_type TEXT,
       status TEXT, offer_amount INTEGER, counter_amount INTEGER)`,
    "INSERT INTO users VALUES ('u-vys', 'vys@example.cz'), ('u-rez', 'rez@example.cz'), ('u-x', 'x@example.cz'), ('u-y', 'y@example.cz')",
    "INSERT INTO villages VALUES ('v-pt', 'Prachatice'), ('v-cb', 'České Budějovice')",
    `INSERT INTO teams (id, name, user_id, parent_team_id, team_type, village_id) VALUES
       ('vys', 'Výškovice', 'u-vys', NULL, 'senior', 'v-pt'),
       ('vys-u21', 'Výškovice U21', 'u-vys', 'vys', 'u21', 'v-pt'),
       ('rez', 'Řeznictví', 'u-rez', NULL, 'senior', 'v-cb'),
       ('rez-u21', 'Řeznictví U21', 'u-rez', 'rez', 'u21', 'v-cb'),
       ('x', 'Klub X', 'u-x', NULL, 'senior', 'v-pt'),
       ('y', 'Klub Y', 'u-y', NULL, 'senior', 'v-pt'),
       ('y2', 'Druhý klub Y', 'u-y', NULL, 'senior', 'v-pt'),
       ('ai1', 'AI klub', 'ai', NULL, 'senior', 'v-pt'),
       ('ai2', 'Jiný AI klub', 'ai', NULL, 'senior', 'v-pt')`,
    "INSERT INTO club_links (team_id, group_id, note) VALUES ('vys', 'g1', '13 přáteláků'), ('rez', 'g1', NULL)",
    `INSERT INTO challenges (id, challenger_team_id, challenged_team_id, status, stake, stake_status) VALUES
       ('c1', 'vys', 'rez', 'played', 0, NULL), ('c2', 'rez', 'vys', 'played', 1000, 'paid'),
       ('c3', 'vys', 'rez', 'played', 500, 'refunded'), ('c4', 'vys', 'rez', 'declined', 0, NULL), ('c5', 'x', 'y', 'played', 0, NULL)`,
    `INSERT INTO transfer_offers VALUES
       ('o1', 'rez-u21', 'vys', 'loan', 'accepted', 2000, NULL),
       ('o2', 'vys', 'rez', 'transfer', 'accepted', 500, 800),
       ('o3', 'x', 'y', 'transfer', 'rejected', 9000, NULL),
       ('o4', 'virtual_ai', 'x', 'transfer', 'accepted', 9000, NULL)`,
  ]) await db.prepare(sql).run();
});

afterAll(async () => {
  await mf.dispose();
});

describe("propojené kluby", () => {
  it("kluby ze stejné skupiny jsou propojené, i přes jejich U21", async () => {
    expect(await areClubsLinked(db, "vys", "rez")).toBe(true);
    expect(await areClubsLinked(db, "rez-u21", "vys")).toBe(true);
    expect(await areClubsLinked(db, "vys-u21", "rez-u21")).toBe(true);
  });

  it("A-tým a jeho U21 jsou jeden klub, ne propojené kluby", async () => {
    expect(await areClubsLinked(db, "vys", "vys-u21")).toBe(false);
  });

  it("dva A-týmy pod jedním účtem jsou propojené i bez zápisu", async () => {
    expect(await areClubsLinked(db, "y", "y2")).toBe(true);
  });

  it("cizí kluby, AI kluby a virtuální klub propojené nejsou", async () => {
    expect(await areClubsLinked(db, "vys", "x")).toBe(false);
    expect(await areClubsLinked(db, "ai1", "ai2")).toBe(false);
    expect(await areClubsLinked(db, "virtual_ai", "vys")).toBe(false);
    expect(await areClubsLinked(db, "vys", null)).toBe(false);
  });

  it("soupisky propojených klubů obsahují i U21, ale ne vlastní klub", async () => {
    expect([...await linkedTeamIds(db, "vys-u21")].sort()).toEqual(["rez", "rez-u21"]);
    expect([...await linkedTeamIds(db, "y")]).toEqual(["y2"]);
    expect((await linkedTeamIds(db, "x")).size).toBe(0);
  });

  it("profil ukáže jen A-týmy se stejným majitelem", async () => {
    expect(await sameOwnerClubs(db, "rez")).toEqual([{ id: "vys", name: "Výškovice" }]);
    expect(await sameOwnerClubs(db, "vys-u21")).toEqual([{ id: "rez", name: "Řeznictví" }]);
    expect(await sameOwnerClubs(db, "x")).toEqual([]);
  });

  it("přehled skupin drží poznámku admina", async () => {
    const groups = await listLinkGroups(db);
    expect(groups).toHaveLength(1);
    expect(new Set(groups[0].clubs.map((c) => c.name))).toEqual(new Set(["Výškovice", "Řeznictví"]));
    expect(groups[0].clubs.find((c) => c.teamId === "vys")?.note).toBe("13 přáteláků");
  });
});

describe("přehled podezřelých dvojic", () => {
  it("sečte přáteláky a přijaté obchody za kluby a seřadí je", async () => {
    const pairs = await suspiciousPairs(db);
    expect(pairs).toHaveLength(1);
    const [p] = pairs;
    expect(new Set([p.a.name, p.b.name])).toEqual(new Set(["Výškovice", "Řeznictví"]));
    // 2 000 + 800 z obchodů a 1 000 z vyplacené sázky; vrácená sázka se nepočítá.
    expect(p).toMatchObject({ friendlies: 3, transfers: 1, loans: 1, money: 3800, linked: true });
    expect([p.a.email, p.b.email].sort()).toEqual(["rez@example.cz", "vys@example.cz"]);
  });

  it("jeden přátelák bez obchodu se v přehledu neukáže", async () => {
    const pairs = await suspiciousPairs(db);
    expect(pairs.some((p) => p.a.teamId === "x" || p.b.teamId === "x")).toBe(false);
  });
});
