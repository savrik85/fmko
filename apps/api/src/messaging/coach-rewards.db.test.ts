/**
 * Odměny a sázky mimo zápas nad skutečnou D1 (Miniflare): dohoda o hubnutí podle skutečné váhy,
 * prohraná sázka hráče, odměna za pátrání a vyplacení tlačítkem.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { Miniflare } from "miniflare";
import { readFileSync } from "node:fs";

const model = vi.hoisted(() => ({ askModelJson: vi.fn() }));
vi.mock("./ai-player-chat", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./ai-player-chat")>()),
  askModelJson: model.askModelJson,
}));

import { fulfilMoneyCommitment, handleCoachMessageForCommitment, recordCommitment, recordInquiryTask, settleCoachCommitments } from "./coach-commitments";
import { respondToCoachRequest } from "./coach-rules";
import { REWARD_BROKEN_SMS, REWARD_KEPT_SMS, WEIGHT_FAILED_SMS, WEIGHT_FORFEIT_KABINA, WEIGHT_WON_SMS } from "./coach-rewards";

let miniflare: Miniflare;
let db: D1Database;
const T0 = new Date("2026-11-18T19:24:00Z");

beforeAll(async () => {
  miniflare = new Miniflare({ modules: true, script: "export default { fetch() { return new Response('ok'); } }", d1Databases: ["DB"] });
  db = await miniflare.getD1Database("DB");
  await db.exec(readFileSync(new URL("../../migrations/0316_coach_commitments.sql", import.meta.url), "utf8").replace(/--[^\n]*/g, "").replace(/\n/g, " "));
  for (const sql of [
    "CREATE TABLE teams (id TEXT PRIMARY KEY, name TEXT, user_id TEXT, parent_team_id TEXT, team_type TEXT NOT NULL DEFAULT 'senior', budget INTEGER, game_date TEXT)",
    "CREATE TABLE players (id TEXT PRIMARY KEY, team_id TEXT, first_name TEXT, last_name TEXT, nickname TEXT, avatar TEXT, nationality TEXT, position TEXT, weekly_wage INTEGER, personality TEXT, life_context TEXT, physical TEXT, coach_relationship INTEGER, loan_from_team_id TEXT, status TEXT, age INTEGER)",
    "CREATE TABLE conversations (id TEXT PRIMARY KEY, team_id TEXT, type TEXT, title TEXT, participant_id TEXT, participant_avatar TEXT, last_message_text TEXT, last_message_at TEXT, unread_count INTEGER DEFAULT 0, created_at TEXT, pinned INTEGER DEFAULT 0)",
    "CREATE TABLE messages (id TEXT PRIMARY KEY, conversation_id TEXT, sender_type TEXT, sender_id TEXT, sender_name TEXT, body TEXT, metadata TEXT, sent_at TEXT, read INTEGER DEFAULT 0)",
    "CREATE TABLE coach_relation_log (id INTEGER PRIMARY KEY AUTOINCREMENT, player_id TEXT, team_id TEXT, old_value INTEGER, new_value INTEGER, delta INTEGER, raw_delta INTEGER, source TEXT, description TEXT, reference_id TEXT, game_date TEXT, created_at TEXT)",
    "CREATE TABLE transactions (id TEXT PRIMARY KEY, team_id TEXT, type TEXT, amount INTEGER, balance_after INTEGER, description TEXT, reference_id TEXT, game_date TEXT)",
    "CREATE TABLE club_incident_knowledge (incident_id TEXT, player_id TEXT, team_id TEXT, role TEXT, willingness INTEGER, interrogation TEXT)",
    "CREATE TABLE injuries (player_id TEXT, days_remaining INTEGER)",
  ]) await db.prepare(sql).run();
}, 30_000);

afterAll(async () => { await miniflare.dispose(); });

beforeEach(async () => {
  model.askModelJson.mockReset();
  for (const t of ["coach_commitments", "teams", "players", "conversations", "messages", "coach_relation_log", "transactions", "club_incident_knowledge"]) {
    await db.prepare(`DELETE FROM ${t}`).run();
  }
  const physical = (weight: number) => JSON.stringify({ height: 178, weight, bodyType: "normal" });
  await db.batch([
    db.prepare("INSERT INTO teams (id, name, user_id, budget, game_date) VALUES ('club', 'FK Dřevostroj', 'u1', 5000, '2026-11-18'), ('rival', 'Lhenice', 'u2', 0, '2026-11-18')"),
    db.prepare(`INSERT INTO players (id, team_id, first_name, last_name, position, weekly_wage, personality, life_context, physical, coach_relationship) VALUES
      ('p1', 'club', 'Ladislav', 'Záhorka', 'FWD', 300, '{"discipline":50,"temper":40}', '{"morale":50}', ?, 50),
      ('p2', 'club', 'Ján', 'Balog', 'MID', 300, '{"discipline":50,"temper":40}', '{"morale":50}', ?, 50),
      ('p3', 'club', 'Vojtěch', 'Havel', 'DEF', 300, '{"discipline":50,"temper":40}', '{"morale":50}', ?, 50),
      ('loan', 'rival', 'Jan', 'Hostující', 'DEF', 300, '{}', '{"morale":50}', ?, 50)`).bind(physical(96.4), physical(95.2), physical(70), physical(99)),
    db.prepare("UPDATE players SET loan_from_team_id = 'club' WHERE id = 'loan'"),
    db.prepare("INSERT INTO conversations (id, team_id, type, title, participant_id, created_at) VALUES ('c1', 'club', 'player', 'Ladislav Záhorka', 'p1', '2026-11-01'), ('c2', 'club', 'player', 'Ján Balog', 'p2', '2026-11-01'), ('c3', 'club', 'player', 'Vojtěch Havel', 'p3', '2026-11-01'), ('cl', 'club', 'player', 'Jan Hostující', 'loan', '2026-11-01')"),
    db.prepare("INSERT INTO conversations (id, team_id, type, title, created_at) VALUES ('kab', 'club', 'squad_group', 'Kabina', '2026-11-01')"),
  ]);
});

const status = async (id: string) => (await db.prepare("SELECT status FROM coach_commitments WHERE id = ?").bind(id).first<{ status: string }>())?.status;
const life = async (pid: string) => JSON.parse((await db.prepare("SELECT life_context FROM players WHERE id = ?").bind(pid).first<{ life_context: string }>())!.life_context);
const setWeight = (pid: string, w: number) => db.prepare("UPDATE players SET physical = json_set(physical, '$.weight', ?) WHERE id = ?").bind(w, pid).run();
const playerSms = async (convId: string) => (await db.prepare(
  "SELECT body FROM messages WHERE conversation_id = ? AND sender_type = 'player' ORDER BY sent_at",
).bind(convId).all<{ body: string }>()).results.map((r) => r.body);
const systemNotes = async (convId: string) => (await db.prepare(
  "SELECT body, metadata FROM messages WHERE conversation_id = ? AND sender_type = 'system' ORDER BY sent_at",
).bind(convId).all<{ body: string; metadata: string }>()).results;

describe("dohoda o hubnutí s odměnou", () => {
  const deal = () => recordCommitment(db, {
    clubTeamId: "club", playerId: "p2", convId: "c2", coachMessage: "O 1000 kč? Když zhubneš na normální váhu.",
    detected: { kind: "weight_target", kg: null, days: 14, rewardType: "money", amount: 1000 }, playerFirstName: "Ján", now: T0,
  });

  it("kývl a shodil: v termínu tlačítko, trenér vyplatí, vztah se zlepší", async () => {
    const id = await deal();
    const note = (await systemNotes("c2"))[0].body;
    expect(note).toContain("Platí, až hráč kývne");
    expect(note).toContain("teď 95,2 kg");
    // Bez kývnutí slib omezit hospodu neplatí.
    expect((await life("p2")).dietPledgeUntil).toBeUndefined();
    expect(await respondToCoachRequest(db, { commitmentId: id, playerId: "p2", accepted: true })).toBe(true);
    expect((await life("p2")).dietPledgeUntil).toBe("2026-12-02");
    await settleCoachCommitments(db, new Date("2026-11-25T10:00:00Z"));
    expect(await status(id)).toBe("active");
    const target = JSON.parse((await db.prepare("SELECT details FROM coach_commitments WHERE id = ?").bind(id).first<{ details: string }>())!.details);
    await setWeight("p2", target.targetWeight - 0.2);
    await settleCoachCommitments(db, new Date("2026-12-03T10:00:00Z"));
    expect(await status(id)).toBe("active");
    const won = await playerSms("c2");
    expect(won.some((b) => WEIGHT_WON_SMS.some((t) => b.replace(/\d+,\d kg|\d+ kg/, "{kg}") === t))).toBe(true);
    const button = (await systemNotes("c2")).find((m) => JSON.parse(m.metadata).type === "coach_commitment");
    expect(button?.body).toContain("splnil dohodu o hubnutí");
    // Bohuslav (E2E 22. 11.): tlačítko psalo cíl (7,2 kg), ne kolik opravdu shodil (7,3 kg).
    const lost = JSON.parse((await db.prepare("SELECT details FROM coach_commitments WHERE id = ?").bind(id).first<{ details: string }>())!.details).lost;
    expect(lost).toBeGreaterThan(target.kg);
    expect(button?.body).toContain(`(${lost.toLocaleString("cs-CZ", { maximumFractionDigits: 1 })} kg dole)`);
    expect(button?.body).toContain("Odměna: 1\u00a0000 Kč, vyplatit");
    expect(await fulfilMoneyCommitment(db, { teamId: "club", commitmentId: id, now: new Date("2026-12-03T12:00:00Z") })).toMatchObject({ ok: true, effect: "Odměna předána (1\u00a0000 Kč)" });
    expect(await status(id)).toBe("kept");
    expect((await db.prepare("SELECT type, amount FROM transactions").first<{ type: string; amount: number }>())).toEqual({ type: "player_bonus", amount: -1000 });
    expect(REWARD_KEPT_SMS).toContain((await playerSms("c2")).at(-1));
    expect((await db.prepare("SELECT delta FROM coach_relation_log WHERE player_id = 'p2'").first<{ delta: number }>())?.delta).toBe(5);
  });

  it("odmítl: dohoda neplatí a hospoda se neomezuje", async () => {
    const id = await deal();
    await respondToCoachRequest(db, { commitmentId: id, playerId: "p2", accepted: false });
    expect(await status(id)).toBe("expired");
    expect((await life("p2")).dietPledgeUntil).toBeUndefined();
  });

  it("hráč už je pod normální váhou: dohoda nevznikne", async () => {
    expect(await recordCommitment(db, {
      clubTeamId: "club", playerId: "p3", convId: "c3", coachMessage: "1000 Kč když zhubneš",
      detected: { kind: "weight_target", kg: null, days: 14, rewardType: "money", amount: 1000 }, playerFirstName: "Vojtěch", now: T0,
    })).toBe("");
    expect((await db.prepare("SELECT COUNT(*) AS n FROM coach_commitments").first<{ n: number }>())?.n).toBe(0);
  });
});

describe("sázka hráče o pivo", () => {
  it("nezhubl: platí kabině rundu a napíše to do Kabiny", async () => {
    const id = await recordCommitment(db, {
      clubTeamId: "club", playerId: "p1", convId: "c1", coachMessage: "Pokud neschodíš za 2 tejdny 5 kilo tak platíš pivo všem z týmu",
      detected: { kind: "weight_target", kg: 5, days: 14, rewardType: "none", forfeit: true }, playerFirstName: "Ladislav", now: T0,
    });
    await respondToCoachRequest(db, { commitmentId: id, playerId: "p1", accepted: true });
    await setWeight("p1", 95.1);
    await settleCoachCommitments(db, new Date("2026-12-03T10:00:00Z"));
    expect(await status(id)).toBe("expired");
    const sms = await playerSms("c1");
    expect(WEIGHT_FAILED_SMS.map((t) => t.replace("{kg}", "1,3 kg"))).toContain(sms[0]);
    expect(WEIGHT_FORFEIT_KABINA).toContain((await playerSms("kab"))[0]);
    expect((await life("p2")).morale).toBe(51);
    expect((await life("p1")).morale).toBe(48);
  });
});

describe("odměna za službu", () => {
  it("za pátrání: platí, až hráč přinese jméno; nezaplacená je po lhůtě porušená", async () => {
    await recordInquiryTask(db, { teamId: "club", convId: "c3", playerId: "p3", incidentId: "inc1", coachMessage: "Zkus se nenápadně optat", now: T0 });
    const id = await recordCommitment(db, {
      clubTeamId: "club", playerId: "p3", convId: "c3", coachMessage: "Zkus prosim, koupim ti valkýro ruma",
      detected: { kind: "reward", rewardType: "bottle" }, playerFirstName: "Vojtěch", now: new Date(T0.getTime() + 3600_000),
    });
    expect((await systemNotes("c3"))[0].body).toContain("když zjistí, kdo za incidentem stojí");
    await db.prepare("INSERT INTO club_incident_knowledge VALUES ('inc1', 'p1', 'club', 'svedek', 80, NULL)").run();
    // Den poté: úkol doručí jméno, odměna je splatná nejpozději další běh.
    await settleCoachCommitments(db, new Date("2026-11-20T10:00:00Z"));
    await settleCoachCommitments(db, new Date("2026-11-20T10:05:00Z"));
    const button = (await systemNotes("c3")).find((m) => JSON.parse(m.metadata).type === "coach_commitment");
    expect(button?.body).toContain("odměnu si zasloužil");
    expect(await status(id)).toBe("active");
    // Web: pod vyhranou odměnou „To nebyl slib“ nedává smysl (API by vrátilo 409).
    expect(JSON.parse(button!.metadata)).toMatchObject({ won: true, done: false });
    await settleCoachCommitments(db, new Date("2026-11-26T10:00:00Z"));
    expect(await status(id)).toBe("broken");
    expect(REWARD_BROKEN_SMS).toContain((await playerSms("c3")).at(-1));
    // Propadlá odměna: tlačítko „Vyplatit“ zmizí (dřív zůstalo a klik vrátil 409, Marek E2E 22. 11.).
    const closed = (await systemNotes("c3")).find((m) => JSON.parse(m.metadata).type === "coach_commitment");
    expect(JSON.parse(closed!.metadata)).toMatchObject({ closed: "broken" });
    expect((await db.prepare("SELECT delta FROM coach_relation_log WHERE player_id = 'p3'").first<{ delta: number }>())?.delta).toBe(-6);
  });

  it("pátrání bez jména: odměna propadne bez výčitek", async () => {
    await recordInquiryTask(db, { teamId: "club", convId: "c3", playerId: "p3", incidentId: "inc1", coachMessage: "Zkus se optat", now: T0 });
    const id = await recordCommitment(db, {
      clubTeamId: "club", playerId: "p3", convId: "c3", coachMessage: "koupim ti valkýro ruma",
      detected: { kind: "reward", rewardType: "bottle" }, playerFirstName: "Vojtěch", now: T0,
    });
    await settleCoachCommitments(db, new Date("2026-11-20T10:00:00Z"));
    await settleCoachCommitments(db, new Date("2026-11-20T10:05:00Z"));
    expect(await status(id)).toBe("expired");
  });

  it("dárek bez podmínky: tlačítko hned, flaška stojí 300 Kč", async () => {
    const id = await recordCommitment(db, {
      clubTeamId: "club", playerId: "p3", convId: "c3", coachMessage: "Za tu pomoc ti koupím flašku",
      detected: { kind: "reward", rewardType: "bottle" }, playerFirstName: "Vojtěch", now: T0,
    });
    const notes = await systemNotes("c3");
    expect(notes).toHaveLength(1);
    expect(notes[0].body).toContain("Odměna: flaška (300 Kč)");
    expect(await fulfilMoneyCommitment(db, { teamId: "club", commitmentId: id, now: T0 })).toMatchObject({ ok: true, effect: "Odměna předána (flaška, 300 Kč)" });
    expect((await db.prepare("SELECT type, amount FROM transactions").first<{ type: string; amount: number }>())).toEqual({ type: "manager_social", amount: -300 });
  });
});

describe("tlačítko 🎁 pod zprávou hráče (Bohuslav, E2E 22. 11.)", () => {
  it("hráč napsal „shodil jsem…“ až po začátku běhu: tlačítko je pod jeho SMS, ne nad ní", async () => {
    const id = await recordCommitment(db, {
      clubTeamId: "club", playerId: "p3", convId: "c3", coachMessage: "Za tu pomoc ti koupím flašku",
      detected: { kind: "reward", rewardType: "bottle" }, playerFirstName: "Vojtěch", now: T0,
    });
    // Běh začal v T, SMS hráče (model) se uložila o tři vteřiny později.
    const tick = new Date("2026-12-03T10:00:00.000Z");
    await db.prepare("INSERT INTO messages (id, conversation_id, sender_type, sender_id, sender_name, body, metadata, sent_at) VALUES ('sms', 'c3', 'player', 'p3', 'Vojtěch Havel', 'Trenére, shodil jsem 7,3 kg.', '{}', '2026-12-03T10:00:03.000Z')").run();
    await db.prepare("UPDATE coach_commitments SET details = json_remove(details, '$.won') WHERE id = ?").bind(id).run();
    const row = await db.prepare("SELECT * FROM coach_commitments WHERE id = ?").bind(id).first<Record<string, unknown>>();
    const { markRewardEarned } = await import("./coach-rewards");
    const buttonId = await markRewardEarned(db, { ...row, first_name: "Vojtěch", last_name: "Havel", nickname: null, avatar: null } as never, tick);
    const sentAt = (await db.prepare("SELECT sent_at FROM messages WHERE id = ?").bind(buttonId).first<{ sent_at: string }>())!.sent_at;
    expect(Date.parse(sentAt)).toBeGreaterThan(Date.parse("2026-12-03T10:00:03.000Z"));
  });
});

describe("jen vlastní kádr", () => {
  it("hráči na hostování jinde odměnu za hubnutí z SMS nezapíše", async () => {
    model.askModelJson.mockResolvedValue({ kind: "weight_target", quote: "1000 Kč, když zhubneš", kg: null, days: null, reward: "money", amount: 1000 });
    expect(await handleCoachMessageForCommitment(db, {}, { teamId: "club", convId: "cl", playerId: "loan", text: "1000 Kč, když zhubneš" })).toBeNull();
    expect(await handleCoachMessageForCommitment(db, {}, { teamId: "club", convId: "c2", playerId: "p2", text: "1000 Kč, když zhubneš" })).toBeTruthy();
    expect((await db.prepare("SELECT player_id FROM coach_commitments").all<{ player_id: string }>()).results.map((r) => r.player_id)).toEqual(["p2"]);
  });
});

// Přetest 3 (C6): rozpoznání dohody doběhlo až po odpovědi hráče (COMMITMENT_REPLY_WAIT_MS 3 s),
// takže hráčovo „Beru to vážně…“ se nezapsalo jako kývnutí a dohoda by propadla jako „nekývl“.
describe("kývnutí na dohodu, která se zapsala až po odpovědi", () => {
  const TEXT = "Ján, 1000 Kč, když do dvou týdnů zhubneš na normální váhu.";
  const DETECTED = { kind: "weight_target", quote: "1000 Kč, když do dvou týdnů zhubneš na normální váhu", kg: null, days: 14, reward: "money", amount: 1000 };
  const ago = (s: number) => new Date(Date.now() - s * 1000).toISOString();
  const coachAndReply = (reply: string) => db.batch([
    db.prepare("INSERT INTO messages (id, conversation_id, sender_type, sender_id, body, sent_at) VALUES ('cm', 'c2', 'user', 'club', ?, ?)").bind(TEXT, ago(20)),
    db.prepare("INSERT INTO messages (id, conversation_id, sender_type, sender_id, body, metadata, sent_at) VALUES ('pr', 'c2', 'player', 'p2', ?, ?, ?)")
      .bind(reply, JSON.stringify({ ai_generated: true }), ago(4)),
  ]);
  const accepted = async () => JSON.parse((await db.prepare("SELECT details FROM coach_commitments WHERE kind = 'weight_target'").first<{ details: string }>())!.details).accepted;

  it("odpověď už je venku: kývnutí z jejího textu se zapíše (Bohuslav „Beru to vážně…“)", async () => {
    model.askModelJson.mockResolvedValue(DETECTED);
    await coachAndReply("Beru to vážně, trenére. Dva týdny žádný alkohol a jdu běhat.");
    expect(await handleCoachMessageForCommitment(db, {}, { teamId: "club", convId: "c2", playerId: "p2", text: TEXT })).toBeTruthy();
    expect(await accepted()).toBe(true);
    expect((await life("p2")).dietPledgeUntil).toBeDefined();
  });

  it("odmítnutí z textu odpovědi dohodu zruší, nejasná odpověď ji nechá čekat", async () => {
    model.askModelJson.mockResolvedValue(DETECTED);
    await coachAndReply("Na to zapomeň, trenére, hubnout nebudu.");
    const id = await handleCoachMessageForCommitment(db, {}, { teamId: "club", convId: "c2", playerId: "p2", text: TEXT });
    expect(await accepted()).toBe(false);
    expect(await status(id!)).toBe("expired");

    await db.batch([db.prepare("DELETE FROM coach_commitments"), db.prepare("DELETE FROM messages")]);
    await coachAndReply("A kolik je to kilo?");
    await handleCoachMessageForCommitment(db, {}, { teamId: "club", convId: "c2", playerId: "p2", text: TEXT });
    expect(await accepted()).toBeUndefined();
  });

  it("dohoda se zapsala, zatímco hráč psal: odpověď bez accepts_request ji podle textu přijme", async () => {
    await db.prepare("INSERT INTO messages (id, conversation_id, sender_type, sender_id, body, sent_at) VALUES ('cm', 'c2', 'user', 'club', ?, ?)").bind(TEXT, ago(20)).run();
    const id = await recordCommitment(db, {
      clubTeamId: "club", playerId: "p2", convId: "c2", coachMessage: TEXT,
      detected: { kind: "weight_target", kg: null, days: 14, rewardType: "money", amount: 1000 }, playerFirstName: "Ján", now: new Date(Date.now() - 15_000),
    });
    const { afterPlayerReply } = await import("./ai-player-spawn");
    // Prompt odpovědi vznikl dřív než dohoda: hráč o ní nevěděl (žádné pendingRequest ani accepts_request).
    await afterPlayerReply(db, {
      teamId: "club", convId: "c2", player: { id: "p2", firstName: "Ján", lastName: "Balog" } as never, at: new Date().toISOString(), offerIds: [],
      reply: { body: "Beru to vážně, trenére, jdu do toho.", writeLater: false },
    });
    expect(await accepted()).toBe(true);
    expect(await status(id)).toBe("active");
  });
});

// E2E 22. 11.: 2 z 5 dohod o hubnutí se s Workers AI nezapsaly (timeout rozpoznání), bez varování
// v logu. Bohuslav pak trenérovi tvrdil „do dvou týdnů zhubnu těch 3 kila“, hra dohodu neznala.
describe("rozpoznání dohody s pomalým nebo padajícím modelem", () => {
  const TEXT = "Bohouši, dám ti 1000 Kč, když do dvou týdnů zhubneš.";
  const DETECTED = { kind: "weight_target", quote: "dám ti 1000 Kč, když do dvou týdnů zhubneš", kg: null, days: 14, reward: "money", amount: 1000 };
  const SENT = "2026-11-22T17:20:00.000Z";
  const memoryKv = () => {
    const store = new Map<string, string>();
    return {
      store,
      put: vi.fn(async (k: string, v: string) => { store.set(k, v); }),
      get: vi.fn(async (k: string) => store.get(k) ?? null),
      delete: vi.fn(async (k: string) => { store.delete(k); }),
      list: vi.fn(async ({ prefix }: { prefix?: string } = {}) => ({ keys: [...store.keys()].filter((k) => !prefix || k.startsWith(prefix)).map((name) => ({ name })), list_complete: true })),
    };
  };
  const coachAndReply = () => db.batch([
    db.prepare("INSERT INTO messages (id, conversation_id, sender_type, sender_id, body, sent_at) VALUES ('cm', 'c2', 'user', 'club', ?, ?)").bind(TEXT, SENT),
    db.prepare("INSERT INTO messages (id, conversation_id, sender_type, sender_id, body, metadata, sent_at) VALUES ('pr', 'c2', 'player', 'p2', ?, ?, '2026-11-22T17:20:40.000Z')")
      .bind("Jasně, trenére, do dvou týdnů zhubnu těch pár kil. Beru to vážně.", JSON.stringify({ ai_generated: true })),
  ]);

  it("timeout se zaloguje, dohoda počká a hodinový běh ji zapíše i s kývnutím z odpovědi", async () => {
    const { logger } = await import("../lib/logger");
    const warn = vi.spyOn(logger, "warn");
    const kv = memoryKv();
    const env = { CACHE_KV: kv as unknown as KVNamespace };
    await coachAndReply();
    const { GeminiUnavailableError } = await import("./model-errors");
    model.askModelJson.mockRejectedValueOnce(new GeminiUnavailableError("workers-ai neodpověděl do 19932 ms"));
    expect(await handleCoachMessageForCommitment(db, env, { teamId: "club", convId: "c2", playerId: "p2", text: TEXT, sentAt: SENT })).toBeNull();
    expect(await db.prepare("SELECT COUNT(*) AS n FROM coach_commitments").first()).toEqual({ n: 0 });
    expect(warn.mock.calls.some((c) => String(c[1]).includes("rozpoznání slibu") && String(c[1]).includes("hodinový běh"))).toBe(true);
    expect(kv.store.size).toBe(1);

    const { processPendingCommitments } = await import("./coach-commitments");
    // Mladší záznam ještě může zpracovávat požadavek: hodinový běh ho nechá.
    expect(await processPendingCommitments(db, env, new Date("2026-11-22T17:21:00Z"))).toBe(0);
    expect(model.askModelJson).toHaveBeenCalledTimes(1);

    model.askModelJson.mockResolvedValueOnce(DETECTED);
    expect(await processPendingCommitments(db, env, new Date("2026-11-22T17:30:00Z"))).toBe(1);
    const row = await db.prepare("SELECT kind, made_at, details FROM coach_commitments").first<{ kind: string; made_at: string; details: string }>();
    expect(row?.kind).toBe("weight_target");
    expect(row?.made_at).toBe(SENT);
    // Hráč na dohodu kývl v odpovědi, která přišla dřív než zápis.
    expect(JSON.parse(row!.details).accepted).toBe(true);
    expect(kv.store.size).toBe(0);
    // 📝 je pod zprávou trenéra, ne až na konci konverzace.
    const note = await db.prepare("SELECT sent_at FROM messages WHERE sender_type = 'system' AND conversation_id = 'c2'").first<{ sent_at: string }>();
    expect(note?.sent_at).toBe("2026-11-22T17:20:01.000Z");
    // Další běh nic nezdvojí.
    expect(await processPendingCommitments(db, env, new Date("2026-11-22T18:30:00Z"))).toBe(0);
    expect(await db.prepare("SELECT COUNT(*) AS n FROM coach_commitments").first()).toEqual({ n: 1 });
    warn.mockRestore();
  });

  it("nečitelná odpověď modelu se zkusí znovu, „žádný slib“ ne", async () => {
    const kv = memoryKv();
    const env = { CACHE_KV: kv as unknown as KVNamespace };
    model.askModelJson.mockResolvedValueOnce(null);
    await handleCoachMessageForCommitment(db, env, { teamId: "club", convId: "c2", playerId: "p2", text: TEXT, sentAt: SENT });
    expect(kv.store.size).toBe(1);

    kv.store.clear();
    model.askModelJson.mockResolvedValueOnce({ kind: "none", quote: "" });
    await handleCoachMessageForCommitment(db, env, { teamId: "club", convId: "c2", playerId: "p2", text: TEXT, sentAt: SENT });
    expect(kv.store.size).toBe(0);
  });
});
