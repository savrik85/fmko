/**
 * Anketa Fotbalista okresu nad SQLite (Miniflare): nominace, hlasy přes SMS s prodlevou
 * odpovědi, vlastní hráč, přepsání hlasu, uzávěrka s hlasy AI a kotlů bez modelu,
 * článek a SMS od redakce. Kroky, které umí běžet dvakrát, se pouští dvakrát.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { Miniflare } from "miniflare";
import { closeOpenPollsForSeason, handlePollReply, POLL_REPLIES, tickDistrictPolls } from "./district-poll";

let miniflare: Miniflare;
let db: D1Database;
const env = () => ({ DB: db });

const SCHEMA = [
  "CREATE TABLE seasons (number INTEGER, status TEXT)",
  "CREATE TABLE leagues (id TEXT PRIMARY KEY, name TEXT, district TEXT, league_type TEXT, waiting INTEGER DEFAULT 0)",
  "CREATE TABLE teams (id TEXT PRIMARY KEY, name TEXT, league_id TEXT, parent_team_id TEXT, user_id TEXT)",
  `CREATE TABLE players (id TEXT PRIMARY KEY, team_id TEXT, first_name TEXT, last_name TEXT, nickname TEXT, position TEXT,
     avatar TEXT, personality TEXT, life_context TEXT, nationality TEXT)`,
  "CREATE TABLE season_calendar (id TEXT PRIMARY KEY, league_id TEXT, season_number INTEGER, scheduled_at TEXT)",
  "CREATE TABLE matches (id TEXT PRIMARY KEY, league_id TEXT, calendar_id TEXT, status TEXT)",
  "CREATE TABLE match_player_stats (match_id TEXT, player_id TEXT, goals INTEGER, assists INTEGER, rating REAL)",
  "CREATE TABLE journalists (id TEXT PRIMARY KEY, league_id TEXT, first_name TEXT, last_name TEXT, nickname TEXT, style TEXT)",
  "CREATE TABLE fan_groups (id TEXT PRIMARY KEY, team_id TEXT, kind TEXT)",
  `CREATE TABLE conversations (id TEXT PRIMARY KEY, team_id TEXT, type TEXT, title TEXT, participant_id TEXT, participant_avatar TEXT,
     ai_thread_active INTEGER, pinned INTEGER, unread_count INTEGER DEFAULT 0, last_message_text TEXT, last_message_at TEXT, created_at TEXT)`,
  "CREATE TABLE messages (id TEXT PRIMARY KEY, conversation_id TEXT, sender_type TEXT, sender_id TEXT, sender_name TEXT, body TEXT, metadata TEXT, sent_at TEXT)",
  "CREATE TABLE news (id TEXT PRIMARY KEY, league_id TEXT, team_id TEXT, type TEXT, headline TEXT, body TEXT, season_number INTEGER, created_at TEXT)",
];

// Okres Prachatice: dvě soutěže, 6 klubů (t1–t4 lidské, a1–a2 AI). Okres Praha bez statistik.
const TEAMS: Array<[string, string, string]> = [
  ["t1", "SK Volary", "l1"], ["t2", "Sokol Lhenice", "l1"], ["t3", "Baník Vimperk", "l2"],
  ["t4", "Jiskra Netolice", "l2"], ["a1", "AI Husinec", "l1"], ["a2", "AI Zbytiny", "l2"],
];

async function seed() {
  for (const sql of SCHEMA) await db.prepare(sql).run();
  const migration = readFileSync(join(__dirname, "../../migrations/0321_district_polls.sql"), "utf8")
    .replace(/--.*$/gm, "").split(";").map((s) => s.trim()).filter(Boolean);
  for (const sql of migration) await db.prepare(sql).run();
  const stmts: D1PreparedStatement[] = [
    db.prepare("INSERT INTO seasons VALUES (3, 'active')"),
    db.prepare("INSERT INTO leagues VALUES ('l1', 'Přebor', 'Prachatice', 'senior', 0), ('l2', 'III. třída', 'Prachatice', 'senior', 0), ('l4', 'IV. třída', 'Prachatice', 'senior', 1), ('lp', 'Praha', 'Praha', 'senior', 0)"),
    db.prepare("INSERT INTO journalists VALUES ('j1', 'l1', 'Dobromila', 'Jelínková', 'Šťouralka', 'bulvar'), ('j2', 'l1', 'Karel', 'Pecka', NULL, 'seriozni')"),
    db.prepare("INSERT INTO season_calendar VALUES ('c1', 'l1', 3, '2026-12-01T17:00:00Z'), ('c-last', 'l1', 3, '2027-01-28T17:00:00Z'), ('c2', 'l2', 3, '2027-01-24T17:00:00Z')"),
  ];
  for (const [id, name, league] of TEAMS) {
    stmts.push(db.prepare("INSERT INTO teams VALUES (?, ?, ?, NULL, ?)").bind(id, name, league, id.startsWith("a") ? "ai" : `u-${id}`));
    stmts.push(db.prepare("INSERT INTO fan_groups VALUES (?, ?, 'kotel')").bind(`fg-${id}`, id));
  }
  // Tři hráči na klub, statistiky z 6 zápasů. Nejlepší: t1-p0 (Horák), pak t2-p0.
  const surnames = ["Horák", "Novák", "Kučera", "Dvořák", "Svoboda", "Černý", "Procházka", "Veselý", "Krejčí", "Marek", "Pokorný", "Pospíšil", "Hájek", "Král", "Jelínek", "Růžička", "Beneš", "Fiala"];
  let n = 0;
  for (const [teamId] of TEAMS) {
    for (let i = 0; i < 3; i++) {
      const pid = `${teamId}-p${i}`;
      const temper = pid === "t2-p0" ? 90 : 30;
      stmts.push(db.prepare("INSERT INTO players VALUES (?, ?, 'Jan', ?, NULL, 'FWD', NULL, ?, '{\"morale\":50}', 'CZ')")
        .bind(pid, teamId, surnames[n++], JSON.stringify({ temper })));
      for (let m = 0; m < 6; m++) {
        const rating = 8 - TEAMS.findIndex((t) => t[0] === teamId) * 0.2 - i * 0.5;
        stmts.push(db.prepare("INSERT INTO match_player_stats VALUES (?, ?, ?, 0, ?)").bind(`m-${teamId}-${m}`, pid, i === 0 ? 1 : 0, rating));
      }
    }
    for (let m = 0; m < 6; m++) {
      const league = TEAMS.find((t) => t[0] === teamId)![2];
      stmts.push(db.prepare("INSERT INTO matches VALUES (?, ?, 'c1', 'simulated')").bind(`m-${teamId}-${m}`, league));
    }
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
const convOf = async (teamId: string) => (await db.prepare("SELECT conv_id FROM district_poll_ballots WHERE voter_id = ?").bind(teamId).first<{ conv_id: string }>())?.conv_id ?? "";
const ballotOf = (teamId: string) => db.prepare("SELECT player_id, pending_reply, reply_due_at FROM district_poll_ballots WHERE voter_id = ?").bind(teamId)
  .first<{ player_id: string | null; pending_reply: string | null; reply_due_at: string | null }>();

describe("anketa Fotbalista okresu", () => {
  it("před 4. 1. nic, 4. 1. dopoledne nominace 10 hráčů a SMS lidským trenérům", async () => {
    expect((await tickDistrictPolls(env(), at("2027-01-03T10:00:00Z"))).opened).toBe(0);
    expect((await tickDistrictPolls(env(), at("2027-01-04T05:00:00Z"))).opened).toBe(0);
    expect((await tickDistrictPolls(env(), at("2027-01-04T09:30:00Z"))).opened).toBe(1);
    expect((await tickDistrictPolls(env(), at("2027-01-04T10:30:00Z"))).opened).toBe(0);
    const cands = await db.prepare("SELECT player_id, team_id, rank FROM district_poll_candidates ORDER BY rank").all<{ player_id: string; team_id: string; rank: number }>();
    expect(cands.results).toHaveLength(10);
    const perClub = new Map<string, number>();
    for (const c of cands.results) perClub.set(c.team_id, (perClub.get(c.team_id) ?? 0) + 1);
    expect(Math.max(...perClub.values())).toBeLessThanOrEqual(2);
    expect(cands.results[0].player_id).toBe("t1-p0");
    const sms = await db.prepare("SELECT c.team_id, c.title, m.body FROM conversations c JOIN messages m ON m.conversation_id = c.id WHERE c.participant_id LIKE 'po-%' ORDER BY c.team_id").all<{ team_id: string; title: string; body: string }>();
    expect(sms.results.map((s) => s.team_id)).toEqual(["t1", "t2", "t3", "t4"]);
    expect(sms.results[0].title).toBe("Karel Pecka");
    expect(sms.results[0].body).toContain("1. Jan Horák (SK Volary)");
    expect(sms.results[0].body).not.toContain("—");
    const poll = await db.prepare("SELECT closes_on FROM district_polls").first<{ closes_on: string }>();
    expect(poll?.closes_on).toBe("2027-01-27");
  });

  it("hlas přes SMS: odpověď redaktora s prodlevou, vlastní hráč odmítnut, druhý hlas přepíše", async () => {
    await handlePollReply(env(), await convOf("t3"), "t3", "dávám Horáka z Volar, kluk je to šikovnej", at("2027-01-05T10:00:00Z"));
    let b = await ballotOf("t3");
    expect(b?.player_id).toBe("t1-p0");
    expect(b?.pending_reply).toBe(POLL_REPLIES.voted("Jan Horák", "SK Volary"));
    expect(new Date(b!.reply_due_at!).getTime()).toBeGreaterThan(at("2027-01-05T10:04:00Z").getTime());

    await handlePollReply(env(), await convOf("t1"), "t1", "Horák samozřejmě", at("2027-01-05T10:00:00Z"));
    b = await ballotOf("t1");
    expect(b?.player_id).toBeNull();
    expect(b?.pending_reply).toBe(POLL_REPLIES.own);

    // V noci odpoví redaktor až ráno.
    await handlePollReply(env(), await convOf("t1"), "t1", "tak dvojka", at("2027-01-05T23:10:00Z"));
    b = await ballotOf("t1");
    expect(b?.player_id).not.toBeNull();
    expect(b?.reply_due_at).toBe("2027-01-06T06:30:00.000Z");
    const first = b!.player_id;
    await handlePollReply(env(), await convOf("t1"), "t1", "ne, nakonec dávám Procházku, ten si to zaslouží víc", at("2027-01-06T08:00:00Z"));
    b = await ballotOf("t1");
    expect(b?.player_id).not.toBe(first);

    await handlePollReply(env(), await convOf("t4"), "t4", "nevím, všichni jsou to lemry", at("2027-01-06T08:00:00Z"));
    expect((await ballotOf("t4"))?.pending_reply).toBe(POLL_REPLIES.unclear);
  });

  it("odpovědi redaktora se doručí po prodlevě a jen jednou", async () => {
    const r1 = await tickDistrictPolls(env(), at("2027-01-06T12:00:00Z"));
    expect(r1.replies).toBe(3);
    const r2 = await tickDistrictPolls(env(), at("2027-01-06T12:30:00Z"));
    expect(r2.replies).toBe(0);
    const msgs = await db.prepare("SELECT COUNT(*) AS n FROM messages WHERE conversation_id = ? AND sender_name = 'Karel Pecka'").bind(await convOf("t3")).first<{ n: number }>();
    expect(msgs?.n).toBe(2);
  });

  it("27. 1. odpoledne ještě ne, večer uzávěrka: hlasy AI a kotlů pravidlem, článek, SMS, naštvaný druhý", async () => {
    await handlePollReply(env(), await convOf("t2"), "t2", "Horák", at("2027-01-20T10:00:00Z"));
    expect((await tickDistrictPolls(env(), at("2027-01-27T15:00:00Z"))).closed).toBe(0);
    expect((await tickDistrictPolls(env(), at("2027-01-27T18:30:00Z"))).closed).toBe(1);
    expect((await tickDistrictPolls(env(), at("2027-01-27T19:30:00Z"))).closed).toBe(0);

    const poll = await db.prepare("SELECT status, winner_player_id, news_id FROM district_polls").first<{ status: string; winner_player_id: string; news_id: string }>();
    expect(poll?.status).toBe("closed");
    expect(poll?.winner_player_id).toBe("t1-p0");
    const open = await db.prepare("SELECT COUNT(*) AS n FROM district_poll_ballots WHERE player_id IS NULL AND conv_id IS NULL").first<{ n: number }>();
    expect(open?.n).toBe(0);
    const kotel = await db.prepare("SELECT player_id, weight FROM district_poll_ballots WHERE voter_id = 'fg-t3'").first<{ player_id: string; weight: number }>();
    expect(kotel).toEqual({ player_id: "t3-p0", weight: 0.5 });

    const news = await db.prepare("SELECT league_id, headline, body FROM news WHERE type = 'player_of_district' ORDER BY league_id").all<{ league_id: string; headline: string; body: string }>();
    expect(news.results.map((x) => x.league_id)).toEqual(["l1", "l2"]);
    expect(news.results[0].headline).toBe("Fotbalistou okresu Prachatice je Jan Horák");
    expect(news.results[0].body).toContain("Kdo koho volil.");
    expect(news.results[0].body).toContain("Baník Vimperk: Jan Horák.");
    // Jméno vítěze v 1. pádu, bez dvou teček za pořadím a bez rodu u redaktora.
    expect(news.results[0].body).toContain("Fotbalistou okresu je Jan Horák z klubu");
    expect(news.results[0].body).not.toMatch(/\.\./);
    expect(news.results[0].body).not.toContain("připravil");
    expect(news.results[0].body).not.toContain("—");
    const desk = await db.prepare("SELECT c.team_id FROM conversations c JOIN messages m ON m.conversation_id = c.id WHERE c.title = 'Redakce Zpravodaje' ORDER BY c.team_id").all<{ team_id: string }>();
    expect(desk.results.map((d) => d.team_id)).toEqual(["t1", "t2", "t3", "t4"]);

    const morale = await db.prepare("SELECT json_extract(life_context, '$.morale') AS m FROM players WHERE id = 't1-p0'").first<{ m: number }>();
    expect(morale?.m).toBe(65);
  });

  it("konec sezóny po uzávěrce nic nezdvojí, hlas po uzávěrce dostane zprávu o konci", async () => {
    expect(await closeOpenPollsForSeason(env(), 3)).toBe(0);
    await handlePollReply(env(), await convOf("t4"), "t4", "Horák", at("2027-01-27T20:00:00Z"));
    expect((await ballotOf("t4"))?.pending_reply).toBe(POLL_REPLIES.closed);
    const news = await db.prepare("SELECT COUNT(*) AS n FROM news").first<{ n: number }>();
    expect(news?.n).toBe(2);
  });
});
