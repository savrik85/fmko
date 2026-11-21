/**
 * Vánoční sálovka nad skutečnou SQLite (Miniflare): pozvánky, přihlášky přes SMS, los,
 * celý den turnaje a výplata banku. Každý krok se pouští dvakrát, protože hodinový běh
 * (ve čtvrt i v půl) a fronta umí stejnou práci zopakovat.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { Miniflare } from "miniflare";
import { handleHallCupReply, HALL_REPLIES, tickHallCup, type HallCupRow } from "./db";

let miniflare: Miniflare;
let db: D1Database;
// Bez CACHE_KV a klíčů: AI je nedostupná, AI kluby rozhodne pravidlo.
const env = () => ({ DB: db } as unknown as Parameters<typeof tickHallCup>[0]);

const SCHEMA = [
  "CREATE TABLE seasons (number INTEGER, status TEXT)",
  "CREATE TABLE villages (id TEXT PRIMARY KEY, district TEXT)",
  "CREATE TABLE leagues (id TEXT PRIMARY KEY, name TEXT, waiting INTEGER DEFAULT 0)",
  `CREATE TABLE teams (id TEXT PRIMARY KEY, name TEXT, user_id TEXT, budget INTEGER, reputation INTEGER, village_id TEXT,
     league_id TEXT, parent_team_id TEXT, team_type TEXT, trophies TEXT, game_date TEXT)`,
  `CREATE TABLE players (id TEXT PRIMARY KEY, team_id TEXT, first_name TEXT, last_name TEXT, nickname TEXT, position TEXT,
     skills TEXT, personality TEXT, life_context TEXT, physical TEXT, age INTEGER, overall_rating INTEGER, status TEXT)`,
  "CREATE TABLE injuries (player_id TEXT, days_remaining INTEGER)",
  `CREATE TABLE conversations (id TEXT PRIMARY KEY, team_id TEXT, type TEXT, title TEXT, participant_id TEXT, ai_thread_active INTEGER,
     pinned INTEGER, unread_count INTEGER, last_message_text TEXT, last_message_at TEXT, created_at TEXT)`,
  "CREATE TABLE messages (id TEXT PRIMARY KEY, conversation_id TEXT, sender_type TEXT, sender_name TEXT, body TEXT, metadata TEXT, sent_at TEXT)",
  "CREATE TABLE transactions (id TEXT PRIMARY KEY, team_id TEXT, type TEXT, amount INTEGER, balance_after INTEGER, description TEXT, reference_id TEXT, game_date TEXT)",
  "CREATE TABLE news (id TEXT PRIMARY KEY, league_id TEXT, team_id TEXT, type TEXT, headline TEXT, body TEXT, season_number INTEGER, created_at TEXT)",
  "CREATE TABLE notifications (id TEXT PRIMARY KEY, team_id TEXT, type TEXT, title TEXT, body TEXT, action_url TEXT)",
];

const HUMANS = ["t1", "t2", "t3", "t4", "t5", "t6", "t7"];
const POSITIONS = ["GK", "GK", "DEF", "DEF", "DEF", "MID", "MID", "MID", "FWD", "FWD", "FWD", "DEF"];

async function seed() {
  for (const sql of SCHEMA) await db.prepare(sql).run();
  const migration = readFileSync(join(__dirname, "../../migrations/0318_hall_cup.sql"), "utf8")
    .replace(/--.*$/gm, "").split(";").map((s) => s.trim()).filter(Boolean);
  for (const sql of migration) await db.prepare(sql).run();
  const stmts: D1PreparedStatement[] = [
    db.prepare("INSERT INTO seasons VALUES (3, 'active')"),
    db.prepare("INSERT INTO villages VALUES ('v-pt', 'Prachatice'), ('v-cb', 'České Budějovice')"),
    db.prepare("INSERT INTO leagues VALUES ('l-3', 'III. třída', 0), ('l-4', 'IV. třída', 1), ('l-cb', 'Přebor ČB', 0)"),
  ];
  HUMANS.forEach((id, i) => stmts.push(db.prepare(
    "INSERT INTO teams VALUES (?, ?, ?, ?, ?, 'v-pt', 'l-3', NULL, NULL, NULL, '2026-12-01')",
  ).bind(id, `Klub ${i + 1}`, `u${i + 1}`, id === "t7" ? 500 : 50_000, 40 + i * 5)));
  stmts.push(
    // AI klub v hrající soutěži (pravidlo: bohatý jede), AI klub v čekající IV. třídě (pozvaný není).
    db.prepare("INSERT INTO teams VALUES ('ai1', 'AI Sokol', 'ai', 90000, 60, 'v-pt', 'l-3', NULL, NULL, NULL, '2026-12-01')"),
    db.prepare("INSERT INTO teams VALUES ('ai4', 'AI Spící', 'ai', 90000, 60, 'v-pt', 'l-4', NULL, NULL, NULL, '2026-12-01')"),
    // Lidský klub z jiného okresu pozvánku dostane, AI klub odjinud a béčko ne.
    db.prepare("INSERT INTO teams VALUES ('cb1', 'Budějky', 'u99', 50000, 50, 'v-cb', 'l-cb', NULL, NULL, NULL, '2026-12-01')"),
    db.prepare("INSERT INTO teams VALUES ('cbai', 'AI Budějky', 'ai', 90000, 70, 'v-cb', 'l-cb', NULL, NULL, NULL, '2026-12-01')"),
    db.prepare("INSERT INTO teams VALUES ('t1b', 'Klub 1 B', 'u1', 0, 30, 'v-pt', 'l-3', 't1', NULL, NULL, '2026-12-01')"),
  );
  for (const teamId of [...HUMANS, "ai1"]) {
    POSITIONS.forEach((pos, i) => stmts.push(db.prepare(
      `INSERT INTO players VALUES (?, ?, 'Jan', ?, NULL, ?, ?, '{}', '{"condition":100,"morale":60}', NULL, 25, ?, 'active')`,
    ).bind(`${teamId}-p${i}`, teamId, `${teamId.toUpperCase()}${i}`, pos,
      JSON.stringify({ speed: 50, technique: 50, shooting: 55, passing: 50, heading: 50, defense: 50, goalkeeping: pos === "GK" ? 65 : 15, vision: 50, creativity: 50, setPieces: 50 }),
      60 - i)));
  }
  await db.batch(stmts);
}

beforeAll(async () => {
  miniflare = new Miniflare({ modules: true, script: "export default { fetch() { return new Response('ok'); } }", d1Databases: ["DB"] });
  db = await miniflare.getD1Database("DB");
  await seed();
});

afterAll(async () => {
  await miniflare.dispose();
});

const at = (iso: string) => new Date(iso);
const cupRow = () => db.prepare("SELECT * FROM hall_cups").first<HallCupRow>();
const convOf = async (teamId: string) => (await db.prepare("SELECT id FROM conversations WHERE team_id = ? AND participant_id LIKE 'hc-%'").bind(teamId).first<{ id: string }>())?.id ?? "";
const lastHallMessage = async (teamId: string) => (await db.prepare(
  "SELECT body FROM messages WHERE conversation_id = ? ORDER BY rowid DESC LIMIT 1",
).bind(await convOf(teamId)).first<{ body: string }>())?.body ?? "";

describe("Vánoční sálovka v databázi", () => {
  it("před 25. 11. se ročník nezakládá, v noci 1. 12. se pozvánky ještě neposílají", async () => {
    expect(await tickHallCup(env(), at("2026-11-20T10:00:00Z"))).toEqual({ status: "none", played: 0 });
    const night = await tickHallCup(env(), at("2026-11-30T23:30:00Z"));
    expect(night.status).toBe("planned");
    expect((await cupRow())?.plays_on).toBe("2026-12-27");
  });

  it("1. 12. dopoledne pozve lidské kluby všech okresů, AI klub z okresu rozhodne pravidlem", async () => {
    expect((await tickHallCup(env(), at("2026-12-01T09:30:00Z"))).status).toBe("invited");
    expect((await tickHallCup(env(), at("2026-12-01T09:45:00Z"))).status).toBe("registration");
    const convs = await db.prepare("SELECT team_id FROM conversations WHERE participant_id LIKE 'hc-%' ORDER BY team_id").all<{ team_id: string }>();
    expect(convs.results.map((r) => r.team_id)).toEqual(["cb1", ...HUMANS]);
    const ai = await db.prepare("SELECT team_id, status FROM hall_cup_entries WHERE team_id LIKE 'ai%' OR team_id = 'cbai'").all<{ team_id: string; status: string }>();
    expect(ai.results).toEqual([{ team_id: "ai1", status: "registered" }]);
    const invite = await db.prepare("SELECT body, metadata FROM messages WHERE conversation_id = ?").bind(await convOf("t1")).first<{ body: string; metadata: string }>();
    expect(invite?.body).toContain("1 000 Kč");
    expect(invite?.body).not.toContain("—");
    expect(JSON.parse(invite?.metadata ?? "{}").options).toHaveLength(2);
  });

  it("přihlášky přes SMS: volný text, tlačítko, rozmyšlení, chudý klub, nejasná odpověď", async () => {
    await handleHallCupReply(db, await convOf("t1"), "t1", "Jasně, hlásíme se, kluci se těší", null);
    expect(await lastHallMessage("t1")).toContain("Máte to");
    await handleHallCupReply(db, await convOf("t1"), "t1", "jo jo, jdem", null);
    expect(await lastHallMessage("t1")).toBe(HALL_REPLIES.alreadyRegistered);
    await handleHallCupReply(db, await convOf("t2"), "t2", "", "register");
    await handleHallCupReply(db, await convOf("t3"), "t3", "urcite pocitejte s nama", null);
    await handleHallCupReply(db, await convOf("t4"), "t4", "Kolik to stojí?", null);
    expect(await lastHallMessage("t4")).toContain("Stačí napsat ano, nebo ne");
    await handleHallCupReply(db, await convOf("t4"), "t4", "ok bereme", null);
    await handleHallCupReply(db, await convOf("t5"), "t5", "přihlašte nás", null);
    await handleHallCupReply(db, await convOf("t5"), "t5", "letos ne, půlka kabiny je na horách", null);
    await handleHallCupReply(db, await convOf("t6"), "t6", "Bez nás", null);
    await handleHallCupReply(db, await convOf("t7"), "t7", "jasně jdem", null);
    expect(await lastHallMessage("t7")).toBe(HALL_REPLIES.noMoney(1000));
    const reg = await db.prepare("SELECT team_id FROM hall_cup_entries WHERE status = 'registered' ORDER BY team_id").all<{ team_id: string }>();
    expect(reg.results.map((r) => r.team_id)).toEqual(["ai1", "t1", "t2", "t3", "t4"]);
  });

  it("los den po uzávěrce: skupina, plán, startovné jednou, SMS s rozpisem", async () => {
    expect((await tickHallCup(env(), at("2026-12-20T20:00:00Z"))).status).toBe("registration");
    expect((await tickHallCup(env(), at("2026-12-21T09:30:00Z"))).status).toBe("drawn");
    await tickHallCup(env(), at("2026-12-21T10:30:00Z"));
    const fees = await db.prepare("SELECT team_id, amount FROM transactions WHERE type = 'hall_cup_fee' ORDER BY team_id").all<{ team_id: string; amount: number }>();
    expect(fees.results).toEqual(["ai1", "t1", "t2", "t3", "t4"].map((team_id) => ({ team_id, amount: -1000 })));
    const matches = await db.prepare("SELECT stage, slot, court, kickoff_at FROM hall_cup_matches ORDER BY slot, court").all<{ stage: string; slot: number; court: number; kickoff_at: string }>();
    // Pět týmů = jedna skupina, každý s každým (10 zápasů), play-off se založí až po skupině.
    expect(matches.results).toHaveLength(10);
    expect(matches.results[0].kickoff_at).toBe("2026-12-27T08:00:00.000Z");
    expect(await lastHallMessage("t1")).toMatch(/Los je hotový\. Hrajete ve skupině A \(.+\)\. První zápas v \d+:\d\d/);
    // Po losu už se přihlásit nejde.
    await handleHallCupReply(db, await convOf("t6"), "t6", "nakonec jo, hlásíme se", null);
    expect(await lastHallMessage("t6")).toBe(HALL_REPLIES.closed);
  });

  it("trenér si vybere soupisku a v zápasech hrají jen jeho lidi", async () => {
    const chosen = ["t1-p1", "t1-p4", "t1-p6", "t1-p7", "t1-p9", "t1-p10", "t1-p11"];
    await db.prepare("UPDATE hall_cup_entries SET roster = ? WHERE team_id = 't1'").bind(JSON.stringify(chosen)).run();
  });

  it("v den turnaje ráno se hraje jen to, co už začalo", async () => {
    const r = await tickHallCup(env(), at("2026-12-27T08:30:00Z"));
    expect(r.status).toBe("playing");
    expect(r.played).toBe(4);
    const pending = await db.prepare("SELECT COUNT(*) AS n FROM hall_cup_matches WHERE status = 'scheduled'").first<{ n: number }>();
    expect(pending?.n).toBe(6);
  });

  it("večer je dohráno: play-off, bank přesně rozdělený, trofej, článek a SMS od redakce, podruhé nic", async () => {
    await tickHallCup(env(), at("2026-12-27T17:30:00Z"));
    await tickHallCup(env(), at("2026-12-27T17:45:00Z"));
    const cup = await cupRow();
    expect(cup?.status).toBe("finished");
    const stages = await db.prepare("SELECT stage, COUNT(*) AS n FROM hall_cup_matches GROUP BY stage ORDER BY stage").all<{ stage: string; n: number }>();
    expect(stages.results).toEqual([{ stage: "final", n: 1 }, { stage: "group", n: 10 }, { stage: "third", n: 1 }]);

    const prizes = await db.prepare("SELECT team_id, amount FROM transactions WHERE type = 'hall_cup_prize' ORDER BY amount DESC").all<{ team_id: string; amount: number }>();
    expect(prizes.results.map((p) => p.amount)).toEqual([2500, 1500, 1000]);
    expect(prizes.results[0].team_id).toBe(cup?.winner_team_id);

    const lineups = await db.prepare("SELECT lineups, home_team_id FROM hall_cup_matches WHERE home_team_id = 't1' OR away_team_id = 't1'").all<{ lineups: string; home_team_id: string }>();
    for (const m of lineups.results) {
      const l = JSON.parse(m.lineups) as { home: Array<{ id: string }>; away: Array<{ id: string }> };
      const mine = m.home_team_id === "t1" ? l.home : l.away;
      expect(mine.every((p) => p.id.startsWith("t1-") && ["t1-p1", "t1-p4", "t1-p6", "t1-p7", "t1-p9", "t1-p10", "t1-p11"].includes(p.id))).toBe(true);
    }

    const trophies = await db.prepare("SELECT trophies FROM teams WHERE id = ?").bind(cup?.winner_team_id).first<{ trophies: string }>();
    expect(JSON.parse(trophies?.trophies ?? "[]")).toHaveLength(1);

    const news = await db.prepare("SELECT league_id, headline, body FROM news WHERE type = 'hall_cup'").all<{ league_id: string; headline: string; body: string }>();
    expect(news.results.map((n) => n.league_id)).toEqual(["l-3"]);
    expect(news.results[0].body).not.toContain("—");
    const desk = await db.prepare(
      "SELECT c.team_id, m.metadata FROM messages m JOIN conversations c ON c.id = m.conversation_id WHERE c.title = 'Redakce Zpravodaje'",
    ).all<{ team_id: string; metadata: string }>();
    expect(desk.results.map((d) => d.team_id).sort()).toEqual(HUMANS);
    expect(JSON.parse(desk.results[0].metadata).href).toMatch(/^\/zpravodaj\?article=/);

    // Opakovaný běh nic nezdvojí.
    await tickHallCup(env(), at("2026-12-27T18:30:00Z"));
    const again = await db.prepare("SELECT COUNT(*) AS n FROM transactions WHERE type = 'hall_cup_prize'").first<{ n: number }>();
    expect(again?.n).toBe(3);
    const deskAgain = await db.prepare("SELECT COUNT(*) AS n FROM messages m JOIN conversations c ON c.id = m.conversation_id WHERE c.title = 'Redakce Zpravodaje'").first<{ n: number }>();
    expect(deskAgain?.n).toBe(HUMANS.length);
    const t1 = await db.prepare("SELECT budget FROM teams WHERE id = 't1'").first<{ budget: number }>();
    const t1Prize = prizes.results.find((p) => p.team_id === "t1")?.amount ?? 0;
    expect(t1?.budget).toBe(50_000 - 1000 + t1Prize);
  });

  it("málo přihlášek: turnaj se zruší, startovné se nestrhne", async () => {
    await db.prepare("DELETE FROM hall_cup_matches").run();
    await db.prepare("DELETE FROM hall_cup_entries").run();
    await db.prepare("DELETE FROM hall_cups").run();
    await db.prepare("DELETE FROM transactions").run();
    await tickHallCup(env(), at("2026-12-01T10:30:00Z"));
    await db.prepare("UPDATE hall_cup_entries SET status = 'declined' WHERE team_id = 'ai1'").run();
    await handleHallCupReply(db, await convOf2("t1"), "t1", "jasně", null);
    await handleHallCupReply(db, await convOf2("t2"), "t2", "jasně", null);
    expect((await tickHallCup(env(), at("2026-12-21T10:30:00Z"))).status).toBe("draw_skipped");
    expect((await cupRow())?.status).toBe("cancelled");
    const fees = await db.prepare("SELECT COUNT(*) AS n FROM transactions").first<{ n: number }>();
    expect(fees?.n).toBe(0);
  });
});

/** Po novém ročníku má klub dvě vlákna s halou; platí to nové. */
async function convOf2(teamId: string): Promise<string> {
  const row = await db.prepare(
    "SELECT conv_id FROM hall_cup_entries WHERE team_id = ?",
  ).bind(teamId).first<{ conv_id: string }>();
  return row?.conv_id ?? "";
}
