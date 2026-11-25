/**
 * Slib docházky nad skutečnou D1 (Miniflare): zápis z odpovědi hráče, odpověď do kabiny zápasu,
 * omluvenky podle kabiny a ranní vyhodnocení porušeného slibu.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { Miniflare } from "miniflare";
import { BROKEN_PLEDGE_SMS, BROKEN_PLEDGE_RELATION, MATCH_ATTEND_PLEDGE_TEXTS, recordAttendancePledge, recordMatchPledgeByAdmin, settleAttendancePledges } from "./attendance-pledge";
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
    "CREATE TABLE cup_teams (id TEXT PRIMARY KEY, team_id TEXT)",
    "CREATE TABLE injuries (id TEXT PRIMARY KEY, player_id TEXT, team_id TEXT, days_remaining INTEGER)",
    "ALTER TABLE players ADD COLUMN suspended_matches INTEGER NOT NULL DEFAULT 0",
    "CREATE TABLE cup_matches (id TEXT PRIMARY KEY, home_cup_team_id TEXT, away_cup_team_id TEXT, scheduled_at TEXT)",
  ]) await db.prepare(sql).run();
}, 30_000);

afterAll(async () => { await miniflare.dispose(); });

beforeEach(async () => {
  for (const t of ["teams", "players", "season_calendar", "matches", "conversations", "messages", "coach_relation_log", "coach_commitments", "cup_teams", "cup_matches", "injuries"]) {
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

  it("„v patek budu musím si to rozmyslet“ slib není (Stehlík, E2E 22. 11.: dostal 📝 na pátek)", async () => {
    await db.prepare("INSERT INTO messages (id, conversation_id, sender_type, body, sent_at) VALUES ('t1', 'c1', 'user', 'A dorazíš v pátek na trénink?', '2026-11-19T17:24:00Z')").run();
    expect(await recordAttendancePledge(db, {
      clubTeamId: "club", convId: "c1", playerId: "p1", playerFirstName: "Petr", pledge: { event: "training", intent: "attend", when: "fri" },
      replyBody: "trenere diky za otazku v patek budu musím si to rozmyslet ale diky za pochopení", now: new Date("2026-11-19T17:25:00Z"),
    })).toBeNull();
    expect((await life()).trainingPledge).toBeUndefined();
    expect(await notes()).toEqual([]);
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

  // Přetest 3 (Procházka): 📝 „přijde na trénink v sobotu 28. 11.“, v sobotu byl pohár a trénink
  // se nekonal. Slib bral zápasy jen z ligy, tick trénink ruší i kvůli poháru a přáteláku.
  it("v den poháru ani přáteláku se netrénuje: slib jde na nejbližší trénink, který se koná", async () => {
    await db.batch([
      db.prepare("INSERT INTO cup_teams VALUES ('ct1', 'club'), ('ct2', 'rival')"),
      db.prepare("INSERT INTO cup_matches VALUES ('cm1', 'ct1', 'ct2', '2026-11-20T16:00:00.000Z')"),
    ]);
    // „V pátek dorazím“ na den poháru nic neslibuje (dřív šel slib na úterý a 📝 ukázala jiný den).
    expect(await recordAttendancePledge(db, { clubTeamId: "club", convId: "c1", playerId: "p1", playerFirstName: "Petr", pledge: { event: "training", intent: "attend", when: "fri" } }))
      .toBeNull();
    expect(await recordAttendancePledge(db, { clubTeamId: "club", convId: "c1", playerId: "p1", playerFirstName: "Petr", pledge: { event: "training", intent: "attend", when: "next" } }))
      .toMatchObject({ from: "2026-11-24", until: "2026-11-24" });
    // Přátelák v úterý 24. 11.: v okně slibu (7 dní) už žádný trénink není, nic se nezapíše.
    await db.prepare("INSERT INTO matches VALUES ('f1', NULL, 'club', 'rival', 'scheduled', '2026-11-24T16:00:00.000Z')").run();
    expect(await recordAttendancePledge(db, { clubTeamId: "club", convId: "c1", playerId: "p1", playerFirstName: "Petr", pledge: { event: "training", intent: "skip", when: "next" } }))
      .toBeNull();
  });

  // Přetest 3 (Antonín Pospíšil, koleno na 5 dní): „Jasný, dorazím, trenére! 😊“ → 📝 „slíbil, že přijde
  // na trénink“. Zraněný na trénink nechodí, slib se nikdy nevyhodnotí a trenér vidí slib, který nejde splnit.
  it("zraněný slib na trénink ani zápas nedá, dokud je zraněný; hráč se stopkou ne na zápas", async () => {
    await db.prepare("INSERT INTO injuries VALUES ('i1', 'p1', 'club', 5)").run();
    const pledge = (event: "training" | "match", when: "next" | "tue" | "fri" = "next") => recordAttendancePledge(db, {
      clubTeamId: "club", convId: "c1", playerId: "p1", playerFirstName: "Petr", pledge: { event, intent: "attend", when },
    });
    expect(await pledge("training")).toBeNull();
    expect(await pledge("match")).toBeNull();
    expect(await recordAttendancePledge(db, {
      clubTeamId: "club", convId: "c1", playerId: "p1", playerFirstName: "Petr", pledge: { event: "training", intent: "skip", when: "next" },
    })).toBeNull();
    expect((await life()).trainingPledge).toBeUndefined();
    expect((await life()).matchPledge).toBeUndefined();
    expect(await notes()).toEqual([]);
    // Zranění na 2 dny: pátek 20. 11. ještě ne, úterý 24. 11. už ano.
    await db.prepare("UPDATE injuries SET days_remaining = 2").run();
    expect(await pledge("training", "fri")).toBeNull();
    expect(await pledge("training", "tue")).toMatchObject({ from: "2026-11-24" });
    // Stopka: na zápas ne, trénovat smí (tick ho na trénink pouští).
    await db.batch([db.prepare("DELETE FROM injuries"), db.prepare("UPDATE players SET suspended_matches = 1 WHERE id = 'p1'")]);
    expect(await pledge("match")).toBeNull();
    expect(await pledge("training", "fri")).toMatchObject({ from: "2026-11-20" });
  });

  // E2E 22. 11. (Jitona: trénink v neděli, ve středu, v pátek a v sobotu): model vrátil „next“
  // a 📝 ukázala nejbližší trénink místo dne, který hráč napsal.
  it("Beran „Ve středu jsem tam“ v pátek 27. 11.: 📝 na středu 2. 12., ne na neděli 29. 11.", async () => {
    await db.batch([
      db.prepare("UPDATE teams SET training_days = '[0,3,5,6]', game_date = '2026-11-27T00:00:00Z' WHERE id = 'club'"),
      db.prepare("INSERT INTO cup_teams VALUES ('ct1', 'club'), ('ct2', 'rival')"),
      db.prepare("INSERT INTO cup_matches VALUES ('cm1', 'ct1', 'ct2', '2026-11-28T13:00:00.000Z')"),
      db.prepare("INSERT INTO messages (id, conversation_id, sender_type, body, sent_at) VALUES ('t1', 'c1', 'user', ?, '2026-11-22T19:07:34.475Z')")
        .bind("Honzo, dorazíš ve středu na trénink? Potřebuju tě na standardky."),
    ]);
    expect(await recordAttendancePledge(db, {
      clubTeamId: "club", convId: "c1", playerId: "p1", playerFirstName: "Jan", pledge: { event: "training", intent: "attend", when: "next" },
      replyBody: "Ve středu jsem tam, trenére! Standardky mi jdou 👍", now: new Date("2026-11-22T19:07:52.870Z"),
    })).toMatchObject({ from: "2026-12-02", until: "2026-12-02" });
    expect(await notes()).toEqual(["📝 Jan slíbil, že přijde na trénink ve středu 2. 12."]);
  });

  it("Hovorka „Dorazím v pátek!“ v neděli 29. 11.: 📝 na pátek 4. 12.; den bez tréninku nic", async () => {
    await db.batch([
      db.prepare("UPDATE teams SET training_days = '[0,3,5,6]', game_date = '2026-11-29T00:00:00Z' WHERE id = 'club'"),
      db.prepare("INSERT INTO season_calendar VALUES ('cal2', 'L1', 3, '2026-11-30T17:00:00Z', 'scheduled')"),
      db.prepare("INSERT INTO matches VALUES ('m2', 'cal2', 'club', 'rival', 'scheduled', '2026-11-01')"),
      db.prepare("INSERT INTO messages (id, conversation_id, sender_type, body, sent_at) VALUES ('t1', 'c1', 'user', ?, '2026-11-22T19:31:15.255Z')")
        .bind("Kubo, dorazíš v pátek na trénink? Budeme dělat standardky."),
    ]);
    expect(await recordAttendancePledge(db, {
      clubTeamId: "club", convId: "c1", playerId: "p1", playerFirstName: "Jakub", pledge: { event: "training", intent: "attend", when: "next" },
      replyBody: "Dorazím v pátek! Standardky budou dobré, jsem připravenej.", now: new Date("2026-11-22T19:31:31.517Z"),
    })).toMatchObject({ from: "2026-12-04", until: "2026-12-04" });
    expect(await notes()).toEqual(["📝 Jakub slíbil, že přijde na trénink v pátek 4. 12."]);
    // V úterý se netrénuje: slib se nezapíše na jiný den.
    await db.prepare("UPDATE players SET life_context = '{}' WHERE id = 'p1'").run();
    expect(await recordAttendancePledge(db, {
      clubTeamId: "club", convId: "c1", playerId: "p1", playerFirstName: "Jakub", pledge: { event: "training", intent: "attend", when: "next" },
      replyBody: "V pátek nemůžu, ale v úterý dorazím, trenére.", now: new Date("2026-11-22T19:33:00Z"),
    })).toBeNull();
    expect((await life()).trainingPledge).toBeUndefined();
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

  // Janoušek (Vlachovo Březí, 25. 11.): den předem „Budu tam“ ve skupině „⚽ vs …“, ráno omluvenka
  // „Zaspal jsem“ v obecné Kabině. Slib „přijdu“ musí přebít poslední odpověď napříč oběma.
  it("dvě kabiny ke stejnému kolu: „přijdu“ přebije ranní omluvenku z druhé kabiny", async () => {
    await db.batch([
      db.prepare("INSERT INTO conversations (id, team_id, type, title, created_at) VALUES ('g1', 'club', 'squad_group', '⚽ vs Katovice', '2026-11-21')"),
      db.prepare("INSERT INTO conversations (id, team_id, type, title, created_at) VALUES ('g2', 'club', 'squad_group', 'Kabina', '2026-10-01')"),
      db.prepare(`INSERT INTO messages (id, conversation_id, sender_type, sender_id, sender_name, body, metadata, sent_at) VALUES
        ('a1', 'g1', 'user', 'club', 'Trenér', 'Kdo může?', '{"type":"match_announce","calendarId":"cal1"}', '2026-11-21 05:15:51'),
        ('a2', 'g1', 'player', 'p1', 'Petr Šimek', 'Budu tam o půl hodiny dřív', '{"type":"attendance","response":"yes","timing":"day_before","calendarId":"cal1"}', '2026-11-21 05:16:02'),
        ('a3', 'g2', 'player', 'p1', 'Petr Šimek', 'Zaspal jsem, budík nezvonil.', '{"type":"attendance","response":"no","timing":"match_day","calendarId":"cal1"}', '2026-11-22 05:11:24'),
        ('a4', 'g2', 'system', NULL, 'Systém', '⚠️ Nové omluvenky v den zápasu:', '{"type":"match_day_announce","calendarId":"cal1"}', '2026-11-22 05:11:44')`),
      db.prepare("UPDATE teams SET game_date = '2026-11-22T00:00:00Z' WHERE id = 'club'"),
    ]);
    expect((await recordedExcuses(db, "club", "cal1"))?.has("p1")).toBe(true);
    await recordAttendancePledge(db, { clubTeamId: "club", convId: "c1", playerId: "p1", playerFirstName: "Petr", pledge: { event: "match", intent: "attend", when: "next" }, now: new Date("2026-11-22T13:24:15Z") });
    expect((await recordedExcuses(db, "club", "cal1"))?.has("p1")).toBe(false);
    const pledged = await db.prepare("SELECT conversation_id FROM messages WHERE json_extract(metadata, '$.timing') = 'pledge'").all<{ conversation_id: string }>();
    expect(pledged.results.map((r) => r.conversation_id)).toEqual(["g2"]);
  });
});

describe("oprava dat: slib k zápasu zapsaný adminem", () => {
  it("omluvený hráč „přijde“: omluvenka neplatí, trenér vidí poznámku v chatu s hráčem", async () => {
    await db.batch([
      db.prepare("INSERT INTO conversations (id, team_id, type, title, created_at) VALUES ('g2', 'club', 'squad_group', 'Kabina', '2026-10-01')"),
      db.prepare(`INSERT INTO messages (id, conversation_id, sender_type, sender_id, sender_name, body, metadata, sent_at) VALUES
        ('a3', 'g2', 'player', 'p1', 'Petr Šimek', 'Zaspal jsem, budík nezvonil.', '{"type":"attendance","response":"no","timing":"match_day","calendarId":"cal1"}', '2026-11-22 05:11:24')`),
      db.prepare("UPDATE teams SET game_date = '2026-11-22T00:00:00Z' WHERE id = 'club'"),
    ]);
    const r = await recordMatchPledgeByAdmin(db, "p1", "attend", new Date("2026-11-22T14:00:00Z"));
    expect(r).toMatchObject({ ok: true, excused: false, pledge: { intent: "attend", matchKey: "cal1" } });
    expect((await recordedExcuses(db, "club", "cal1"))?.has("p1")).toBe(false);
    expect(await notes()).toEqual(["📝 Petr slíbil, že přijde na zápas v neděli 22. 11."]);
  });

  it("neznámý hráč nebo hráč bez chatu: chyba, nic se nezapíše", async () => {
    expect(await recordMatchPledgeByAdmin(db, "nikdo", "attend")).toMatchObject({ ok: false });
    await db.prepare("DELETE FROM conversations WHERE id = 'c1'").run();
    expect(await recordMatchPledgeByAdmin(db, "p1", "attend")).toMatchObject({ ok: false });
    expect((await life()).matchPledge).toBeUndefined();
  });
});

describe("kabina zápasu bez doslovných kopií (Jitona, E2E 22. 11.)", () => {
  // Filip i Tůma „Nakonec dorazím, domluvil jsem se s trenérem.“, Veselý i Marek „Změna plánu, přijdu, kluci.“
  it("4 hráči přemluvení za sebou v jedné kabině nemají dvě stejné věty", async () => {
    const ids = ["f1550185", "6be7bd77", "6b0fd5fe", "56c64d42"];
    await db.batch([
      db.prepare("INSERT INTO conversations (id, team_id, type, title, created_at) VALUES ('g1', 'club', 'squad_group', '⚽ vs Hradčany', '2026-11-21')"),
      db.prepare(`INSERT INTO messages (id, conversation_id, sender_type, sender_id, sender_name, body, metadata, sent_at) VALUES
        ('a1', 'g1', 'user', 'club', 'Trenér', 'Kdo může?', '{"type":"match_announce","calendarId":"cal1"}', '2026-11-21T03:00:00Z')`),
      ...ids.flatMap((id, i) => [
        db.prepare("INSERT INTO players (id, team_id, first_name, last_name, nationality, life_context, coach_relationship) VALUES (?, 'club', ?, 'Hráč', 'CZ', '{}', 60)").bind(id, `Hráč${i}`),
        db.prepare("INSERT INTO conversations (id, team_id, type, title, participant_id, created_at) VALUES (?, 'club', 'player', ?, ?, '2026-11-01')").bind(`c-${id}`, `Hráč${i}`, id),
        db.prepare(`INSERT INTO messages (id, conversation_id, sender_type, sender_id, sender_name, body, metadata, sent_at)
          VALUES (?, 'g1', 'player', ?, ?, 'Nemůžu, mám kocovinu.', '{"type":"attendance","response":"no","calendarId":"cal1"}', ?)`)
          .bind(`x-${id}`, id, `Hráč${i}`, `2026-11-21T03:00:${10 + i}Z`),
      ]),
    ]);
    for (const [i, id] of ids.entries()) {
      await recordAttendancePledge(db, {
        clubTeamId: "club", convId: `c-${id}`, playerId: id, playerFirstName: `Hráč${i}`, pledge: { event: "match", intent: "attend", when: "next" },
        now: new Date(Date.parse("2026-11-21T07:00:00Z") + i * 60_000),
      });
    }
    const said = (await db.prepare("SELECT body FROM messages WHERE conversation_id = 'g1' AND json_extract(metadata, '$.timing') = 'pledge'").all<{ body: string }>()).results.map((r) => r.body);
    expect(said).toHaveLength(4);
    expect(new Set(said).size).toBe(4);
    for (const body of said) expect(MATCH_ATTEND_PLEDGE_TEXTS).toContain(body);
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
