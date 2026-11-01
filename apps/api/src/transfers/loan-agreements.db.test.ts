import { readFileSync } from "node:fs";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { Miniflare } from "miniflare";
import { checkLoanAgreements, ensureLoanAgreements, warnLoanBorrowersBeforeMatch } from "./loan-agreements";

/**
 * Hostování s podmínkou hraní: denní kontrola napíše půjčujícímu při porušení (jednou),
 * den před zápasem dostane hostující klub varování a stará hostování bez záznamu se doplní.
 */
describe("hlídání podmínky hostování", () => {
  let miniflare: Miniflare;
  let db: D1Database;
  const LENDER = "lender";
  const BORROWER = "borrower";
  const PLAYER = "p1";

  beforeAll(async () => {
    miniflare = new Miniflare({ modules: true, script: "export default { fetch() { return new Response('ok'); } }", d1Databases: ["DB"] });
    db = await miniflare.getD1Database("DB");
    for (const sql of [
      "CREATE TABLE teams (id TEXT PRIMARY KEY, name TEXT, parent_team_id TEXT, game_date TEXT, training_attendance TEXT, user_id TEXT, budget INTEGER DEFAULT 0)",
      "CREATE TABLE managers (team_id TEXT, user_id TEXT, created_at TEXT)",
      `CREATE TABLE players (id TEXT PRIMARY KEY, first_name TEXT, last_name TEXT, team_id TEXT, loan_from_team_id TEXT, loan_until TEXT,
        overall_rating INTEGER, skills TEXT, life_context TEXT, avatar TEXT, age INTEGER, position TEXT)`,
      "CREATE TABLE player_contracts (id TEXT, player_id TEXT, team_id TEXT, join_type TEXT, is_active INTEGER, joined_at TEXT, fee INTEGER)",
      "CREATE TABLE season_calendar (id TEXT PRIMARY KEY, scheduled_at TEXT)",
      `CREATE TABLE matches (id TEXT PRIMARY KEY, league_id TEXT, calendar_id TEXT, home_team_id TEXT, away_team_id TEXT,
        home_score INTEGER, away_score INTEGER, status TEXT, absences TEXT, simulated_at TEXT)`,
      `CREATE TABLE match_player_stats (id TEXT, match_id TEXT, player_id TEXT, team_id TEXT, started INTEGER, minutes_played INTEGER,
        goals INTEGER DEFAULT 0, assists INTEGER DEFAULT 0, yellow_cards INTEGER DEFAULT 0, red_cards INTEGER DEFAULT 0, rating REAL)`,
      "CREATE TABLE conversations (id TEXT PRIMARY KEY, team_id TEXT, type TEXT, title TEXT, pinned INTEGER, unread_count INTEGER, last_message_text TEXT, last_message_at TEXT, created_at TEXT)",
      "CREATE TABLE messages (id TEXT PRIMARY KEY, conversation_id TEXT, sender_type TEXT, sender_name TEXT, body TEXT, metadata TEXT, sent_at TEXT)",
    ]) await db.prepare(sql).run();
    // Tabulka záznamů přesně z migrace.
    const migration = readFileSync(new URL("../../migrations/0283_loan_market.sql", import.meta.url), "utf8");
    const create = migration.slice(migration.indexOf("CREATE TABLE IF NOT EXISTS loan_agreements"));
    for (const stmt of create.split(";").map((x) => x.trim()).filter(Boolean)) await db.prepare(stmt).run();
  });

  afterAll(async () => { await miniflare.dispose(); });

  beforeEach(async () => {
    for (const t of ["teams", "managers", "players", "player_contracts", "season_calendar", "matches", "match_player_stats", "conversations", "messages", "loan_agreements"]) {
      await db.prepare(`DELETE FROM ${t}`).run();
    }
    await db.batch([
      db.prepare("INSERT INTO teams (id, name, game_date, training_attendance, user_id) VALUES (?, 'FK Přebor', '2026-11-10T16:00:00.000Z', '{}', 'u1')").bind(LENDER),
      db.prepare("INSERT INTO teams (id, name, game_date, training_attendance, user_id) VALUES (?, 'TJ Nováček', '2026-11-10T16:00:00.000Z', '{}', 'u2')").bind(BORROWER),
      db.prepare("INSERT INTO managers VALUES (?, 'u1', '2026-01-01')").bind(LENDER),
      db.prepare("INSERT INTO managers VALUES (?, 'u2', '2026-01-01')").bind(BORROWER),
      db.prepare("INSERT INTO players (id, first_name, last_name, team_id, loan_from_team_id, loan_until, overall_rating, skills, life_context) VALUES (?, 'Jan', 'Novák', ?, ?, '2026-12-31T16:00:00.000Z', 45, '{\"speed\":40}', '{}')")
        .bind(PLAYER, BORROWER, LENDER),
      db.prepare(`INSERT INTO loan_agreements (id, player_id, lender_team_id, borrower_team_id, playing_time, started_at, until, created_at)
        VALUES ('la1', ?, ?, ?, 'starter', '2026-11-01T16:00:00.000Z', '2026-12-31T16:00:00.000Z', '2026-11-01T10:00:00Z')`).bind(PLAYER, LENDER, BORROWER),
    ]);
  });

  /** Ligový zápas hostujícího klubu; `start` = hráč začal, `sub` = střídal, null = neseděl ani na hřišti. */
  async function match(n: number, role: "start" | "sub" | null, absent = false) {
    const day = String(1 + n * 2).padStart(2, "0");
    const stmts = [
      db.prepare("INSERT INTO season_calendar VALUES (?, ?)").bind(`c${n}`, `2026-11-${day}T17:00:00.000Z`),
      db.prepare("INSERT INTO matches VALUES (?, 'lg', ?, ?, 'opp', 2, 1, 'simulated', ?, ?)")
        .bind(`m${n}`, `c${n}`, BORROWER, absent ? JSON.stringify([{ playerId: PLAYER, name: "Jan Novák", reason: "Zranění", teamId: BORROWER }]) : "[]", `2026-11-${day}T17:05:00Z`),
    ];
    if (role) {
      stmts.push(db.prepare("INSERT INTO match_player_stats (id, match_id, player_id, team_id, started, minutes_played, rating) VALUES (?, ?, ?, ?, ?, ?, 6.5)")
        .bind(`s${n}`, `m${n}`, PLAYER, BORROWER, role === "start" ? 1 : 0, role === "start" ? 90 : 20));
    }
    await db.batch(stmts);
  }

  async function sms(teamId: string) {
    return (await db.prepare(
      "SELECT m.body FROM messages m JOIN conversations c ON c.id = m.conversation_id WHERE c.team_id = ? ORDER BY m.sent_at",
    ).bind(teamId).all<{ body: string }>()).results.map((r) => r.body);
  }

  it("porušení: půjčující dostane jednu zprávu, i když kontrola běží znovu", async () => {
    await match(1, "start");
    await match(2, null);
    await match(3, null);
    expect(await checkLoanAgreements(db)).toMatchObject({ breaches: 1 });
    expect(await checkLoanAgreements(db)).toMatchObject({ breaches: 0 });
    const msgs = await sms(LENDER);
    expect(msgs).toHaveLength(1);
    expect(msgs[0]).toContain("Jan Novák na hostování v klubu TJ Nováček nehraje");
    expect(msgs[0]).toContain("v základu 1 z 3 zápasů");
  });

  it("zápas, kdy hráč chyběl kvůli zranění, se nepočítá", async () => {
    await match(1, "start");
    await match(2, null, true);
    await match(3, "start");
    await match(4, "start");
    expect(await checkLoanAgreements(db)).toMatchObject({ breaches: 0 });
    expect(await sms(LENDER)).toHaveLength(0);
  });

  it("den před zápasem varuje hostující klub, jednou na kolo", async () => {
    await match(1, "start");
    await match(2, "start");
    expect(await warnLoanBorrowersBeforeMatch(db, BORROWER, "c3")).toBe(1);
    expect(await warnLoanBorrowersBeforeMatch(db, BORROWER, "c3")).toBe(0);
    const msgs = await sms(BORROWER);
    expect(msgs[0]).toContain("Slíbili jste, že Jan Novák bude hrát v základu");
    expect(msgs[0]).toContain("Když zítra nezačne v základu");
  });

  it("když hráč na hostování už není, záznam se uzavře", async () => {
    await db.prepare("UPDATE players SET team_id = ?, loan_from_team_id = NULL WHERE id = ?").bind(LENDER, PLAYER).run();
    expect(await checkLoanAgreements(db)).toMatchObject({ closed: 1 });
    const row = await db.prepare("SELECT status FROM loan_agreements WHERE id = 'la1'").first<{ status: string }>();
    expect(row?.status).toBe("ended");
  });

  it("staré hostování bez záznamu se doplní s výchozím bodem teď", async () => {
    await db.prepare("DELETE FROM loan_agreements").run();
    await db.prepare("INSERT INTO player_contracts VALUES ('k1', ?, ?, 'loan', 1, '2026-10-30T16:00:00.000Z', 1500)").bind(PLAYER, BORROWER).run();
    expect(await ensureLoanAgreements(db, LENDER)).toBe(1);
    expect(await ensureLoanAgreements(db, LENDER)).toBe(0);
    const row = await db.prepare("SELECT playing_time, fee, started_at, start_rating, baseline_at FROM loan_agreements").first<Record<string, unknown>>();
    expect(row).toMatchObject({ playing_time: "none", fee: 1500, started_at: "2026-10-30T16:00:00.000Z", start_rating: 45 });
    expect(row?.baseline_at).toBeTruthy();
  });
});
