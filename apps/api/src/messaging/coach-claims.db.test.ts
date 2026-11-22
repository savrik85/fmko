/**
 * Oznámení trenéra bez akce ve hře nad skutečnou D1 (Miniflare): poznámka pro trenéra
 * s odkazem, nejvýš jednou za tři dny, a co o tom ví hráč. Když trenér akci opravdu
 * udělá, poznámka nepřijde a hráč to bere jako fakt.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { Miniflare } from "miniflare";
import { claimPromptLines, loadCoachClaimMemory, noteUnbackedClaims } from "./coach-claims";

let miniflare: Miniflare;
let db: D1Database;
const now = new Date("2026-10-07T16:36:49Z");

beforeAll(async () => {
  miniflare = new Miniflare({ modules: true, script: "export default { fetch() { return new Response('ok'); } }", d1Databases: ["DB"] });
  db = await miniflare.getD1Database("DB");
  for (const sql of [
    "CREATE TABLE teams (id TEXT PRIMARY KEY, name TEXT, parent_team_id TEXT, captain_id TEXT)",
    "CREATE TABLE players (id TEXT PRIMARY KEY, team_id TEXT, first_name TEXT, last_name TEXT, status TEXT, loan_from_team_id TEXT)",
    "CREATE TABLE messages (id TEXT PRIMARY KEY, conversation_id TEXT, sender_type TEXT, sender_id TEXT, sender_name TEXT, body TEXT, metadata TEXT, sent_at TEXT, read INTEGER DEFAULT 0)",
    "CREATE TABLE transfer_listings (id TEXT PRIMARY KEY, player_id TEXT, status TEXT, deal_type TEXT, created_at TEXT)",
    `CREATE TABLE club_incidents (id TEXT PRIMARY KEY, team_id TEXT, category TEXT, status TEXT, resolution TEXT, resolution_data TEXT,
       police_result_on TEXT, culprit_player_id TEXT, culprit_revealed INTEGER DEFAULT 0, created_at TEXT)`,
    "CREATE TABLE season_calendar (id TEXT PRIMARY KEY, scheduled_at TEXT, status TEXT)",
    "CREATE TABLE lineups (id TEXT PRIMARY KEY, team_id TEXT, calendar_id TEXT, captain_id TEXT, is_auto INTEGER DEFAULT 0)",
    "CREATE TABLE coach_commitments (id TEXT PRIMARY KEY, player_id TEXT, kind TEXT, status TEXT, resolved_at TEXT)",
  ]) await db.prepare(sql).run();
}, 30_000);

afterAll(async () => { await miniflare.dispose(); });

beforeEach(async () => {
  for (const t of ["teams", "players", "messages", "transfer_listings", "club_incidents", "season_calendar", "lineups", "coach_commitments"]) {
    await db.prepare(`DELETE FROM ${t}`).run();
  }
  await db.batch([
    db.prepare("INSERT INTO teams VALUES ('club', 'FK Fezko Výškovice', NULL, 'p1'), ('club-u21', 'FK Fezko Výškovice U21', 'club', NULL)"),
    db.prepare("INSERT INTO players VALUES ('p1', 'club', 'Radek', 'Študlar', 'active', NULL)"),
  ]);
});

const notes = async () => (await db.prepare(
  "SELECT body, metadata, sent_at, read FROM messages WHERE conversation_id = 'c1' AND sender_type = 'system' ORDER BY sent_at, rowid",
).all<{ body: string; metadata: string; sent_at: string; read: number }>()).results;
const coachSays = async (text: string, at: Date = now) => {
  await db.prepare("INSERT INTO messages (id, conversation_id, sender_type, sender_id, body, sent_at) VALUES (?, 'c1', 'user', 'club', ?, ?)")
    .bind(crypto.randomUUID(), text, at.toISOString()).run();
  return noteUnbackedClaims(db, { teamId: "club", convId: "c1", playerId: "p1", text, now: at });
};

describe("poznámka pro trenéra", () => {
  it("prodej a plat bez akce ve hře: dvě poznámky pod zprávou, s odkazem na kartu hráče", async () => {
    const noted = await coachSays("Dobře. Dávám tě na seznam nepotřebných hráčů určených k prodeji a po sezoně tě připustíme. S platem nepočítej");
    expect(noted).toEqual(["transfer_list", "wage_cut"]);
    const [sale, wage] = await notes();
    expect(sale.body).toBe("ℹ️ Ve hře se zatím nic nezměnilo, Radek Študlar na přestupové listině není. Na trh ho dáš na jeho kartě.");
    expect(JSON.parse(sale.metadata)).toEqual({ type: "coach_claim_note", kind: "transfer_list", href: "/hrac/p1", label: "Otevřít kartu hráče" });
    // Pod zprávou trenéra a přečtená (je pro něj, nepočítá se do nepřečtených).
    expect(sale.sent_at).toBe(new Date(now.getTime() + 1000).toISOString());
    expect(sale.read).toBe(1);
    expect(wage.body).toContain("plat pořád stejný");
  });

  it("stejný druh pro stejného hráče nejvýš jednou za tři dny", async () => {
    await coachSays("Tak půjdeš z týmu");
    expect(await coachSays("Sbal se a vypadni.", new Date(now.getTime() + 3600_000))).toEqual([]);
    expect(await coachSays("Tady už si nezahraješ.", new Date(now.getTime() + 4 * 86400_000))).toEqual(["dismissal"]);
    expect((await notes()).map((n) => JSON.parse(n.metadata).kind)).toEqual(["dismissal", "dismissal"]);
  });

  it("akce provedená ve hře: žádná poznámka (hráč na listině, policie na incidentu)", async () => {
    await db.batch([
      db.prepare("INSERT INTO transfer_listings VALUES ('l1', 'p1', 'active', 'transfer', '2026-10-07')"),
      db.prepare("INSERT INTO club_incidents VALUES ('inc-1', 'club', 'kradez', 'policie', NULL, NULL, '2026-10-12', NULL, 0, '2026-10-01T10:00:00Z')"),
    ]);
    expect(await coachSays("Dávám tě na seznam nepotřebných hráčů určených k prodeji.")).toEqual([]);
    expect(await coachSays("Predal jsem to policii", new Date(now.getTime() + 60_000))).toEqual([]);
    expect(await notes()).toEqual([]);
  });

  it("policie u staršího incidentu neznamená, že řeší i ten otevřený", async () => {
    await db.batch([
      db.prepare("INSERT INTO club_incidents VALUES ('inc-old', 'club', 'kradez', 'uzavreny', 'vyreseno_policii', NULL, '2026-09-30', NULL, 0, '2026-09-20T10:00:00Z')"),
      db.prepare("INSERT INTO club_incidents VALUES ('inc-new', 'club', 'poskozeni', 'otevreny', NULL, NULL, NULL, NULL, 0, '2026-10-05T10:00:00Z')"),
    ]);
    expect(await coachSays("Predal jsem to policii")).toEqual(["police"]);
    expect(JSON.parse((await notes())[0].metadata)).toMatchObject({ href: "/incidenty?id=inc-new" });
  });

  it("policie: odkaz na otevřený incident, kde ji jde zavolat; bez incidentu jen poznámka", async () => {
    expect(await coachSays("Predal jsem to policii")).toEqual(["police"]);
    expect(JSON.parse((await notes())[0].metadata)).toMatchObject({ kind: "police", href: null });
    await db.prepare("DELETE FROM messages").run();
    await db.prepare("INSERT INTO club_incidents VALUES ('inc-2', 'club', 'kradez', 'otevreny', NULL, NULL, NULL, NULL, 0, '2026-10-05T10:00:00Z')").run();
    await coachSays("Policii jsem to nahlásil, uvidíme co dál");
    expect(JSON.parse((await notes())[0].metadata)).toMatchObject({ kind: "police", href: "/incidenty?id=inc-2", label: "Otevřít incident" });
  });

  it("páska: kapitán klubu bez sestavy dostane poznámku; v uložené sestavě s jiným kapitánem ne", async () => {
    expect(await coachSays("Beru ti pásku magore!")).toEqual(["captaincy"]);
    expect(JSON.parse((await notes())[0].metadata)).toMatchObject({ href: "/zapas", label: "Otevřít sestavu" });
    await db.prepare("DELETE FROM messages").run();
    const next = new Date(now.getTime() + 86400_000).toISOString();
    await db.batch([
      db.prepare("INSERT INTO season_calendar VALUES ('cal-1', ?, 'scheduled')").bind(next),
      db.prepare("INSERT INTO lineups VALUES ('lu-1', 'club', 'cal-1', 'p2', 0)"),
    ]);
    expect(await coachSays("Beru ti pásku magore!")).toEqual([]);
  });

  it("výhrůžka, nestavění a běžná zpráva poznámku nedostanou", async () => {
    expect(await coachSays("Ještě jednou a letíš z týmu.")).toEqual([]);
    expect(await coachSays("Já tě nebudu stavět.")).toEqual([]);
    expect(await coachSays("Ahoj, jak noha?")).toEqual([]);
    expect(await notes()).toEqual([]);
  });
});

describe("co o tom ví hráč", () => {
  it("vyhazov, který se nestal, je výhrůžka; zpráva starší než týden už ne", async () => {
    await coachSays("Tak půjdeš z týmu", new Date(Date.now() - 3600_000));
    await coachSays("Vrať poháry, sbal se a vypadni.", new Date(Date.now() - 9 * 86400_000));
    const claims = await loadCoachClaimMemory(db, { clubTeamId: "club", playerId: "p1", convId: "c1" });
    expect(claims).toEqual([expect.objectContaining({ kind: "dismissal", quote: "Tak půjdeš z týmu", holds: false })]);
    expect(claimPromptLines(claims)[0]).toContain("pořád jsi v kádru a hraješ za klub");
  });

  it("trenér pak hráče opravdu dá na listinu: další odpověď už to má jako fakt (řádek o trhu)", async () => {
    await coachSays("Dávám tě na seznam nepotřebných hráčů určených k prodeji.", new Date(Date.now() - 3600_000));
    const before = await loadCoachClaimMemory(db, { clubTeamId: "club", playerId: "p1", convId: "c1" });
    expect(before).toEqual([expect.objectContaining({ kind: "transfer_list", holds: false })]);
    await db.prepare("INSERT INTO transfer_listings VALUES ('l2', 'p1', 'active', 'transfer', '2026-10-08')").run();
    const after = await loadCoachClaimMemory(db, { clubTeamId: "club", playerId: "p1", convId: "c1" });
    expect(after).toEqual([expect.objectContaining({ kind: "transfer_list", holds: true })]);
    expect(claimPromptLines(after)).toEqual([]);
  });

  it("hráč z U21 klubu i hráč půjčený jinam patří klubu", async () => {
    await db.prepare("UPDATE players SET team_id = 'club-u21' WHERE id = 'p1'").run();
    await coachSays("Tak půjdeš z týmu", new Date(Date.now() - 3600_000));
    expect((await loadCoachClaimMemory(db, { clubTeamId: "club", playerId: "p1", convId: "c1" }))[0].holds).toBe(false);
    await db.batch([
      db.prepare("INSERT INTO teams VALUES ('other', 'SK Lhota', NULL, NULL)"),
      db.prepare("UPDATE players SET team_id = 'other', loan_from_team_id = 'club' WHERE id = 'p1'"),
    ]);
    expect((await loadCoachClaimMemory(db, { clubTeamId: "club", playerId: "p1", convId: "c1" }))[0].holds).toBe(false);
  });
});
