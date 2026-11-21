/**
 * Výběr okresu nad SQLite (Miniflare): vypsání, nominace přes SMS (čísla i jména, vlastní
 * hráč se vynechá), uzávěrka (16 hráčů, aspoň dva brankáři, nálada, SMS klubům), zápas bez
 * řádku v teams, článek a SMS od redakce; opakovaný běh nic nezdvojí.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { Miniflare } from "miniflare";
import { handlePollReply } from "./district-poll";
import { announceDistrictSelection, parseSelectionPicks, pickSquad, tickDistrictSelections } from "./district-selection";

let miniflare: Miniflare;
let db: D1Database;
const env = () => ({ DB: db });

const SCHEMA = [
  "CREATE TABLE seasons (number INTEGER, status TEXT)",
  "CREATE TABLE leagues (id TEXT PRIMARY KEY, name TEXT, district TEXT, league_type TEXT, waiting INTEGER DEFAULT 0)",
  "CREATE TABLE teams (id TEXT PRIMARY KEY, name TEXT, league_id TEXT, parent_team_id TEXT, user_id TEXT)",
  `CREATE TABLE players (id TEXT PRIMARY KEY, team_id TEXT, first_name TEXT, last_name TEXT, nickname TEXT, position TEXT, skills TEXT, personality TEXT,
     life_context TEXT, physical TEXT, age INTEGER, overall_rating INTEGER, status TEXT, loan_from_team_id TEXT, avatar TEXT, nationality TEXT)`,
  "CREATE TABLE injuries (id TEXT PRIMARY KEY, player_id TEXT, team_id TEXT, type TEXT, description TEXT, severity TEXT, days_remaining INTEGER, days_total INTEGER, match_id TEXT)",
  `CREATE TABLE conversations (id TEXT PRIMARY KEY, team_id TEXT, type TEXT, title TEXT, participant_id TEXT, participant_avatar TEXT, ai_thread_active INTEGER,
     pinned INTEGER, unread_count INTEGER DEFAULT 0, last_message_text TEXT, last_message_at TEXT, created_at TEXT)`,
  "CREATE TABLE messages (id TEXT PRIMARY KEY, conversation_id TEXT, sender_type TEXT, sender_id TEXT, sender_name TEXT, body TEXT, metadata TEXT, sent_at TEXT)",
  "CREATE TABLE news (id TEXT PRIMARY KEY, league_id TEXT, team_id TEXT, type TEXT, headline TEXT, body TEXT, season_number INTEGER, created_at TEXT)",
];

function migration(file: string): string[] {
  return readFileSync(join(__dirname, `../../migrations/${file}`), "utf8").replace(/--.*$/gm, "").split(";").map((s) => s.trim()).filter(Boolean);
}

const POS = ["GK", "DEF", "DEF", "MID", "MID", "FWD"];

beforeAll(async () => {
  miniflare = new Miniflare({ modules: true, script: "export default { fetch() { return new Response('ok'); } }", d1Databases: ["DB"] });
  db = await miniflare.getD1Database("DB");
  for (const sql of [...SCHEMA, ...migration("0321_district_polls.sql"), ...migration("0333_district_selection.sql")]) await db.prepare(sql).run();
  const stmts: D1PreparedStatement[] = [
    db.prepare("INSERT INTO seasons VALUES (4, 'active')"),
    db.prepare("INSERT INTO leagues VALUES ('lp', 'Přebor PT', 'Prachatice', 'senior', 0), ('ls', 'Přebor ST', 'Strakonice', 'senior', 0), ('l4', 'IV. třída', 'Prachatice', 'senior', 1)"),
  ];
  const skills = JSON.stringify({ speed: 50, technique: 50, shooting: 50, passing: 50, heading: 50, defense: 50, goalkeeping: 15, vision: 50, creativity: 50, setPieces: 50 });
  for (const [prefix, league] of [["p", "lp"], ["s", "ls"]] as const) {
    for (let t = 1; t <= 6; t++) {
      const teamId = `${prefix}${t}`;
      stmts.push(db.prepare("INSERT INTO teams VALUES (?, ?, ?, NULL, ?)").bind(teamId, `Klub ${teamId}`, league, t <= 3 ? `u-${teamId}` : "ai"));
      POS.forEach((pos, i) => stmts.push(db.prepare(
        `INSERT INTO players VALUES (?, ?, 'Jan', ?, NULL, ?, ?, ?, '{"morale":50,"condition":100}', NULL, 25, ?, 'active', NULL, NULL, 'CZ')`,
      ).bind(`${teamId}-${i}`, teamId, `Hráč${teamId.toUpperCase()}${i}`, pos, skills,
        JSON.stringify({ temper: teamId === "p4" ? 90 : 30 }), 70 - t - i)));
    }
  }
  // Čekající IV. třída do výběru nepatří.
  stmts.push(db.prepare("INSERT INTO teams VALUES ('w1', 'Spící', 'l4', NULL, 'ai')"));
  stmts.push(db.prepare(`INSERT INTO players VALUES ('w1-0', 'w1', 'Jan', 'Spící', NULL, 'FWD', ?, '{}', '{}', NULL, 25, 99, 'active', NULL, NULL, 'CZ')`).bind(skills));
  await db.batch(stmts);
});

afterAll(async () => {
  await miniflare.dispose();
});

const NOW = new Date("2027-03-01T10:00:00Z");
let matchId = "";

describe("výběr okresu: čisté funkce", () => {
  const cands = Array.from({ length: 24 }, (_, i) => ({ playerId: `c${i + 1}`, name: `Jan Novák${i + 1}`, teamName: "Klub", rank: i + 1 }));
  it("čísla ze seznamu, nejvýš tři", () => {
    expect(parseSelectionPicks("dávám 3, 7 a 12, případně 14", cands)).toEqual(["c3", "c7", "c12"]);
  });
  it("sestava: 16 nejvíc jmenovaných, aspoň dva brankáři", () => {
    const list = Array.from({ length: 24 }, (_, i) => ({ player_id: `x${i}`, position: i === 20 || i === 21 ? "GK" : "MID", rank: i + 1 }));
    const squad = pickSquad(list, new Map([["x23", 5]]));
    expect(squad).toHaveLength(16);
    expect(squad[0]).toBe("x23");
    expect(squad.filter((id) => id === "x20" || id === "x21")).toHaveLength(2);
  });
});

describe("výběr okresu v databázi", () => {
  it("vypsání: kandidáti obou okresů (bez čekající ligy, nejvýš tři z klubu) a SMS od OFS lidským trenérům", async () => {
    await expect(announceDistrictSelection(env(), { homeDistrict: "Prachatice", awayDistrict: "Strakonice", venue: "Volary", matchDate: "2027-03-03" }, NOW)).rejects.toThrow("aspoň za čtyři dny");
    matchId = await announceDistrictSelection(env(), { homeDistrict: "Prachatice", awayDistrict: "Strakonice", venue: "Volary", matchDate: "2027-03-08" }, NOW);
    const c = await db.prepare("SELECT poll_id, player_id, team_id, position FROM district_poll_candidates").all<{ poll_id: string; player_id: string; team_id: string; position: string }>();
    const home = c.results.filter((r) => r.poll_id.endsWith("-home"));
    expect(home).toHaveLength(18);
    expect(home.map((r) => r.player_id)).not.toContain("w1-0");
    const perClub = new Map<string, number>();
    for (const r of home) perClub.set(r.team_id, (perClub.get(r.team_id) ?? 0) + 1);
    expect(Math.max(...perClub.values())).toBeLessThanOrEqual(3);
    expect(home.filter((r) => r.position === "GK").length).toBeGreaterThanOrEqual(3);
    const sms = await db.prepare("SELECT c.team_id, c.title, m.body FROM conversations c JOIN messages m ON m.conversation_id = c.id ORDER BY c.team_id").all<{ team_id: string; title: string; body: string }>();
    expect(sms.results.map((s) => s.team_id)).toEqual(["p1", "p2", "p3", "s1", "s2", "s3"]);
    expect(sms.results[0].title).toBe("OFS Prachatice");
    expect(sms.results[0].body).not.toMatch(/[—–]/);
  });

  it("nominace přes SMS: vlastní hráč se vynechá, nejasná zpráva dostane dotaz", async () => {
    const convOf = async (teamId: string) => (await db.prepare("SELECT conv_id FROM district_poll_ballots WHERE voter_id = ?").bind(teamId).first<{ conv_id: string }>())!.conv_id;
    const own = await db.prepare("SELECT rank FROM district_poll_candidates WHERE team_id = 'p1' ORDER BY rank LIMIT 1").first<{ rank: number }>();
    await handlePollReply(env(), await convOf("p1"), "p1", `dávám ${own!.rank}, 17 a 18`, NOW);
    const b = await db.prepare("SELECT picks, pending_reply FROM district_poll_ballots WHERE voter_id = 'p1'").first<{ picks: string; pending_reply: string }>();
    expect(JSON.parse(b!.picks)).toHaveLength(2);
    expect(b!.pending_reply).toContain("Vlastního hráče jsme vynechali");
    await handlePollReply(env(), await convOf("s1"), "s1", "nevím, rozhodněte sami", NOW);
    expect((await db.prepare("SELECT pending_reply FROM district_poll_ballots WHERE voter_id = 's1'").first<{ pending_reply: string }>())!.pending_reply).toContain("Nerozumím");
  });

  it("uzávěrka dva dny před zápasem večer: 16 v každém výběru, AI kluby pravidlem, nálada, SMS klubům", async () => {
    expect((await tickDistrictSelections(env(), new Date("2027-03-06T12:00:00Z"))).closed).toBe(0);
    expect((await tickDistrictSelections(env(), new Date("2027-03-06T18:30:00Z"))).closed).toBe(2);
    const m = await db.prepare("SELECT status FROM district_selection_matches").first<{ status: string }>();
    expect(m?.status).toBe("ready");
    const polls = await db.prepare("SELECT result FROM district_polls").all<{ result: string }>();
    for (const p of polls.results) {
      const squad = (JSON.parse(p.result) as { squad: string[] }).squad;
      expect(squad).toHaveLength(16);
    }
    const ofs = await db.prepare("SELECT COUNT(*) AS n FROM messages WHERE body LIKE 'Do výběru okresu%'").first<{ n: number }>();
    expect(ofs!.n).toBeGreaterThan(0);
  });

  it("v den zápasu před výkopem nic, po výkopu zápas, článek, SMS od redakce; podruhé nic", async () => {
    expect((await tickDistrictSelections(env(), new Date("2027-03-08T10:00:00Z"))).played).toBe(0);
    expect((await tickDistrictSelections(env(), new Date("2027-03-08T14:30:00Z"))).played).toBe(1);
    expect((await tickDistrictSelections(env(), new Date("2027-03-08T15:30:00Z"))).played).toBe(0);
    const m = await db.prepare("SELECT status, home_score, away_score, lineups FROM district_selection_matches").first<{ status: string; home_score: number; lineups: string }>();
    expect(m?.status).toBe("played");
    expect(JSON.parse(m!.lineups).home).toHaveLength(11);
    const news = await db.prepare("SELECT league_id, body FROM news WHERE type = 'district_selection' ORDER BY league_id").all<{ league_id: string; body: string }>();
    expect(news.results.map((n) => n.league_id)).toEqual(["lp", "ls"]);
    expect(news.results[0].body).not.toMatch(/[—–]/);
    // Název okresu se neskloňuje: „Za Prachatice dali góly“ nahradila „výběru okresu Prachatice“.
    expect(news.results[0].body).not.toMatch(/\bZa (Prachatice|Strakonice)\b/);
    expect(news.results[0].body).toContain("Sestava výběru okresu Prachatice:");
    const desk = await db.prepare("SELECT COUNT(*) AS n FROM messages m JOIN conversations c ON c.id = m.conversation_id WHERE c.title = 'Redakce Zpravodaje'").first<{ n: number }>();
    expect(desk!.n).toBe(6);
    const teams = await db.prepare("SELECT COUNT(*) AS n FROM teams").first<{ n: number }>();
    expect(teams!.n).toBe(13);
  });
});
