/**
 * Tipovačka v hospodě nad SQLite (Miniflare): body, dělení banku beze zbytku, tip po výkopu
 * odmítnut, vklad jen jednou (i při dvojkliku), dvojí vyhodnocení = jedna výplata a jedna SMS.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { Miniflare } from "miniflare";
import { loadTipView, saveTips, settlePubTips, splitTipPot, TipError, tipPoints } from "./tip-game";

let miniflare: Miniflare;
let db: D1Database;

const SCHEMA = [
  "CREATE TABLE seasons (number INTEGER, status TEXT)",
  "CREATE TABLE leagues (id TEXT PRIMARY KEY, name TEXT, district TEXT, league_type TEXT, waiting INTEGER DEFAULT 0)",
  "CREATE TABLE teams (id TEXT PRIMARY KEY, name TEXT, league_id TEXT, parent_team_id TEXT, user_id TEXT, budget INTEGER)",
  "CREATE TABLE season_calendar (id TEXT PRIMARY KEY, league_id TEXT, season_number INTEGER, scheduled_at TEXT, status TEXT)",
  "CREATE TABLE matches (id TEXT PRIMARY KEY, league_id TEXT, calendar_id TEXT, home_team_id TEXT, away_team_id TEXT, home_score INTEGER, away_score INTEGER, status TEXT)",
  "CREATE TABLE transactions (id TEXT PRIMARY KEY, team_id TEXT, type TEXT, amount INTEGER, balance_after INTEGER, description TEXT, reference_id TEXT, game_date TEXT)",
  "CREATE TABLE conversations (id TEXT PRIMARY KEY, team_id TEXT, type TEXT, title TEXT, pinned INTEGER, unread_count INTEGER DEFAULT 0, last_message_text TEXT, last_message_at TEXT, created_at TEXT)",
  "CREATE TABLE messages (id TEXT PRIMARY KEY, conversation_id TEXT, sender_type TEXT, sender_name TEXT, body TEXT, metadata TEXT, sent_at TEXT)",
];

beforeAll(async () => {
  miniflare = new Miniflare({ modules: true, script: "export default { fetch() { return new Response('ok'); } }", d1Databases: ["DB"] });
  db = await miniflare.getD1Database("DB");
  for (const sql of SCHEMA) await db.prepare(sql).run();
  const migration = readFileSync(join(__dirname, "../../migrations/0326_pub_tips.sql"), "utf8")
    .replace(/--.*$/gm, "").split(";").map((s) => s.trim()).filter(Boolean);
  for (const sql of migration) await db.prepare(sql).run();
  await db.batch([
    db.prepare("INSERT INTO seasons VALUES (3, 'active')"),
    db.prepare("INSERT INTO leagues VALUES ('l1', 'Přebor', 'Prachatice', 'senior', 0), ('l2', 'III. třída', 'Prachatice', 'senior', 0), ('lp', 'Praha', 'Praha', 'senior', 0)"),
    db.prepare(`INSERT INTO teams VALUES ('t1', 'Volary', 'l1', NULL, 'u1', 5000), ('t2', 'Lhenice', 'l1', NULL, 'u2', 5000),
      ('t3', 'Vimperk', 'l2', NULL, 'u3', 5000), ('t4', 'Netolice', 'l2', NULL, 'u4', 100), ('a1', 'AI Husinec', 'l1', NULL, 'ai', 9000),
      ('p1', 'Praha', 'lp', NULL, 'u9', 5000)`),
    // Kolo 24. 1. v 18:00 v Praze (17:00 UTC) v obou soutěžích, další kolo 28. 1.
    db.prepare("INSERT INTO season_calendar VALUES ('c1', 'l1', 3, '2027-01-24T17:00:00.000Z', 'scheduled'), ('c2', 'l2', 3, '2027-01-24T17:00:00.000Z', 'scheduled'), ('c3', 'l1', 3, '2027-01-28T17:00:00.000Z', 'scheduled'), ('cp', 'lp', 3, '2027-01-24T17:00:00.000Z', 'scheduled')"),
    db.prepare("INSERT INTO matches VALUES ('m1', 'l1', 'c1', 't1', 't2', NULL, NULL, 'scheduled'), ('m2', 'l2', 'c2', 't3', 't4', NULL, NULL, 'scheduled'), ('m3', 'l1', 'c3', 't2', 'a1', NULL, NULL, 'scheduled'), ('mp', 'lp', 'cp', 'p1', 'p1', NULL, NULL, 'scheduled')"),
  ]);
});

afterAll(async () => {
  await miniflare.dispose();
});

const morning = new Date("2027-01-24T08:00:00Z");

describe("tipovačka: počty", () => {
  it("3 body přesný výsledek, 1 tendence, 0 vedle", () => {
    expect(tipPoints({ home: 2, away: 1 }, { home: 2, away: 1 })).toBe(3);
    expect(tipPoints({ home: 3, away: 0 }, { home: 2, away: 1 })).toBe(1);
    expect(tipPoints({ home: 1, away: 1 }, { home: 0, away: 0 })).toBe(1);
    expect(tipPoints({ home: 0, away: 2 }, { home: 2, away: 1 })).toBe(0);
  });

  it("bank se rozdělí beze zbytku, zbytek dostanou dřív přihlášení", () => {
    const out = splitTipPot([{ teamId: "a", points: 4 }, { teamId: "b", points: 4 }, { teamId: "c", points: 4 }, { teamId: "d", points: 1 }], 800);
    expect([...out.values()].reduce((s, v) => s + v, 0)).toBe(800);
    expect(out.get("a")).toBe(267);
    expect(out.get("c")).toBe(266);
    expect(out.has("d")).toBe(false);
  });
});

describe("tipovačka v databázi", () => {
  it("lístek ukáže zápasy okresu na nejbližší den, Praha ani další kolo ne", async () => {
    const view = await loadTipView(db, "t1", morning);
    expect(view?.round?.day).toBe("2027-01-24");
    // Řazení podle soutěže: III. třída před Přeborem.
    expect(view?.matches.map((m) => m.matchId)).toEqual(["m2", "m1"]);
    expect(view?.matches.every((m) => m.open)).toBe(true);
  });

  it("vklad se strhne jednou i při dvojkliku, tipy jde přepsat", async () => {
    const a = await saveTips(db, "t1", [{ matchId: "m1", home: 2, away: 1 }, { matchId: "m2", home: 0, away: 0 }], morning);
    const b = await saveTips(db, "t1", [{ matchId: "m1", home: 3, away: 1 }], morning);
    expect(a.charged).toBe(true);
    expect(b.charged).toBe(false);
    const stakes = await db.prepare("SELECT COUNT(*) AS n FROM transactions WHERE team_id = 't1' AND type = 'pub_tip_stake'").first<{ n: number }>();
    expect(stakes?.n).toBe(1);
    const tip = await db.prepare("SELECT home, away FROM pub_tips WHERE team_id = 't1' AND match_id = 'm1'").first<{ home: number; away: number }>();
    expect(tip).toEqual({ home: 3, away: 1 });
  });

  it("chudý klub, AI klub a nesmyslné skóre odmítnuty", async () => {
    await expect(saveTips(db, "t4", [{ matchId: "m1", home: 1, away: 0 }], morning)).rejects.toThrow(TipError);
    await expect(saveTips(db, "a1", [{ matchId: "m1", home: 1, away: 0 }], morning)).rejects.toThrow("jen pro kluby trenérů");
    await expect(saveTips(db, "t2", [{ matchId: "m1", home: -1, away: 0 }], morning)).rejects.toThrow("od 0 do 20");
    const entries = await db.prepare("SELECT COUNT(*) AS n FROM pub_tip_entries WHERE team_id IN ('t4', 'a1')").first<{ n: number }>();
    expect(entries?.n).toBe(0);
  });

  it("po výkopu tip nejde", async () => {
    await saveTips(db, "t2", [{ matchId: "m1", home: 1, away: 1 }], morning);
    await saveTips(db, "t3", [{ matchId: "m1", home: 3, away: 1 }, { matchId: "m2", home: 2, away: 2 }], morning);
    await expect(saveTips(db, "t2", [{ matchId: "m1", home: 0, away: 3 }], new Date("2027-01-24T17:30:00Z"))).rejects.toThrow("už začal");
  });

  it("před dohráním se nevyhodnocuje, potom jednou: body, bank, SMS", async () => {
    expect(await settlePubTips(db, new Date("2027-01-24T17:30:00Z"))).toBe(0);
    await db.batch([
      db.prepare("UPDATE matches SET status = 'simulated', home_score = 3, away_score = 1 WHERE id = 'm1'"),
      db.prepare("UPDATE matches SET status = 'simulated', home_score = 0, away_score = 0 WHERE id = 'm2'"),
    ]);
    expect(await settlePubTips(db, new Date("2027-01-24T17:30:00Z"))).toBe(1);
    expect(await settlePubTips(db, new Date("2027-01-24T18:30:00Z"))).toBe(0);
    const entries = await db.prepare("SELECT team_id, points, payout FROM pub_tip_entries ORDER BY team_id").all<{ team_id: string; points: number; payout: number }>();
    // t1: 3 + 3 = 6, t2: 0, t3: 3 + 1 = 4. Bank 3 × 200 = 600 bere t1.
    expect(entries.results).toEqual([
      { team_id: "t1", points: 6, payout: 600 }, { team_id: "t2", points: 0, payout: 0 }, { team_id: "t3", points: 4, payout: 0 },
    ]);
    const wins = await db.prepare("SELECT team_id, amount FROM transactions WHERE type = 'pub_tip_win'").all<{ team_id: string; amount: number }>();
    expect(wins.results).toEqual([{ team_id: "t1", amount: 600 }]);
    const sms = await db.prepare("SELECT c.team_id, m.body FROM messages m JOIN conversations c ON c.id = m.conversation_id WHERE c.title = 'Hospodský' ORDER BY c.team_id").all<{ team_id: string; body: string }>();
    expect(sms.results.map((s) => s.team_id)).toEqual(["t1", "t2", "t3"]);
    expect(sms.results[0].body).toContain("berete 600 Kč");
    expect(sms.results[1].body).toContain("nejlepší měl 6");
    for (const s of sms.results) expect(s.body).not.toMatch(/[—–]/);
  });

  it("po kole lístek nabídne další den a ukáže poslední výsledky a tabulku sezóny", async () => {
    const view = await loadTipView(db, "t3", new Date("2027-01-25T08:00:00Z"));
    expect(view?.round?.day).toBe("2027-01-28");
    expect(view?.last?.winners).toEqual([{ name: "Volary", points: 6, payout: 600 }]);
    expect(view?.last?.myPoints).toBe(4);
    expect(view?.season[0]).toEqual({ teamId: "t1", name: "Volary", points: 6, rounds: 1 });
  });
});
