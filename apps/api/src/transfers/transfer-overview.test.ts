import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { Miniflare } from "miniflare";
import { loadTransferOverview } from "./transfer-overview";

let miniflare: Miniflare;
let db: D1Database;

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
  for (const t of ["player_contracts", "players", "departed_players", "teams", "seasons", "ai_negotiations", "transfer_offers"]) {
    await db.prepare(`DROP TABLE IF EXISTS ${t}`).run();
  }
  await db.prepare("CREATE TABLE seasons (id TEXT PRIMARY KEY, number INTEGER)").run();
  await db.prepare("CREATE TABLE teams (id TEXT PRIMARY KEY, name TEXT, primary_color TEXT, secondary_color TEXT, badge_primary_color TEXT, badge_secondary_color TEXT, badge_pattern TEXT, badge_initials TEXT, badge_symbol TEXT)").run();
  await db.prepare("CREATE TABLE players (id TEXT PRIMARY KEY, first_name TEXT, last_name TEXT, avatar TEXT)").run();
  await db.prepare("CREATE TABLE departed_players (id TEXT PRIMARY KEY, first_name TEXT, last_name TEXT, avatar TEXT)").run();
  await db.prepare(
    `CREATE TABLE player_contracts (id TEXT PRIMARY KEY, player_id TEXT, team_id TEXT, season_id TEXT, joined_at TEXT,
       left_at TEXT, join_type TEXT, leave_type TEXT, fee INTEGER DEFAULT 0, is_active INTEGER DEFAULT 1, created_at TEXT)`,
  ).run();
  await db.prepare("CREATE TABLE ai_negotiations (id TEXT PRIMARY KEY, player_id TEXT, club_name TEXT, status TEXT, resolved_at TEXT)").run();
  await db.prepare("CREATE TABLE transfer_offers (id TEXT PRIMARY KEY, player_id TEXT, from_team_id TEXT, status TEXT, offer_amount INTEGER, virtual_team_data TEXT, resolved_at TEXT)").run();
  await db.prepare("INSERT INTO seasons VALUES ('s1', 1), ('s2', 2)").run();
  await db.prepare("INSERT INTO teams VALUES ('A','Dvorce','#112233','#FFFFFF',NULL,NULL,'shield',NULL,NULL), ('B','Prachatice','#AA0000','#FFFFFF','#BB1111','#EEEEEE','stripes','PR','star')").run();
  await db.prepare(`INSERT INTO players VALUES ('p1','Jan','Novák','{"head":1,"hair":2,"eyes":3}'), ('p2','Petr','Svoboda',NULL)`).run();
  await db.prepare(`INSERT INTO departed_players VALUES ('p3','Karel','Černý','{"head":9,"hair":8,"eyes":7}')`).run();
});

const contract = (id: string, player: string, team: string, season: string, joined: string, join: string, extra: { left?: string; leave?: string; fee?: number; created: string }) =>
  db.prepare("INSERT INTO player_contracts (id, player_id, team_id, season_id, joined_at, left_at, join_type, leave_type, fee, is_active, created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)")
    .bind(id, player, team, season, joined, extra.left ?? null, join, extra.leave ?? null, extra.fee ?? 0, extra.left ? 0 : 1, extra.created).run();

describe("loadTransferOverview", () => {
  it("klub mimo hru: koupě od něj i prodej do něj ukazují jeho jméno (dřív „Volný hráč“ / nic)", async () => {
    // Koupě od klubu mimo hru přes skauta: předchozí smlouva ve hře není, jméno zná jednání.
    await contract("c1", "p1", "B", "s2", "2026-10-19", "transfer", { fee: 90000, created: "2026-10-19 05:10:00" });
    await db.prepare("INSERT INTO ai_negotiations VALUES ('n1', 'p1', 'FK Blatná', 'signed', '2026-10-19T05:10:00Z')").run();
    const buyer = (await loadTransferOverview(db, "B"))[0];
    expect(buyer).toMatchObject({ direction: "in", kind: "transfer", otherTeamId: null, otherTeamName: "FK Blatná", fee: 90000 });
    expect(buyer.otherTeamBadge?.initials).toBe("FB");

    // Prodej do klubu mimo hru: hráč zmizel ze hry, kupce a cenu zná přijatá nabídka.
    await contract("c2", "p3", "A", "s1", "2026-01-01", "generated", { left: "2026-10-18", leave: "transfer", created: "2026-01-01 10:00:00" });
    await db.prepare(`INSERT INTO transfer_offers VALUES ('o1', 'p3', 'virtual_ai', 'accepted', 93000, '{"name":"SV Grafenau"}', '2026-10-18T12:00:00Z')`).run();
    const seller = (await loadTransferOverview(db, "A"))[0];
    expect(seller).toMatchObject({ direction: "out", kind: "transfer", otherTeamId: null, otherTeamName: "SV Grafenau", fee: 93000 });
  });

  it("přestup vidí kupující jako příchod a prodávající jako odchod, s protistranou a cenou", async () => {
    await contract("c1", "p1", "A", "s1", "2026-01-01", "generated", { left: "2026-03-01", leave: "transfer", created: "2026-01-01 10:00:00" });
    await contract("c2", "p1", "B", "s1", "2026-03-01", "transfer", { fee: 12000, created: "2026-03-01 10:00:00" });

    const buyer = await loadTransferOverview(db, "B");
    expect(buyer).toHaveLength(1);
    expect(buyer[0]).toMatchObject({ direction: "in", kind: "transfer", playerId: "p1", playerName: "Jan Novák", otherTeamId: "A", otherTeamName: "Dvorce", fee: 12000, seasonNumber: 1 });

    const seller = await loadTransferOverview(db, "A");
    expect(seller).toHaveLength(1);
    expect(seller[0]).toMatchObject({ direction: "out", kind: "transfer", playerId: "p1", otherTeamId: "B", otherTeamName: "Prachatice", fee: 12000 });
  });

  it("sezóna odchodu je sezóna přestupu (kupujícího), ne sezóna, kdy kontrakt prodávajícího začal", async () => {
    await contract("c1", "p1", "A", "s1", "2026-01-01", "generated", { left: "2026-10-01", leave: "transfer", created: "2026-01-01 10:00:00" });
    await contract("c2", "p1", "B", "s2", "2026-10-01", "transfer", { fee: 500, created: "2026-10-01 10:00:00" });
    expect((await loadTransferOverview(db, "A"))[0].seasonNumber).toBe(2);
    expect((await loadTransferOverview(db, "B"))[0].seasonNumber).toBe(2);
  });

  it("příchozí hráč má avatar a protistrana znak klubu s barvami z odznaku (jinak z dresu)", async () => {
    await contract("c1", "p1", "A", "s1", "2026-01-01", "generated", { left: "2026-03-01", leave: "transfer", created: "2026-01-01 10:00:00" });
    await contract("c2", "p1", "B", "s1", "2026-03-01", "transfer", { fee: 100, created: "2026-03-01 10:00:00" });
    const buyer = (await loadTransferOverview(db, "B"))[0];
    expect(buyer.playerAvatar).toEqual({ head: 1, hair: 2, eyes: 3 });
    expect(buyer.otherTeamBadge).toEqual({ primary: "#112233", secondary: "#FFFFFF", pattern: "shield", initials: "D", symbol: null });
    const seller = (await loadTransferOverview(db, "A"))[0];
    expect(seller.otherTeamBadge).toEqual({ primary: "#BB1111", secondary: "#EEEEEE", pattern: "stripes", initials: "PR", symbol: "star" });
  });

  it("odešlý hráč bere avatar z archivu a hráč bez avataru ho nemá", async () => {
    await contract("c1", "p3", "A", "s1", "2026-01-01", "generated", { left: "2026-04-01", leave: "released", created: "2026-01-01 10:00:00" });
    await contract("c2", "p2", "A", "s1", "2026-02-01", "free_agent", { created: "2026-02-01 10:00:00" });
    const rows = await loadTransferOverview(db, "A");
    expect(rows.find((r) => r.playerId === "p3")?.playerAvatar).toEqual({ head: 9, hair: 8, eyes: 7 });
    expect(rows.find((r) => r.playerId === "p2")?.playerAvatar).toBeNull();
    expect(rows.find((r) => r.playerId === "p2")?.otherTeamBadge).toBeNull();
  });

  it("zakládající členové a odchovanci se mezi přestupy nepočítají", async () => {
    await contract("c1", "p1", "A", "s1", "2026-01-01", "generated", { created: "2026-01-01 10:00:00" });
    await contract("c2", "p2", "A", "s1", "2026-01-01", "youth", { created: "2026-01-02 10:00:00" });
    expect(await loadTransferOverview(db, "A")).toEqual([]);
  });

  it("volný hráč přišel bez protistrany, propuštěný odešel bez protistrany, odešlý hráč má jméno z archivu", async () => {
    await contract("c1", "p2", "A", "s1", "2026-02-01", "free_agent", { created: "2026-02-01 10:00:00" });
    await contract("c2", "p3", "A", "s1", "2026-01-01", "generated", { left: "2026-04-01", leave: "released", created: "2026-01-01 10:00:00" });

    const rows = await loadTransferOverview(db, "A");
    expect(rows.find((r) => r.playerId === "p2")).toMatchObject({ direction: "in", kind: "free_agent", otherTeamId: null, otherTeamName: null });
    expect(rows.find((r) => r.playerId === "p3")).toMatchObject({ direction: "out", kind: "released", otherTeamId: null, playerName: "Karel Černý", seasonNumber: null });
  });

  it("odchod se řadí podle data odchodu, ne podle vzniku kontraktu", async () => {
    await contract("c1", "p1", "A", "s1", "2026-01-01", "generated", { left: "2026-09-01", leave: "released", created: "2026-01-01 10:00:00" });
    await contract("c2", "p2", "A", "s1", "2026-05-01", "free_agent", { created: "2026-05-01 10:00:00" });
    const rows = await loadTransferOverview(db, "A");
    expect(rows.map((r) => r.playerId)).toEqual(["p1", "p2"]);
  });

  it("nejnovější nahoře a limit se dodrží", async () => {
    await contract("c1", "p1", "A", "s1", "2026-02-01", "free_agent", { created: "2026-02-01 10:00:00" });
    await contract("c2", "p2", "A", "s2", "2026-05-01", "free_agent", { created: "2026-05-01 10:00:00" });
    const rows = await loadTransferOverview(db, "A", 1);
    expect(rows).toHaveLength(1);
    expect(rows[0].playerId).toBe("p2");
  });
});
