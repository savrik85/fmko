/**
 * Pravidla a tresty trenéra nad skutečnou D1 (Miniflare): pravidlo docházky a jeho porušení,
 * kolečka na tréninku, poslední šance, omluva kabině a pravidla z kabiny jen pro vlastní kádr.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { Miniflare } from "miniflare";
import { readFileSync } from "node:fs";

const model = vi.hoisted(() => ({ askModelJson: vi.fn() }));
vi.mock("./ai-player-chat", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./ai-player-chat")>()),
  askModelJson: model.askModelJson,
}));
const askModelJson = model.askModelJson;
import { recordCommitment, settleCoachCommitments } from "./coach-commitments";
import {
  APOLOGY_REFUSED_KABINA, APOLOGY_SINCERE_KABINA, LAPS_CONDITION, LAPS_REFUSED_RELATION, LAPS_REFUSED_SMS, LAST_CHANCE_REMINDERS, RULE_BROKEN_SMS,
  TRAINING_RULE_ATTENDANCE_BONUS, applyLapsAtTraining, applyPendingLapsFatigue, handleSquadRule, loadClubRules, respondToCoachRequest, trainingRuleBonus,
} from "./coach-rules";

let miniflare: Miniflare;
let db: D1Database;
const T0 = new Date("2026-11-19T14:32:00Z");

beforeAll(async () => {
  miniflare = new Miniflare({ modules: true, script: "export default { fetch() { return new Response('ok'); } }", d1Databases: ["DB"] });
  db = await miniflare.getD1Database("DB");
  await db.exec(readFileSync(new URL("../../migrations/0316_coach_commitments.sql", import.meta.url), "utf8").replace(/--[^\n]*/g, "").replace(/\n/g, " "));
  for (const sql of [
    "CREATE TABLE teams (id TEXT PRIMARY KEY, name TEXT, user_id TEXT, parent_team_id TEXT, team_type TEXT NOT NULL DEFAULT 'senior', budget INTEGER, game_date TEXT)",
    "CREATE TABLE players (id TEXT PRIMARY KEY, team_id TEXT, first_name TEXT, last_name TEXT, nickname TEXT, avatar TEXT, nationality TEXT, position TEXT, weekly_wage INTEGER, personality TEXT, life_context TEXT, coach_relationship INTEGER, loan_from_team_id TEXT, status TEXT, age INTEGER)",
    "CREATE TABLE matches (id TEXT PRIMARY KEY, calendar_id TEXT, home_team_id TEXT, away_team_id TEXT, status TEXT, simulated_at TEXT, home_lineup_data TEXT, away_lineup_data TEXT, home_score INTEGER, away_score INTEGER)",
    "CREATE TABLE season_calendar (id TEXT PRIMARY KEY, league_id TEXT, season_number INTEGER, scheduled_at TEXT, status TEXT)",
    "CREATE TABLE match_player_stats (match_id TEXT, player_id TEXT, minutes_played INTEGER, goals INTEGER, assists INTEGER)",
    "CREATE TABLE injuries (player_id TEXT, days_remaining INTEGER)",
    "CREATE TABLE conversations (id TEXT PRIMARY KEY, team_id TEXT, type TEXT, title TEXT, participant_id TEXT, participant_avatar TEXT, last_message_text TEXT, last_message_at TEXT, unread_count INTEGER DEFAULT 0, created_at TEXT, pinned INTEGER DEFAULT 0)",
    "CREATE TABLE messages (id TEXT PRIMARY KEY, conversation_id TEXT, sender_type TEXT, sender_id TEXT, sender_name TEXT, body TEXT, metadata TEXT, sent_at TEXT, read INTEGER DEFAULT 0)",
    "CREATE TABLE coach_relation_log (id INTEGER PRIMARY KEY AUTOINCREMENT, player_id TEXT, team_id TEXT, old_value INTEGER, new_value INTEGER, delta INTEGER, raw_delta INTEGER, source TEXT, description TEXT, reference_id TEXT, game_date TEXT, created_at TEXT)",
    "CREATE TABLE condition_log (id INTEGER PRIMARY KEY AUTOINCREMENT, player_id TEXT, team_id TEXT, old_value INTEGER, new_value INTEGER, delta INTEGER, source TEXT, description TEXT, game_date TEXT, created_at TEXT)",
    "CREATE TABLE club_incidents (id TEXT PRIMARY KEY, team_id TEXT, status TEXT, culprit_player_id TEXT, culprit_revealed INTEGER, created_at TEXT)",
  ]) await db.prepare(sql).run();
}, 30_000);

afterAll(async () => { await miniflare.dispose(); });

const calm = JSON.stringify({ discipline: 70, temper: 30 });
const rebel = JSON.stringify({ discipline: 20, temper: 80 });

beforeEach(async () => {
  askModelJson.mockReset();
  for (const t of ["coach_commitments", "teams", "players", "matches", "season_calendar", "conversations", "messages", "coach_relation_log", "condition_log", "club_incidents"]) {
    await db.prepare(`DELETE FROM ${t}`).run();
  }
  await db.batch([
    db.prepare("INSERT INTO teams (id, name, user_id, game_date) VALUES ('club', 'FC Rohde', 'u1', '2026-11-19'), ('rival', 'Akcent', 'u2', '2026-11-19')"),
    db.prepare(`INSERT INTO players (id, team_id, first_name, last_name, position, personality, life_context, coach_relationship) VALUES
      ('p1', 'club', 'Tomáš', 'Veselý', 'MID', '${calm}', '{"morale":50,"condition":90}', 50),
      ('p2', 'club', 'Patrik', 'Kopecký', 'FWD', '${rebel}', '{"morale":50,"condition":90}', 50),
      ('p3', 'club', 'Ondřej', 'Nový', 'GK', '${calm}', '{"morale":50,"condition":90}', 50),
      ('loan', 'rival', 'Jan', 'Hostující', 'DEF', '${calm}', '{"morale":50}', 50)`),
    db.prepare("UPDATE players SET loan_from_team_id = 'club' WHERE id = 'loan'"),
    db.prepare("INSERT INTO conversations (id, team_id, type, title, created_at) VALUES ('kab', 'club', 'squad_group', 'Kabina', '2026-11-01')"),
    db.prepare("INSERT INTO conversations (id, team_id, type, title, participant_id, created_at) VALUES ('c2', 'club', 'player', 'Patrik Kopecký', 'p2', '2026-11-01')"),
  ]);
});

const status = async (id: string) => (await db.prepare("SELECT status FROM coach_commitments WHERE id = ?").bind(id).first<{ status: string }>())?.status;
const life = async (pid: string) => JSON.parse((await db.prepare("SELECT life_context FROM players WHERE id = ?").bind(pid).first<{ life_context: string }>())!.life_context);
const playerMessages = async (convId: string) => (await db.prepare(
  "SELECT sender_id, body FROM messages WHERE conversation_id = ? AND sender_type = 'player' ORDER BY sent_at",
).bind(convId).all<{ sender_id: string; body: string }>()).results;
const smsFrom = async (pid: string) => (await db.prepare(
  "SELECT m.body FROM messages m JOIN conversations c ON c.id = m.conversation_id WHERE c.type = 'player' AND m.sender_id = ?",
).bind(pid).all<{ body: string }>()).results.map((r) => r.body);
const lineup = (ids: string[]) => JSON.stringify({ starters: ids.map((id) => ({ id })) });

describe("kdo nechodí, nehraje", () => {
  const rule = () => recordCommitment(db, {
    clubTeamId: "club", playerId: "p1", convId: "kab", coachMessage: "Kdo nebude chodit na tréninky, nebude hrát",
    detected: { kind: "training_rule" }, playerFirstName: "Tomáš", now: T0,
  });

  it("platí pro celou kabinu: hráči ho znají a docházka stoupne", async () => {
    await rule();
    const rules = await loadClubRules(db, "club");
    expect(rules).toHaveLength(1);
    expect(rules[0].details.squad).toBe(true);
    expect(await trainingRuleBonus(db, "club")).toBe(TRAINING_RULE_ATTENDANCE_BONUS);
    expect((await db.prepare("SELECT body FROM messages WHERE conversation_id = 'kab' AND sender_type = 'system'").first<{ body: string }>())?.body)
      .toBe("📝 Kabina si pravidlo zapamatovala: kdo vynechá trénink, nehraje.");
  });

  it("trenér postaví hráče, který vynechal trénink: kabina to vidí, pravidlo padá", async () => {
    const id = await rule();
    await db.batch([
      db.prepare("UPDATE players SET life_context = json_set(life_context, '$.missedTrainings', json('[\"2026-11-20\"]')) WHERE id = 'p2'"),
      db.prepare("INSERT INTO season_calendar VALUES ('cal1', 'L1', 3, '2026-11-22T16:00:00Z', 'simulated')"),
      db.prepare("INSERT INTO matches (id, calendar_id, home_team_id, away_team_id, status, simulated_at, home_lineup_data) VALUES ('m1', 'cal1', 'club', 'rival', 'simulated', '2026-11-22T16:05:00Z', ?)").bind(lineup(["p2", "p3"])),
    ]);
    await settleCoachCommitments(db, new Date("2026-11-23T10:00:00Z"));
    expect(await status(id)).toBe("broken");
    expect((await life("p1")).morale).toBe(48);
    expect((await life("p2")).morale).toBe(50);
    // Napíše ten nejukázněnější, kdo trénink nevynechal.
    const sms = [...await smsFrom("p1"), ...await smsFrom("p3")];
    expect(sms).toHaveLength(1);
    expect(RULE_BROKEN_SMS.map((t) => t.replace("{name}", "Patrik Kopecký"))).toContain(sms[0]);
    expect(await trainingRuleBonus(db, "club")).toBe(0);
  });

  it("dodržené pravidlo do konce lhůty: dodrženo, bez SMS", async () => {
    const id = await rule();
    await db.prepare("INSERT INTO matches (id, calendar_id, home_team_id, away_team_id, status, simulated_at, away_lineup_data) VALUES ('m1', NULL, 'rival', 'club', 'simulated', '2026-11-22T16:05:00Z', ?)").bind(lineup(["p1"])).run();
    await settleCoachCommitments(db, new Date("2026-11-23T10:00:00Z"));
    expect(await status(id)).toBe("active");
    await settleCoachCommitments(db, new Date("2026-12-12T10:00:00Z"));
    expect(await status(id)).toBe("kept");
    expect(await smsFrom("p1")).toEqual([]);
  });
});

describe("trestná kolečka", () => {
  it("odmítl v SMS: na tréninku neběží, vztah dolů a trenérovi to napíše", async () => {
    const id = await recordCommitment(db, {
      clubTeamId: "club", playerId: "p2", convId: "c2", coachMessage: "Budeš běhat kolečka", detected: { kind: "laps_penalty", target: "self" },
      playerFirstName: "Patrik", now: T0,
    });
    expect(await respondToCoachRequest(db, { commitmentId: id, playerId: "p2", accepted: false })).toBe(true);
    expect(await respondToCoachRequest(db, { commitmentId: id, playerId: "p2", accepted: true })).toBe(false);
    await applyLapsAtTraining(db, { clubTeamId: "club", teamId: "club", gameDay: "2026-11-20", attended: new Map([["p2", true]]) });
    expect(await status(id)).toBe("active");
    expect((await life("p2")).condition).toBe(90);
    const log = await db.prepare("SELECT delta FROM coach_relation_log WHERE player_id = 'p2'").first<{ delta: number }>();
    expect(log?.delta).toBe(LAPS_REFUSED_RELATION);
    await settleCoachCommitments(db, new Date("2026-11-20T10:00:00Z"));
    expect(await status(id)).toBe("kept");
    expect(LAPS_REFUSED_SMS).toContain((await smsFrom("p2"))[0]);
    // Druhý běh už nic nepíše.
    await settleCoachCommitments(db, new Date("2026-11-21T10:00:00Z"));
    expect(await smsFrom("p2")).toHaveLength(1);
  });

  it("kývl: odběhá, kondice −5, nálada −1; kdo nepřišel, běží až příště", async () => {
    const id = await recordCommitment(db, {
      clubTeamId: "club", playerId: "p2", convId: "c2", coachMessage: "Budeš běhat kolečka", detected: { kind: "laps_penalty", target: "self" },
      playerFirstName: "Patrik", now: T0,
    });
    await respondToCoachRequest(db, { commitmentId: id, playerId: "p2", accepted: true });
    await applyLapsAtTraining(db, { clubTeamId: "club", teamId: "club", gameDay: "2026-11-20", attended: new Map([["p2", false]]) });
    expect(await status(id)).toBe("active");
    await applyLapsAtTraining(db, { clubTeamId: "club", teamId: "club", gameDay: "2026-11-24", attended: new Map([["p2", true]]) });
    await applyLapsAtTraining(db, { clubTeamId: "club", teamId: "club", gameDay: "2026-11-27", attended: new Map([["p2", true]]) });
    await settleCoachCommitments(db, new Date("2026-11-24T10:00:00Z"));
    expect(await status(id)).toBe("kept");
    expect(await life("p2")).toMatchObject({ condition: 85, morale: 49 });
    expect((await db.prepare("SELECT description FROM condition_log WHERE player_id = 'p2'").first<{ description: string }>())?.description).toBe("Trestná kolečka");
  });

  it("v denním ticku až po regeneraci: Marek 92 → 100 → 95, ne 92 → 87 → 100 (E2E 22. 11.)", async () => {
    await db.prepare("UPDATE players SET life_context = json_set(life_context, '$.condition', 92) WHERE id = 'p2'").run();
    const id = await recordCommitment(db, {
      clubTeamId: "club", playerId: "p2", convId: "c2", coachMessage: "Budeš běhat kolečka", detected: { kind: "laps_penalty", target: "self" },
      playerFirstName: "Patrik", now: T0,
    });
    await respondToCoachRequest(db, { commitmentId: id, playerId: "p2", accepted: true });
    // Trénink: kolečka se zapíšou, kondice zatím ne.
    await applyLapsAtTraining(db, { clubTeamId: "club", teamId: "club", gameDay: "2026-11-22", attended: new Map([["p2", true]]), deferCondition: true });
    expect((await life("p2")).condition).toBe(92);
    // Denní regenerace (daily-tick) vytáhne kondici na strop.
    await db.prepare("UPDATE players SET life_context = json_set(life_context, '$.condition', 100)").run();
    expect(await applyPendingLapsFatigue(db, "2026-11-22")).toBe(1);
    expect((await life("p2")).condition).toBe(100 - LAPS_CONDITION);
    expect((await db.prepare("SELECT old_value, new_value, description FROM condition_log WHERE player_id = 'p2'").first()))
      .toEqual({ old_value: 100, new_value: 95, description: "Trestná kolečka" });
    // Druhý běh (pokračování ticku) nic neodečte.
    expect(await applyPendingLapsFatigue(db, "2026-11-22")).toBe(0);
    expect((await life("p2")).condition).toBe(95);
    // Ranní SMS o odběhaných kolečkách funguje dál.
    await settleCoachCommitments(db, new Date("2026-11-22T10:00:00Z"));
    expect(await status(id)).toBe("kept");
  });

  it("„kdo se omluví, běhá“: po zápase dostane trest každý omluvený zvlášť", async () => {
    const rule = await recordCommitment(db, {
      clubTeamId: "club", playerId: "p1", convId: "kab", coachMessage: "Kdo nebude moct, bude běhat kolečka",
      detected: { kind: "laps_penalty", target: "absentees" }, playerFirstName: "Tomáš", now: T0,
    });
    await db.batch([
      db.prepare("INSERT INTO conversations (id, team_id, type, title, created_at) VALUES ('g1', 'club', 'squad_group', '⚽ vs Akcent', '2026-11-21')"),
      db.prepare(`INSERT INTO messages (id, conversation_id, sender_type, sender_id, sender_name, body, metadata, sent_at) VALUES
        ('a1', 'g1', 'player', 'p3', 'Ondřej Nový', 'Babičku k doktorovi.', '{"type":"attendance","response":"no","calendarId":"cal1"}', '2026-11-21T03:00:10Z'),
        ('a2', 'g1', 'player', 'p1', 'Tomáš Veselý', 'Jasně.', '{"type":"attendance","response":"yes","calendarId":"cal1"}', '2026-11-21T03:00:20Z')`),
      db.prepare("INSERT INTO matches (id, calendar_id, home_team_id, away_team_id, status, simulated_at) VALUES ('m1', 'cal1', 'club', 'rival', 'simulated', '2026-11-22T16:05:00Z')"),
    ]);
    await settleCoachCommitments(db, new Date("2026-11-23T10:00:00Z"));
    expect(await status(rule)).toBe("kept");
    const personal = await db.prepare("SELECT player_id, status, details FROM coach_commitments WHERE kind = 'laps_penalty' AND id != ?").bind(rule).all<{ player_id: string; status: string; details: string }>();
    expect(personal.results.map((r) => r.player_id)).toEqual(["p3"]);
    expect(JSON.parse(personal.results[0].details)).toMatchObject({ target: "self", playerIds: ["p3"] });
  });
});

describe("hráč na pokyn odpoví v SMS", () => {
  it("hráč ví, že má kolečka, a jeho „odmakám“ se zapíše", async () => {
    const id = await recordCommitment(db, {
      clubTeamId: "club", playerId: "p2", convId: "c2", coachMessage: "Za omluvenku kolečka", detected: { kind: "laps_penalty", target: "self" },
      playerFirstName: "Patrik", now: new Date(),
    });
    const { loadChatMemory } = await import("./player-memory");
    const player = { id: "p2", firstName: "Patrik", lastName: "Kopecký" } as import("./ai-player-scenarios").PlayerSnapshot;
    await loadChatMemory(db, player, { teamId: "club", convId: "c2" });
    expect(player.pendingRequest).toEqual({ commitmentId: id, kind: "laps_penalty" });
    const { afterPlayerReply } = await import("./ai-player-spawn");
    await afterPlayerReply(db, {
      teamId: "club", convId: "c2", player, at: new Date().toISOString(), offerIds: [],
      reply: { body: "Ty kolečka si odmakám, slibuju!", writeLater: false, acceptsRequest: true },
    });
    const d = await db.prepare("SELECT json_extract(details, '$.accepted') AS a FROM coach_commitments WHERE id = ?").bind(id).first<{ a: number }>();
    expect(d?.a).toBe(1);
  });
});

describe("poslední šance", () => {
  it("menší šance na průšvih, a když se další provalí, asistent připomene slib", async () => {
    const id = await recordCommitment(db, {
      clubTeamId: "club", playerId: "p2", convId: "c2", coachMessage: "Máš poslední šanci, jedna blbost a letíš!",
      detected: { kind: "last_chance" }, playerFirstName: "Patrik", now: T0,
    });
    expect((await life("p2")).lastChanceUntil).toBe("2026-12-19");
    await settleCoachCommitments(db, new Date("2026-11-20T10:00:00Z"));
    expect(await status(id)).toBe("active");
    await db.prepare("INSERT INTO club_incidents VALUES ('inc2', 'club', 'otevreny', 'p2', 1, '2026-11-25T03:00:00Z')").run();
    await settleCoachCommitments(db, new Date("2026-11-26T10:00:00Z"));
    expect(await status(id)).toBe("broken");
    expect((await life("p2")).lastChanceUntil).toBeUndefined();
    const reminder = await db.prepare(
      "SELECT m.body FROM messages m JOIN conversations c ON c.id = m.conversation_id WHERE c.title = 'Asistent trenéra'",
    ).first<{ body: string }>();
    expect(LAST_CHANCE_REMINDERS.map((t) => t.replace("{name}", "Patrik Kopecký"))).toContain(reminder?.body);
  });

  it("čistý do konce lhůty: dodržel, poslední šance z hráče zmizí", async () => {
    const id = await recordCommitment(db, {
      clubTeamId: "club", playerId: "p2", convId: "c2", coachMessage: "Máš poslední šanci, jedna blbost a letíš!",
      detected: { kind: "last_chance" }, playerFirstName: "Patrik", now: T0,
    });
    await settleCoachCommitments(db, new Date("2026-12-20T10:00:00Z"));
    expect(await status(id)).toBe("kept");
    expect((await life("p2")).lastChanceUntil).toBeUndefined();
  });
});

describe("omluva kabině", () => {
  const apology = (playerId: string, name: string) => recordCommitment(db, {
    clubTeamId: "club", playerId, convId: "c2", coachMessage: "Omluvíš se celé kabině", detected: { kind: "squad_apology" }, playerFirstName: name, now: T0,
  });

  it("kývl: druhý den se v kabině omluví a kabině se uleví", async () => {
    const id = await apology("p1", "Tomáš");
    await respondToCoachRequest(db, { commitmentId: id, playerId: "p1", accepted: true });
    await settleCoachCommitments(db, new Date("2026-11-19T16:00:00Z"));
    expect(await status(id)).toBe("active");
    await settleCoachCommitments(db, new Date("2026-11-20T10:00:00Z"));
    expect(await status(id)).toBe("kept");
    const posted = await playerMessages("kab");
    expect(posted).toHaveLength(1);
    expect(APOLOGY_SINCERE_KABINA).toContain(posted[0].body);
    expect((await life("p3")).morale).toBe(52);
    expect((await life("p1")).morale).toBe(50);
  });

  it("vzdorovitý hráč bez odpovědi to odmítne a kabina to vidí", async () => {
    const id = await apology("p2", "Patrik");
    await settleCoachCommitments(db, new Date("2026-11-20T10:00:00Z"));
    expect(await status(id)).toBe("broken");
    expect(APOLOGY_REFUSED_KABINA).toContain((await playerMessages("kab"))[0]?.body);
    expect((await life("p3")).morale).toBe(49);
  });
});

describe("pravidla z kabiny", () => {
  const squad = [
    { id: "p1", firstName: "Tomáš", lastName: "Veselý" },
    { id: "p2", firstName: "Patrik", lastName: "Kopecký" },
    { id: "loan", firstName: "Jan", lastName: "Hostující" },
  ];
  it("poslední šance jmenovaným: jen vlastní kádr, hráč na hostování nic", async () => {
    askModelJson.mockResolvedValueOnce({ kind: "last_chance", quote: "poslední šance, jedna blbost a letíte", target: "named" });
    const ids = await handleSquadRule(db, {}, {
      teamId: "club", convId: "kab", message: "Kopecký a Hostující, poslední šance, jedna blbost a letíte.", squad, representative: squad[0],
    });
    expect(ids).toHaveLength(1);
    expect((await life("p2")).lastChanceUntil).toBeDefined();
    expect((await life("loan")).lastChanceUntil).toBeUndefined();
  });

  it("kolečka celé kabině zastupuje kapitán; zpráva bez trestu model nevolá", async () => {
    askModelJson.mockResolvedValueOnce({ kind: "laps_penalty", quote: "na tréninku za tenhle výkon budete běhat", target: "team" });
    const ids = await handleSquadRule(db, {}, {
      teamId: "club", convId: "kab", message: "11 střel a žádný gól, na tréninku za tenhle výkon budete běhat", squad, representative: squad[0],
    });
    expect(ids).toHaveLength(1);
    expect((await loadClubRules(db, "club"))[0].details).toMatchObject({ squad: true, target: "team" });
    expect(await handleSquadRule(db, {}, { teamId: "club", convId: "kab", message: "Zdar chlapi", squad, representative: squad[0] })).toEqual([]);
    expect(askModelJson).toHaveBeenCalledTimes(1);
    // Kolečka celé kabiny běží jen áčko, kdo přišel.
    await applyLapsAtTraining(db, { clubTeamId: "club", teamId: "club", gameDay: "2026-11-20", attended: new Map([["p1", true], ["p3", false]]) });
    expect((await life("p1")).condition).toBe(85);
    expect((await life("p3")).condition).toBe(90);
  });

  // Lokální E2E 22. 11. (Fezko, Kabina): plán tréninku se zapsal jako kolečka celé kabině.
  it("plán tréninku v kabině trest není, ani když ho model za trest vezme", async () => {
    expect(await handleSquadRule(db, {}, {
      teamId: "club", convId: "kab", message: "Ještě k úternímu tréninku: začínáme v půl šesté a bude hodně běhání.", squad, representative: squad[0],
    })).toEqual([]);
    expect(askModelJson).not.toHaveBeenCalled();
    askModelJson.mockResolvedValueOnce({ kind: "laps_penalty", quote: "budeme běhat kolečka na rozcvičku", target: "team" });
    expect(await handleSquadRule(db, {}, {
      teamId: "club", convId: "kab", message: "Ve čtvrtek budeme běhat kolečka na rozcvičku a pak standardky.", squad, representative: squad[0],
    })).toEqual([]);
    // Trest bez „celá kabina“, „všichni“ nebo „budete“ dostanou jen jmenovaní (tady nikdo).
    askModelJson.mockResolvedValueOnce({ kind: "laps_penalty", quote: "Kopecký za trest poběží kolečka", target: "team" });
    const ids = await handleSquadRule(db, {}, {
      teamId: "club", convId: "kab", message: "Kopecký za trest poběží kolečka.", squad, representative: squad[0],
    });
    expect(ids).toHaveLength(1);
    const row = await db.prepare("SELECT player_id, details FROM coach_commitments WHERE id = ?").bind(ids[0]).first<{ player_id: string; details: string }>();
    expect(row?.player_id).toBe("p2");
    expect(JSON.parse(row?.details ?? "{}")).toMatchObject({ target: "self" });
  });
});
