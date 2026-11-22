/**
 * Slib docházky nad skutečnou D1 (Miniflare): zápis z odpovědi hráče, odpověď do kabiny zápasu,
 * omluvenky podle kabiny a ranní vyhodnocení porušeného slibu.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { Miniflare } from "miniflare";
import { BROKEN_PLEDGE_SMS, BROKEN_PLEDGE_RELATION, MATCH_ATTEND_PLEDGE_TEXTS, recordAttendancePledge, settleAttendancePledges } from "./attendance-pledge";
import { afterPlayerReply, applyResolutionAndClose } from "./ai-player-spawn";
import { recordedExcuses } from "../events/match-absences";
import type { PlayerSnapshot } from "./ai-player-scenarios";

let miniflare: Miniflare;
let db: D1Database;

beforeAll(async () => {
  miniflare = new Miniflare({ modules: true, script: "export default { fetch() { return new Response('ok'); } }", d1Databases: ["DB"] });
  db = await miniflare.getD1Database("DB");
  for (const sql of [
    "CREATE TABLE teams (id TEXT PRIMARY KEY, name TEXT, user_id TEXT, parent_team_id TEXT, team_type TEXT NOT NULL DEFAULT 'senior', league_id TEXT, game_date TEXT, training_type TEXT, training_sessions INTEGER, training_days TEXT, training_plan TEXT)",
    "CREATE TABLE players (id TEXT PRIMARY KEY, team_id TEXT, first_name TEXT, last_name TEXT, nickname TEXT, avatar TEXT, nationality TEXT, life_context TEXT, coach_relationship INTEGER, status TEXT, loan_from_team_id TEXT)",
    "CREATE TABLE season_calendar (id TEXT PRIMARY KEY, league_id TEXT, season_number INTEGER, scheduled_at TEXT, status TEXT)",
    "CREATE TABLE matches (id TEXT PRIMARY KEY, calendar_id TEXT, home_team_id TEXT, away_team_id TEXT, status TEXT, created_at TEXT)",
    "CREATE TABLE conversations (id TEXT PRIMARY KEY, team_id TEXT, type TEXT, title TEXT, participant_id TEXT, participant_avatar TEXT, last_message_text TEXT, last_message_at TEXT, unread_count INTEGER DEFAULT 0, created_at TEXT, pinned INTEGER DEFAULT 0, ai_thread_state TEXT, ai_thread_active INTEGER DEFAULT 0)",
    "CREATE TABLE messages (id TEXT PRIMARY KEY, conversation_id TEXT, sender_type TEXT, sender_id TEXT, sender_name TEXT, body TEXT, metadata TEXT, sent_at TEXT, read INTEGER DEFAULT 0)",
    "CREATE TABLE coach_relation_log (id INTEGER PRIMARY KEY AUTOINCREMENT, player_id TEXT, team_id TEXT, old_value INTEGER, new_value INTEGER, delta INTEGER, raw_delta INTEGER, source TEXT, description TEXT, reference_id TEXT, game_date TEXT, created_at TEXT)",
    "CREATE TABLE coach_commitments (id TEXT PRIMARY KEY, team_id TEXT, player_id TEXT, conversation_id TEXT, kind TEXT, status TEXT, made_at TEXT, due_at TEXT, resolved_at TEXT, quote TEXT, details TEXT, last_reminder_key TEXT)",
  ]) await db.prepare(sql).run();
}, 30_000);

afterAll(async () => { await miniflare.dispose(); });

beforeEach(async () => {
  for (const t of ["teams", "players", "season_calendar", "matches", "conversations", "messages", "coach_relation_log", "coach_commitments"]) {
    await db.prepare(`DELETE FROM ${t}`).run();
  }
  await db.batch([
    // Čtvrtek 19. 11., trénink v úterý a v pátek, zápas v neděli 22. 11.
    db.prepare(`INSERT INTO teams (id, name, user_id, league_id, game_date, training_type, training_days) VALUES
      ('club', 'SK Agrokat', 'u1', 'L1', '2026-11-19T00:00:00Z', 'conditioning', '[2,5]'),
      ('rival', 'Katovice', 'u2', 'L1', '2026-11-19T00:00:00Z', 'conditioning', NULL)`),
    db.prepare(`INSERT INTO players (id, team_id, first_name, last_name, nationality, life_context, coach_relationship) VALUES
      ('p1', 'club', 'Petr', 'Šimek', 'CZ', '{"morale":50}', 50)`),
    db.prepare("INSERT INTO season_calendar VALUES ('cal1', 'L1', 3, '2026-11-22T16:00:00Z', 'scheduled')"),
    db.prepare("INSERT INTO matches VALUES ('m1', 'cal1', 'club', 'rival', 'scheduled', '2026-11-01')"),
    db.prepare("INSERT INTO conversations (id, team_id, type, title, participant_id, created_at) VALUES ('c1', 'club', 'player', 'Petr Šimek', 'p1', '2026-11-01')"),
  ]);
});

const life = async (pid = "p1") => JSON.parse((await db.prepare("SELECT life_context FROM players WHERE id = ?").bind(pid).first<{ life_context: string }>())!.life_context);
const notes = async () => (await db.prepare("SELECT body FROM messages WHERE conversation_id = 'c1' AND sender_type = 'system'").all<{ body: string }>()).results.map((r) => r.body);

describe("zápis slibu z odpovědi hráče", () => {
  it("„v pátek snad dorazím“: slib na páteční trénink a poznámka pro trenéra", async () => {
    const snapshot = { id: "p1", firstName: "Petr", lastName: "Šimek" } as PlayerSnapshot;
    await afterPlayerReply(db, {
      teamId: "club", convId: "c1", player: snapshot, at: "2026-11-19T17:25:00Z", offerIds: [],
      reply: { body: "v pátek dorazím", writeLater: false, attendancePledge: { event: "training", intent: "attend", when: "fri" } },
    });
    expect((await life()).trainingPledge).toMatchObject({ intent: "attend", from: "2026-11-20", until: "2026-11-20", once: true, convId: "c1", teamId: "club" });
    expect(await notes()).toEqual(["📝 Petr slíbil, že přijde na trénink v pátek 20. 11."]);
  });

  it("poznámka je pod odpovědí hráče, i když odpověď vlákno uzavře (Jelínek, E2E 22. 11.)", async () => {
    // Vyhodnocení konce vlákna modelem trvá: odpověď dřív dostala čas až po něm, poznámka ze slibu byla nad ní.
    const snapshot = { id: "p1", firstName: "Petr", lastName: "Šimek" } as PlayerSnapshot;
    const at = "2026-11-19T17:25:00.000Z";
    await afterPlayerReply(db, {
      teamId: "club", convId: "c1", player: snapshot, at, offerIds: [],
      reply: { body: "Jasně, trenére, zítra teda nejezdím.", writeLater: false, attendancePledge: { event: "match", intent: "skip", when: "next" } },
    });
    await applyResolutionAndClose(db, "c1", "club", "p1", "Jasně, trenére, zítra teda nejezdím.", "Petr Šimek", "left_out",
      { trigger: "x", scenario_id: "left_out", max_replies: 2, current_replies: 2, awaiting: "player", initiated_at: at } as never,
      { morale_delta: 0, condition_delta: 0, relationship_delta: 0, absence_days: 0, absence_reason: "", summary: "", tone: "neutral" }, at);
    const order = (await db.prepare("SELECT sender_type, sent_at FROM messages WHERE conversation_id = 'c1' ORDER BY julianday(sent_at)")
      .all<{ sender_type: string; sent_at: string }>()).results;
    expect(order.map((m) => m.sender_type)).toEqual(["player", "system"]);
    expect(order.map((m) => m.sent_at)).toEqual([at, "2026-11-19T17:25:01.000Z"]);
  });

  it("„dej si od tréninku pauzu“ a hráč kývne: volno od trenéra, poznámka to říká (Jan Černý, E2E 22. 11.)", async () => {
    await db.prepare("INSERT INTO messages (id, conversation_id, sender_type, body, sent_at) VALUES ('t1', 'c1', 'user', ?, '2026-11-19T17:24:00Z')")
      .bind("Petře, v pátek si dej od tréninku pauzu, potřebuju tě v neděli čerstvýho. Takže nepřijdeš, jo?").run();
    await recordAttendancePledge(db, {
      clubTeamId: "club", convId: "c1", playerId: "p1", playerFirstName: "Petr", pledge: { event: "training", intent: "skip", when: "fri" },
      now: new Date("2026-11-19T17:25:00Z"),
    });
    expect((await life()).trainingPledge).toMatchObject({ intent: "skip", from: "2026-11-20", coachGranted: true });
    expect(await notes()).toEqual(["📝 Petr má na trénink v pátek 20. 11. od tebe volno."]);
  });

  it("váhavé „asi nepřijdu“ slib není (Šimon Nový, E2E 22. 11.)", async () => {
    await db.prepare("INSERT INTO messages (id, conversation_id, sender_type, body, sent_at) VALUES ('t1', 'c1', 'user', 'Petře, v pátek trénink v pět, dorazíš?', '2026-11-19T17:24:00Z')").run();
    expect(await recordAttendancePledge(db, {
      clubTeamId: "club", convId: "c1", playerId: "p1", playerFirstName: "Petr", pledge: { event: "training", intent: "skip", when: "fri" },
      replyBody: "Trenére, asi nepřijdu. Šichta se nedá odsunout, přijde to zkrátka.", now: new Date("2026-11-19T17:25:00Z"),
    })).toBeNull();
    expect((await life()).trainingPledge).toBeUndefined();
    expect(await notes()).toEqual([]);
    // Jasné „nepřijdu“ k témuž je slib.
    expect(await recordAttendancePledge(db, {
      clubTeamId: "club", convId: "c1", playerId: "p1", playerFirstName: "Petr", pledge: { event: "training", intent: "skip", when: "fri" },
      replyBody: "Trenére, v pátek nepřijdu, mám šichtu.", now: new Date("2026-11-19T17:26:00Z"),
    })).toMatchObject({ intent: "skip", from: "2026-11-20" });
  });

  it("odpověď mimo téma slib není: trenér psal výhrůžku, hráč odpověděl na starý hovor", async () => {
    await db.prepare("INSERT INTO messages (id, conversation_id, sender_type, body, sent_at) VALUES ('t1', 'c1', 'user', 'Šimone, jestli to uděláš ještě jednou, letíš.', '2026-11-19T17:24:00Z')").run();
    expect(await recordAttendancePledge(db, {
      clubTeamId: "club", convId: "c1", playerId: "p1", playerFirstName: "Petr", pledge: { event: "training", intent: "skip", when: "wed" },
      replyBody: "Nepřijdu, šichta se nedá odsunout.", now: new Date("2026-11-19T17:25:00Z"),
    })).toBeNull();
    // Hráč sám jmenuje trénink: k tématu to je, i když se trenér neptal.
    expect(await recordAttendancePledge(db, {
      clubTeamId: "club", convId: "c1", playerId: "p1", playerFirstName: "Petr", pledge: { event: "training", intent: "skip", when: "fri" },
      replyBody: "Jo, chápu. Na páteční trénink ale nepřijdu, mám šichtu.", now: new Date("2026-11-19T17:26:00Z"),
    })).toMatchObject({ intent: "skip" });
  });

  it("stejný slib znovu: poznámka se nezdvojí (Jelínek 3× „nepřijde“, E2E 22. 11.)", async () => {
    const again = (at: string) => recordAttendancePledge(db, {
      clubTeamId: "club", convId: "c1", playerId: "p1", playerFirstName: "Petr", pledge: { event: "match", intent: "skip", when: "next" },
      replyBody: "Furt ne, trenére! Na zápas nejdu.", now: new Date(at),
    });
    await again("2026-11-19T17:25:00Z");
    await again("2026-11-19T17:27:00Z");
    await again("2026-11-19T17:29:00Z");
    expect(await notes()).toEqual(["📝 Petr na zápas v neděli 22. 11. nepřijde."]);
    // Změna názoru poznámku dostane.
    await recordAttendancePledge(db, {
      clubTeamId: "club", convId: "c1", playerId: "p1", playerFirstName: "Petr", pledge: { event: "match", intent: "attend", when: "next" },
      replyBody: "Tak jo, na zápas přijdu.", now: new Date("2026-11-19T17:31:00Z"),
    });
    expect(await notes()).toHaveLength(2);
  });

  it("přemluvení přepíše starší „nepřijdu“", async () => {
    await recordAttendancePledge(db, { clubTeamId: "club", convId: "c1", playerId: "p1", playerFirstName: "Petr", pledge: { event: "training", intent: "skip", when: "week" } });
    expect((await life()).trainingPledge.intent).toBe("skip");
    await recordAttendancePledge(db, { clubTeamId: "club", convId: "c1", playerId: "p1", playerFirstName: "Petr", pledge: { event: "training", intent: "attend", when: "tue" } });
    expect((await life()).trainingPledge).toMatchObject({ intent: "attend", from: "2026-11-24" });
  });

  it("tým netrénuje: nic se nezapíše ani nepíše", async () => {
    await db.prepare("UPDATE teams SET training_type = NULL, training_days = NULL WHERE id = 'club'").run();
    expect(await recordAttendancePledge(db, { clubTeamId: "club", convId: "c1", playerId: "p1", playerFirstName: "Petr", pledge: { event: "training", intent: "attend", when: "next" } })).toBeNull();
    expect((await life()).trainingPledge).toBeUndefined();
    expect(await notes()).toEqual([]);
  });
});

describe("jen vlastní kádr", () => {
  it("hráč na hostování v cizím klubu si omluvenku v jeho zápase nevyrobí", async () => {
    await db.batch([
      // Klubu patří, ale hostuje v Katovicích: jejich kabina zápasu už existuje.
      db.prepare("INSERT INTO players (id, team_id, first_name, last_name, life_context, coach_relationship, loan_from_team_id) VALUES ('loan', 'rival', 'Jan', 'Hostující', '{}', 50, 'club')"),
      db.prepare("INSERT INTO conversations (id, team_id, type, title, created_at) VALUES ('g2', 'rival', 'squad_group', '⚽ vs SK Agrokat', '2026-11-21')"),
      db.prepare(`INSERT INTO messages (id, conversation_id, sender_type, sender_id, sender_name, body, metadata, sent_at) VALUES
        ('b1', 'g2', 'player', 'loan', 'Jan Hostující', 'Budu tam.', '{"type":"attendance","response":"yes","calendarId":"cal1"}', '2026-11-21T03:00:10Z')`),
    ]);
    expect(await recordAttendancePledge(db, {
      clubTeamId: "club", convId: "c1", playerId: "loan", playerFirstName: "Jan", pledge: { event: "match", intent: "skip", when: "next" },
    })).toBeNull();
    expect((await life("loan")).matchPledge).toBeUndefined();
    expect((await recordedExcuses(db, "rival", "cal1"))?.has("loan")).toBe(false);
    expect((await db.prepare("SELECT COUNT(*) AS n FROM messages WHERE conversation_id IN ('g2', 'c1')").first<{ n: number }>())?.n).toBe(1);
  });

  it("cizí hráč nic, hráč vlastní U21 ano", async () => {
    await db.batch([
      db.prepare("INSERT INTO teams (id, name, user_id, parent_team_id, team_type, league_id, game_date, training_type, training_days) VALUES ('club-u21', 'SK Agrokat U21', 'u1', 'club', 'u21', 'L2', '2026-11-19T00:00:00Z', 'conditioning', '[3]')"),
      db.prepare("INSERT INTO players (id, team_id, first_name, last_name, life_context, coach_relationship) VALUES ('kid', 'club-u21', 'Ondra', 'Mladý', '{}', 50), ('foe', 'rival', 'Karel', 'Cizí', '{}', 50)"),
    ]);
    const training = (playerId: string) => recordAttendancePledge(db, {
      clubTeamId: "club", convId: "c1", playerId, playerFirstName: "Hráč", pledge: { event: "training", intent: "skip", when: "next" },
    });
    expect(await training("foe")).toBeNull();
    expect((await life("foe")).trainingPledge).toBeUndefined();
    expect(await training("kid")).toMatchObject({ intent: "skip", from: "2026-11-25", teamId: "club-u21" });
  });
});

describe("slib k zápasu a kabina zápasu", () => {
  it("kabina ještě není: slib se uloží a použije se při jejím založení", async () => {
    await recordAttendancePledge(db, { clubTeamId: "club", convId: "c1", playerId: "p1", playerFirstName: "Petr", pledge: { event: "match", intent: "skip", when: "sun" } });
    expect((await life()).matchPledge).toMatchObject({ intent: "skip", matchKey: "cal1", matchDay: "2026-11-22" });
    expect(await notes()).toEqual(["📝 Petr na zápas v neděli 22. 11. nepřijde."]);
    expect(await recordedExcuses(db, "club", "cal1")).toBeNull();
  });

  it("omluvený z losu se nechá přemluvit: „přijdu“ do kabiny zápasu a omluvenka neplatí", async () => {
    await db.batch([
      db.prepare("INSERT INTO conversations (id, team_id, type, title, created_at) VALUES ('g1', 'club', 'squad_group', '⚽ vs Katovice', '2026-11-21')"),
      db.prepare(`INSERT INTO messages (id, conversation_id, sender_type, sender_id, sender_name, body, metadata, sent_at) VALUES
        ('a1', 'g1', 'user', 'club', 'Trenér', 'Kdo může?', '{"type":"match_announce","calendarId":"cal1"}', '2026-11-21T03:00:00Z'),
        ('a2', 'g1', 'player', 'p1', 'Petr Šimek', 'Koně okovat, nedám to.', '{"type":"attendance","response":"no","calendarId":"cal1"}', '2026-11-21T03:00:10Z')`),
    ]);
    expect((await recordedExcuses(db, "club", "cal1"))?.has("p1")).toBe(true);
    await recordAttendancePledge(db, { clubTeamId: "club", convId: "c1", playerId: "p1", playerFirstName: "Petr", pledge: { event: "match", intent: "attend", when: "next" }, now: new Date("2026-11-21T07:25:00Z") });
    expect((await recordedExcuses(db, "club", "cal1"))?.has("p1")).toBe(false);
    const said = await db.prepare("SELECT body FROM messages WHERE conversation_id = 'g1' AND json_extract(metadata, '$.timing') = 'pledge'").first<{ body: string }>();
    expect(MATCH_ATTEND_PLEDGE_TEXTS).toContain(said?.body);
    // Podruhé stejný slib do kabiny nic nepíše.
    await recordAttendancePledge(db, { clubTeamId: "club", convId: "c1", playerId: "p1", playerFirstName: "Petr", pledge: { event: "match", intent: "attend", when: "next" } });
    expect((await db.prepare("SELECT COUNT(*) AS n FROM messages WHERE conversation_id = 'g1'").first<{ n: number }>())?.n).toBe(3);
  });
});

describe("ranní vyhodnocení", () => {
  const setPledge = (p: Record<string, unknown>) =>
    db.prepare("UPDATE players SET life_context = json_set(life_context, '$.trainingPledge', json(?), '$.absence', json(?)) WHERE id = 'p1'")
      .bind(JSON.stringify({ intent: "attend", from: "2026-11-20", until: "2026-11-20", once: true, at: "x", convId: "c1", ...p }),
        JSON.stringify({ reason: "Měl směnu v práci", category: "training", date: "2026-11-20" })).run();

  it("slíbil a nepřišel: vztah −2, omluvná SMS, slib zmizí", async () => {
    await db.prepare("UPDATE teams SET game_date = '2026-11-20T00:00:00Z'").run();
    await setPledge({ outcome: "broken", outcomeDay: "2026-11-20" });
    expect(await settleAttendancePledges(db, undefined, new Date("2026-11-20T10:00:00Z"))).toBe(1);
    const log = await db.prepare("SELECT source, delta, description FROM coach_relation_log WHERE player_id = 'p1'").first<{ source: string; delta: number; description: string }>();
    expect(log).toMatchObject({ source: "promise", delta: BROKEN_PLEDGE_RELATION });
    const sms = await db.prepare("SELECT body FROM messages WHERE conversation_id = 'c1' AND sender_type = 'player'").first<{ body: string }>();
    expect(BROKEN_PLEDGE_SMS).toContain(sms?.body);
    expect((await life()).trainingPledge).toBeUndefined();
    // Druhý běh už nic nedělá.
    expect(await settleAttendancePledges(db, undefined, new Date("2026-11-21T10:00:00Z"))).toBe(0);
  });

  it("splněný slib zmizí bez SMS, běžící slib zůstane, prošlý zápas se smaže", async () => {
    await db.prepare("UPDATE teams SET game_date = '2026-11-20T00:00:00Z'").run();
    await setPledge({ outcome: "kept", outcomeDay: "2026-11-20" });
    await db.prepare(`INSERT INTO players (id, team_id, first_name, last_name, life_context, coach_relationship) VALUES
      ('p2', 'club', 'Radek', 'Šíma', '{"trainingPledge":{"intent":"skip","from":"2026-11-20","until":"2026-11-24","once":false,"at":"x","convId":"c2"},"matchPledge":{"intent":"skip","matchKey":"old","matchDay":"2026-11-15","at":"x","convId":"c2"}}', 50)`).run();
    expect(await settleAttendancePledges(db, undefined, new Date("2026-11-20T10:00:00Z"))).toBe(0);
    expect((await life()).trainingPledge).toBeUndefined();
    expect((await life("p2")).trainingPledge?.intent).toBe("skip");
    expect((await life("p2")).matchPledge).toBeUndefined();
    expect((await db.prepare("SELECT COUNT(*) AS n FROM messages WHERE sender_type = 'player'").first<{ n: number }>())?.n).toBe(0);
  });
});
