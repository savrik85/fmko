import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { Miniflare } from "miniflare";
import { readFileSync } from "node:fs";

const fx = vi.hoisted(() => ({
  aiEnabled: vi.fn(async () => true),
  generateFollowUpMessage: vi.fn(async () => ({ body: "Tak už můžu, trenére. Jasně, beru to, zůstávám." })),
  handleAiPlayerReply: vi.fn(async () => undefined),
  startCoachThread: vi.fn(async () => true),
}));

vi.mock("../lib/ai-provider", () => ({ isAiEnabled: fx.aiEnabled }));
vi.mock("./ai-player-chat", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./ai-player-chat")>()),
  generateFollowUpMessage: fx.generateFollowUpMessage,
}));
vi.mock("./ai-player-spawn", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./ai-player-spawn")>()),
  handleAiPlayerReply: fx.handleAiPlayerReply,
}));
vi.mock("./coach-initiated", () => ({ startCoachThread: fx.startCoachThread }));

import { deliverDueFollowUps, nextFreeMoment, scheduleFollowUp } from "./follow-ups";

let miniflare: Miniflare;
let db: D1Database;

const NOW = new Date("2026-11-10T17:00:00.000Z"); // úterý 18:00 v Praze

beforeAll(async () => {
  miniflare = new Miniflare({ modules: true, script: "export default { fetch() { return new Response('ok'); } }", d1Databases: ["DB"] });
  db = await miniflare.getD1Database("DB");
});

afterAll(async () => { await miniflare.dispose(); });

beforeEach(async () => {
  vi.clearAllMocks();
  fx.aiEnabled.mockResolvedValue(true);
  for (const t of ["teams", "players", "conversations", "messages", "player_follow_ups", "missed_calls", "transfer_offers", "coach_relation_log", "villages", "managers", "matches", "club_incidents", "injuries"]) {
    await db.prepare(`DROP TABLE IF EXISTS ${t}`).run();
  }
  for (const sql of [
    "CREATE TABLE teams (id TEXT PRIMARY KEY, name TEXT, user_id TEXT, parent_team_id TEXT, village_id TEXT, league_id TEXT, game_date TEXT)",
    `CREATE TABLE players (id TEXT PRIMARY KEY, team_id TEXT, loan_from_team_id TEXT, first_name TEXT, last_name TEXT, nationality TEXT,
       age INTEGER, position TEXT, personality TEXT, life_context TEXT, coach_relationship INTEGER, is_celebrity INTEGER, status TEXT, overall_rating INTEGER)`,
    `CREATE TABLE conversations (id TEXT PRIMARY KEY, team_id TEXT, type TEXT, participant_id TEXT, last_message_text TEXT, last_message_at TEXT,
       unread_count INTEGER DEFAULT 0, ai_thread_active INTEGER DEFAULT 0, ai_thread_state TEXT, ai_thread_last_at TEXT)`,
    "CREATE TABLE messages (id TEXT PRIMARY KEY, conversation_id TEXT, sender_type TEXT, sender_id TEXT, sender_name TEXT, body TEXT, metadata TEXT, sent_at TEXT, read INTEGER)",
    "CREATE TABLE missed_calls (team_id TEXT, volajici TEXT, jmeno TEXT, pocet INTEGER, created_at TEXT)",
    "CREATE TABLE transfer_offers (id TEXT, player_id TEXT, from_team_id TEXT, to_team_id TEXT, offer_amount INTEGER, counter_amount INTEGER, status TEXT, last_action_by TEXT, virtual_team_data TEXT, created_at TEXT)",
    `CREATE TABLE coach_relation_log (id INTEGER PRIMARY KEY AUTOINCREMENT, player_id TEXT, team_id TEXT, old_value INTEGER, new_value INTEGER,
       delta INTEGER, raw_delta INTEGER, source TEXT, description TEXT, reference_id TEXT, game_date TEXT)`,
    "CREATE TABLE villages (id TEXT PRIMARY KEY, name TEXT, size TEXT, district TEXT)",
    "CREATE TABLE managers (team_id TEXT, name TEXT)",
    "CREATE TABLE matches (id TEXT, home_team_id TEXT, away_team_id TEXT, home_score INTEGER, away_score INTEGER, status TEXT, simulated_at TEXT)",
    "CREATE TABLE club_incidents (team_id TEXT, status TEXT, category TEXT, subject_player_id TEXT, kind TEXT)",
    "CREATE TABLE injuries (player_id TEXT, description TEXT, days_remaining INTEGER, osobni_volno INTEGER, is_fake INTEGER)",
  ]) await db.prepare(sql).run();
  const migration = readFileSync(new URL("../../migrations/0275_player_follow_ups.sql", import.meta.url), "utf8");
  for (const stmt of migration.replace(/--.*$/gm, "").split(";").map((x) => x.trim()).filter(Boolean)) await db.prepare(stmt).run();
  await db.prepare("INSERT INTO teams (id, name, game_date) VALUES ('t1', 'TJ Dvory', '2026-11-10'), ('t2', 'SK Jinde', '2026-11-10')").run();
  await db.prepare(
    `INSERT INTO players (id, team_id, first_name, last_name, age, position, personality, life_context, coach_relationship, is_celebrity, status)
     VALUES ('p1', 't1', 'Jakub', 'Jelínek', 27, 'FWD', '{"alcohol":30}', '{"occupation":"Zedník","morale":50}', 60, 0, 'active')`,
  ).run();
  await db.prepare("INSERT INTO conversations (id, team_id, type, participant_id) VALUES ('c1', 't1', 'player', 'p1')").run();
});

const msg = (id: string, sender: "user" | "player", body: string, at: string) =>
  db.prepare("INSERT INTO messages (id, conversation_id, sender_type, sender_id, sender_name, body, sent_at) VALUES (?, 'c1', ?, ?, 'x', ?, ?)")
    .bind(id, sender, sender === "player" ? "p1" : "t1", body, at).run();
const followUps = () => db.prepare("SELECT kind, attempts, done_at FROM player_follow_ups").all<{ kind: string; attempts: number; done_at: string | null }>().then((r) => r.results);
const schedule = (kind: "reply_later" | "retry_reply" | "after_invite" | "hangover", payload: Record<string, unknown> = {}, replace = false) =>
  scheduleFollowUp(db, { teamId: "t1", playerId: "p1", convId: "c1", kind, dueAt: new Date(NOW.getTime() - 60_000), payload, replace, now: NOW });

describe("plánování odložené zprávy", () => {
  it("na konverzaci čeká nejvýš jedna zpráva daného druhu", async () => {
    expect(await schedule("reply_later")).toEqual(expect.any(String));
    expect(await schedule("reply_later")).toBeNull();
    expect(await schedule("retry_reply")).toEqual(expect.any(String));
    await db.prepare("UPDATE player_follow_ups SET done_at = ? WHERE kind = 'reply_later'").bind(NOW.toISOString()).run();
    expect(await schedule("reply_later")).toEqual(expect.any(String));
  });

  it("druhé „ozvu se pak“ čekající zprávu přepíše novou kotvou, ne zahodí", async () => {
    const first = await schedule("reply_later", { anchorAt: "2026-11-10T08:00:00.000Z" }, true);
    const second = await schedule("reply_later", { anchorAt: "2026-11-10T08:20:00.000Z" }, true);
    expect(second).toBe(first);
    const row = await db.prepare("SELECT payload FROM player_follow_ups").first<{ payload: string }>();
    expect(JSON.parse(row!.payload).anchorAt).toBe("2026-11-10T08:20:00.000Z");
  });

  it("zedník se ozve až po šichtě, ne v práci ani v noci", () => {
    const bricklayer = { id: "p1", occupation: "Zedník", alcohol: 30, age: 27 };
    // Úterý 10:00 v Praze: v práci do 16:00.
    const at = nextFreeMoment(bricklayer, new Date("2026-11-10T09:00:00.000Z"), {}, () => 0);
    expect(at.toISOString()).toBe("2026-11-10T15:00:00.000Z");
    // Z práce smí (ráno po hospodě s kocovinou).
    expect(nextFreeMoment(bricklayer, new Date("2026-11-10T09:00:00.000Z"), { allowWork: true }, () => 0).toISOString()).toBe("2026-11-10T09:00:00.000Z");
    // Ve dvě ráno spí, ozve se nejdřív v osm.
    const morning = nextFreeMoment(bricklayer, new Date("2026-11-14T01:00:00.000Z"), { allowWork: true, earliestHour: 8 }, () => 0);
    expect(morning.toISOString()).toBe("2026-11-14T07:00:00.000Z");
  });
});

describe("ozvu se pak", () => {
  it("po šichtě hráč odepíše a otevře se vlákno, na které trenér může reagovat", async () => {
    await msg("m1", "user", "Kubo, zvednu ti plat jako Strakonice, zůstaneš?", "2026-11-10T07:42:00.000Z");
    await msg("m2", "player", "Jsem v práci, ozvu se potom.", "2026-11-10T07:42:30.000Z");
    await schedule("reply_later", { anchorAt: "2026-11-10T07:42:30.000Z" });
    expect(await deliverDueFollowUps(db, {}, NOW)).toEqual({ delivered: 1, cancelled: 0, retried: 0 });
    const last = await db.prepare("SELECT body, metadata FROM messages WHERE id NOT IN ('m1','m2')").first<{ body: string; metadata: string }>();
    expect(last?.body).toContain("Tak už můžu");
    expect(JSON.parse(last!.metadata)).toMatchObject({ follow_up: "reply_later" });
    const conv = await db.prepare("SELECT ai_thread_active, ai_thread_state FROM conversations WHERE id = 'c1'").first<{ ai_thread_active: number; ai_thread_state: string }>();
    expect(conv?.ai_thread_active).toBe(1);
    expect(JSON.parse(conv!.ai_thread_state)).toMatchObject({ scenario_id: "coach_initiated", awaiting: "coach" });
    // Model dostal trenérovu otázku v historii.
    const history = (fx.generateFollowUpMessage.mock.calls[0] as unknown[])[3] as Array<{ body: string }>;
    expect(history.map((h) => h.body)).toContain("Kubo, zvednu ti plat jako Strakonice, zůstaneš?");
    expect((await followUps())[0].done_at).not.toBeNull();
  });

  it("když hráč mezitím napsal sám, odložená zpráva se zruší", async () => {
    await msg("m2", "player", "Jsem v práci, ozvu se potom.", "2026-11-10T07:42:30.000Z");
    await msg("m3", "player", "Tak jo, beru.", "2026-11-10T09:00:00.000Z");
    await schedule("reply_later", { anchorAt: "2026-11-10T07:42:30.000Z" });
    expect(await deliverDueFollowUps(db, {}, NOW)).toEqual({ delivered: 0, cancelled: 1, retried: 0 });
    expect(fx.generateFollowUpMessage).not.toHaveBeenCalled();
  });

  it("hráč, který mezitím odešel z klubu, už nepíše", async () => {
    await db.prepare("UPDATE players SET team_id = 't2' WHERE id = 'p1'").run();
    await schedule("reply_later", { anchorAt: "2026-11-10T07:42:30.000Z" });
    expect((await deliverDueFollowUps(db, {}, NOW)).cancelled).toBe(1);
  });
});

describe("odpověď po výpadku modelu", () => {
  it("model nejde: zkouší se dál a vzdá se až po 36 hodinách (výpadek 23. 10. trval 12)", async () => {
    fx.aiEnabled.mockResolvedValue(false);
    await msg("m1", "user", "Kdo rozbil tribunu?", "2026-11-10T13:17:00.000Z");
    await schedule("retry_reply");
    for (let h = 0; h <= 34; h++) await deliverDueFollowUps(db, {}, new Date(NOW.getTime() + h * 3600_000 + 60_000));
    expect((await followUps())[0].done_at).toBeNull();
    for (let h = 35; h <= 48; h++) await deliverDueFollowUps(db, {}, new Date(NOW.getTime() + h * 3600_000 + 60_000));
    expect((await followUps())[0].done_at).not.toBeNull();
  });

  it("hráč, který spí, dostane odpověď až ráno", async () => {
    await msg("m1", "user", "Sedli, odmítneme Forpsi, jo?", "2026-11-10T13:17:00.000Z");
    await schedule("retry_reply");
    const night = new Date("2026-11-11T01:30:00.000Z"); // středa 2:30 v Praze
    expect((await deliverDueFollowUps(db, {}, night)).retried).toBe(1);
    expect(fx.startCoachThread).not.toHaveBeenCalled();
    const due = await db.prepare("SELECT due_at, done_at FROM player_follow_ups").first<{ due_at: string; done_at: string | null }>();
    expect(due?.done_at).toBeNull();
    expect(Date.parse(due!.due_at)).toBeGreaterThanOrEqual(Date.parse("2026-11-11T06:00:00.000Z"));
  });

  it("dva souběžné běhy doručí zprávu jen jednou", async () => {
    await schedule("after_invite", { invite: "bbq", topicId: "casual_bbq" });
    const [a, b] = await Promise.all([deliverDueFollowUps(db, {}, NOW), deliverDueFollowUps(db, {}, NOW)]);
    expect(a.delivered + b.delivered).toBe(1);
    expect(fx.generateFollowUpMessage).toHaveBeenCalledTimes(1);
  });

  it("model zase jde: hráč odpoví na poslední zprávu trenéra a řekne, že neměl telefon", async () => {
    await msg("m1", "user", "Sedli, odmítneme Forpsi, jo?", "2026-11-10T13:17:00.000Z");
    await schedule("retry_reply");
    fx.startCoachThread.mockImplementationOnce(async () => {
      await msg("m2", "player", "Sorry, neměl jsem telefon. Jasně, odmítni to.", "2026-11-10T17:00:30.000Z");
      return true;
    });
    expect((await deliverDueFollowUps(db, {}, NOW)).delivered).toBe(1);
    expect(fx.startCoachThread).toHaveBeenCalledWith(expect.anything(), {}, expect.objectContaining({
      convId: "c1", coachMessage: "Sedli, odmítneme Forpsi, jo?", lateReply: "offline",
    }));
  });

  it("když si hráč zprávu mezitím jen přečetl, odpověď se už nezkouší", async () => {
    await msg("m1", "user", "Zdar, jak je?", "2026-11-10T13:17:00.000Z");
    await db.prepare("UPDATE messages SET metadata = ? WHERE id = 'm1'").bind(JSON.stringify({ readAt: "2026-11-10T13:18:00.000Z" })).run();
    await schedule("retry_reply");
    expect((await deliverDueFollowUps(db, {}, NOW)).cancelled).toBe(1);
    expect(fx.startCoachThread).not.toHaveBeenCalled();
  });

  it("rozjeté vlákno převezme stejně jako odpověď na novou zprávu", async () => {
    await msg("m1", "user", "Pohoda, díky.", "2026-11-10T13:35:00.000Z");
    await db.prepare("UPDATE conversations SET ai_thread_active = 1, ai_thread_state = ? WHERE id = 'c1'")
      .bind(JSON.stringify({ scenario_id: "coach_initiated", awaiting: "coach", player_id: "p1" })).run();
    await schedule("retry_reply");
    await deliverDueFollowUps(db, {}, NOW);
    expect(fx.handleAiPlayerReply).toHaveBeenCalledWith(expect.anything(), {}, "c1", { lateReply: "offline" });
    const state = await db.prepare("SELECT ai_thread_state FROM conversations WHERE id = 'c1'").first<{ ai_thread_state: string }>();
    expect(JSON.parse(state!.ai_thread_state).awaiting).toBe("player");
  });
});

describe("poděkování po přijatém pozvání", () => {
  it("vztah se zlepší s důvodem do Kabiny a hráč otevře vlákno jen tak", async () => {
    await schedule("after_invite", { invite: "pig_slaughter", topicId: "casual_pig_slaughter" });
    expect((await deliverDueFollowUps(db, {}, NOW)).delivered).toBe(1);
    const log = await db.prepare("SELECT delta, source, description FROM coach_relation_log").first<{ delta: number; source: string; description: string }>();
    expect(log).toMatchObject({ delta: 6, source: "invite" });
    expect(log?.description).toContain("zabijačku");
    const p = await db.prepare("SELECT coach_relationship, json_extract(life_context, '$.morale') AS morale FROM players WHERE id = 'p1'").first<{ coach_relationship: number; morale: number }>();
    expect(p).toEqual({ coach_relationship: 66, morale: 54 });
    const conv = await db.prepare("SELECT ai_thread_state FROM conversations WHERE id = 'c1'").first<{ ai_thread_state: string }>();
    expect(JSON.parse(conv!.ai_thread_state)).toMatchObject({ scenario_id: "casual_invite_thanks", casual: true });
  });
});
