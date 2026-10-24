import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { Miniflare } from "miniflare";
import { readFileSync } from "node:fs";

const fx = vi.hoisted(() => ({
  generateInitialMessage: vi.fn(async () => "Trenére, koukej, co jsem dneska vytáh z rybníka!"),
  coachAcceptsInvite: vi.fn(async () => true),
  generatePlayerPhoto: vi.fn(async () => "photos/test.jpg"),
  createCoachLedSession: vi.fn(async () => ({ ok: true as const, attendeesCount: 4, incidentsCount: 1 })),
  recordTransaction: vi.fn(async () => 0),
}));

vi.mock("../lib/ai-provider", () => ({ isAiEnabled: vi.fn(async () => true) }));
vi.mock("./ai-player-chat", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./ai-player-chat")>()),
  generateInitialMessage: fx.generateInitialMessage,
  coachAcceptsInvite: fx.coachAcceptsInvite,
}));
vi.mock("./player-photo", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./player-photo")>()),
  generatePlayerPhoto: fx.generatePlayerPhoto,
}));
vi.mock("./voice-message", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./voice-message")>()),
  recordVoiceMessage: vi.fn(async () => null),
}));
vi.mock("../season/pub", () => ({ createCoachLedSession: fx.createCoachLedSession }));
vi.mock("../season/finance-processor", () => ({ recordTransaction: fx.recordTransaction }));

import { handleCoachMessageForInvite, spawnCasualMessages } from "./casual-messages";
import { CASUAL_MIN_RELATION, CASUAL_TOPICS, INVITES, topicFits, type CasualContext } from "./casual-topics";
import { PHOTO_SCENES } from "./player-photo";
import type { PlayerSnapshot } from "./ai-player-scenarios";

let miniflare: Miniflare;
let db: D1Database;
let kv: KVNamespace;

/** Sobota 14. 11. 2026, 19:30 v Praze (zimní čas, UTC+1). */
const SATURDAY_EVENING = new Date("2026-11-14T18:30:00.000Z");

beforeAll(async () => {
  miniflare = new Miniflare({
    modules: true, script: "export default { fetch() { return new Response('ok'); } }",
    d1Databases: ["DB"], kvNamespaces: ["CACHE_KV"],
  });
  db = await miniflare.getD1Database("DB");
  kv = await miniflare.getKVNamespace("CACHE_KV") as unknown as KVNamespace;
});

afterAll(async () => { await miniflare.dispose(); });

beforeEach(async () => {
  vi.clearAllMocks();
  for (const t of ["teams", "users", "players", "conversations", "messages", "matches", "club_incidents", "injuries", "villages", "managers", "player_follow_ups", "pub_sessions", "seasonal_events", "seasons"]) {
    await db.prepare(`DROP TABLE IF EXISTS ${t}`).run();
  }
  for (const sql of [
    "CREATE TABLE teams (id TEXT PRIMARY KEY, name TEXT, user_id TEXT, parent_team_id TEXT, village_id TEXT, league_id TEXT, game_date TEXT)",
    "CREATE TABLE users (id TEXT PRIMARY KEY, last_activity_at TEXT)",
    `CREATE TABLE players (id TEXT PRIMARY KEY, team_id TEXT, first_name TEXT, last_name TEXT, nationality TEXT, nickname TEXT, avatar TEXT,
       age INTEGER, position TEXT, personality TEXT, life_context TEXT, coach_relationship INTEGER, is_celebrity INTEGER, status TEXT, overall_rating INTEGER)`,
    `CREATE TABLE conversations (id TEXT PRIMARY KEY, team_id TEXT, type TEXT, title TEXT, participant_id TEXT, participant_avatar TEXT,
       last_message_text TEXT, last_message_at TEXT, unread_count INTEGER DEFAULT 0, ai_thread_active INTEGER DEFAULT 0,
       ai_thread_state TEXT, ai_thread_last_at TEXT, created_at TEXT)`,
    "CREATE TABLE messages (id TEXT PRIMARY KEY, conversation_id TEXT, sender_type TEXT, sender_id TEXT, sender_name TEXT, body TEXT, metadata TEXT, sent_at TEXT, read INTEGER)",
    "CREATE TABLE matches (id TEXT PRIMARY KEY, home_team_id TEXT, away_team_id TEXT, home_score INTEGER, away_score INTEGER, status TEXT, simulated_at TEXT)",
    "CREATE TABLE club_incidents (id TEXT, team_id TEXT, status TEXT, category TEXT, subject_player_id TEXT, kind TEXT)",
    "CREATE TABLE injuries (id TEXT, player_id TEXT, description TEXT, days_remaining INTEGER, osobni_volno INTEGER, is_fake INTEGER)",
    "CREATE TABLE villages (id TEXT PRIMARY KEY, name TEXT, size TEXT, district TEXT)",
    "CREATE TABLE managers (team_id TEXT, name TEXT)",
    "CREATE TABLE pub_sessions (team_id TEXT, game_date TEXT, incidents TEXT)",
    `CREATE TABLE seasonal_events (id TEXT, team_id TEXT, league_id TEXT, type TEXT, title TEXT, description TEXT, effects TEXT,
       season TEXT, game_week INTEGER, status TEXT, created_at TEXT)`,
    "CREATE TABLE seasons (number INTEGER, status TEXT)",
  ]) await db.prepare(sql).run();
  const migration = readFileSync(new URL("../../migrations/0275_player_follow_ups.sql", import.meta.url), "utf8");
  for (const stmt of migration.replace(/--.*$/gm, "").split(";").map((x) => x.trim()).filter(Boolean)) await db.prepare(stmt).run();
  await db.prepare("INSERT INTO teams (id, name, user_id, village_id, game_date) VALUES ('t1', 'TJ Dvory', 'u1', 'v1', '2026-11-14')").run();
  await db.prepare("INSERT INTO users VALUES ('u1', ?)").bind(new Date(SATURDAY_EVENING.getTime() - 3600_000).toISOString()).run();
  await db.prepare("INSERT INTO villages VALUES ('v1', 'Dvory', 'village', 'Prachatice')").run();
  await db.prepare("INSERT INTO managers VALUES ('t1', 'Zdeněk')").run();
  await kv.delete("casual_topics:t1");
});

afterEach(() => { vi.restoreAllMocks(); });

async function addPlayer(id: string, relation: number, o: { alcohol?: number; lifeContext?: Record<string, unknown> } = {}) {
  await db.prepare(
    `INSERT INTO players (id, team_id, first_name, last_name, age, position, personality, life_context, coach_relationship, is_celebrity, status, overall_rating)
     VALUES (?, 't1', 'Franta', ?, 30, 'MID', ?, ?, ?, 0, 'active', 50)`,
  ).bind(id, `Hráč-${id}`, JSON.stringify({ alcohol: o.alcohol ?? 30, temper: 40 }), JSON.stringify({ occupation: "Zedník", ...o.lifeContext }), relation).run();
}

const casualMessages = () => db.prepare(
  "SELECT m.sender_id, m.metadata, c.ai_thread_state FROM messages m JOIN conversations c ON c.id = m.conversation_id",
).all<{ sender_id: string; metadata: string; ai_thread_state: string }>().then((r) => r.results);

describe("témata zpráv jen tak", () => {
  const ctx = (o: Partial<CasualContext> = {}): CasualContext => ({
    month: 11, weekday: 6, hour: 15, situation: "volno", drinksAt: null, workplacePhoto: false, lastOutcome: null, ...o,
  });
  const makePlayer = (o: Partial<PlayerSnapshot> = {}): PlayerSnapshot => ({
    id: "p", firstName: "Franta", lastName: "Novák", age: 30, position: "MID", morale: 60, condition: 80, coachRelationship: 70,
    discipline: 50, patriotism: 50, alcohol: 30, temper: 40, leadership: 40, workRate: 50, aggression: 40,
    recentMinutes: 200, recentRatingAvg: 6.5, isCelebrity: false, ...o,
  });
  const topic = (id: string) => CASUAL_TOPICS.find((t) => t.id === id)!;

  it("fotky a pozvání odkazují na scény, které existují", () => {
    for (const t of CASUAL_TOPICS) {
      if (t.photo && t.photo !== "work") expect(PHOTO_SCENES[t.photo], t.id).toBeDefined();
      if (t.invite) expect(INVITES[t.invite], t.id).toBeDefined();
    }
    for (const [kind, info] of Object.entries(INVITES)) {
      if (info.photo) expect(PHOTO_SCENES[info.photo], kind).toBeDefined();
    }
  });

  it("v textech pro hráče ani v zadání nejsou dlouhé pomlčky", () => {
    const texts = [
      ...CASUAL_TOPICS.flatMap((t) => [t.description, t.label]),
      ...Object.values(INVITES).flatMap((i) => [i.label, i.thanks]),
      ...Object.values(PHOTO_SCENES).map((s) => s.alt),
    ];
    for (const text of texts) expect(text).not.toMatch(/[—–]/);
  });

  it("kdo trenéra nemá rád, jen tak nepíše vůbec", () => {
    expect(CASUAL_MIN_RELATION).toBe(40);
    for (const t of CASUAL_TOPICS) expect(topicFits(t, makePlayer({ coachRelationship: 35 }), ctx({ situation: "po_praci", hour: 18 }))).toBe(0);
  });

  it("zve jen ten, kdo trenéra má rád; „Bere tě“ pošle leda fotku z práce", () => {
    const work = ctx({ situation: "prace", hour: 10, weekday: 2, workplacePhoto: true });
    expect(topicFits(topic("casual_work_photo"), makePlayer({ coachRelationship: 45 }), work)).toBeGreaterThan(0);
    expect(topicFits(topic("casual_pig_slaughter"), makePlayer({ coachRelationship: 45 }), ctx())).toBe(0);
    expect(topicFits(topic("casual_pig_slaughter"), makePlayer({ coachRelationship: 75 }), ctx())).toBeGreaterThan(0);
  });

  it("roční doba a den: zabijačka v listopadu o víkendu, ne v červenci; houby jen na podzim", () => {
    expect(topicFits(topic("casual_pig_slaughter"), makePlayer(), ctx({ month: 7 }))).toBe(0);
    expect(topicFits(topic("casual_pig_slaughter"), makePlayer(), ctx({ weekday: 2 }))).toBe(0);
    expect(topicFits(topic("casual_mushrooms"), makePlayer(), ctx({ month: 9 }))).toBeGreaterThan(0);
    expect(topicFits(topic("casual_mushrooms"), makePlayer(), ctx({ month: 12 }))).toBe(0);
  });

  it("svatbu a miminko jen ten, kdo je má v životní situaci", () => {
    expect(topicFits(topic("casual_wedding"), makePlayer(), ctx())).toBe(0);
    expect(topicFits(topic("casual_wedding"), makePlayer({ zivotniSituace: { kind: "svatba_spoluhrace", label: "Svatba" } }), ctx())).toBeGreaterThan(0);
  });

  it("pozvánka z hospody jen z hospody večer", () => {
    expect(topicFits(topic("casual_pub_evening"), makePlayer(), ctx({ situation: "pije", drinksAt: "hospoda", hour: 20 }))).toBeGreaterThan(0);
    expect(topicFits(topic("casual_pub_evening"), makePlayer(), ctx({ situation: "pije", drinksAt: "doma", hour: 20 }))).toBe(0);
    expect(topicFits(topic("casual_pub_evening"), makePlayer(), ctx({ situation: "volno", hour: 20 }))).toBe(0);
  });
});

describe("kdo dostane zprávu jen tak", () => {
  it("kamarád trenéra napíše: vlákno jen tak čeká na trenéra a klub má odstup", async () => {
    await addPlayer("p1", 85);
    const r = await spawnCasualMessages(db, { CACHE_KV: kv, AI: {} as Ai, SEED_DATA: {} as R2Bucket }, SATURDAY_EVENING, { teamId: "t1" });
    expect(r.sent).toBe(1);
    const [m] = await casualMessages();
    expect(m.sender_id).toBe("p1");
    expect(JSON.parse(m.metadata)).toMatchObject({ casual: true, turn: 0 });
    expect(JSON.parse(m.ai_thread_state)).toMatchObject({ casual: true, awaiting: "coach", player_id: "p1" });
    const team = await db.prepare("SELECT last_casual_message_at AS at FROM teams WHERE id = 't1'").first<{ at: string }>();
    expect(team?.at).toBe(SATURDAY_EVENING.toISOString());
  });

  it("hráč, který trenéra nemá rád, se neozve", async () => {
    await addPlayer("p1", 30);
    const r = await spawnCasualMessages(db, { CACHE_KV: kv }, SATURDAY_EVENING, { teamId: "t1" });
    expect(r.sent).toBe(0);
    expect(fx.generateInitialMessage).not.toHaveBeenCalled();
  });

  it("nanečisto vrátí koncept a nic nezapíše", async () => {
    await addPlayer("p1", 85);
    const r = await spawnCasualMessages(db, { CACHE_KV: kv, AI: {} as Ai, SEED_DATA: {} as R2Bucket }, SATURDAY_EVENING, { teamId: "t1", dryRun: true });
    expect(r.drafts).toHaveLength(1);
    expect(await casualMessages()).toHaveLength(0);
  });

  it("cron píše jen aktivním klubům, mimo noc a ne dva dny po sobě", async () => {
    await addPlayer("p1", 85);
    vi.spyOn(Math, "random").mockReturnValue(0);
    // Ve dvě ráno nikdo.
    expect((await spawnCasualMessages(db, { CACHE_KV: kv }, new Date("2026-11-14T01:30:00.000Z"))).sent).toBe(0);
    // Manažer naposledy ve hře před pěti dny.
    await db.prepare("UPDATE users SET last_activity_at = ?").bind(new Date(SATURDAY_EVENING.getTime() - 5 * 86400_000).toISOString()).run();
    expect((await spawnCasualMessages(db, { CACHE_KV: kv }, SATURDAY_EVENING)).sent).toBe(0);
    // Aktivní, ale zprávu jen tak dostal před hodinou.
    await db.prepare("UPDATE users SET last_activity_at = ?").bind(SATURDAY_EVENING.toISOString()).run();
    await db.prepare("UPDATE teams SET last_casual_message_at = ?").bind(new Date(SATURDAY_EVENING.getTime() - 3600_000).toISOString()).run();
    expect((await spawnCasualMessages(db, { CACHE_KV: kv }, SATURDAY_EVENING)).sent).toBe(0);
    await db.prepare("UPDATE teams SET last_casual_message_at = NULL").run();
    expect((await spawnCasualMessages(db, { CACHE_KV: kv, AI: {} as Ai, SEED_DATA: {} as R2Bucket }, SATURDAY_EVENING)).sent).toBe(1);
  });

  it("hráč, se kterým se zrovna píše, se vynechá", async () => {
    await addPlayer("p1", 85);
    await db.prepare("INSERT INTO conversations (id, team_id, type, participant_id, ai_thread_active, ai_thread_state) VALUES ('c1', 't1', 'player', 'p1', 1, '{}')").run();
    expect((await spawnCasualMessages(db, { CACHE_KV: kv }, SATURDAY_EVENING, { teamId: "t1" })).sent).toBe(0);
  });
});

describe("pozvání", () => {
  async function invite() {
    await addPlayer("p1", 85, { alcohol: 70 });
    const r = await spawnCasualMessages(db, { CACHE_KV: kv, AI: {} as Ai, SEED_DATA: {} as R2Bucket }, SATURDAY_EVENING, { teamId: "t1", topicId: "casual_pub_evening" });
    expect(r.sent).toBe(1);
    return (await db.prepare("SELECT id FROM conversations WHERE participant_id = 'p1'").first<{ id: string }>())!.id;
  }

  it("trenér napíše „jdu“: zapíše se hospoda s rundou a po akci přijde poděkování", async () => {
    const convId = await invite();
    expect(await handleCoachMessageForInvite(db, { CACHE_KV: kv }, convId, "Ok tak počkej až usne žena a pak vyrazím")).toBe(true);
    expect(fx.createCoachLedSession).toHaveBeenCalledWith(expect.anything(), "t1", "2026-11-14", "invited", { inviterId: "p1" });
    expect(fx.recordTransaction).toHaveBeenCalledWith(expect.anything(), "t1", "event", -600, expect.any(String), "2026-11-14");
    const f = await db.prepare("SELECT kind, payload, due_at FROM player_follow_ups").first<{ kind: string; payload: string; due_at: string }>();
    expect(f?.kind).toBe("after_invite");
    expect(JSON.parse(f!.payload)).toMatchObject({ invite: "pub" });
    expect(Date.parse(f!.due_at)).toBeGreaterThan(Date.now());
    // Stejný odstup jako „Pojedeme na jedno“: celý tým hned potom do hospody nevezme.
    expect(await db.prepare("SELECT type FROM seasonal_events WHERE team_id = 't1'").first()).toEqual({ type: "hospoda_action" });
  });

  it("dvě rychlé zprávy „jdu“ naráz zaplatí jen jednu rundu", async () => {
    const convId = await invite();
    const r = await Promise.all([
      handleCoachMessageForInvite(db, { CACHE_KV: kv }, convId, "jdu"),
      handleCoachMessageForInvite(db, { CACHE_KV: kv }, convId, "už letím"),
    ]);
    expect(r.filter(Boolean)).toHaveLength(1);
    expect(fx.createCoachLedSession).toHaveBeenCalledTimes(1);
    expect(fx.recordTransaction).toHaveBeenCalledTimes(1);
  });

  it("kdo zval, v hospodě nakonec není: bez rundy i bez poděkování", async () => {
    const convId = await invite();
    fx.createCoachLedSession.mockResolvedValueOnce({ ok: false, reason: "Kdo zval, není k dispozici" } as never);
    expect(await handleCoachMessageForInvite(db, { CACHE_KV: kv }, convId, "jdu")).toBe(false);
    expect(fx.recordTransaction).not.toHaveBeenCalled();
    expect(await db.prepare("SELECT COUNT(*) AS n FROM player_follow_ups WHERE done_at IS NULL").first()).toEqual({ n: 0 });
  });

  it("druhé „jdu“ už nic nezaplatí a odmítnutí nic nespustí", async () => {
    const convId = await invite();
    await handleCoachMessageForInvite(db, { CACHE_KV: kv }, convId, "jdu");
    await handleCoachMessageForInvite(db, { CACHE_KV: kv }, convId, "už jsem na cestě");
    expect(fx.createCoachLedSession).toHaveBeenCalledTimes(1);

    const other = await db.prepare("SELECT id FROM conversations WHERE participant_id = 'p1'").first<{ id: string }>();
    await kv.put(`open_invite:${other!.id}`, JSON.stringify({ kind: "bbq", topicId: "casual_bbq", teamId: "t1", playerId: "p1", playerFirstName: "Franta" }));
    fx.coachAcceptsInvite.mockResolvedValueOnce(false);
    expect(await handleCoachMessageForInvite(db, { CACHE_KV: kv }, other!.id, "dneska fakt nemůžu")).toBe(false);
  });

  it("když už dnes trenér s klukama v hospodě byl, druhá návštěva se nezapíše", async () => {
    const convId = await invite();
    await db.prepare("INSERT INTO pub_sessions VALUES ('t1', '2026-11-14', ?)").bind(JSON.stringify([{ type: "coach_led_visit" }])).run();
    await handleCoachMessageForInvite(db, { CACHE_KV: kv }, convId, "jdu");
    expect(fx.createCoachLedSession).not.toHaveBeenCalled();
    expect(await db.prepare("SELECT COUNT(*) AS n FROM player_follow_ups").first<{ n: number }>()).toEqual({ n: 1 });
  });
});

describe("věk", () => {
  it("do hospody a na bál zve až dospělý", () => {
    const pub = CASUAL_TOPICS.find((t) => t.id === "casual_pub_evening")!;
    const base = {
      id: "p", firstName: "Tomáš", lastName: "Novotný", position: "MID" as const, morale: 60, condition: 80, coachRelationship: 70,
      discipline: 50, patriotism: 50, alcohol: 60, temper: 40, leadership: 40, workRate: 50, aggression: 40,
      recentMinutes: 200, recentRatingAvg: 6.5, isCelebrity: false,
    };
    const evening: CasualContext = { month: 11, weekday: 6, hour: 20, situation: "pije", drinksAt: "hospoda", workplacePhoto: false, lastOutcome: null };
    expect(topicFits(pub, { ...base, age: 17 }, evening)).toBe(0);
    expect(topicFits(pub, { ...base, age: 19 }, evening)).toBeGreaterThan(0);
  });
});
