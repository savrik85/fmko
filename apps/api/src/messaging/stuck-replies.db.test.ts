/**
 * Zaseklé „píše…“ v telefonu a denní úklid neodpovězených vláken, nad skutečnou D1 (Miniflare).
 * Případ z 11/2026: David Kotrc „psal“ týden a úklid od září padal na vláknu předáka fanoušků.
 */
import { afterAll, beforeEach, beforeAll, describe, expect, it } from "vitest";
import { Miniflare } from "miniflare";
import { releaseStuckReplies } from "./stuck-replies";
import { expireStaleAiThreads } from "./ai-player-spawn";

let miniflare: Miniflare;
let db: D1Database;

const ago = (min: number) => new Date(Date.now() - min * 60_000).toISOString().replace(/\.\d{3}Z$/, "Z");
const DAY = 24 * 60;

beforeAll(async () => {
  miniflare = new Miniflare({
    modules: true,
    script: "export default { fetch() { return new Response('ok'); } }",
    d1Databases: ["DB"],
  });
  db = await miniflare.getD1Database("DB");
  await db.exec("CREATE TABLE conversations (id TEXT PRIMARY KEY, team_id TEXT, type TEXT, participant_id TEXT, ai_thread_active INTEGER, ai_thread_state TEXT, last_message_at TEXT, last_message_text TEXT, unread_count INTEGER DEFAULT 0)");
  await db.exec("CREATE TABLE messages (id TEXT PRIMARY KEY, conversation_id TEXT, sender_type TEXT, sender_name TEXT, body TEXT, metadata TEXT, sent_at TEXT, read INTEGER)");
  await db.exec("CREATE TABLE player_follow_ups (id TEXT PRIMARY KEY, team_id TEXT, player_id TEXT, conversation_id TEXT, kind TEXT, due_at TEXT, payload TEXT, created_at TEXT, done_at TEXT)");
  await db.exec("CREATE TABLE players (id TEXT PRIMARY KEY, team_id TEXT, loan_from_team_id TEXT, first_name TEXT, last_name TEXT, personality TEXT)");
  await db.exec("CREATE TABLE teams (id TEXT PRIMARY KEY, parent_team_id TEXT, phone_credit INTEGER, phone_credit_date TEXT)");
  await db.exec("INSERT INTO teams (id, phone_credit) VALUES ('t1', 0), ('t2', 0)");
});

afterAll(async () => {
  await miniflare.dispose();
});

beforeEach(async () => {
  await db.batch([
    db.prepare("DELETE FROM conversations"),
    db.prepare("DELETE FROM messages"),
    db.prepare("DELETE FROM player_follow_ups"),
    db.prepare("DELETE FROM players"),
    db.prepare("INSERT INTO players (id, team_id) VALUES ('p1', 't1')"),
    db.prepare("UPDATE teams SET phone_credit = 0"),
  ]);
});

async function addConv(id: string, state: Record<string, unknown> | null, lastMessageAt: string, active = 1) {
  await db.prepare("INSERT INTO conversations (id, team_id, type, participant_id, ai_thread_active, ai_thread_state, last_message_at) VALUES (?, 't1', 'player', 'p1', ?, ?, ?)")
    .bind(id, active, state ? JSON.stringify(state) : null, lastMessageAt).run();
}

async function addMessage(convId: string, senderType: string, sentAt: string) {
  await db.prepare("INSERT INTO messages (id, conversation_id, sender_type, sender_name, body, sent_at) VALUES (?, ?, ?, 'x', 'zpráva', ?)")
    .bind(crypto.randomUUID(), convId, senderType, sentAt).run();
}

async function stateOf(id: string) {
  const row = await db.prepare("SELECT ai_thread_active, ai_thread_state FROM conversations WHERE id = ?").bind(id)
    .first<{ ai_thread_active: number; ai_thread_state: string | null }>();
  return { active: row?.ai_thread_active, state: row?.ai_thread_state ? JSON.parse(row.ai_thread_state) : null };
}

const playerThread = (over: Record<string, unknown> = {}) => ({
  trigger: "coach_initiated", scenario_id: "coach_initiated", max_replies: 30, current_replies: 1,
  awaiting: "player", initiated_at: ago(6 * DAY), player_id: "p1", resolution: null, ...over,
});

describe("zaseklá odpověď hráče", () => {
  it("týden staré „píše“ vrátí trenérovi bez opožděné odpovědi", async () => {
    // Stav z doby před pojistkou: bez awaiting_since, rozhoduje poslední zpráva.
    await addConv("kotrc", playerThread(), ago(2 * DAY));
    const res = await releaseStuckReplies(db);
    expect(res.players).toBe(1);
    expect(res.retries).toBe(0);
    expect((await stateOf("kotrc")).state.awaiting).toBe("coach");
    expect((await stateOf("kotrc")).active).toBe(1);
  });

  it("čerstvě zaseklá odpověď se vrátí a hráč odpoví později", async () => {
    await addConv("fresh", playerThread({ awaiting_since: ago(40) }), ago(40));
    const res = await releaseStuckReplies(db);
    expect(res).toMatchObject({ players: 1, retries: 1 });
    const followUp = await db.prepare("SELECT kind, conversation_id FROM player_follow_ups").first<{ kind: string; conversation_id: string }>();
    expect(followUp).toEqual({ kind: "retry_reply", conversation_id: "fresh" });
  });

  it("hráč mimo klub: vlákno se vrátí, opožděná odpověď se neplánuje a SMS se vrací", async () => {
    await db.prepare("UPDATE players SET team_id = 't2' WHERE id = 'p1'").run();
    await addConv("gone", playerThread({ awaiting_since: ago(40) }), ago(40));
    await addMessage("gone", "user", ago(40));
    const res = await releaseStuckReplies(db);
    expect(res).toMatchObject({ players: 1, retries: 0 });
    expect(await db.prepare("SELECT COUNT(*) AS n FROM player_follow_ups").first<{ n: number }>()).toEqual({ n: 0 });
    expect((await db.prepare("SELECT phone_credit FROM teams WHERE id = 't1'").first<{ phone_credit: number }>())?.phone_credit).toBe(3);
  });

  it("odpověď, která právě běží, nechá být", async () => {
    // Poslední zpráva je stará (odložená odpověď), ale čekání začalo před chvílí.
    await addConv("running", playerThread({ awaiting_since: ago(1) }), ago(3 * 60));
    expect((await releaseStuckReplies(db)).players).toBe(0);
    expect((await stateOf("running")).state.awaiting).toBe("player");
  });

  it("zaseklé psaní majitele firmy vrátí původní stav, čerstvé ne", async () => {
    const since = (min: number) => Math.floor(Date.now() / 1000) - min * 60;
    const prev = JSON.stringify({ kind: "sponsor_owner", awaiting: "coach" });
    await addConv("owner-stuck", { kind: "sponsor_owner_typing", awaiting: "player", since: since(60), prevActive: 1, prevState: prev }, ago(60));
    await addConv("owner-none", { kind: "sponsor_owner_typing", awaiting: "player", since: since(60), prevActive: 0, prevState: null }, ago(60));
    await addConv("owner-typing", { kind: "sponsor_owner_typing", awaiting: "player", since: since(0), prevActive: 1, prevState: prev }, ago(0));
    expect((await releaseStuckReplies(db)).owners).toBe(2);
    expect(await stateOf("owner-stuck")).toEqual({ active: 1, state: { kind: "sponsor_owner", awaiting: "coach" } });
    expect(await stateOf("owner-none")).toEqual({ active: 0, state: null });
    expect((await stateOf("owner-typing")).state.kind).toBe("sponsor_owner_typing");
  });
});

describe("denní úklid neodpovězených vláken", () => {
  it("vlákno předáka fanoušků úklid nezastaví a zůstane čekat na trenéra", async () => {
    await addConv("leader", { kind: "fan_leader", leaderId: "l1", groupId: "g1", awaiting: "coach" }, ago(60 * DAY));
    await addConv("casual", playerThread({ awaiting: "coach", casual: true, trigger: "casual", scenario_id: "casual" }), ago(3.5 * DAY));
    const res = await expireStaleAiThreads(db);
    expect(res.failed).toBe(0);
    expect(res.coachClosed).toBe(1);
    expect((await stateOf("casual")).active).toBe(0);
    expect((await stateOf("leader")).active).toBe(1);
  });

  it("trenér měl poslední slovo: zavře bez urážky", async () => {
    await addConv("coach-last", playerThread({ awaiting: "coach", trigger: "after_invite", scenario_id: "after_invite" }), ago(3.5 * DAY));
    await addMessage("coach-last", "player", ago(3.6 * DAY));
    await addMessage("coach-last", "user", ago(3.5 * DAY));
    const res = await expireStaleAiThreads(db);
    expect(res).toMatchObject({ quietClosed: 1, offended: 0 });
    const { active, state } = await stateOf("coach-last");
    expect(active).toBe(0);
    expect(state.resolution).toMatchObject({ morale_delta: 0, relationship_delta: 0 });
  });

  it("týdny staré vlákno z výpadku úklidu zavře bez urážky, čerstvější hráče urazí", async () => {
    await addConv("old", playerThread({ awaiting: "coach", trigger: "bench_complaint", scenario_id: "bench_complaint" }), ago(20 * DAY));
    await addMessage("old", "player", ago(20 * DAY));
    // Hráč, kterého už klub nemá: urážka vlákno jen zavře, bez dopadu na hráče.
    await addConv("recent", playerThread({ awaiting: "coach", trigger: "bench_complaint", scenario_id: "bench_complaint", player_id: "gone" }), ago(3.5 * DAY));
    await addMessage("recent", "player", ago(3.5 * DAY));
    const res = await expireStaleAiThreads(db);
    expect(res).toMatchObject({ quietClosed: 1, offended: 1, failed: 0 });
    expect((await stateOf("old")).state.resolution.summary).toBe("Rozhovor skončil bez odpovědi.");
    expect((await stateOf("recent")).active).toBe(0);
  });
});
